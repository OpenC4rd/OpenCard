/**
 * 模块说明：
 * - 维护项目路径 目录索引 监听与文件树移动重命名事务
 * 职责边界：
 * - 只管理文件系统真相 不管理编辑草稿与会话状态
 */
import { computed, readonly, ref, shallowRef } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import { listen, type Event, type UnlistenFn } from '@tauri-apps/api/event'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import { fileSystemService, takeDirectoryWalkMetrics } from '../services/fileSystemService'
import { createProjectOpenTimer } from '../services/projectOpenTiming'
import { initializeProjectStructure } from '../services/projectStructureService'
import {
  isProjectIndexSkippedPath,
  isProjectInternalRelativePath,
  PROJECT_INTERNAL_DIRECTORIES,
  PROJECT_INTERNAL_DIRECTORY_NAME,
  PROJECT_PACKAGE_DIRECTORY,
  resolveProjectInternalRelativePath,
} from '../model/projectStructure'
import {
  PROJECT_PROFILE_FILE_NAME,
  parseProjectMetadataText,
  serializeProjectMetadata,
  toProjectInformation,
  type ProjectInformation,
  type ProjectProfile,
} from '../model/projectMetadata'
import {
  PROJECT_FONT_REGISTRY_FILE_NAME,
  buildProjectFontRegistry,
  parseProjectFontRegistryText,
  serializeProjectFontRegistry,
  type ProjectFontComposition,
  type ProjectFont,
  type ProjectFontRegistry,
} from '../model/projectFontRegistry'
import {
  PROJECT_ICON_REGISTRY_FILE_NAME,
  parseProjectIconRegistryText,
  serializeProjectIconRegistry,
} from '../model/projectIconRegistry'
import {
  PROJECT_DICTIONARY_FILE_NAME,
  parseProjectDictionaryText,
  resolveProjectDictionary,
  serializeProjectDictionary,
  type ProjectDictionary,
  type ResolvedProjectDictionary,
} from '../model/projectDictionary'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import { findProjectWorkspaceState, updateProjectWorkspaceState } from '../../settings/model/workspaceState'
import { taskScheduler } from '../../../utils/taskScheduler'
import type { OcNodeDropPosition } from '../../../shared/ui/node/node.types'
import { getPathBasename, normalizePath } from '../../../shared/model/filePath'
import {
  APP_CACHE_PACKAGES_DIRECTORY_NAME,
  resolveAppCachePath,
} from '../../../shared/storage/appStoragePaths'
import { reportAppError } from '../../logging/appErrorCatalog'
import {
  clearProjectFonts,
  syncProjectFonts,
  type ProjectFontLoadError,
} from '../services/projectFontLoader'
import {
  ensureLoadableProjectFont,
  extractFontCollectionFaces,
} from '../services/trueTypeFontRepair'
import { readProjectFontCharacterSet } from '../services/projectFontCoverage'
import {
  buildProjectIconCatalog,
  EMPTY_PROJECT_ICON_CATALOG,
  type ProjectIconCatalog,
  type ProjectIconLoadError,
} from '../services/projectIconCatalog'
import { readProjectIconDimensions } from '../services/projectIconDimensions'
import {
  clearProjectIconDimensions,
  forgetProjectIconDimensions,
  loadProjectImageDimensions,
  readProjectIconSize,
  setProjectIconDimensionLoader,
} from '../services/projectIconDimensionResolver'
import type { CardRenderEnvironment } from '../../card-rendering/renderPipeline'
import { isRemoteResourceAllowed } from '../../editor-runtime/services/editorResource'
import { networkResourceManager } from '../../network-resources/store/networkResourceManager'
import {
  DEFAULT_PROJECT_ICON_DIRECTORY,
  findProjectIconKeyConflicts,
  type ProjectIconSeries,
} from '../model/projectIcons'
import {
  DEFAULT_PROJECT_FONT_DIRECTORY,
} from '../model/projectFonts'
import {
  readResourcePackageArchive,
  unpackResourcePackage,
  type ResourcePackageArchive,
} from '../services/resourcePackageArchive'
import {
  createProjectResourceNamespace,
  loadProjectResourceEnvironment,
  packageScopeRoots,
  type ProjectResourceEnvironment,
  type ProjectResourcePackage,
  type ProjectResourcePackageCatalog,
} from '../services/projectResourceEnvironment'
import {
  relativizeResourcePath,
  resolveResourcePath as resolveScopedResourcePath,
} from '../model/scopedResourcePath'

const PROJECT_METADATA_SAVE_DELAY_MS = 1200
const PROJECT_METADATA_SAVE_KEY = 'project-metadata'
const PROJECT_TREE_LOOKAHEAD_DEPTH = 2

/**
 * Bulk operations (importing an icon set, installing a package, unpacking a template) write many
 * files in a row, and every write raises its own watcher event. Coalescing the reactions behind one
 * short quiet window turns "one full project re-index per written file" into a single refresh, which
 * is what keeps a large import from getting slower the more files the project already holds.
 */
const FILE_CHANGE_REFRESH_DELAY_MS = 150
const FILE_CHANGE_INDEX_REFRESH_KEY = 'project-index-refresh'
const FILE_CHANGE_RESOURCE_ENVIRONMENT_REFRESH_KEY = 'project-resource-environment-refresh'
const PROJECT_FONT_EXTENSIONS = new Set(['woff', 'woff2', 'ttf', 'otf', 'ttc', 'otc'])
const PROJECT_ICON_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg'])

export type ImportedProjectFontFile = {
  source: string
  copied: boolean
}
export type ImportedProjectFontFiles = {
  sources: readonly string[]
  copied: boolean
}
export type ProjectAssetImportConflict = {
  existingSource: string
  availableCopySource: string
}
export type ProjectAssetImportResolution = 'rename-copy' | 'use-existing'

interface FileChangedPayload {
  /** 后端会把一段时间内的变化合并成一批，所以这里只关心路径。 */
  paths: string[]
}

type MoveEntryByDropResult =
  | { ok: true; fromPath: string; toPath: string }
  | { ok: false; reason: 'project-not-open' | 'invalid-target' | 'self-target' | 'descendant-target' | 'same-path' | 'target-exists' | 'move-failed' }

type RenameEntryResult =
  | { ok: true; fromPath: string; toPath: string }
  | { ok: false; reason: 'project-not-open' | 'invalid-name' | 'same-path' | 'target-exists' | 'rename-failed' }

export type WorkspaceEntryMoveRequest = {
  key: string
  targetKey: string | null
  position: OcNodeDropPosition
}

/** Files dragged in from outside the application, addressed to one place in the project tree. */
export type WorkspaceExternalDropRequest = {
  paths: readonly string[]
  targetKey: string | null
  position: OcNodeDropPosition
}

type CopyExternalEntriesResult =
  | { ok: true; copied: number; skipped: number; failed: number }
  | { ok: false; reason: 'project-not-open' | 'invalid-target' }

