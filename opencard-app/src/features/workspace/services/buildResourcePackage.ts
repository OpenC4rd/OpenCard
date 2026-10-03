import {
  type ResourcePackagePublicFont,
  type ResourcePackagePublicIconSeries,
} from '../model/resourcePackage'
import {
  parseProjectFontRegistryText,
  serializeProjectFontRegistry,
  type ProjectFont,
  type ProjectFontRegistryDocument,
} from '../model/projectFontRegistry'
import {
  parseProjectIconRegistryText,
  serializeProjectIconRegistry,
  type ProjectIconRegistryDocument,
} from '../model/projectIconRegistry'
import { PROJECT_FONT_REGISTRY_FILE_NAME, PROJECT_ICON_REGISTRY_FILE_NAME, PROJECT_PROFILE_FILE_NAME } from '../model/projectStructure'
import { isProjectCoverPath, resolveCoverAbsolutePath } from '../model/projectCover'
import { parseProjectMetadataText } from '../model/projectMetadata'
import type { FileSystemService } from './fileSystemService'
import { invoke } from '@tauri-apps/api/core'
import { resolveFileType } from '../model/fileTypes'
import { resolveResourcePath, type PackageScopeRoots } from '../model/scopedResourcePath'
import type { ProjectIcon } from '../model/projectIcons'
import { PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME } from '../model/projectStructure'
import { parseCustomBlockRegistryText, serializeCustomBlockRegistry, type CustomBlockRegistryEntry } from '../model/customBlockRegistry'
import type { ResourcePackagePublicBlock } from '../model/resourcePackage'

export type ResourcePackageProjectBuildOptions = {
  fs: Pick<FileSystemService, 'readFile' | 'fileExists'>
  projectRootPath: string
  /** 身份由打包界面填:包自己说清楚自己是谁,文件名不算数。 */
  author: string
  name: string
  version: string
  title: string
  /** 项目的包解开在哪 —— 内化时要从那里取文件。 */
  packageRoots?: PackageScopeRoots
  imageSelection?: {
    paths: readonly string[]
  }
  fontSelection?: {
    familyKeys: readonly string[]
    compositionKeys: readonly string[]
  }
  iconSelection?: {
    seriesKeys: readonly string[]
  }
  blockSelection?: { keys: readonly string[] }
  otherSelection?: { paths: readonly string[] }
  outputPath: string
}

/**
 * 包内一个文件的来源：打包在 Rust 侧完成，前端只给这份清单，内容不再读进 webview。
 * `stored` 表示已是压缩格式（png/jpeg/webp/avif/woff2），写包时直接存，省一次无用的 deflate。
 */
type ResourcePackagePlannedFile = {
  sourcePath: string
  archivePath: string
  stored: boolean
}

const ALREADY_COMPRESSED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'woff2'])

function plannedFile(sourcePath: string, archivePath: string): ResourcePackagePlannedFile {
  const name = archivePath.split('/').pop() ?? archivePath
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLocaleLowerCase() : ''
  return { sourcePath, archivePath, stored: ALREADY_COMPRESSED_EXTENSIONS.has(extension) }
}

type ResourcePackageFontProjection = {
  document: ProjectFontRegistryDocument | null
  files: readonly ResourcePackagePlannedFile[]
  publicFonts: readonly ResourcePackagePublicFont[]
}

type ResourcePackageIconProjection = {
  document: ProjectIconRegistryDocument | null
  files: readonly ResourcePackagePlannedFile[]
  publicIconSeries: readonly ResourcePackagePublicIconSeries[]
}

export type ResourcePackageProjectBuildResult = {
  outputPath: string
  fingerprint: string
}

type ResourcePackageBlockProjection = {
  document: { blocks: readonly CustomBlockRegistryEntry[] } | null
  files: readonly ResourcePackagePlannedFile[]
  publicBlocks: readonly ResourcePackagePublicBlock[]
}

