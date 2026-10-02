import { formatPackageCoordinate, parsePackageCoordinate, resolvePackageQualifier, type PackageCoordinate, type PackageQualifier } from '../model/packageCoordinate'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import { parseResourceReferenceList } from './resourceReference'
import { RESOURCE_PACKAGE_SUFFIX, type ResourcePackageManifest } from '../model/resourcePackage'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { ProjectFontRegistry, ProjectFontRegistryDocument } from '../model/projectFontRegistry'
import { buildProjectFontRegistry, parseProjectFontRegistryText } from '../model/projectFontRegistry'
import type { ProjectIconRegistryDocument } from '../model/projectIconRegistry'
import { parseProjectIconRegistryText } from '../model/projectIconRegistry'
import type { ProjectIconCatalog } from './projectIconCatalog'
import { buildProjectIconCatalog, EMPTY_PROJECT_ICON_CATALOG } from './projectIconCatalog'
import type { FileSystemService } from './fileSystemService'
import { readResourcePackageArchive, type ResourcePackageArchive } from './resourcePackageArchive'
import { resolveProjectCover } from './projectCoverService'
import type { ProjectCover } from '../model/projectCover'
import { resolveResourcePath, type PackageScopeRoots } from '../model/scopedResourcePath'
import {
  PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME,
  PROJECT_INTERNAL_DIRECTORY_NAME,
  PROJECT_PACKAGE_DIRECTORY,
} from '../model/projectStructure'
import { buildCustomBlockRegistry, parseCustomBlockRegistryText, type CustomBlockRegistry } from '../model/customBlockRegistry'
import type { OcBlockDocument } from '../../card-rendering/customBlockRuntime'
import { parseOcBlock } from '../../card-rendering/customBlockRuntime'

export type ProjectResourceScopeKind = 'project' | 'package'

export type ProjectResourcePackage = {
  /** 包在清单里自述的坐标。文件名与目录名都不参与身份。 */
  readonly coordinate: PackageCoordinate
  /** 内容指纹。解开目录就挂在它上面，也是"同一个包"的判据。 */
  readonly fingerprint: string
  readonly manifest: ResourcePackageManifest
  /** 项目里那个 `.ocpack` 文件。它交给 git，是"这个项目装了它"的唯一真相。 */
  readonly archivePath: string
  /**
   * 解开后的目录。`null` 表示**正在解开**，不是"不可用"——解好之后环境会重建一次，
   * 引用它的图标与字体那时候就出现了。真正不可用的包根本不会进这张表。
   */
  readonly rootPath: string | null
  /** 包封面：清单声明且文件存在时才有值。 */
  readonly cover: ProjectCover | null
}

/**
 * 项目里装着的包，**一份内容一条**，键就是内容指纹。
 *
 * 键不是坐标，因为坐标是文件的属性而不是它的身份：同一个包换了一份构建，坐标一样、内容不一样，
 * 那是两个文件，谁也不该被悄悄丢掉（换了构建却不显示，等于页面在骗人）。
 * 反过来，同一份内容放了两个文件名（重复安装、或者手放一份）只留一条 —— 它们连解压目录都一样。
 *
 * 于是"同一个坐标该用哪一份"只在**解析引用**的时候才需要答案，见 `resolveProjectResourcePackage`。
 */
export type ProjectResourcePackageCatalog = ReadonlyMap<string, ProjectResourcePackage>

/**
 * 一个读不出来的归档：它在项目里，但我们说不出它是谁。
 *
 * 发现阶段本来就要读每个归档才知道它是谁，所以这一条不是额外校验，只是不再把结果丢掉：
 * 包管理器整页要能让人看到"这个文件我读不出来"，否则它在那里就是一个谁也解释不了的空缺。
 */
export type UnreadableProjectPackage = {
  readonly archivePath: string
  readonly reason: string
}