const projectPath = ref('')
const indexedEntries = ref<DirEntry[]>([])
const isWatching = ref(false)
const fileChangeRevision = ref(0)
const registeredDirectories = ref(new Map<string, number>())
const expandedDirectories = ref(new Set<string>())
const projectProfile = ref<ProjectProfile | null>(null)
const resolvedProject = ref<ProjectInformation | null>(null)
const profileError = ref<string | null>(null)
const projectFontFamilies = ref<readonly ProjectFont[]>([])
const projectFontCompositions = ref<readonly ProjectFontComposition[]>([])
const projectFonts = ref<ProjectFontRegistry>({})
const fontRegistryError = ref<string | null>(null)
const fontRegistryReady = ref(false)
const projectFontLoadErrors = ref<readonly ProjectFontLoadError[]>([])
const projectIconSeries = ref<readonly ProjectIconSeries[]>([])
const iconRegistryError = ref<string | null>(null)
const iconRegistryReady = ref(false)
const projectIconCatalog = ref<ProjectIconCatalog>(EMPTY_PROJECT_ICON_CATALOG)
const projectIconLoadErrors = ref<readonly ProjectIconLoadError[]>([])
const projectDictionary = ref<ProjectDictionary | null>(null)
const resolvedDictionary = ref<ResolvedProjectDictionary | null>(null)
const dictionaryError = ref<string | null>(null)
const projectResourcePackages = shallowRef<ProjectResourcePackageCatalog>(new Map())
const projectResourceEnvironments = shallowRef<ReadonlyMap<string, ProjectResourceEnvironment>>(new Map())
let resourceEnvironmentReloadVersion = 0
const settingsStore = useAppSettingsStore()
const projectResourceEnvironment = computed<ProjectResourceEnvironment>(() => ({
  kind: 'project',
  namespace: createProjectResourceNamespace('project', projectPath.value || 'root'),
  rootPath: projectPath.value || null,
  generation: fileChangeRevision.value,
  fontDocument: {
    families: projectFontFamilies.value,
    compositions: projectFontCompositions.value,
  },
  fonts: projectFonts.value,
  iconDocument: { iconSeries: projectIconSeries.value },
  iconCatalog: projectIconCatalog.value,
  packages: projectResourcePackages.value,
  packageEnvironments: projectResourceEnvironments.value,
}))
/**
 * One icon's paint asks for its size here. The catalog entry is the shared record every render path
 * reads, so the answer is written onto it: the surfaces that already hold this entry re-render, and a
 * later reader sees a measured icon without asking again.
 */
const renderEnvironment = computed<CardRenderEnvironment>(() => ({
  project: resolvedProject.value,
  dictionary: resolvedDictionary.value,
  remoteResourcePolicy: projectProfile.value?.remoteResources,
  resolveRemoteResource: url => {
    const path = projectPath.value
    if (!path || !isRemoteResourceAllowed(url, projectProfile.value?.remoteResources)) return null
    const resource = networkResourceManager.forProject(
      path,
      source => isRemoteResourceAllowed(source, projectProfile.value?.remoteResources),
    ).get(url)
    return resource ? convertFileSrc(resource.path) : null
  },
  projectIconCatalog: projectIconCatalog.value,
  resolveIconDimensions: readProjectIconSize,
  projectResourceEnvironment: projectResourceEnvironment.value,
}) as CardRenderEnvironment)

let unlistenFn: UnlistenFn | null = null
let projectIconLoadVersion = 0
let projectManagementStructurePromise: Promise<void> | null = null

/** Sizes are read from the project files, once per icon, only when an icon is painted. */
setProjectIconDimensionLoader(loadProjectIconDimensions)

function pathIdentity(path: string): string {
  const normalized = normalizePath(path)
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized
}

function ensureProjectOpen(): string {
  if (!projectPath.value) {
    throw new Error('Project is not open')
  }

  return normalizePath(projectPath.value)
}

function resolveProjectPath(path: string): string {
  if (!path) {
    return ensureProjectOpen()
  }

  const normalizedProjectPath = ensureProjectOpen()
  const normalizedPath = normalizePath(path)

  if (pathIdentity(normalizedPath) === pathIdentity(normalizedProjectPath)
    || pathIdentity(normalizedPath).startsWith(`${pathIdentity(normalizedProjectPath)}/`)) {
    return normalizedPath
  }

  return `${normalizedProjectPath}/${path.replace(/^[/\\]+/, '').replace(/\\/g, '/')}`
}

function resolveProjectInternalPath(path = ''): string {
  return resolveProjectPath(resolveProjectInternalRelativePath(path))
}

/**
 * 这个文件属于哪个作用域。项目里的文件属于项目；缓存里的文件属于某个包 ——
 * 包解开在软件存储里，与项目根毫无关系，所以只有拿已知的包根去比。
 */
function scopeRootForFile(rootPath: string, filePath: string): string | null {
  const identity = pathIdentity(filePath)
  if (identity === pathIdentity(rootPath) || identity.startsWith(`${pathIdentity(rootPath)}/`)) return rootPath
  for (const candidate of packageScopeRoots(projectResourceEnvironment.value.packages).values()) {
    const packageIdentity = pathIdentity(candidate)
    if (identity === packageIdentity || identity.startsWith(`${packageIdentity}/`)) return candidate
  }
  return null
}

function resolveResourcePathFromFile(sourceFilePath: string, reference: string): string {
  const rootPath = ensureProjectOpen()
  const resolved = resolveScopedResourcePath({
    scopeRootPath: scopeRootForFile(rootPath, resolveProjectPath(sourceFilePath)) ?? rootPath,
    projectRootPath: rootPath,
    reference,
    packageRoots: packageScopeRoots(projectResourceEnvironment.value.packages),
  })
  if (!resolved.ok) throw new Error(resolved.message)
  return resolved.value
}

function resolveResourceAssetSrcFromFile(sourceFilePath: string, reference: string): string {
  return convertFileSrc(resolveResourcePathFromFile(sourceFilePath, reference))
}

function createResourceReferenceFromFile(sourceFilePath: string, targetPath: string): string {
  const rootPath = ensureProjectOpen()
  const resolved = relativizeResourcePath({
    scopeRootPath: scopeRootForFile(rootPath, resolveProjectPath(sourceFilePath)) ?? rootPath,
    projectRootPath: rootPath,
    targetPath: resolveProjectPath(targetPath),
    packageRoots: packageScopeRoots(projectResourceEnvironment.value.packages),
  })
  if (!resolved.ok) throw new Error(resolved.message)
  return resolved.value
}

function toRelativeProjectPath(path: string): string {
  const normalizedProjectPath = ensureProjectOpen()
  const resolvedPath = resolveProjectPath(path)

  if (resolvedPath === normalizedProjectPath) {
    return ''
  }

  return resolvedPath.slice(normalizedProjectPath.length + 1)
}

async function saveProjectWorkspaceState() {
  if (!projectPath.value) return
  const states = settingsStore.settings.value.projectCreation.workspaceStates
  const workspaceStates = updateProjectWorkspaceState(states, projectPath.value, (current) => {
    current.expandedDirectories = Array.from(expandedDirectories.value).sort()
    return current
  })
  settingsStore.updateProjectCreation({ workspaceStates })
}

async function saveProjectConfiguration(path: string, content: string): Promise<string> {
  const profile = parseProjectMetadataText(content)
  if (!profile) throw new Error('Invalid project.json content')
  const resolvedPath = resolveProjectPath(path)
  if (pathIdentity(resolvedPath) !== pathIdentity(resolveProjectPath(PROJECT_PROFILE_FILE_NAME))) {
    throw new Error('Project profile must be stored at the project root')
  }
  const canonicalContent = serializeProjectMetadata(profile)
  await fileSystemService.writeFile(resolvedPath, canonicalContent)
  await reloadProjectProfile()
  return canonicalContent
}

async function saveProjectFontRegistry(path: string, content: string): Promise<string> {
  const document = parseProjectFontRegistryText(content)
  if (!document) throw new Error('Invalid fonts.json content')
  const resolvedPath = resolveProjectPath(path)
  if (pathIdentity(resolvedPath) !== pathIdentity(resolveProjectPath(PROJECT_FONT_REGISTRY_FILE_NAME))) {
    throw new Error('Project font registry must be stored at the project root')
  }
  const canonicalContent = serializeProjectFontRegistry(document)
  await fileSystemService.writeFile(resolvedPath, canonicalContent)
  await reloadProjectFontRegistry()
  return canonicalContent
}

async function saveProjectIconRegistry(path: string, content: string): Promise<string> {
  const document = parseProjectIconRegistryText(content)
  if (!document || findProjectIconKeyConflicts(document.iconSeries).length > 0) {
    throw new Error('Invalid icons.json content')
  }
  const resolvedPath = resolveProjectPath(path)
  if (pathIdentity(resolvedPath) !== pathIdentity(resolveProjectPath(PROJECT_ICON_REGISTRY_FILE_NAME))) {
    throw new Error('Project icon registry must be stored at the project root')
  }
  const canonicalContent = serializeProjectIconRegistry(document)
  await fileSystemService.writeFile(resolvedPath, canonicalContent)
  await reloadProjectIconRegistry()
  return canonicalContent
}