async function buildBlockProjection(options: ResourcePackageProjectBuildOptions, root: string): Promise<ResourcePackageBlockProjection> {
  const selected = selectedIdentities(options.blockSelection?.keys ?? [])
  if (!selected.size) return { document: null, files: [], publicBlocks: [] }
  const registryPath = `${root}/${PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME}`
  if (!await options.fs.fileExists(registryPath)) throw new Error('Project custom block registry is missing')
  const source = parseCustomBlockRegistryText(await options.fs.readFile(registryPath))
  if (!source) throw new Error('Project custom block registry is invalid')
  const entries = (source.blocks ?? []).filter(entry => selected.has(entry.key.toLocaleLowerCase()))
  if (entries.length !== selected.size) throw new Error('Selected project custom block is unavailable')
  const files = new Map<string, ResourcePackagePlannedFile>()
  const projected: CustomBlockRegistryEntry[] = []
  for (const entry of entries) {
    const resolved = resolveBundledResource(options, root, entry.source)
    if (!resolved.ok) throw new Error(`Project custom block path is invalid: ${entry.source}`)
    if (!await options.fs.fileExists(resolved.value)) throw new Error(`Project custom block file is missing: ${entry.source}`)
    const archivePath = archivedReferencePath(entry.source)
    projected.push({ ...entry, source: archivePath })
    if (!files.has(archivePath.toLocaleLowerCase())) files.set(archivePath.toLocaleLowerCase(), plannedFile(resolved.value, archivePath))
  }
  return {
    document: { blocks: projected }, files: [...files.values()],
    publicBlocks: projected.map(entry => ({ key: entry.key, title: entry.name, source: entry.source })),
  }
}

export type ResourcePackageBuildRequest = {
  outputPath: string
  author: string
  name: string
  version: string
  title: string
  cover?: string
  files: readonly ResourcePackagePlannedFile[]
  texts: readonly { archivePath: string, text: string }[]
  publicFonts: readonly ResourcePackagePublicFont[]
  publicIconSeries: readonly ResourcePackagePublicIconSeries[]
  publicBlocks: readonly ResourcePackagePublicBlock[]
}

/**
 * 包自动沿用项目封面；没有封面、封面缺失或不是图片时返回 null，绝不中断打包。
 */
async function buildCoverProjection(
  options: ResourcePackageProjectBuildOptions,
  root: string,
): Promise<string | null> {
  try {
    const profilePath = `${root}/${PROJECT_PROFILE_FILE_NAME}`
    if (!await options.fs.fileExists(profilePath)) return null
    const profile = parseProjectMetadataText(await options.fs.readFile(profilePath))
    const relativePath = profile?.cover
    if (!relativePath || !isProjectCoverPath(relativePath)) return null
    if (!await options.fs.fileExists(resolveCoverAbsolutePath(root, relativePath))) return null
    return relativePath
  } catch {
    return null
  }
}

/** 绝对路径 → 项目相对路径（正斜杠）；不在项目内时返回空串。 */
function projectRelativePath(root: string, value: string): string {
  const path = value.trim().replace(/\\/g, '/')
  const rootIdentity = root.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
  const pathIdentity = path.toLocaleLowerCase()
  if (pathIdentity === rootIdentity) return ''
  return pathIdentity.startsWith(`${rootIdentity}/`) ? path.slice(rootIdentity.length + 1) : ''
}

function resolveSelectedImage(root: string, value: string): { absolutePath: string, relativePath: string } {
  const path = value.trim().replace(/\\/g, '/')
  const absolute = path.startsWith('/') || /^[a-z]:\//i.test(path)
  const relativePath = absolute ? projectRelativePath(root, path) : path
  const segments = relativePath.split('/')
  const identity = relativePath.toLocaleLowerCase()
  if (!relativePath || /^[a-z]:/i.test(relativePath)
    || segments.some(segment => !segment || segment === '.' || segment === '..'
    || /[\u0000-\u001f\u007f]/.test(segment))) {
    throw new Error(`Selected image path is outside the project or unsafe: ${value}`)
  }
  if (identity === '.git' || identity.startsWith('.git/')
    || identity === '.opencard' || identity.startsWith('.opencard/')) {
    throw new Error(`Selected image path is managed or internal: ${value}`)
  }
  if (resolveFileType(relativePath, root).id !== 'image') {
    throw new Error(`Selected project file is not an image: ${value}`)
  }
  return { absolutePath: `${root}/${relativePath}`, relativePath }
}