export type ProjectResourceEnvironment = {
  readonly kind: ProjectResourceScopeKind
  readonly namespace: string
  readonly rootPath: string | null
  readonly generation?: number
  readonly fontDocument: ProjectFontRegistryDocument
  readonly fonts: ProjectFontRegistry
  readonly iconDocument: ProjectIconRegistryDocument
  readonly iconCatalog: ProjectIconCatalog
  readonly packages?: ProjectResourcePackageCatalog
  /**
   * 项目作用域里每一个归档**文件**，含内容相同的那几份。引用解析按指纹去重（见 `packages`），
   * 但"文件夹里有哪些包"是另一件事：相册按文件列，重复的一份也是文件。
   */
  readonly packageFiles?: readonly ProjectResourcePackageFile[]
  readonly unreadablePackages?: readonly UnreadableProjectPackage[]
  readonly packageEnvironments?: ReadonlyMap<string, ProjectResourceEnvironment>
  readonly customBlockRegistry?: CustomBlockRegistry
  readonly customBlockSources?: ReadonlyMap<string, OcBlockDocument>
}

export type ProjectResourcePackageFile = {
  archivePath: string
  fingerprint: string
}

/**
 * 坐标 → 解开目录。还没解开的包不在里面 —— 它现在指不到任何文件。
 *
 * 这是从 `packages` 推出来的，不在环境上再存一份：包解开在哪只有一个答案。
 * 每个要用它的地方在自己那道边界上算一次（一次渲染、一次浏览），而不是每次解析都算。
 *
 * 同一坐标有两份（换了构建的那两个文件）时取**先出现的那一份**：引用只认坐标，
 * 所以它必须落到唯一一个目录上，规则和解析引用时一致。
 */
export function packageScopeRoots(packages: ProjectResourcePackageCatalog | undefined): PackageScopeRoots {
  const roots = new Map<string, string>()
  for (const pkg of packages?.values() ?? []) {
    const coordinate = formatPackageCoordinate(pkg.coordinate)
    if (pkg.rootPath && !roots.has(coordinate)) roots.set(coordinate, pkg.rootPath)
  }
  return roots
}

export type ProjectResourceScopeMap = ReadonlyMap<string, ProjectResourceEnvironment>

/**
 * 引用里的限定符解析成**哪一个包**：写了版本就要那一版，没写版本就取装着的里面**最高的那一版**。
 * 所以"不写版本"不存在装错版本这回事，代价是长相会随项目里的包而变。
 *
 * 同一坐标有两份时取先出现的那一份（目录按文件名排序，所以是文件名靠前的那个）。
 * 这一步是"同一个坐标用哪一份"唯一的答案所在 —— 目录里两份都在，只有引用需要选出唯一一个。
 */
export function resolveProjectResourcePackage(
  environment: ProjectResourceEnvironment,
  qualifier: PackageQualifier,
): ProjectResourcePackage | null {
  const packages = environment.packages
  if (!packages) return null
  const firstByCoordinate = new Map<string, ProjectResourcePackage>()
  for (const pkg of packages.values()) {
    const coordinate = formatPackageCoordinate(pkg.coordinate)
    if (!firstByCoordinate.has(coordinate)) firstByCoordinate.set(coordinate, pkg)
  }
  const coordinate = resolvePackageQualifier(firstByCoordinate.keys(), qualifier)
  return coordinate ? firstByCoordinate.get(coordinate) ?? null : null
}

export function projectResourceScopeIdentity(blockId: string, fieldKey: string): string {
  return `${blockId}\u0000${fieldKey}`
}

export function createProjectResourceNamespace(kind: ProjectResourceScopeKind, identity: string): string {
  const normalized = identity.toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'root'
  return `${kind}-${normalized}`
}

export function createScopedProjectFontFamily(namespace: string, fontKey: string): string {
  return `OpenCardResource-${namespace}-${fontKey}`
}