async function saveProjectDictionary(path: string, content: string): Promise<string> {
  const dictionary = parseProjectDictionaryText(content)
  if (!dictionary) throw new Error('Invalid locale.json content')
  const resolvedPath = resolveProjectPath(path)
  if (pathIdentity(resolvedPath) !== pathIdentity(resolveProjectPath(PROJECT_DICTIONARY_FILE_NAME))) {
    throw new Error('Project dictionary must be stored at the project root')
  }
  const canonicalContent = serializeProjectDictionary(dictionary)
  await fileSystemService.writeFile(resolvedPath, canonicalContent)
  await reloadProjectDictionary()
  return canonicalContent
}

function clearProjectProfile() {
  projectProfile.value = null
  resolvedProject.value = null
  profileError.value = null
}

function clearProjectFontRegistry() {
  clearProjectFonts()
  projectFontFamilies.value = []
  projectFontCompositions.value = []
  projectFonts.value = {}
  fontRegistryError.value = null
  projectFontLoadErrors.value = []
  fontRegistryReady.value = false
}

function clearProjectIconRegistry() {
  projectIconLoadVersion += 1
  // Sizes belong to the project that is closing.
  clearProjectIconDimensions()
  projectIconSeries.value = []
  iconRegistryError.value = null
  projectIconCatalog.value = EMPTY_PROJECT_ICON_CATALOG
  projectIconLoadErrors.value = []
  iconRegistryReady.value = false
}

async function syncRegisteredProjectFonts(
  fonts: readonly ProjectFont[],
  compositions: readonly ProjectFontComposition[] = projectFontCompositions.value,
): Promise<void> {
  const result = await syncProjectFonts(
    fonts,
    source => resolveResourceAssetSrcFromFile(PROJECT_FONT_REGISTRY_FILE_NAME, source),
    compositions,
    async source => readProjectFontCharacterSet(
      await fileSystemService.readBinaryFile(resolveResourcePathFromFile(PROJECT_FONT_REGISTRY_FILE_NAME, source)),
    ),
  )
  if (result.current) projectFontLoadErrors.value = result.errors
}

/** Whether a project-relative path is a file one icon set owns, whatever the registry currently says. */
function isManagedProjectIconFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLocaleLowerCase()
  const iconRoot = `${PROJECT_INTERNAL_DIRECTORY_NAME}/${DEFAULT_PROJECT_ICON_DIRECTORY}/`.toLocaleLowerCase()
  return normalized.startsWith(iconRoot)
    && PROJECT_ICON_EXTENSIONS.has(normalized.slice(normalized.lastIndexOf('.') + 1))
}

/**
 * Resolves one icon's natural size when its first paint asks for it.
 *
 * A vector states its size in its own markup, so reading that text is much cheaper than decoding the
 * image and is tried first; everything else is handed to the decoder.
 */
async function loadProjectIconDimensions(
  src: string,
  source: string,
): Promise<{ width: number; height: number }> {
  try {
    const content = await fileSystemService.readFile(
      resolveResourcePathFromFile(PROJECT_ICON_REGISTRY_FILE_NAME, source),
    )
    const dimensions = readProjectIconDimensions(source, content)
    if (dimensions) return dimensions
  } catch {
    // Fall through to the decoder: an unreadable or unusual file still deserves a real measurement.
  }
  return await loadProjectImageDimensions(src)
}

function syncRegisteredProjectIcons(iconSeries: readonly ProjectIconSeries[]): void {
  const version = ++projectIconLoadVersion
  const catalog = buildProjectIconCatalog(
    iconSeries,
    source => resolveResourceAssetSrcFromFile(PROJECT_ICON_REGISTRY_FILE_NAME, source),
  )
  if (version !== projectIconLoadVersion) return
  projectIconCatalog.value = catalog
  projectIconLoadErrors.value = catalog.errors
}

function clearProjectDictionary() {
  projectDictionary.value = null
  resolvedDictionary.value = null
  dictionaryError.value = null
}

async function reloadProjectResourceEnvironment(): Promise<boolean> {
  const expectedVersion = ++resourceEnvironmentReloadVersion
  const expectedProjectPath = projectPath.value
  if (!expectedProjectPath) {
    projectResourcePackages.value = new Map()
    projectResourceEnvironments.value = new Map()
    return false
  }
  try {
    const environment = await loadProjectResourceEnvironment({
      fs: fileSystemService,
      rootPath: expectedProjectPath,
      packagesRoot: await resolveAppCachePath(APP_CACHE_PACKAGES_DIRECTORY_NAME),
      kind: 'project',
      identity: expectedProjectPath,
      generation: fileChangeRevision.value,
      iconCatalog: projectIconCatalog.value,
      unusableFingerprints,
      onPackagePending: schedulePackageUnpacking,
    })
    if (expectedVersion !== resourceEnvironmentReloadVersion || expectedProjectPath !== projectPath.value) return false
    projectResourcePackages.value = environment.packages ?? new Map()
    projectResourceEnvironments.value = environment.packageEnvironments ?? new Map()
    return true
  } catch (error) {
    if (expectedVersion !== resourceEnvironmentReloadVersion || expectedProjectPath !== projectPath.value) return false
    projectResourcePackages.value = new Map()
    projectResourceEnvironments.value = new Map()
    reportAppError('OC-E3016', { path: `${expectedProjectPath}/.opencard/packages`, error })
    return false
  }
}

async function reloadProjectProfile(): Promise<boolean> {
  if (!projectPath.value) return false
  const path = resolveProjectPath(PROJECT_PROFILE_FILE_NAME)
  if (!await fileSystemService.fileExists(path)) {
    clearProjectProfile()
    return false
  }
  try {
    const profile = parseProjectMetadataText(await fileSystemService.readFile(path))
    if (!profile) throw new Error('Invalid project profile')
    projectProfile.value = profile
    resolvedProject.value = toProjectInformation(profile)
    profileError.value = null
    return true
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : String(error)
    projectProfile.value = null
    resolvedProject.value = null
    reportAppError('OC-E3002', { path, error })
    return false
  }
}

async function reloadProjectFontRegistry(): Promise<boolean> {
  if (!projectPath.value) return false
  const path = resolveProjectPath(PROJECT_FONT_REGISTRY_FILE_NAME)
  if (!await fileSystemService.fileExists(path)) {
    clearProjectFontRegistry()
    fontRegistryReady.value = true
    return false
  }
  try {
    const document = parseProjectFontRegistryText(await fileSystemService.readFile(path))
    if (!document) throw new Error('Invalid project font registry')
    projectFontFamilies.value = document.families ?? []
    projectFontCompositions.value = document.compositions ?? []
    projectFonts.value = buildProjectFontRegistry(document)
    await syncRegisteredProjectFonts(projectFontFamilies.value, projectFontCompositions.value)
    fontRegistryError.value = null
    fontRegistryReady.value = true
    return true
  } catch (error) {
    clearProjectFontRegistry()
    fontRegistryError.value = error instanceof Error ? error.message : String(error)
    reportAppError('OC-E3009', { path, error })
    return false
  }
}

async function reloadProjectIconRegistry(): Promise<boolean> {
  if (!projectPath.value) return false
  const path = resolveProjectPath(PROJECT_ICON_REGISTRY_FILE_NAME)
  if (!await fileSystemService.fileExists(path)) {
    clearProjectIconRegistry()
    iconRegistryReady.value = true
    return false
  }
  try {
    const document = parseProjectIconRegistryText(await fileSystemService.readFile(path))
    if (!document || findProjectIconKeyConflicts(document.iconSeries).length > 0) {
      throw new Error('Invalid project icon registry')
    }
    projectIconSeries.value = document.iconSeries ?? []
    await syncRegisteredProjectIcons(projectIconSeries.value)
    iconRegistryError.value = null
    iconRegistryReady.value = true
    return true
  } catch (error) {
    clearProjectIconRegistry()
    iconRegistryError.value = error instanceof Error ? error.message : String(error)
    reportAppError('OC-E3010', { path, error })
    return false
  }
}