function selectedImages(root: string, paths: readonly string[]): { absolutePath: string, relativePath: string }[] {
  const result = new Map<string, { absolutePath: string, relativePath: string }>()
  for (const path of paths) {
    const image = resolveSelectedImage(root, path)
    const identity = image.relativePath.toLocaleLowerCase()
    if (!result.has(identity)) result.set(identity, image)
  }
  return [...result.values()]
}

function selectedOtherFiles(root: string, paths: readonly string[]): { absolutePath: string, relativePath: string }[] {
  const result = new Map<string, { absolutePath: string, relativePath: string }>()
  for (const value of paths) {
    const relativePath = value.trim().replace(/\\/g, '/')
    const lower = relativePath.toLocaleLowerCase()
    const segments = relativePath.split('/')
    if (!relativePath || lower.startsWith('.opencard/') || lower === '.opencard' || lower.startsWith('.git/') || lower === '.git'
      || segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error(`Selected project file is internal or unsafe: ${value}`)
    }
    const absolutePath = `${root}/${relativePath}`
    if (!result.has(lower)) result.set(lower, { absolutePath, relativePath })
  }
  return [...result.values()]
}

function selectedIdentities(keys: readonly string[]): Set<string> {
  return new Set(keys.map(key => key.toLocaleLowerCase()))
}

/**
 * 一条引用在包内的落点：限定符（如果有）之后的路径。
 *
 * 项目文件 `.opencard/fonts/x.woff2` 落成 `.opencard/fonts/x.woff2`；
 * 来自别人的包 `alice/support@1.2.0#fonts/shared.ttf` 落成 `fonts/shared.ttf`。
 * 两者落到包内之后都只是当前作用域里的相对路径 —— 这就是"内化"：
 * 复制的是资源文件本身，包里不留任何对别的包的引用。
 */
function archivedReferencePath(source: string): string {
  const hash = source.indexOf('#')
  return (hash < 0 ? source : source.slice(hash + 1)).trim()
}

/** 解析一条资源引用（可能指向项目，也可能指向某个已解开的包）。 */
function resolveBundledResource(
  options: ResourcePackageProjectBuildOptions,
  root: string,
  reference: string,
) {
  return resolveResourcePath({
    scopeRootPath: root,
    projectRootPath: root,
    reference,
    packageRoots: options.packageRoots,
  })
}