export function resolveProjectEnvironmentFontFamily(
  references: string,
  environment: ProjectResourceEnvironment,
  projectFallback: (references: string) => string,
): string {
  if (environment.kind === 'project') return projectFallback(references)
  return parseResourceReferenceList(references, 'font').map(token => {
    if (token.diagnostics.length > 0) return ''
    if (!token.reference) return token.source
    if (token.reference.scope !== 'current') return ''
    const key = token.reference.key
    const entry = Object.entries(environment.fonts).find(([candidateKey]) => (
      candidateKey.toLocaleLowerCase() === key.toLocaleLowerCase()
    ))?.[1]
    return entry ? JSON.stringify(createScopedProjectFontFamily(environment.namespace, key)) : ''
  }).filter(Boolean).join(', ')
}

/** 一个包解开后的目录就在它自己的指纹下面，所以"解开了没有"问一次缓存目录就有答案。 */
type EnvironmentFs = Pick<FileSystemService, 'fileExists' | 'readFile' | 'readDirectory'>

function isPackageFile(entry: DirEntry): boolean {
  return entry.isFile && !entry.isSymlink && entry.name.toLocaleLowerCase().endsWith(RESOURCE_PACKAGE_SUFFIX)
}

/**
 * 一个包在项目里的位置：`.opencard/packages/<随便什么名字>.ocpack`。
 * 名字不参与身份，只用来去重，所以这里按文件名排序后逐个读。
 *
 * 这里只判断一件事：**它是不是一个包**（能不能读出身份与内容特征码）。读不出来的、
 * 坐标重复的、同一份内容出现两次的，一律不进目录 —— 谁引用它，谁在渲染时拿到
 * `package-unavailable`；没有引用就一点声音都没有。
 *
 * 包里缺什么文件不在这里管：注册表是描述性的，用到它的时候自然报出来，和引用一张
 * 不存在的图片是一回事。
 */
async function discoverProjectResourcePackages(options: {
  fs: EnvironmentFs
  root: string
  /** 包快照根（`<软件存储>/cache/snapshots`）：解开目录就挂在指纹上，所以"解开了没有"在这里回答。 */
  snapshotsRoot: string
  unusableFingerprints?: ReadonlySet<string>
  onPackagePending?: (archive: ResourcePackageArchive, archivePath: string, snapshotsRoot: string) => void
}): Promise<{
  packages: Map<string, ProjectResourcePackage>
  packageFiles: ProjectResourcePackageFile[]
  unreadable: UnreadableProjectPackage[]
}> {
  const packages = new Map<string, ProjectResourcePackage>()
  const packageFiles: ProjectResourcePackageFile[] = []
  const unreadable: UnreadableProjectPackage[] = []
  const archiveRoot = `${options.root}/${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}`
  if (!await options.fs.fileExists(archiveRoot)) return { packages, packageFiles, unreadable }

  const entries = (await options.fs.readDirectory(archiveRoot)).filter(isPackageFile)
  entries.sort((left, right) => left.name.localeCompare(right.name))

  // 同一个坐标或同一份内容出现两次都不算错，是"有人又放了一份"：一份内容只留一条
  // （同一份内容连解压目录都一样），先出现的那个文件名胜出。
  for (const entry of entries) {
    const archivePath = `${archiveRoot}/${entry.name}`
    let archive: ResourcePackageArchive
    try {
      archive = await readResourcePackageArchive(archivePath)
    } catch (cause) {
      unreadable.push({ archivePath, reason: cause instanceof Error ? cause.message : String(cause) })
      continue
    }
    packageFiles.push({ archivePath, fingerprint: archive.fingerprint })
    if (packages.has(archive.fingerprint)) continue
    if (options.unusableFingerprints?.has(archive.fingerprint)) continue
    // "解开了没有"就是"缓存里有没有那个指纹目录"：缓存目录名按指纹算出来，不需要谁再记一份。
    const unpackRoot = `${options.snapshotsRoot}/${archive.fingerprint}`
    const unpacked = await options.fs.fileExists(unpackRoot)
    packages.set(archive.fingerprint, {
      coordinate: parsePackageCoordinate(archive.coordinate)!,
      fingerprint: archive.fingerprint,
      manifest: archive.manifest,
      archivePath,
      rootPath: unpacked ? unpackRoot : null,
      cover: unpacked
        ? await resolveProjectCover({ fs: options.fs, rootPath: unpackRoot, relativePath: archive.manifest.cover })
        : null,
    })
    // 还没解开的包只排队，不在这里等：加载环境不该被一次解压卡住。
    if (!unpacked) options.onPackagePending?.(archive, archivePath, options.snapshotsRoot)
  }
  return { packages, unreadable, packageFiles }
}