async function reloadProjectDictionary(): Promise<boolean> {
  if (!projectPath.value) return false
  const path = resolveProjectPath(PROJECT_DICTIONARY_FILE_NAME)
  if (!await fileSystemService.fileExists(path)) {
    clearProjectDictionary()
    return false
  }
  try {
    const dictionary = parseProjectDictionaryText(await fileSystemService.readFile(path))
    if (!dictionary) throw new Error('Invalid project dictionary')
    const resolution = resolveProjectDictionary(dictionary)
    projectDictionary.value = dictionary
    resolvedDictionary.value = resolution.values
    dictionaryError.value = resolution.warning
    if (resolution.warning) {
      console.warn('[project-dictionary] Active language is missing:', { path, active: dictionary.active })
    }
    return true
  } catch (error) {
    dictionaryError.value = error instanceof Error ? error.message : String(error)
    projectDictionary.value = null
    resolvedDictionary.value = null
    reportAppError('OC-E3003', { path, error })
    return false
  }
}

function loadProjectWorkspaceState() {
  const state = findProjectWorkspaceState(
    settingsStore.settings.value.projectCreation.workspaceStates,
    projectPath.value,
  )
  expandedDirectories.value = new Set(state?.expandedDirectories ?? [])
  registeredDirectories.value = new Map([['', PROJECT_TREE_LOOKAHEAD_DEPTH]])
  for (const directory of PROJECT_INTERNAL_DIRECTORIES) {
    registeredDirectories.value.set(directory, 1)
  }
  for (const relativePath of expandedDirectories.value) {
    registeredDirectories.value.set(relativePath, PROJECT_TREE_LOOKAHEAD_DEPTH)
  }
}

function scheduleProjectMetadataSave() {
  if (!projectPath.value) return

  taskScheduler.schedule(PROJECT_METADATA_SAVE_KEY, PROJECT_METADATA_SAVE_DELAY_MS, async () => {
    await saveProjectWorkspaceState()
  })
}

function isMetadataPath(path: string): boolean {
  if (!projectPath.value) return false
  return [
    PROJECT_PROFILE_FILE_NAME,
    PROJECT_FONT_REGISTRY_FILE_NAME,
    PROJECT_ICON_REGISTRY_FILE_NAME,
    PROJECT_DICTIONARY_FILE_NAME,
  ]
    .some(fileName => pathIdentity(resolveProjectPath(fileName)) === pathIdentity(path))
}

/**
 * 那些被跳过的目录的登记不进索引：它们只作为条目被父目录列出。
 * 规则本身在 `model/projectStructure` 里，和 `.opencard` 的定义待在一起。
 */

async function refreshIndexedEntries(options?: { persist?: boolean }) {
  if (!projectPath.value) return

  try {
    const nextEntries = new Map<string, DirEntry>()
    const unavailableDirectories = new Set<string>()
    // 托管目录（.opencard/fonts、.opencard/icons）的内容永远不进索引：它们只作为条目被父目录列出。
    // 若这里还按登记去列一次，导入过大量字体的项目每次打开都要重新读那个目录。
    const managedRegistrations = [...registeredDirectories.value.keys()].filter(isProjectIndexSkippedPath)
    if (managedRegistrations.length > 0) {
      registeredDirectories.value = new Map([...registeredDirectories.value]
        .filter(([relativePath]) => !isProjectIndexSkippedPath(relativePath)))
    }
    const registrations = Array.from(registeredDirectories.value.entries())
      .sort(([leftPath], [rightPath]) => leftPath.length - rightPath.length)

    for (const [relativePath, depth] of registrations) {
      const directoryPath = relativePath ? resolveProjectPath(relativePath) : ensureProjectOpen()
      let entries: DirEntry[]
      try {
        entries = await fileSystemService.readDirectoryEntries(directoryPath, depth, relativePath, {
          skipDirectory: isProjectIndexSkippedPath,
        })
      } catch (error) {
        if (!relativePath || await fileSystemService.fileExists(directoryPath)) throw error
        unavailableDirectories.add(relativePath)
        continue
      }

      for (const entry of entries) {
        nextEntries.set(entry.name, entry)
      }
    }

    if (unavailableDirectories.size > 0) {
      registeredDirectories.value = new Map([...registeredDirectories.value]
        .filter(([relativePath]) => !unavailableDirectories.has(relativePath)))
      expandedDirectories.value = new Set([...expandedDirectories.value]
        .filter(relativePath => !unavailableDirectories.has(relativePath)))
    }
    indexedEntries.value = Array.from(nextEntries.values())

    if (options?.persist !== false) {
      scheduleProjectMetadataSave()
    }
  } catch (error) {
    reportAppError('OC-E2005', error)
  }
}

async function readDirectoryEntries(path: string = '', depth: number = PROJECT_TREE_LOOKAHEAD_DEPTH) {
  const relativePath = toRelativeProjectPath(path)
  // 托管目录的内容不进索引，也不登记，否则会在大目录上退化成每次打开项目都重列一遍。
  if (isProjectIndexSkippedPath(relativePath)) return
  const normalizedDepth = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : Number.POSITIVE_INFINITY
  const currentDepth = registeredDirectories.value.get(relativePath) ?? 0

  if (currentDepth < normalizedDepth) {
    registeredDirectories.value.set(relativePath, normalizedDepth)
  }

  await refreshIndexedEntries()
}

function setDirectoryExpanded(path: string, expanded: boolean) {
  const relativePath = toRelativeProjectPath(path)
  // 托管目录的内容不进索引，展开与否都不登记。
  if (!relativePath || isProjectIndexSkippedPath(relativePath)) {
    return
  }

  const nextExpandedDirectories = new Set(expandedDirectories.value)

  if (expanded) {
    nextExpandedDirectories.add(relativePath)
    registeredDirectories.value.set(
      relativePath,
      Math.max(registeredDirectories.value.get(relativePath) ?? 0, PROJECT_TREE_LOOKAHEAD_DEPTH),
    )
  } else {
    nextExpandedDirectories.delete(relativePath)
  }

  expandedDirectories.value = nextExpandedDirectories
  scheduleProjectMetadataSave()
}

function isDirectoryExpanded(path: string): boolean {
  const relativePath = toRelativeProjectPath(path)
  return relativePath ? expandedDirectories.value.has(relativePath) : true
}

function resolveAssetSrc(path: string): string {
  if (!path) {
    return ''
  }

  return convertFileSrc(resolveProjectPath(path))
}

async function startWatching() {
  if (!projectPath.value || isWatching.value) return

  try {
    unlistenFn = await listen<FileChangedPayload>('file-changed', (event: Event<FileChangedPayload>) => {
      // 项目里的 `.ocpack` 现在就是"这个项目装了哪些包"本身，所以它们的变化必须看见：
      // 用户从资源管理器拖进来一个、或者 `git pull` 拉回来一个，都要重扫。
      const changedPaths = event.payload.paths.map((path) => normalizePath(path))
      if (changedPaths.length === 0) return
      fileChangeRevision.value += 1
      if (changedPaths.some(path => pathIdentity(path) === pathIdentity(resolveProjectPath(PROJECT_PROFILE_FILE_NAME)))) {
        void reloadProjectProfile()
      }
      if (changedPaths.some(path => pathIdentity(path) === pathIdentity(resolveProjectPath(PROJECT_FONT_REGISTRY_FILE_NAME)))) {
        void reloadProjectFontRegistry()
      }
      if (changedPaths.some(path => pathIdentity(path) === pathIdentity(resolveProjectPath(PROJECT_ICON_REGISTRY_FILE_NAME)))) {
        void reloadProjectIconRegistry()
      }
      // Both of these scan far more than the changed path, so they wait for a quiet window instead of
      // running once per written file.
      taskScheduler.schedule(
        FILE_CHANGE_RESOURCE_ENVIRONMENT_REFRESH_KEY,
        FILE_CHANGE_REFRESH_DELAY_MS,
        async () => {
          await reloadProjectResourceEnvironment()
        },
      )
      if (changedPaths.some(path => pathIdentity(path) === pathIdentity(resolveProjectPath(PROJECT_DICTIONARY_FILE_NAME)))) {
        void reloadProjectDictionary()
      }
      const fontSources = projectFontFamilies.value.flatMap(font => Object.values(font.files)
        .flatMap(styles => Object.values(styles ?? {}))
        .map(source => resolveResourcePathFromFile(PROJECT_FONT_REGISTRY_FILE_NAME, source)))
      if (changedPaths.some(path => fontSources.some(source => pathIdentity(path) === pathIdentity(source)))) {
        void syncRegisteredProjectFonts(projectFontFamilies.value)
      }
      // Any managed icon file that changed may have changed size. This is keyed by path rather than
      // by current registration, because a set being created writes its files before its registry
      // entry exists, and a re-created set reuses the same paths for new content.
      for (const path of changedPaths) {
        const relative = toRelativeProjectPath(path)
        // Any measured size for a managed icon file that changed is stale.
        if (isManagedProjectIconFile(relative)) forgetProjectIconDimensions(relative)
      }
      const iconSources = projectIconSeries.value.flatMap(series => series.icons.map(icon => (
        resolveResourcePathFromFile(PROJECT_ICON_REGISTRY_FILE_NAME, icon.source)
      )))
      if (changedPaths.some(path => iconSources.some(source => pathIdentity(path) === pathIdentity(source)))) {
        void syncRegisteredProjectIcons(projectIconSeries.value)
      }
      taskScheduler.schedule(FILE_CHANGE_INDEX_REFRESH_KEY, FILE_CHANGE_REFRESH_DELAY_MS, refreshIndexedEntries)
    })

    await fileSystemService.startWatching(projectPath.value)
    isWatching.value = true
  } catch (error) {
    reportAppError('OC-E2006', error)
  }
}