async function buildFontProjection(
  options: ResourcePackageProjectBuildOptions,
  root: string,
): Promise<ResourcePackageFontProjection> {
  const publicFamilyKeys = selectedIdentities(options.fontSelection?.familyKeys ?? [])
  const selectedCompositionKeys = selectedIdentities(options.fontSelection?.compositionKeys ?? [])
  if (publicFamilyKeys.size === 0 && selectedCompositionKeys.size === 0) {
    return { document: null, files: [], publicFonts: [] }
  }

  const registryPath = `${root}/${PROJECT_FONT_REGISTRY_FILE_NAME}`
  if (!await options.fs.fileExists(registryPath)) throw new Error('Project font registry is missing')
  const document = parseProjectFontRegistryText(await options.fs.readFile(registryPath))
  if (!document) throw new Error('Project font registry is invalid')
  const families = document.families ?? []
  const compositions = document.compositions ?? []
  const familiesByKey = new Map(families.map(family => [family.key.toLocaleLowerCase(), family]))
  const compositionsByKey = new Map(compositions.map(composition => [composition.key.toLocaleLowerCase(), composition]))

  for (const key of publicFamilyKeys) {
    if (!familiesByKey.has(key)) throw new Error(`Selected project font is unavailable: ${key}`)
  }
  const includedFamilyKeys = new Set(publicFamilyKeys)
  for (const key of selectedCompositionKeys) {
    const composition = compositionsByKey.get(key)
    if (!composition) throw new Error(`Selected font composition is unavailable: ${key}`)
    for (const member of composition.members) {
      const memberKey = member.fontKey.toLocaleLowerCase()
      if (!familiesByKey.has(memberKey)) {
        throw new Error(`Font composition ${composition.key} references unavailable project font: ${member.fontKey}`)
      }
      includedFamilyKeys.add(memberKey)
    }
  }

  const selectedFamilies = families.filter(family => includedFamilyKeys.has(family.key.toLocaleLowerCase()))
  const publicFamilies = selectedFamilies.filter(family => publicFamilyKeys.has(family.key.toLocaleLowerCase()))
  const selectedCompositions = compositions.filter(composition => selectedCompositionKeys.has(composition.key.toLocaleLowerCase()))
  const files = new Map<string, ResourcePackagePlannedFile>()
  const projectedFamilies: ProjectFont[] = []
  for (const family of selectedFamilies) {
    const projectedFiles: ProjectFont['files'] = {}
    for (const [weight, styles] of Object.entries(family.files)) {
      if (!styles) continue
      const projectedStyles: { upright?: string, italic?: string } = {}
      for (const style of ['upright', 'italic'] as const) {
        const source = styles[style]
        if (!source) continue
        const entryPath = archivedReferencePath(source)
        const resolved = resolveBundledResource(options, root, source)
        if (!resolved.ok) throw new Error(`Project font file path is invalid: ${source}`)
        if (!await options.fs.fileExists(resolved.value)) throw new Error(`Project font file is missing: ${source}`)
        projectedStyles[style] = entryPath
        const identity = entryPath.toLocaleLowerCase()
        if (!files.has(identity)) files.set(identity, plannedFile(resolved.value, entryPath))
      }
      projectedFiles[weight as keyof ProjectFont['files']] = projectedStyles
    }
    projectedFamilies.push({ ...family, files: projectedFiles })
  }
  const projectedDocument: ProjectFontRegistryDocument = {
    ...(projectedFamilies.length ? { families: projectedFamilies } : {}),
    ...(selectedCompositions.length ? { compositions: selectedCompositions } : {}),
  }
  return {
    document: projectedDocument,
    files: [...files.values()],
    publicFonts: [
      ...publicFamilies.map(family => ({ key: family.key, title: family.name })),
      ...selectedCompositions.map(composition => ({ key: composition.key, title: composition.name })),
    ],
  }
}

async function buildIconProjection(
  options: ResourcePackageProjectBuildOptions,
  root: string,
): Promise<ResourcePackageIconProjection> {
  const selectedSeriesKeys = selectedIdentities(options.iconSelection?.seriesKeys ?? [])
  if (selectedSeriesKeys.size === 0) return { document: null, files: [], publicIconSeries: [] }

  const registryPath = `${root}/${PROJECT_ICON_REGISTRY_FILE_NAME}`
  if (!await options.fs.fileExists(registryPath)) throw new Error('Project icon registry is missing')
  const document = parseProjectIconRegistryText(await options.fs.readFile(registryPath))
  if (!document) throw new Error('Project icon registry is invalid')
  const series = document.iconSeries ?? []
  const seriesByKey = new Map(series.map(entry => [entry.key.toLocaleLowerCase(), entry]))
  for (const key of selectedSeriesKeys) {
    if (!seriesByKey.has(key)) throw new Error(`Selected project icon series is unavailable: ${key}`)
  }

  const selectedSeries = series.filter(entry => selectedSeriesKeys.has(entry.key.toLocaleLowerCase()))
  const files = new Map<string, ResourcePackagePlannedFile>()
  const projectedSeries: typeof selectedSeries = []
  for (const entry of selectedSeries) {
    const icons: ProjectIcon[] = []
    for (const icon of entry.icons) {
      const entryPath = archivedReferencePath(icon.source)
      const resolved = resolveBundledResource(options, root, icon.source)
      if (!resolved.ok) throw new Error(`Project icon path is invalid: ${icon.source}`)
      if (!await options.fs.fileExists(resolved.value)) {
        throw new Error(`Project icon file is missing: ${icon.source}`)
      }
      icons.push({ ...icon, source: entryPath })
      const identity = entryPath.toLocaleLowerCase()
      if (!files.has(identity)) files.set(identity, plannedFile(resolved.value, entryPath))
    }
    projectedSeries.push({ ...entry, icons })
  }
  const projectedDocument: ProjectIconRegistryDocument = { iconSeries: projectedSeries }
  return {
    document: projectedDocument,
    files: [...files.values()],
    publicIconSeries: selectedSeries.map(entry => ({
      key: entry.key,
      title: entry.name,
      count: entry.icons.length,
    })),
  }
}

