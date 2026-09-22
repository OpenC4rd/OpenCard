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
import { PROJECT_FONT_REGISTRY_FILE_NAME, PROJECT_ICON_REGISTRY_FILE_NAME, PROJECT_PROFILE_FILE_NAME,
  PROJECT_PACKAGE_DIRECTORY, PROJECT_INTERNAL_DIRECTORY_NAME } from '../model/projectStructure'
import { isProjectCoverPath, resolveCoverAbsolutePath } from '../model/projectCover'
import { parseProjectMetadataText } from '../model/projectMetadata'
import type { FileSystemService } from './fileSystemService'
import { invoke } from '@tauri-apps/api/core'
import { normalizeKeySlug } from '../../../shared/model/keySlug'
import { resolveFileType } from '../model/fileTypes'
import { resolveResourcePath } from '../model/scopedResourcePath'
import {
  normalizeResourcePackageManifest,
  RESOURCE_PACKAGE_MANIFEST_FILE_NAME,
  type ResourcePackageIncludedPackage,
} from '../model/resourcePackage'
import type { ProjectIcon } from '../model/projectIcons'

export type ResourcePackageProjectBuildOptions = {
  fs: Pick<FileSystemService, 'readFile' | 'fileExists' | 'readDirectoryEntries'>
  projectRootPath: string
  key: string
  name: string
  version: string
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
  /** 直接勾选要整包带走的子包；被引用的子包无论如何都会带上。 */
  packageSelection?: {
    keys: readonly string[]
  }
  outputPath?: string
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
  contentHash: string
  imagePaths: readonly string[]
}