async function stopWatching() {
  taskScheduler.cancel(PROJECT_METADATA_SAVE_KEY)
  // A pending coalesced refresh belongs to the project that just stopped being watched.
  taskScheduler.cancel(FILE_CHANGE_INDEX_REFRESH_KEY)
  taskScheduler.cancel(FILE_CHANGE_RESOURCE_ENVIRONMENT_REFRESH_KEY)

  if (unlistenFn) {
    unlistenFn()
    unlistenFn = null
  }

  await fileSystemService.stopWatching()
  isWatching.value = false
}

async function setProjectPath(path: string) {
  const normalizedPath = normalizePath(path)

  if (projectPath.value === normalizedPath) {
    return
  }

  if (isWatching.value) {
    await stopWatching()
  }

  projectPath.value = normalizedPath
  projectManagementStructurePromise = null
  indexedEntries.value = []
  registeredDirectories.value = new Map()
  expandedDirectories.value = new Set()
  // 换项目就把"解不开的包"忘掉：那个记录只在同一个项目里说得通。
  unusableFingerprints.clear()
    clearProjectProfile()
    clearProjectFontRegistry()
    clearProjectIconRegistry()
    clearProjectDictionary()

  if (!projectPath.value) {
    return
  }

  const openTimer = createProjectOpenTimer(normalizedPath)
  openTimer.step('reset')
  const walkStartedAt = performance.now()
  loadProjectWorkspaceState()
  await refreshIndexedEntries({ persist: false })
  const walk = takeDirectoryWalkMetrics()
  openTimer.mark(`index tree (${walk.reads} dir reads)`, performance.now() - walkStartedAt)
  // Each registry records its own duration so one slow branch cannot be hidden by its siblings.
  const registriesStartedAt = performance.now()
  const timed = <T>(label: string, work: Promise<T>): Promise<T> => work.then((result) => {
    openTimer.mark(label, performance.now() - registriesStartedAt)
    return result
  })
  await Promise.all([
    timed('profile', reloadProjectProfile()),
    timed('fonts', reloadProjectFontRegistry()),
    timed('icons', reloadProjectIconRegistry()),
    timed('dictionary', reloadProjectDictionary()),
  ])
  openTimer.step(`registries (${projectIconSeries.value.reduce((total, series) => total + series.icons.length, 0)} icons/${Object.keys(projectFonts.value).length} fonts)`)
  // After the registries: the environment carries the project icon catalog, so it must not start
  // before that catalog exists.
  await reloadProjectResourceEnvironment()
  openTimer.step('resource environment')
  await startWatching()
  openTimer.step('watcher')
  if (await fileSystemService.fileExists(resolveProjectPath(PROJECT_INTERNAL_DIRECTORY_NAME))) {
    void ensureProjectManagementStructure()
  }
  scheduleProjectMetadataSave()
  openTimer.step('tail')
  openTimer.done(`entries ${walk.entries}, worst dir read ${walk.worstMs.toFixed(1)}ms ${walk.worstPath}`)
}

async function chooseProjectDirectory(title: string): Promise<string | null> {
  const path = await fileSystemService.openProject(title)
  return path ? normalizePath(path) : null
}

async function openProject(title: string) {
  const path = await chooseProjectDirectory(title)
  if (path) {
    await setProjectPath(path)
  }

  return path
}

async function resetProjectWorkspaceState(): Promise<void> {
  if (!projectPath.value) return

  taskScheduler.cancel(PROJECT_METADATA_SAVE_KEY)
  registeredDirectories.value = new Map([['', PROJECT_TREE_LOOKAHEAD_DEPTH]])
  expandedDirectories.value = new Set()
  await refreshIndexedEntries({ persist: false })
  await saveProjectWorkspaceState()
}

async function readFile(path: string) {
  return await fileSystemService.readFile(resolveProjectPath(path))
}

async function saveFile(relativePath: string, content: string) {
  await fileSystemService.writeFile(resolveProjectPath(relativePath), content)
  await refreshIndexedEntries()
}

async function findAvailableProjectAssetName(targetDirectory: string, fileName: string): Promise<string> {
  const dotIndex = fileName.lastIndexOf('.')
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const suffix = dotIndex > 0 ? fileName.slice(dotIndex) : ''
  let candidateIndex = 2
  while (await fileSystemService.fileExists(`${targetDirectory}/${stem} (${candidateIndex})${suffix}`)) {
    candidateIndex += 1
  }
  return `${stem} (${candidateIndex})${suffix}`
}

async function getProjectAssetImportConflict(
  sourcePath: string,
  targetDirectoryPath: string,
  registryFilePath: string,
  supportedExtensions: ReadonlySet<string>,
  unsupportedMessage: string,
): Promise<ProjectAssetImportConflict | null> {
  const normalizedSourcePath = normalizePath(sourcePath)
  ensureProjectOpen()
  const fileName = getPathBasename(normalizedSourcePath)
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLocaleLowerCase() : ''
  if (!supportedExtensions.has(extension)) throw new Error(unsupportedMessage)
  const targetDirectory = resolveProjectInternalPath(targetDirectoryPath)
  if (pathIdentity(normalizedSourcePath).startsWith(`${pathIdentity(targetDirectory)}/`)) return null

  if (!await fileSystemService.fileExists(`${targetDirectory}/${fileName}`)) return null
  const availableName = await findAvailableProjectAssetName(targetDirectory, fileName)
  return {
    existingSource: createResourceReferenceFromFile(registryFilePath, `${targetDirectory}/${fileName}`),
    availableCopySource: createResourceReferenceFromFile(registryFilePath, `${targetDirectory}/${availableName}`),
  }
}