/** 注册表读不出来就当作空的：它是描述性的，读不动不该把整个作用域判死。 */
async function readRegistryDocument<T extends object>(
  fs: EnvironmentFs,
  path: string,
  parse: (text: string) => T | null,
  empty: T,
): Promise<T> {
  try {
    return await fs.fileExists(path) ? parse(await fs.readFile(path)) ?? empty : empty
  } catch {
    return empty
  }
}

/** 一个作用域的字体与图标注册表。包的作用域根就是它解开后的目录。 */
async function readScopeRegistries(fs: EnvironmentFs, root: string): Promise<{
  fonts: ProjectFontRegistryDocument
  icons: ProjectIconRegistryDocument
  customBlocks: CustomBlockRegistry
}> {
  return {
    fonts: await readRegistryDocument(fs, `${root}/${PROJECT_INTERNAL_DIRECTORY_NAME}/fonts/fonts.json`, parseProjectFontRegistryText, {}),
    icons: await readRegistryDocument(fs, `${root}/${PROJECT_INTERNAL_DIRECTORY_NAME}/icons/icons.json`, parseProjectIconRegistryText, {}),
    customBlocks: buildCustomBlockRegistry(await readRegistryDocument(
      fs,
      `${root}/${PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME}`,
      parseCustomBlockRegistryText,
      {},
    )),
  }
}

async function readCustomBlockSources(
  fs: EnvironmentFs,
  root: string,
  relative = '',
  result = new Map<string, OcBlockDocument>(),
): Promise<ReadonlyMap<string, OcBlockDocument>> {
  let entries: DirEntry[]
  try {
    entries = await fs.readDirectory(`${root}/${relative}`)
  } catch {
    return result
  }
  for (const entry of entries) {
    if (entry.isSymlink) continue
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name
    const absolutePath = `${root}/${relativePath}`
    if (entry.isDirectory) {
      const directory = relativePath.toLocaleLowerCase().replace(/\\/g, '/')
      if (directory === '.git' || directory.startsWith('.git/')
        || directory === 'node_modules' || directory.startsWith('node_modules/')
        || directory === 'dist' || directory.startsWith('dist/')
        || directory === '.opencard/packages' || directory.startsWith('.opencard/packages/')) continue
      await readCustomBlockSources(fs, root, relativePath, result)
      continue
    }
    if (!entry.isFile || !entry.name.toLocaleLowerCase().endsWith('.ocblock')) continue
    try {
      const parsed = parseOcBlock(JSON.parse(await fs.readFile(absolutePath)))
      if (parsed) result.set(relativePath, parsed)
    } catch {
      // A malformed source is reported when a custom block references it.
    }
  }
  return result
}

function buildScopeIconCatalog(
  root: string,
  projectRoot: string,
  icons: ProjectIconRegistryDocument,
): ProjectIconCatalog {
  const series = icons.iconSeries ?? []
  if (series.length === 0) return EMPTY_PROJECT_ICON_CATALOG
  return buildProjectIconCatalog(series, source => {
    const resolved = resolveResourcePath({ scopeRootPath: root, projectRootPath: projectRoot, reference: source })
    return resolved.ok ? convertFileSrc(resolved.value) : ''
  })
}