export type ResourcePackageBuildRequest = {
  outputPath: string
  key: string
  name: string
  version: string
  cover?: string
  files: readonly ResourcePackagePlannedFile[]
  texts: readonly { archivePath: string, text: string }[]
  publicFonts: readonly ResourcePackagePublicFont[]
  publicIconSeries: readonly ResourcePackagePublicIconSeries[]
  packages: readonly ResourcePackageIncludedPackage[]
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

function selectedIdentities(keys: readonly string[]): Set<string> {
  return new Set(keys.map(key => key.toLocaleLowerCase()))
}

const RESOURCE_PACKAGE_STORAGE_PREFIX = `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}/`

/** 资源落在包存储里时返回它所属的子包 Key，否则 null。 */
function resourcePackageKey(filePath: string): string | null {
  if (!filePath.toLocaleLowerCase().startsWith(RESOURCE_PACKAGE_STORAGE_PREFIX.toLocaleLowerCase())) return null
  return filePath.slice(RESOURCE_PACKAGE_STORAGE_PREFIX.length).split('/')[0] || null
}

/**
 * 资源在包内的位置：就是它在项目里的位置，原样复制，不改名、不挪层。
 * 注册表里的引用照抄这个位置，只有落在包存储里的资源要换成包 Key 的写法：
 * `.opencard/packages` 不允许出现在引用里，而 `support@icons/ok.svg` 解析到的正是同一位置。
 */
function packageResourceReference(filePath: string): string {
  const key = resourcePackageKey(filePath)
  if (!key) return filePath
  return `${key}@${filePath.slice(RESOURCE_PACKAGE_STORAGE_PREFIX.length + key.length + 1)}`
}

/**
 * 被引用或勾选的子包必须整包进包：只捞被引用的那几个文件会把子包拆残，
 * 子包自己的清单与注册表就不在了，`子包@font:…` 这类引用会解析不到。
 * 返回带进包的文件，以及写进清单的子包摘要。
 */
async function bundleResourceSubPackages(
  options: ResourcePackageProjectBuildOptions,
  root: string,
  packageKeys: ReadonlySet<string>,
  planned: readonly ResourcePackagePlannedFile[],
): Promise<{ files: ResourcePackagePlannedFile[]; packages: ResourcePackageIncludedPackage[] }> {
  const included = new Set(planned.map(file => file.archivePath.toLocaleLowerCase()))
  const extra: ResourcePackagePlannedFile[] = []
  const packages: ResourcePackageIncludedPackage[] = []
  for (const key of packageKeys) {
    const packageRoot = `${root}/${RESOURCE_PACKAGE_STORAGE_PREFIX}${key}`
    if (!await options.fs.fileExists(packageRoot)) throw new Error(`Selected resource package is missing: ${key}`)
    let summary: ResourcePackageIncludedPackage = { key, name: key, version: '' }
    for (const entry of await options.fs.readDirectoryEntries(packageRoot, Number.POSITIVE_INFINITY)) {
      if (entry.isDirectory || entry.isSymlink) continue
      const path = `${RESOURCE_PACKAGE_STORAGE_PREFIX}${key}/${entry.name}`
      if (path.toLocaleLowerCase().endsWith(`/${RESOURCE_PACKAGE_MANIFEST_FILE_NAME}`.toLocaleLowerCase())) {
        summary = includedPackageSummary(key, await options.fs.readFile(`${root}/${path}`))
      }
      const identity = path.toLocaleLowerCase()
      if (included.has(identity)) continue
      included.add(identity)
      extra.push(plannedFile(`${root}/${path}`, path))
    }
    packages.push(summary)
  }
  return { files: extra, packages }
}

function includedPackageSummary(key: string, manifestJson: string): ResourcePackageIncludedPackage {
  try {
    const manifest = normalizeResourcePackageManifest(JSON.parse(manifestJson), key).manifest
    return { key, name: manifest.name, version: manifest.version }
  } catch {
    return { key, name: key, version: '' }
  }
}

async function buildFontProjection(
  options: ResourcePackageProjectBuildOptions,
  root: string,
  packageKeys: Set<string>,
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
        const resolved = resolveResourcePath(root, registryPath, source)
        if (!resolved.ok) throw new Error(`Project font file path is invalid: ${source}`)
        if (!await options.fs.fileExists(resolved.value)) throw new Error(`Project font file is missing: ${source}`)
        const filePath = projectRelativePath(root, resolved.value)
        const packageKey = resourcePackageKey(filePath)
        if (packageKey) packageKeys.add(packageKey)
        projectedStyles[style] = packageResourceReference(filePath)
        const identity = filePath.toLocaleLowerCase()
        if (!files.has(identity)) files.set(identity, plannedFile(resolved.value, filePath))
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
  packageKeys: Set<string>,
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
      const resolved = resolveResourcePath(root, registryPath, icon.source)
      if (!resolved.ok) throw new Error(`Project icon path is invalid: ${icon.source}`)
      if (!await options.fs.fileExists(resolved.value)) {
        throw new Error(`Project icon file is missing: ${icon.source}`)
      }
      const filePath = projectRelativePath(root, resolved.value)
      const packageKey = resourcePackageKey(filePath)
      if (packageKey) packageKeys.add(packageKey)
      icons.push({ ...icon, source: packageResourceReference(filePath) })
      const identity = filePath.toLocaleLowerCase()
      if (!files.has(identity)) files.set(identity, plannedFile(resolved.value, filePath))
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
  const key = normalizeKeySlug(options.key)
  if (!key) throw new Error('Invalid package Key')
  const root = options.projectRootPath.replace(/\\/g, '/').replace(/[\\/]+$/, '')
  if (!root) throw new Error('Project root path is required')
  const images = selectedImages(root, options.imageSelection?.paths ?? [])
  const packageKeys = new Set(options.packageSelection?.keys ?? [])
  const fontProjection = await buildFontProjection(options, root, packageKeys)
  const iconProjection = await buildIconProjection(options, root, packageKeys)
  if (images.length === 0 && packageKeys.size === 0 && !fontProjection.document && !iconProjection.document) {
    throw new Error('Select at least one resource')
  }
  const files: ResourcePackagePlannedFile[] = [...fontProjection.files, ...iconProjection.files]
  const bundled = await bundleResourceSubPackages(options, root, packageKeys, files)
  files.push(...bundled.files)
  for (const image of images) {
    if (!await options.fs.fileExists(image.absolutePath)) {
      throw new Error(`Selected project image is missing: ${image.relativePath}`)
    }
    files.push(plannedFile(image.absolutePath, image.relativePath))
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
  const localePath = `${root}/.opencard/locale.json`
  if (await options.fs.fileExists(localePath)) {
    texts.push({ archivePath: '.opencard/locale.json', text: await options.fs.readFile(localePath) })
  }
  const request: ResourcePackageBuildRequest = {
    outputPath: options.outputPath,
    key, name: options.name, version: options.version,
    ...(cover ? { cover } : {}),
    files,
    texts,
    publicFonts: fontProjection.publicFonts,
    publicIconSeries: iconProjection.publicIconSeries,
    packages: bundled.packages,
  }
  const result = await invoke<{ outputPath: string, contentHash: string }>('build_resource_package', { request })
  return { ...result, imagePaths: images.map(image => image.absolutePath) }
}