async function importProjectFontFiles(
  sourcePath: string,
  conflictResolution?: ProjectAssetImportResolution,
  collectionIndices?: readonly number[],
): Promise<ImportedProjectFontFiles> {
  const targetDirectory = DEFAULT_PROJECT_FONT_DIRECTORY
  const normalizedSourcePath = normalizePath(sourcePath)
  ensureProjectOpen()
  const fileName = getPathBasename(normalizedSourcePath)
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLocaleLowerCase() : ''
  if (!PROJECT_FONT_EXTENSIONS.has(extension)) throw new Error('Unsupported project font file')

  const sourceIdentity = pathIdentity(normalizedSourcePath)
  const targetAbsoluteDirectory = resolveProjectInternalPath(targetDirectory)
  const fontReference = (name: string) => createResourceReferenceFromFile(
    PROJECT_FONT_REGISTRY_FILE_NAME,
    `${targetAbsoluteDirectory}/${name}`,
  )
  const sourceInsideManagedDirectory = sourceIdentity.startsWith(`${pathIdentity(targetAbsoluteDirectory)}/`)
  const sourceBytes = await fileSystemService.readBinaryFile(normalizedSourcePath)
  if (extension === 'ttc' || extension === 'otc') {
    const faces = extractFontCollectionFaces(sourceBytes)
    const stem = fileName.slice(0, fileName.lastIndexOf('.'))
    const sources: string[] = []
    await fileSystemService.createDirectory(targetAbsoluteDirectory)
    const selectedIndices = collectionIndices ?? faces.map((_, index) => index)
    for (const index of selectedIndices) {
      if (!Number.isInteger(index) || index < 0 || index >= faces.length) {
        throw new Error('Invalid font collection member')
      }
      const face = faces[index]!
      const extractedName = `${stem}-${index + 1}.${face.extension}`
      const prepared = await ensureLoadableProjectFont(face.bytes, extractedName)
      const duplicateName = await findMatchingProjectFontFile(targetAbsoluteDirectory, prepared.bytes)
      if (duplicateName) {
        sources.push(fontReference(duplicateName))
        continue
      }
      const desiredName = prepared.repaired ? createRepairedFontName(extractedName) : extractedName
      const outputName = await fileSystemService.fileExists(`${targetAbsoluteDirectory}/${desiredName}`)
        ? await findAvailableProjectAssetName(targetAbsoluteDirectory, desiredName)
        : desiredName
      await fileSystemService.writeBinaryFile(`${targetAbsoluteDirectory}/${outputName}`, prepared.bytes)
      sources.push(fontReference(outputName))
    }
    await refreshIndexedEntries()
    return { sources, copied: true }
  }
  const targetExists = await fileSystemService.fileExists(`${targetAbsoluteDirectory}/${fileName}`)
  if (!sourceInsideManagedDirectory && targetExists && conflictResolution === 'use-existing') {
    return { sources: [fontReference(fileName)], copied: false }
  }

  const prepared = await ensureLoadableProjectFont(
    sourceBytes,
    fileName,
  )
  const duplicateName = await findMatchingProjectFontFile(targetAbsoluteDirectory, prepared.bytes)
  if (duplicateName) return { sources: [fontReference(duplicateName)], copied: false }
  if (sourceInsideManagedDirectory && !prepared.repaired) {
    return {
      sources: [fontReference(normalizedSourcePath.slice(targetAbsoluteDirectory.length + 1))],
      copied: false,
    }
  }

  const outputDirectory = targetAbsoluteDirectory
  const repairedName = prepared.repaired ? createRepairedFontName(fileName) : fileName
  const outputName = await fileSystemService.fileExists(`${outputDirectory}/${repairedName}`)
    ? await findAvailableProjectAssetName(outputDirectory, repairedName)
    : repairedName
  await fileSystemService.createDirectory(outputDirectory)
  if (prepared.repaired) await fileSystemService.writeBinaryFile(`${outputDirectory}/${outputName}`, prepared.bytes)
  else await fileSystemService.copyFile(normalizedSourcePath, `${outputDirectory}/${outputName}`)
  await refreshIndexedEntries()
  return { sources: [fontReference(outputName)], copied: true }
}

async function ensureProjectManagementStructure(): Promise<void> {
  if (projectManagementStructurePromise) return await projectManagementStructurePromise
  const root = ensureProjectOpen()
  projectManagementStructurePromise = (async () => {
    await initializeProjectStructure(fileSystemService, root)
    for (const directory of PROJECT_INTERNAL_DIRECTORIES) {
      registeredDirectories.value.set(directory, 1)
    }
    if (projectPath.value !== root) return
    await refreshIndexedEntries({ persist: false })
  })()
  await projectManagementStructurePromise
}

async function findMatchingProjectFontFile(
  targetDirectory: string,
  bytes: Uint8Array,
): Promise<string | null> {
  let entries: DirEntry[]
  try {
    entries = await fileSystemService.readDirectoryEntries(targetDirectory, 1)
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isFile || entry.isSymlink || !PROJECT_FONT_EXTENSIONS.has(
      entry.name.split('.').pop()?.toLocaleLowerCase() ?? '',
    )) continue
    try {
      const existing = await fileSystemService.readBinaryFile(`${targetDirectory}/${entry.name}`)
      if (existing.length === bytes.length && existing.every((byte, index) => byte === bytes[index])) {
        return entry.name
      }
    } catch {
      // An unreadable candidate does not make the import itself fail.
    }
  }
  return null
}

function createRepairedFontName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  return `${stem}-repaired.ttf`
}

async function getProjectFontImportConflict(
  sourcePath: string,
): Promise<ProjectAssetImportConflict | null> {
  const targetDirectory = DEFAULT_PROJECT_FONT_DIRECTORY
  if (/\.(?:ttc|otc)$/i.test(sourcePath)) return null
  return await getProjectAssetImportConflict(
    sourcePath,
    targetDirectory,
    PROJECT_FONT_REGISTRY_FILE_NAME,
    PROJECT_FONT_EXTENSIONS,
    'Unsupported project font file',
  )
}

/** 解不开的包：别再排一次队，也别指望它。为什么解不开已经报在发生处了。 */
const unusableFingerprints = new Set<string>()

/**
 * 发现一个还没解开的包就把它排上队，**不等它**。解开是幂等的、按指纹去重的，
 * 所以两个项目同时用到同一个包也只会解一次。解完之后重建一次环境，引用它的图标与字体自己出现。
 */
function schedulePackageUnpacking(
  archive: ResourcePackageArchive,
  archivePath: string,
  packagesRoot: string,
): void {
  void unpackResourcePackage(archive, archivePath, packagesRoot).then(
    () => reloadProjectResourceEnvironment(),
    (error: unknown) => {
      // 错误对象就在手边，报一次就够；不再往别的地方挂第二份文案。
      unusableFingerprints.add(archive.fingerprint)
      reportAppError('OC-E3017', { path: archivePath, error })
      void reloadProjectResourceEnvironment()
    },
  )
}

/**
 * 把一个 `.ocpack` 复制进项目 —— 这就是"装"。装进去就算数：机器上那份删了也不影响，
 * 项目自己带着归档提交进 git。
 *
 * 复制之前先读一遍：读不出身份的归档不进项目，否则它只会在那里当一个谁也叫不出名字的文件。
 *
 * **文件名由坐标唯一决定**，所以同一个包再装一次就是覆盖同一个文件，同一个坐标换了一份内容
 * 就是就地替换 —— 项目里有且只有这一份。分隔符用 `@`：它不可能出现在作者、包名或版本里，
 * 所以两个不同的坐标不会撞成同一个文件名。
 */
async function installResourcePackageFile(sourcePath: string, projectRootPath?: string): Promise<void> {
  const rootPath = projectRootPath ? normalizePath(projectRootPath) : ensureProjectOpen()
  const archive = await readResourcePackageArchive(sourcePath)
  const packagesRoot = `${rootPath}/${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}`
  await fileSystemService.createDirectory(packagesRoot)
  const target = `${packagesRoot}/${archive.coordinate.replace(/\//g, '@')}.ocpack`
  // 别把一个文件复制到它自己身上：那会先截断再读，把包毁成 0 字节。
  if (pathIdentity(normalizePath(sourcePath)) === pathIdentity(target)) return
  await fileSystemService.copyFile(sourcePath, target)
  // 装进一个还没打开的项目（新建项目时的预装）不需要刷新当前项目。
  if (!projectPath.value || pathIdentity(rootPath) !== pathIdentity(projectPath.value)) return
  await reloadProjectResourceEnvironment()
  await refreshIndexedEntries()
}

/** 卸载 = 删掉那个文件。共享的解开缓存不受影响 —— 它是派生的，删了会自动重建。 */
async function removeResourcePackage(archivePath: string): Promise<void> {
  await fileSystemService.deleteFile(archivePath)
  await reloadProjectResourceEnvironment()
  await refreshIndexedEntries()
}