export async function loadProjectResourceEnvironment(options: {
  fs: EnvironmentFs
  rootPath: string | null
  projectRootPath?: string | null
  /**
   * 包快照根（`<软件存储>/cache/snapshots`）。它决定"包解开了没有"这个问题的答案在哪找，
   * 所以由调用方解析一次传进来，而不是每个包各自去问。
   */
  snapshotsRoot: string
  kind: ProjectResourceScopeKind
  identity: string
  generation?: number
  /**
   * A catalog already assembled by the caller for this same root, so the environment reuses it instead
   * of assembling an identical one.
   */
  iconCatalog?: ProjectIconCatalog
  /**
   * 已经试过但解不开的包（指纹）。它们不进目录：一个解不开的包既画不出东西，
   * 也不该永远停在"正在解开"上。为什么解不开由调用方在失败发生处报出去。
   */
  unusableFingerprints?: ReadonlySet<string>
  /**
   * 发现一个还没解开的包时叫一次，并把包快照根一起交给它。加载本身**不等**它：那是后台的事，
   * 解好之后重建一次环境，画面自己补齐。
   */
  onPackagePending?: (archive: ResourcePackageArchive, archivePath: string, snapshotsRoot: string) => void
}): Promise<ProjectResourceEnvironment> {
  const namespace = createProjectResourceNamespace(options.kind, options.identity)
  const root = options.rootPath?.replace(/[\\/]+$/, '') ?? null
  const projectRoot = options.projectRootPath?.replace(/[\\/]+$/, '') ?? root ?? ''
  const snapshotsRoot = options.snapshotsRoot.replace(/[\\/]+$/, '')

  const registries = root
    ? await readScopeRegistries(options.fs, root)
    : { fonts: {}, icons: {}, customBlocks: {} }

  const discovered = root && options.kind === 'project'
    ? await discoverProjectResourcePackages({
      fs: options.fs,
      root,
      snapshotsRoot,
      unusableFingerprints: options.unusableFingerprints,
      onPackagePending: options.onPackagePending,
    })
    : { packages: new Map<string, ProjectResourcePackage>(), unreadable: [], packageFiles: [] }
  const packages = discovered.packages

  const packageEnvironments = new Map<string, ProjectResourceEnvironment>()
  for (const pkg of packages.values()) {
    if (!pkg.rootPath) continue
    // 包环境按**坐标**索引：引用只认坐标，所以同一坐标有两份时仍然只建一个环境（先出现的那份）。
    const coordinate = formatPackageCoordinate(pkg.coordinate)
    if (packageEnvironments.has(coordinate)) continue
    const loadedPackageEnvironment = await loadProjectResourceEnvironment({
      fs: options.fs,
      rootPath: pkg.rootPath,
      projectRootPath: projectRoot,
      snapshotsRoot,
      kind: 'package',
      identity: coordinate,
      generation: options.generation,
    })
    const publicBlocks = pkg.manifest.public.blocks ?? []
    const manifestBlocks = Object.fromEntries(publicBlocks.map((entry) => [entry.key, {
      key: entry.key,
      name: entry.title,
      source: entry.source,
    }]))
    packageEnvironments.set(coordinate, {
      ...loadedPackageEnvironment,
      customBlockRegistry: {
        ...(loadedPackageEnvironment.customBlockRegistry ?? {}),
        ...manifestBlocks,
      },
    })
  }

  const iconCatalog = options.iconCatalog ?? (root
    ? buildScopeIconCatalog(root, projectRoot, registries.icons)
    : EMPTY_PROJECT_ICON_CATALOG)
  return {
    kind: options.kind,
    namespace,
    rootPath: root,
    generation: options.generation ?? 0,
    fontDocument: registries.fonts,
    fonts: buildProjectFontRegistry(registries.fonts),
    iconDocument: registries.icons,
    iconCatalog,
    packages,
    packageFiles: discovered.packageFiles,
    unreadablePackages: discovered.unreadable,
    packageEnvironments,
    customBlockRegistry: registries.customBlocks,
    customBlockSources: root ? await readCustomBlockSources(options.fs, root) : new Map(),
  }
}