export async function buildResourcePackageFromProject(
  options: ResourcePackageProjectBuildOptions,
): Promise<ResourcePackageProjectBuildResult> {
  const root = options.projectRootPath.replace(/\\/g, '/').replace(/[\\/]+$/, '')
  if (!root) throw new Error('Project root path is required')
  const images = selectedImages(root, options.imageSelection?.paths ?? [])
  const otherFiles = selectedOtherFiles(root, options.otherSelection?.paths ?? [])
  const fontProjection = await buildFontProjection(options, root)
  const iconProjection = await buildIconProjection(options, root)
  const blockProjection = await buildBlockProjection(options, root)
  if (images.length === 0 && otherFiles.length === 0 && !fontProjection.document && !iconProjection.document && !blockProjection.document) {
    throw new Error('Select at least one resource')
  }
  const files: ResourcePackagePlannedFile[] = [...fontProjection.files, ...iconProjection.files]
  files.push(...blockProjection.files)
  for (const image of images) {
    if (!await options.fs.fileExists(image.absolutePath)) {
      throw new Error(`Selected project image is missing: ${image.relativePath}`)
    }
    files.push(plannedFile(image.absolutePath, image.relativePath))
  }
  for (const file of otherFiles) {
    if (!await options.fs.fileExists(file.absolutePath)) throw new Error(`Selected project file is missing: ${file.relativePath}`)
    files.push(plannedFile(file.absolutePath, file.relativePath))
  }
  const cover = await buildCoverProjection(options, root)
  if (cover && !files.some(file => file.archivePath.toLocaleLowerCase() === cover.toLocaleLowerCase())) {
    files.push(plannedFile(resolveCoverAbsolutePath(root, cover), cover))
  }
  const texts: { archivePath: string, text: string }[] = []
  if (fontProjection.document) {
    texts.push({ archivePath: PROJECT_FONT_REGISTRY_FILE_NAME, text: serializeProjectFontRegistry(fontProjection.document) })
  }
  if (iconProjection.document) {
    texts.push({ archivePath: PROJECT_ICON_REGISTRY_FILE_NAME, text: serializeProjectIconRegistry(iconProjection.document) })
  }
  if (blockProjection.document) {
    texts.push({ archivePath: PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME, text: serializeCustomBlockRegistry(blockProjection.document) })
  }
  const localePath = `${root}/.opencard/locale.json`
  if (await options.fs.fileExists(localePath)) {
    texts.push({ archivePath: '.opencard/locale.json', text: await options.fs.readFile(localePath) })
  }
  // 包里没有依赖清单：用到的别人的资源已经内化成包内的普通文件。
  const request: ResourcePackageBuildRequest = {
    outputPath: options.outputPath,
    author: options.author,
    name: options.name,
    version: options.version,
    title: options.title,
    ...(cover ? { cover } : {}),
    files,
    texts,
    publicFonts: fontProjection.publicFonts,
    publicIconSeries: iconProjection.publicIconSeries,
    publicBlocks: blockProjection.publicBlocks,
  }
  return await invoke<ResourcePackageProjectBuildResult>('build_resource_package', { request })
}