/** 按归档路径找项目里的那个包。文件名不参与身份，所以路径是它在项目里的唯一标识。 */
function findProjectResourcePackage(archivePath: string): ProjectResourcePackage | null {
  const identity = pathIdentity(normalizePath(archivePath))
  return [...projectResourcePackages.value.values()]
    .find(candidate => pathIdentity(candidate.archivePath) === identity) ?? null
}

async function createEntryWithAvailableName(
  parentPath: string,
  baseName: string,
  kind: 'file' | 'folder',
  content: string = '',
): Promise<string> {
  const resolvedParentPath = resolveProjectPath(parentPath)
  let suffix = 1

  while (true) {
    const dotIndex = kind === 'file' ? baseName.lastIndexOf('.') : -1
    const name = suffix === 1
      ? baseName
      : dotIndex > 0
        ? `${baseName.slice(0, dotIndex)} ${suffix}${baseName.slice(dotIndex)}`
        : `${baseName} ${suffix}`
    const candidatePath = `${resolvedParentPath}/${name}`
    if (!await fileSystemService.fileExists(candidatePath)) {
      if (kind === 'folder') await fileSystemService.createDirectory(candidatePath)
      else await fileSystemService.writeFile(candidatePath, content)
      await refreshIndexedEntries()
      return candidatePath
    }
    suffix += 1
  }
}

async function trashFile(relativePath: string) {
  if (isProjectInternalRelativePath(toRelativeProjectPath(relativePath))) {
    throw new Error('Managed project files cannot be moved to trash')
  }
  const resolvedPath = resolveProjectPath(relativePath)
  await fileSystemService.trashFile(resolvedPath)
  if (pathIdentity(resolvedPath) === pathIdentity(resolveProjectPath(PROJECT_PROFILE_FILE_NAME))) clearProjectProfile()
  if (pathIdentity(resolvedPath) === pathIdentity(resolveProjectPath(PROJECT_FONT_REGISTRY_FILE_NAME))) clearProjectFontRegistry()
  if (pathIdentity(resolvedPath) === pathIdentity(resolveProjectPath(PROJECT_ICON_REGISTRY_FILE_NAME))) clearProjectIconRegistry()
  if (pathIdentity(resolvedPath) === pathIdentity(resolveProjectPath(PROJECT_DICTIONARY_FILE_NAME))) clearProjectDictionary()
  await refreshIndexedEntries()
}

async function revealEntryInFileManager(path: string) {
  await fileSystemService.revealInFileManager(resolveProjectPath(path))
}

function getRelativeProjectPath(path: string) {
  return toRelativeProjectPath(path)
}

function getRelativeProjectPathIfInside(path: string): string | null {
  const normalizedPath = normalizePath(path)
  const projectRoot = ensureProjectOpen()
  const identity = pathIdentity(normalizedPath)
  const projectIdentity = pathIdentity(projectRoot)
  if (identity === projectIdentity) return ''
  return identity.startsWith(`${projectIdentity}/`)
    ? normalizedPath.slice(projectRoot.length + 1)
    : null
}

function getPathDirname(path: string) {
  const normalizedPath = normalizePath(path)
  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    return ''
  }

  return normalizedPath.slice(0, lastSlashIndex)
}

function isSameOrDescendantPath(targetPath: string, ancestorPath: string) {
  const normalizedTargetPath = pathIdentity(targetPath)
  const normalizedAncestorPath = pathIdentity(ancestorPath)
  return normalizedTargetPath === normalizedAncestorPath || normalizedTargetPath.startsWith(`${normalizedAncestorPath}/`)
}

function isValidEntryName(name: string) {
  if (!name) {
    return false
  }

  if (name === '.' || name === '..') {
    return false
  }

  if (/[<>:"/\\|?*\u0000-\u001F]/.test(name)) {
    return false
  }

  if (/[. ]$/.test(name)) {
    return false
  }

  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)
}

function resolveFileTreeDestination({ key, targetKey, position }: WorkspaceEntryMoveRequest) {
  if (!projectPath.value) {
    return null
  }

  const draggedPath = normalizePath(key)
  const targetPath = targetKey ? normalizePath(targetKey) : null
  if (isProjectInternalRelativePath(toRelativeProjectPath(draggedPath))
    || targetPath && isProjectInternalRelativePath(toRelativeProjectPath(targetPath))) return null
  const draggedEntry = indexedEntries.value.find((entry) =>
    normalizePath(resolveProjectPath(entry.name)) === draggedPath,
  )
  const targetEntry = targetPath
    ? indexedEntries.value.find((entry) => normalizePath(resolveProjectPath(entry.name)) === targetPath)
    : null
  if (
    !draggedEntry
    || targetPath && !targetEntry
    || !targetPath && position !== 'inside'
    || position === 'inside' && targetPath && !targetEntry?.isDirectory
  ) return null

  let destinationDirectory = normalizePath(projectPath.value)
  if (targetPath) {
    destinationDirectory = position === 'inside'
      ? targetPath
      : getPathDirname(targetPath) || normalizePath(projectPath.value)
  }

  return {
    draggedPath,
    destinationDirectory,
    destinationPath: `${destinationDirectory}/${getPathBasename(draggedPath)}`,
    draggedIsDirectory: Boolean(draggedEntry.isDirectory),
    targetPath,
  }
}

function remapRelativePath(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) {
    return newPrefix
  }

  if (!path.startsWith(`${oldPrefix}/`)) {
    return path
  }

  return `${newPrefix}${path.slice(oldPrefix.length)}`
}

async function moveEntry(sourcePath: string, targetPath: string) {
  const sourceRelativePath = toRelativeProjectPath(sourcePath)
  const targetRelativePath = toRelativeProjectPath(targetPath)
  if (isProjectInternalRelativePath(sourceRelativePath) || isProjectInternalRelativePath(targetRelativePath)) {
    throw new Error('Managed project entries cannot be moved')
  }
  const sourceEntry = indexedEntries.value.find((entry) => entry.name === sourceRelativePath)

  await fileSystemService.renameFile(
    resolveProjectPath(sourceRelativePath),
    resolveProjectPath(targetRelativePath),
  )

  const normalizedSource = normalizePath(sourcePath)
  const normalizedTarget = normalizePath(targetPath)
  if (sourceEntry?.isDirectory) {
    const nextExpandedDirectories = new Set<string>()
    for (const relativePath of expandedDirectories.value) {
      nextExpandedDirectories.add(remapRelativePath(relativePath, sourceRelativePath, targetRelativePath))
    }
    expandedDirectories.value = nextExpandedDirectories

    const nextRegisteredDirectories = new Map<string, number>()
    for (const [relativePath, depth] of registeredDirectories.value.entries()) {
      nextRegisteredDirectories.set(
        remapRelativePath(relativePath, sourceRelativePath, targetRelativePath),
        depth,
      )
    }
    registeredDirectories.value = nextRegisteredDirectories
  }

  await refreshIndexedEntries()
  if (isMetadataPath(normalizedSource) || isMetadataPath(normalizedTarget)) {
    await Promise.all([
      reloadProjectProfile(),
      reloadProjectFontRegistry(),
      reloadProjectIconRegistry(),
      reloadProjectDictionary(),
    ])
  }
}

async function renameEntry(path: string, nextName: string): Promise<RenameEntryResult> {
  if (!projectPath.value) {
    return { ok: false, reason: 'project-not-open' }
  }

  const sourcePath = normalizePath(path)
  const trimmedName = nextName.trim()
  if (!isValidEntryName(trimmedName)) {
    return { ok: false, reason: 'invalid-name' }
  }

  const targetDirectory = getPathDirname(sourcePath)
  const targetPath = `${targetDirectory}/${trimmedName}`
  if (targetPath === sourcePath) {
    return { ok: false, reason: 'same-path' }
  }

  const targetExists = await fileSystemService.fileExists(targetPath)
  if (targetExists) {
    return { ok: false, reason: 'target-exists' }
  }

  try {
    await moveEntry(sourcePath, targetPath)
    return {
      ok: true,
      fromPath: sourcePath,
      toPath: targetPath,
    }
  } catch (error) {
    reportAppError('OC-E2007', error)
    return { ok: false, reason: 'rename-failed' }
  }
}

async function moveEntryByDrop(payload: WorkspaceEntryMoveRequest): Promise<MoveEntryByDropResult> {
  if (!projectPath.value) {
    return { ok: false, reason: 'project-not-open' }
  }

  const destination = resolveFileTreeDestination(payload)
  if (!destination) {
    return { ok: false, reason: 'invalid-target' }
  }

  const { draggedPath, destinationDirectory, destinationPath, draggedIsDirectory, targetPath } = destination

  if (targetPath && draggedPath === targetPath) {
    return { ok: false, reason: 'self-target' }
  }

  if (targetPath && isSameOrDescendantPath(targetPath, draggedPath)) {
    return { ok: false, reason: 'descendant-target' }
  }

  if (draggedIsDirectory && isSameOrDescendantPath(destinationDirectory, draggedPath)) {
    return { ok: false, reason: 'descendant-target' }
  }

  if (destinationPath === draggedPath) {
    return { ok: false, reason: 'same-path' }
  }

  const targetExists = await fileSystemService.fileExists(destinationPath)
  if (targetExists) {
    return { ok: false, reason: 'target-exists' }
  }

  try {
    await moveEntry(draggedPath, destinationPath)
    return {
      ok: true,
      fromPath: draggedPath,
      toPath: destinationPath,
    }
  } catch (error) {
    reportAppError('OC-E2008', error)
    return { ok: false, reason: 'move-failed' }
  }
}

/**
 * Where an external drop lands: a directory row receives into itself, a file row (or the drop
 * indicator above/below it) receives into the directory that holds it, and the empty area of the
 * tree receives into the project root. Managed `.opencard` content is never an external target.
 */
function resolveExternalDropDirectory({ targetKey, position }: WorkspaceExternalDropRequest): string | null {
  const projectRoot = normalizePath(projectPath.value)
  if (!projectRoot) return null
  if (!targetKey) return position === 'inside' ? projectRoot : null

  const targetPath = normalizePath(targetKey)
  // Compared by identity so a differently-cased key can never fall through to the parent directory.
  if (pathIdentity(targetPath) === pathIdentity(projectRoot)) return null
  if (!isSameOrDescendantPath(targetPath, projectRoot)) return null
  if (isProjectInternalRelativePath(toRelativeProjectPath(targetPath))) return null

  const targetIsDirectory = indexedEntries.value.some(entry =>
    Boolean(entry.isDirectory) && normalizePath(resolveProjectPath(entry.name)) === targetPath)
  if (position === 'inside' && targetIsDirectory) return targetPath
  return getPathDirname(targetPath) || projectRoot
}

async function copyDirectoryIntoProject(sourceDirectory: string, targetDirectory: string): Promise<void> {
  await fileSystemService.createDirectory(targetDirectory)
  for (const entry of await fileSystemService.readDirectory(sourceDirectory)) {
    // Symlinks are left out: copying one either duplicates a foreign subtree or loops back into it.
    if (entry.isSymlink) continue
    const sourcePath = `${sourceDirectory}/${entry.name}`
    const targetPath = `${targetDirectory}/${entry.name}`
    if (entry.isDirectory) await copyDirectoryIntoProject(sourcePath, targetPath)
    else await fileSystemService.copyFile(sourcePath, targetPath)
  }
}

/** Copies one external entry in without overwriting: a taken name gets the next free numbered name. */
async function copyExternalEntryIntoDirectory(sourcePath: string, destinationDirectory: string): Promise<'copied' | 'skipped'> {
  const sourceName = getPathBasename(sourcePath)
  if (!isValidEntryName(sourceName)) return 'skipped'
  if (isSameOrDescendantPath(destinationDirectory, sourcePath)) return 'skipped'

  const info = await fileSystemService.getFileInfo(sourcePath)
  const targetName = await fileSystemService.fileExists(`${destinationDirectory}/${sourceName}`)
    ? await findAvailableProjectAssetName(destinationDirectory, sourceName)
    : sourceName
  const targetPath = `${destinationDirectory}/${targetName}`
  if (info.isDirectory) await copyDirectoryIntoProject(sourcePath, targetPath)
  else await fileSystemService.copyFile(sourcePath, targetPath)
  return 'copied'
}

async function copyExternalEntriesIntoProject(
  payload: WorkspaceExternalDropRequest,
): Promise<CopyExternalEntriesResult> {
  if (!projectPath.value) return { ok: false, reason: 'project-not-open' }
  const destinationDirectory = resolveExternalDropDirectory(payload)
  if (!destinationDirectory) return { ok: false, reason: 'invalid-target' }

  let copied = 0
  let skipped = 0
  let failed = 0
  for (const path of payload.paths) {
    const sourcePath = normalizePath(path)
    if (!sourcePath) {
      skipped += 1
      continue
    }
    try {
      if (await copyExternalEntryIntoDirectory(sourcePath, destinationDirectory) === 'copied') copied += 1
      else skipped += 1
    } catch (error) {
      failed += 1
      reportAppError('OC-E2009', { path: sourcePath, error })
    }
  }

  if (copied > 0) await refreshIndexedEntries()
  return { ok: true, copied, skipped, failed }
}

export function useProjectStore() {
  return {
    projectPath: readonly(projectPath),
    projectProfile: readonly(projectProfile),
    resolvedProject: readonly(resolvedProject),
    projectInformation: readonly(resolvedProject),
    profileError: readonly(profileError),
    projectFontFamilies: readonly(projectFontFamilies),
    projectFontCompositions: readonly(projectFontCompositions),
    projectFonts: readonly(projectFonts),
    fontRegistryError: readonly(fontRegistryError),
    fontRegistryReady: readonly(fontRegistryReady),
    projectFontLoadErrors: readonly(projectFontLoadErrors),
    projectIconSeries: readonly(projectIconSeries),
    iconRegistryError: readonly(iconRegistryError),
    iconRegistryReady: readonly(iconRegistryReady),
    projectIconCatalog: readonly(projectIconCatalog),
    renderEnvironment,
    projectIconLoadErrors: readonly(projectIconLoadErrors),
    projectDictionary: readonly(projectDictionary),
    projectResourcePackages: readonly(projectResourcePackages),
    projectResourceEnvironment,
    resolvedDictionary: readonly(resolvedDictionary),
    dictionaryError: readonly(dictionaryError),
    projectName: computed(() => {
      if (!projectPath.value) return ''
      return projectPath.value.split('/').pop() || ''
    }),
    indexedEntries: readonly(indexedEntries),
    registeredDirectories: readonly(registeredDirectories),
    expandedDirectories: readonly(expandedDirectories),
    isWatching: readonly(isWatching),
    fileChangeRevision: readonly(fileChangeRevision),
    chooseProjectDirectory,
    ensureProjectManagementStructure,
    openProject,
    resetProjectWorkspaceState,
    saveProjectConfiguration,
    saveProjectFontRegistry,
    saveProjectIconRegistry,
    saveProjectDictionary,
    reloadProjectProfile,
    reloadProjectFontRegistry,
    reloadProjectIconRegistry,
    reloadProjectDictionary,
    reloadProjectResourceEnvironment,
    clearProjectProfile,
    clearProjectFontRegistry,
    clearProjectIconRegistry,
    clearProjectDictionary,
    setProjectPath,
    readDirectoryEntries,
    setDirectoryExpanded,
    isDirectoryExpanded,
    resolveAssetSrc,
    resolveProjectInternalPath,
    resolveResourcePathFromFile,
    resolveResourceAssetSrcFromFile,
    readFile,
    saveFile,
    importProjectFontFiles,
    getProjectFontImportConflict,
    installResourcePackageFile,
    removeResourcePackage,
    findProjectResourcePackage,
    createEntryWithAvailableName,
    trashFile,
    revealEntryInFileManager,
    getRelativeProjectPath,
    getRelativeProjectPathIfInside,
    moveEntry,
    moveEntryByDrop,
    copyExternalEntriesIntoProject,
    renameEntry,
    startWatching,
    stopWatching,
    resolveProjectPath,
  }
}
