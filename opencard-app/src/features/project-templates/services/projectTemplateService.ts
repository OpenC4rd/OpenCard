import { basename, join, resolveResource } from '@tauri-apps/api/path'
import { describeError } from '../../../shared/model/error'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { parseCardDocument } from '../../../entities/card/storage'
import { APP_TEMPLATE_DIRECTORY_NAME, resolveAppStorageRoot } from '../../../shared/storage/appStoragePaths'
import { fileSystemService, type FileSystemService } from '../../workspace/services/fileSystemService'
import { CARD_DOCUMENT_SUFFIX } from '../../workspace/model/fileTypes'
import { parseProjectMetadataText, serializeProjectMetadata } from '../../workspace/model/projectMetadata'
import { parseProjectFontRegistryText } from '../../workspace/model/projectFontRegistry'
import { parseProjectIconRegistryText } from '../../workspace/model/projectIconRegistry'
import { parseProjectDictionaryText } from '../../workspace/model/projectDictionary'
import { initializeProjectStructure } from '../../workspace/services/projectStructureService'
import {
  PROJECT_DICTIONARY_FILE_NAME,
  PROJECT_FONT_REGISTRY_FILE_NAME,
  PROJECT_ICON_REGISTRY_FILE_NAME,
  PROJECT_PROFILE_FILE_NAME,
} from '../../workspace/model/projectStructure'
import {
  PROJECT_TEMPLATE_SCHEMA_VERSION,
  PROJECT_TEMPLATE_PACKAGE_EXTENSION,
  PROJECT_TEMPLATE_PACKAGE_SUFFIX,
  TemplateServiceError,
  parseProjectTemplateManifest,
  resolveTemplateEntries,
  isSafeProjectTemplateId,
  validateProjectName,
  validateTemplateDescription,
  validateTemplateName,
  type CreateProjectFromTemplateRequest,
  type CreatedProject,
  type CreateUserTemplateRequest,
  type ExportProjectTemplateRequest,
  type ProjectTemplate,
  type ProjectTemplateManifest,
  type ProjectTemplateSource,
  type TemplateCatalogSnapshot,
  type TemplateProjectInspection,
} from '../model/projectTemplate'
import { isProjectCoverPath } from '../../workspace/model/projectCover'

const BUILTIN_TEMPLATE_INDEX_PATH = 'templates/index.json'
const TEMPLATE_MANIFEST_FILE_NAME = 'template.json'
const TEMPLATE_CONTENT_DIRECTORY_NAME = 'content'
const STRUCTURED_PROJECT_FILES = [
  { name: PROJECT_PROFILE_FILE_NAME, parse: parseProjectMetadataText, label: 'project file' },
  { name: PROJECT_FONT_REGISTRY_FILE_NAME, parse: parseProjectFontRegistryText, label: 'font registry' },
  { name: PROJECT_ICON_REGISTRY_FILE_NAME, parse: parseProjectIconRegistryText, label: 'icon registry' },
  { name: PROJECT_DICTIONARY_FILE_NAME, parse: parseProjectDictionaryText, label: 'dictionary' },
] as const
const TEMPLATE_PACKAGE_EXTENSIONS = [PROJECT_TEMPLATE_PACKAGE_EXTENSION, 'zip']
const MAX_TEMPLATE_PACKAGE_BYTES = 128 * 1024 * 1024
const MAX_TEMPLATE_UNPACKED_BYTES = 256 * 1024 * 1024

type TemplateIndex = {
  schemaVersion: typeof PROJECT_TEMPLATE_SCHEMA_VERSION
  templates: string[]
}

export interface ProjectTemplatePathService {
  appStorageDir(): Promise<string>
  basename(path: string): Promise<string>
  join(...paths: string[]): Promise<string>
  resolveResource(path: string): Promise<string>
}

const defaultPathService: ProjectTemplatePathService = {
  appStorageDir: resolveAppStorageRoot,
  basename,
  join,
  resolveResource,
}

function parseJson(value: string, code: 'invalid-catalog' | 'invalid-manifest', path: string): unknown {
  try {
    return JSON.parse(value)
  } catch (cause) {
    throw new TemplateServiceError(code, `Invalid JSON at ${path}`, { cause })
  }
}

function parseTemplateIndex(value: unknown): TemplateIndex | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  if (source.schemaVersion !== PROJECT_TEMPLATE_SCHEMA_VERSION || !Array.isArray(source.templates)) return null
  if (!source.templates.every((item) => typeof item === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(item))) {
    return null
  }
  return {
    schemaVersion: PROJECT_TEMPLATE_SCHEMA_VERSION,
    templates: [...source.templates] as string[],
  }
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function pathSegments(value: string): string[] {
  return normalizeRelativePath(value).split('/').filter(Boolean)
}

function isOpenCardDocument(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath)
  return normalized.toLowerCase().endsWith(CARD_DOCUMENT_SUFFIX)
}

function entryDepth(entry: DirEntry): number {
  return pathSegments(entry.name).length
}

function assertNoSymlinks(entries: DirEntry[]): void {
  if (entries.some((entry) => entry.isSymlink)) {
    throw new TemplateServiceError('source-has-symlink', 'Template sources cannot contain symbolic links')
  }
}

function assertValidProjectName(projectName: string): string {
  if (validateProjectName(projectName)) {
    throw new TemplateServiceError('invalid-project-name', 'Invalid project name')
  }
  return projectName.trim()
}

function assertValidCreateTemplateRequest(request: CreateUserTemplateRequest): void {
  if (validateTemplateName(request.name)) {
    throw new TemplateServiceError('invalid-template-name', 'Invalid template name')
  }
  if (validateTemplateDescription(request.description)) {
    throw new TemplateServiceError('description-too-long', 'Template description is too long')
  }
}

function normalizeRequestedEntries(request: CreateUserTemplateRequest): string[] {
  return [...new Set([request.entry, ...(request.entries ?? [])].map(normalizeRelativePath).filter(Boolean))]
}

function resolveEntryName(document: { name?: unknown }, fallback: string): string {
  return typeof document.name === 'string' && document.name.trim()
    ? document.name.trim()
    : fallback
}

function normalizeExcludedPaths(paths: readonly string[] = []): string[] {
  return [...new Set(paths.map(normalizeRelativePath).filter((path) => (
    path
    && !path.startsWith('/')
    && !/^[a-z]:/i.test(path)
    && !path.split('/').some((segment) => segment === '.' || segment === '..')
  )))]
}

function isExcludedPath(path: string, excludedPaths: readonly string[]): boolean {
  return excludedPaths.some((excluded) => path === excluded || path.startsWith(`${excluded}/`))
}

async function assertValidStructuredProjectFiles(
  fs: FileSystemService,
  paths: ProjectTemplatePathService,
  rootPath: string,
  errorKind: 'source-not-project' | 'invalid-package' | 'invalid-manifest',
): Promise<void> {
  for (const file of STRUCTURED_PROJECT_FILES) {
    const path = await paths.join(rootPath, ...pathSegments(file.name))
    if (await fs.fileExists(path) && !file.parse(await fs.readFile(path))) {
      throw new TemplateServiceError(errorKind, `OpenCard ${file.label} is invalid`)
    }
  }
}

function normalizeArchivePath(value: string): string | null {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return null
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return null
  return normalized
}

function assertSupportedPackagePath(path: string): void {
  const extension = path.split('.').pop()?.toLowerCase()
  if (!extension || !TEMPLATE_PACKAGE_EXTENSIONS.includes(extension)) {
    throw new TemplateServiceError('invalid-package', 'Template package must be .octemplate or .zip')
  }
}
export class ProjectTemplateService {
  constructor(
    private readonly fs: FileSystemService = fileSystemService,
    private readonly paths: ProjectTemplatePathService = defaultPathService,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async pickProjectParentDirectory(title: string): Promise<string | null> {
    return await this.fs.pickDirectory(title)
  }

  async pickTemplateSourceFile(title: string): Promise<string | null> {
    return await this.fs.pickFile({
      title,
      fileTypeName: 'OpenCard Template',
      extensions: TEMPLATE_PACKAGE_EXTENSIONS,
    })
  }

  async pickTemplateExportPath(defaultPath: string, title: string): Promise<string | null> {
    return await this.fs.pickSavePath({
      defaultPath,
      title,
      fileTypeName: 'OpenCard Template',
      extensions: [PROJECT_TEMPLATE_PACKAGE_EXTENSION],
    })
  }

  async loadCatalog(): Promise<TemplateCatalogSnapshot> {
    const builtinTemplates = await this.loadBuiltinTemplates()
    const { templates: userTemplates, warnings } = await this.loadUserTemplates()
    return {
      templates: [
        ...builtinTemplates,
        ...userTemplates.sort((a, b) => a.name.localeCompare(b.name)),
      ],
      warnings,
    }
  }

  async inspectProjectSource(sourcePath: string): Promise<TemplateProjectInspection> {
    await this.assertSourceRoot(sourcePath)
    await assertValidStructuredProjectFiles(this.fs, this.paths, sourcePath, 'source-not-project')

    const entries = await this.fs.readDirectoryEntries(sourcePath, Number.POSITIVE_INFINITY)
    assertNoSymlinks(entries)
    const documentEntries: string[] = []
    const entryNames: Record<string, string> = {}
    const coverCandidates: string[] = []

    for (const entry of entries) {
      if (!entry.isFile) continue
      const relativePath = normalizeRelativePath(entry.name)
      if (isProjectCoverPath(relativePath)) coverCandidates.push(relativePath)
      if (!isOpenCardDocument(relativePath)) continue

      const absolutePath = await this.paths.join(sourcePath, ...pathSegments(relativePath))
      try {
        const document = parseCardDocument(JSON.parse(await this.fs.readFile(absolutePath)) as unknown)
        documentEntries.push(relativePath)
        entryNames[relativePath] = resolveEntryName(document, relativePath)
      } catch {
        // Invalid documents are omitted; at least one valid entry is required below.
      }
    }

    documentEntries.sort((a, b) => a.localeCompare(b))
    coverCandidates.sort((a, b) => a.localeCompare(b))
    if (documentEntries.length === 0) {
      throw new TemplateServiceError('source-not-project', 'Project contains no valid OpenCard documents')
    }

    return {
      sourcePath,
      suggestedName: await this.paths.basename(sourcePath),
      entries: documentEntries,
      entryNames,
      coverCandidates,
    }
  }

  async importUserTemplate(sourcePath: string): Promise<ProjectTemplate> {
    assertSupportedPackagePath(sourcePath)
    try {
      const archive = await this.readTemplateArchive(sourcePath)
      return await this.commitUserTemplateArchive(archive.manifest, archive.content, archive.entryNames)
    } catch (cause) {
      if (cause instanceof TemplateServiceError) throw cause
      throw new TemplateServiceError('invalid-package', 'Selected file is not a valid template package', { cause })
    }
  }

  async exportProjectTemplate(request: ExportProjectTemplateRequest): Promise<string> {
    assertValidCreateTemplateRequest(request)
    const inspection = await this.inspectProjectSource(request.sourcePath)
    const entries = normalizeRequestedEntries(request)
    if (entries.length === 0 || entries.some((entry) => !inspection.entries.includes(entry))) {
      throw new TemplateServiceError('entry-not-found', 'A template entry is missing')
    }
    const entry = entries[0]
    const covers = [...new Set(request.covers.map(normalizeRelativePath))]
    if (covers.some((cover) => !inspection.coverCandidates.includes(cover))) {
      throw new TemplateServiceError('cover-not-found', 'Template cover is missing')
    }
    const excludedPaths = normalizeExcludedPaths(request.excludedPaths)
    for (const file of STRUCTURED_PROJECT_FILES) {
      if (await this.fs.fileExists(await this.paths.join(request.sourcePath, ...pathSegments(file.name)))
        && isExcludedPath(file.name, excludedPaths)) {
        throw new TemplateServiceError('source-not-project', `The ${file.label} cannot be excluded`)
      }
    }
    if (entries.some((candidate) => isExcludedPath(candidate, excludedPaths))) {
      throw new TemplateServiceError('entry-not-found', 'A selected entry is excluded')
    }
    if (covers.some((cover) => isExcludedPath(cover, excludedPaths))) {
      throw new TemplateServiceError('cover-not-found', 'A selected cover is excluded')
    }

    const manifest: ProjectTemplateManifest = {
      schemaVersion: PROJECT_TEMPLATE_SCHEMA_VERSION,
      id: this.createId(),
      name: request.name.trim(),
      description: request.description.trim(),
      entry,
      ...(entries.length > 1 ? { entries } : {}),
      ...(covers.length ? { covers } : {}),
    }
    const outputPath = request.outputPath.toLowerCase().endsWith(PROJECT_TEMPLATE_PACKAGE_SUFFIX)
      ? request.outputPath
      : `${request.outputPath}${PROJECT_TEMPLATE_PACKAGE_SUFFIX}`
    try {
      const entries = await this.fs.readDirectoryEntries(request.sourcePath, Number.POSITIVE_INFINITY)
      assertNoSymlinks(entries)
      const archiveFiles: Record<string, Uint8Array> = {
        [TEMPLATE_MANIFEST_FILE_NAME]: strToU8(JSON.stringify(manifest, null, 2)),
      }
      for (const file of entries) {
        if (!file.isFile) continue
        const relativePath = normalizeRelativePath(file.name)
        if (relativePath === '.opencard-cache' || relativePath.startsWith('.opencard-cache/')) continue
        if (isExcludedPath(relativePath, excludedPaths)) continue
        const absolutePath = await this.paths.join(request.sourcePath, ...pathSegments(relativePath))
        archiveFiles[`${TEMPLATE_CONTENT_DIRECTORY_NAME}/${relativePath}`] = await this.fs.readBinaryFile(absolutePath)
      }

      await this.fs.writeBinaryFile(outputPath, zipSync(archiveFiles, { level: 6 }))
      return outputPath
    } catch (cause) {
      if (cause instanceof TemplateServiceError) throw cause
      throw new TemplateServiceError('archive-failed', 'Failed to export template package', { cause })
    }
  }

  async createUserTemplate(request: CreateUserTemplateRequest): Promise<ProjectTemplate> {
    assertValidCreateTemplateRequest(request)
    const inspection = await this.inspectProjectSource(request.sourcePath)
    const entries = normalizeRequestedEntries(request)
    if (entries.length === 0 || entries.some((entry) => !inspection.entries.includes(entry))) {
      throw new TemplateServiceError('entry-not-found', 'A selected entry does not exist in the source project')
    }
    const entry = entries[0]

    const covers = [...new Set(request.covers.map(normalizeRelativePath))]
    if (covers.some((cover) => !inspection.coverCandidates.includes(cover))) {
      throw new TemplateServiceError('cover-not-found', 'A selected template cover does not exist in the source project')
    }

    const manifest: ProjectTemplateManifest = {
      schemaVersion: PROJECT_TEMPLATE_SCHEMA_VERSION,
      id: this.createId(),
      name: request.name.trim(),
      description: request.description.trim(),
      entry,
      ...(entries.length > 1 ? { entries } : {}),
      ...(covers.length > 0 ? { covers } : {}),
    }
    return await this.commitUserTemplate(manifest, request.sourcePath, inspection.entryNames)
  }
  async deleteUserTemplate(template: ProjectTemplate): Promise<void> {
    if (template.source !== 'user') {
      throw new TemplateServiceError('builtin-delete-forbidden', 'Built-in templates cannot be deleted')
    }
    if (!isSafeProjectTemplateId(template.id) || template.key !== `user:${template.id}`) {
      throw new TemplateServiceError('invalid-manifest', 'Invalid user template identity')
    }

    const userRoot = await this.resolveUserTemplateRoot()
    await this.fs.deleteFile(await this.paths.join(userRoot, template.id))
  }

  async createProject(request: CreateProjectFromTemplateRequest): Promise<CreatedProject> {
    const projectName = assertValidProjectName(request.projectName)
    if (!await this.fs.fileExists(request.parentPath)) {
      throw new TemplateServiceError('parent-not-found', 'Project parent directory does not exist')
    }

    const targetPath = await this.paths.join(request.parentPath, projectName)
    if (await this.fs.fileExists(targetPath)) {
      throw new TemplateServiceError('target-exists', 'Project target already exists')
    }

    const temporaryPath = await this.paths.join(
      request.parentPath,
      `.${projectName}.opencard-create-${this.createId()}`,
    )
    const templateEntries = resolveTemplateEntries(request.template)
    const selectedEntry = normalizeRelativePath(request.entry ?? request.template.entry ?? '')
    if (selectedEntry && !templateEntries.includes(selectedEntry)) {
      throw new TemplateServiceError('entry-not-found', 'Selected template entry is not available')
    }

    try {
      await this.fs.createDirectory(temporaryPath)
      if (await this.fs.fileExists(request.template.contentPath)) {
        await this.copyDirectory(request.template.contentPath, temporaryPath)
      }
      await initializeProjectStructure(this.fs, temporaryPath, this.createId)
      if (selectedEntry) {
        const entryPath = await this.paths.join(temporaryPath, ...pathSegments(selectedEntry))
        if (!await this.fs.fileExists(entryPath)) {
          throw new TemplateServiceError('entry-not-found', 'Template entry is missing')
        }
      }
      // 模板只是一个文件夹：它内部的项目文件不合规也不该拦住创建，
      // 能读出原有信息就只改名字，读不出来就用一份空配置写上项目名。
      const projectFilePath = await this.paths.join(temporaryPath, ...pathSegments(PROJECT_PROFILE_FILE_NAME))
      const templateProfile = await this.fs.fileExists(projectFilePath)
        ? parseProjectMetadataText(await this.fs.readFile(projectFilePath))
        : null
      await this.fs.writeFile(projectFilePath, serializeProjectMetadata({
        ...(templateProfile ?? {}),
        name: projectName,
      }))
      const createdEntryPath = selectedEntry
        ? await this.paths.join(targetPath, ...pathSegments(selectedEntry))
        : undefined
      await this.fs.renameFile(temporaryPath, targetPath)
      return { path: targetPath, ...(createdEntryPath ? { entry: createdEntryPath } : {}) }
    } catch (cause) {
      const cleanupCause = await this.removeIfExists(temporaryPath)
      if (cause instanceof TemplateServiceError && !cleanupCause) throw cause
      throw new TemplateServiceError(
        'copy-failed',
        cleanupCause
          ? 'Failed to create project and clean up temporary files'
          : 'Failed to create project from template',
        { cause: cleanupCause ? { operation: cause, cleanup: cleanupCause } : cause },
      )
    }
  }

  private async readTemplateArchive(sourcePath: string): Promise<{
    manifest: ProjectTemplateManifest
    content: Map<string, Uint8Array>
    entryNames: Record<string, string>
  }> {
    const bytes = await this.fs.readBinaryFile(sourcePath)
    if (bytes.byteLength > MAX_TEMPLATE_PACKAGE_BYTES) {
      throw new TemplateServiceError('invalid-package', 'Template package is too large')
    }
    const unpacked = unzipSync(bytes)
    const normalized = new Map<string, Uint8Array>()
    let unpackedBytes = 0
    for (const [rawPath, content] of Object.entries(unpacked)) {
      const path = normalizeArchivePath(rawPath)
      if (!path || normalized.has(path)) throw new TemplateServiceError('invalid-package', 'Unsafe archive path')
      unpackedBytes += content.byteLength
      if (unpackedBytes > MAX_TEMPLATE_UNPACKED_BYTES) {
        throw new TemplateServiceError('invalid-package', 'Unpacked template is too large')
      }
      normalized.set(path, content)
    }

    const manifestBytes = normalized.get(TEMPLATE_MANIFEST_FILE_NAME)
    if (!manifestBytes) throw new TemplateServiceError('invalid-manifest', 'Template manifest is missing')
    const manifest = parseProjectTemplateManifest(
      parseJson(strFromU8(manifestBytes), 'invalid-manifest', TEMPLATE_MANIFEST_FILE_NAME),
    )
    if (!manifest) throw new TemplateServiceError('invalid-manifest', 'Template manifest is invalid')

    const content = new Map<string, Uint8Array>()
    for (const [path, bytesValue] of normalized) {
      if (path === TEMPLATE_MANIFEST_FILE_NAME) continue
      if (!path.startsWith(`${TEMPLATE_CONTENT_DIRECTORY_NAME}/`)) {
        throw new TemplateServiceError('invalid-package', 'Unexpected file outside template content')
      }
      content.set(path.slice(TEMPLATE_CONTENT_DIRECTORY_NAME.length + 1), bytesValue)
    }
    for (const file of STRUCTURED_PROJECT_FILES) {
      if (content.has(file.name) && !file.parse(strFromU8(content.get(file.name)!))) {
        throw new TemplateServiceError('invalid-package', `OpenCard ${file.label} is invalid`)
      }
    }
    const entries = resolveTemplateEntries(manifest)
    if (entries.some((entry) => !content.has(entry))) {
      throw new TemplateServiceError('entry-not-found', 'A template entry is missing')
    }
    for (const cover of manifest.covers ?? []) {
      if (!content.has(cover)) throw new TemplateServiceError('cover-not-found', 'Template cover is missing')
    }
    const entryNames: Record<string, string> = {}
    for (const entry of entries) {
      try {
        const document = parseCardDocument(JSON.parse(strFromU8(content.get(entry)!)) as unknown)
        entryNames[entry] = resolveEntryName(document, entry)
      } catch (cause) {
        throw new TemplateServiceError('entry-not-found', 'Template entry is invalid', { cause })
      }
    }
    return { manifest, content, entryNames }
  }

  private async commitUserTemplateArchive(
    manifest: ProjectTemplateManifest,
    content: Map<string, Uint8Array>,
    entryNames: Readonly<Record<string, string>>,
  ): Promise<ProjectTemplate> {
    const userRoot = await this.resolveUserTemplateRoot()
    await this.fs.createDirectory(userRoot)
    const finalRoot = await this.paths.join(userRoot, manifest.id)
    if (await this.fs.fileExists(finalRoot)) throw new TemplateServiceError('template-exists', 'Template ID exists')
    const temporaryRoot = await this.paths.join(userRoot, `.tmp-${manifest.id}-${this.createId()}`)
    try {
      await this.fs.createDirectory(temporaryRoot)
      const contentRoot = await this.paths.join(temporaryRoot, TEMPLATE_CONTENT_DIRECTORY_NAME)
      await this.fs.createDirectory(contentRoot)
      for (const [relativePath, bytes] of content) {
        const segments = pathSegments(relativePath)
        for (let index = 1; index < segments.length; index += 1) {
          await this.fs.createDirectory(await this.paths.join(contentRoot, ...segments.slice(0, index)))
        }
        await this.fs.writeBinaryFile(await this.paths.join(contentRoot, ...segments), bytes)
      }
      await this.fs.writeFile(
        await this.paths.join(temporaryRoot, TEMPLATE_MANIFEST_FILE_NAME),
        JSON.stringify(manifest, null, 2),
      )
      const runtimeTemplate = await this.createRuntimeTemplate(manifest, 'user', finalRoot, entryNames)
      await this.fs.renameFile(temporaryRoot, finalRoot)
      return runtimeTemplate
    } catch (cause) {
      await this.removeIfExists(temporaryRoot)
      if (cause instanceof TemplateServiceError) throw cause
      throw new TemplateServiceError('copy-failed', 'Failed to install template package', { cause })
    }
  }

  private async commitUserTemplate(
    manifest: ProjectTemplateManifest,
    sourceContentPath: string,
    entryNames: Readonly<Record<string, string>>,
  ): Promise<ProjectTemplate> {
    const userRoot = await this.resolveUserTemplateRoot()
    await this.fs.createDirectory(userRoot)
    const finalRoot = await this.paths.join(userRoot, manifest.id)
    if (await this.fs.fileExists(finalRoot)) {
      throw new TemplateServiceError('template-exists', 'A user template with this ID already exists')
    }

    const temporaryRoot = await this.paths.join(userRoot, `.tmp-${manifest.id}-${this.createId()}`)
    try {
      await this.fs.createDirectory(temporaryRoot)
      const contentPath = await this.paths.join(temporaryRoot, TEMPLATE_CONTENT_DIRECTORY_NAME)
      await this.fs.createDirectory(contentPath)
      await this.copyDirectory(sourceContentPath, contentPath)
      await this.fs.writeFile(
        await this.paths.join(temporaryRoot, TEMPLATE_MANIFEST_FILE_NAME),
        JSON.stringify(manifest, null, 2),
      )
      const runtimeTemplate = await this.createRuntimeTemplate(manifest, 'user', finalRoot, entryNames)
      await this.fs.renameFile(temporaryRoot, finalRoot)
      return runtimeTemplate
    } catch (cause) {
      const cleanupCause = await this.removeIfExists(temporaryRoot)
      if (cause instanceof TemplateServiceError && !cleanupCause) throw cause
      throw new TemplateServiceError(
        'copy-failed',
        cleanupCause
          ? 'Failed to save user template and clean up temporary files'
          : 'Failed to save user template',
        { cause: cleanupCause ? { operation: cause, cleanup: cleanupCause } : cause },
      )
    }
  }

  private async loadBuiltinTemplates(): Promise<ProjectTemplate[]> {
    const indexPath = await this.paths.resolveResource(BUILTIN_TEMPLATE_INDEX_PATH)
    const indexValue = parseJson(await this.fs.readFile(indexPath), 'invalid-catalog', indexPath)
    const index = parseTemplateIndex(indexValue)
    if (!index) throw new TemplateServiceError('invalid-catalog', 'Invalid built-in template catalog')

    const builtinRoot = await this.paths.resolveResource('templates')
    const templates: ProjectTemplate[] = []
    for (const id of index.templates) {
      const rootPath = await this.paths.join(builtinRoot, id)
      const template = await this.loadTemplate(rootPath, 'builtin')
      if (template.id !== id) {
        throw new TemplateServiceError('invalid-manifest', `Built-in template ID mismatch: ${id}`)
      }
      templates.push(template)
    }
    return templates
  }

  private async loadUserTemplates(): Promise<Pick<TemplateCatalogSnapshot, 'templates' | 'warnings'>> {
    const rootPath = await this.resolveUserTemplateRoot()
    await this.fs.createDirectory(rootPath)
    const entries = await this.fs.readDirectory(rootPath)
    const templates: ProjectTemplate[] = []
    const warnings: TemplateCatalogSnapshot['warnings'] = []

    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const packagePath = await this.paths.join(rootPath, entry.name)
      if (entry.isSymlink) {
        warnings.push({ path: packagePath, reason: 'Template packages cannot be symbolic links' })
        continue
      }
      if (entry.name.startsWith('.tmp-')) {
        try {
          await this.fs.deleteFile(packagePath)
        } catch (cause) {
          warnings.push({ path: packagePath, reason: `Failed to clean up temporary template: ${describeError(cause)}` })
        }
        continue
      }
      try {
        const template = await this.loadTemplate(packagePath, 'user')
        if (template.id !== entry.name) {
          throw new TemplateServiceError('invalid-manifest', `User template ID mismatch: ${entry.name}`)
        }
        templates.push(template)
      } catch (cause) {
        warnings.push({ path: packagePath, reason: describeError(cause) })
      }
    }
    return { templates, warnings }
  }

  private async loadTemplate(rootPath: string, source: ProjectTemplateSource): Promise<ProjectTemplate> {
    if (source === 'user') {
      assertNoSymlinks(await this.fs.readDirectoryEntries(rootPath, Number.POSITIVE_INFINITY))
    }

    const manifestPath = await this.paths.join(rootPath, TEMPLATE_MANIFEST_FILE_NAME)
    const value = parseJson(await this.fs.readFile(manifestPath), 'invalid-manifest', manifestPath)
    const manifest = parseProjectTemplateManifest(value)
    if (!manifest) throw new TemplateServiceError('invalid-manifest', `Invalid template manifest: ${manifestPath}`)

    const contentPath = await this.paths.join(rootPath, TEMPLATE_CONTENT_DIRECTORY_NAME)
    const entryPaths = await Promise.all(resolveTemplateEntries(manifest).map(async (entry) => (
      await this.paths.join(contentPath, ...pathSegments(entry))
    )))
    if ((await Promise.all(entryPaths.map((path) => this.fs.fileExists(path)))).some((exists) => !exists)) {
      throw new TemplateServiceError('invalid-manifest', `Template content is incomplete: ${rootPath}`)
    }
    await assertValidStructuredProjectFiles(this.fs, this.paths, contentPath, 'invalid-manifest')
    for (const cover of manifest.covers ?? []) {
      const coverPath = await this.paths.join(contentPath, ...pathSegments(cover))
      if (!await this.fs.fileExists(coverPath)) {
        throw new TemplateServiceError('invalid-manifest', `Template cover is missing: ${coverPath}`)
      }
    }

    const entryNames: Record<string, string> = {}
    const templateEntries = resolveTemplateEntries(manifest)
    for (const [index, entryPath] of entryPaths.entries()) {
      try {
        const document = parseCardDocument(JSON.parse(await this.fs.readFile(entryPath)) as unknown)
        const relativePath = templateEntries[index]
        if (relativePath) entryNames[relativePath] = resolveEntryName(document, relativePath)
      } catch (cause) {
        throw new TemplateServiceError('invalid-manifest', `Template entry is invalid: ${entryPath}`, { cause })
      }
    }
    return this.createRuntimeTemplate(manifest, source, rootPath, entryNames)
  }

  private async createRuntimeTemplate(
    manifest: ProjectTemplateManifest,
    source: ProjectTemplateSource,
    rootPath: string,
    entryNames: Readonly<Record<string, string>> = {},
  ): Promise<ProjectTemplate> {
    const contentPath = await this.paths.join(rootPath, TEMPLATE_CONTENT_DIRECTORY_NAME)
    const coverPaths = await Promise.all((manifest.covers ?? []).map(async (cover) => (
      await this.paths.join(contentPath, ...pathSegments(cover))
    )))
    return {
      ...manifest,
      key: `${source}:${manifest.id}`,
      source,
      rootPath,
      contentPath,
      coverPaths,
      entryNames: { ...entryNames },
    }
  }

  private async resolveUserTemplateRoot(): Promise<string> {
    return await this.paths.join(await this.paths.appStorageDir(), APP_TEMPLATE_DIRECTORY_NAME)
  }

  private async copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
    await this.assertSourceRoot(sourcePath)
    const entries = await this.fs.readDirectoryEntries(sourcePath, Number.POSITIVE_INFINITY)
    assertNoSymlinks(entries)
    const directories = entries.filter((entry) => entry.isDirectory).sort((a, b) => entryDepth(a) - entryDepth(b))
    const files = entries.filter((entry) => entry.isFile)

    for (const entry of directories) {
      await this.fs.createDirectory(await this.paths.join(targetPath, ...pathSegments(entry.name)))
    }
    for (const entry of files) {
      const segments = pathSegments(entry.name)
      await this.fs.copyFile(
        await this.paths.join(sourcePath, ...segments),
        await this.paths.join(targetPath, ...segments),
      )
    }
  }

  private async assertSourceRoot(path: string): Promise<void> {
    const info = await this.fs.getFileInfo(path)
    if (info.isSymlink) {
      throw new TemplateServiceError('source-has-symlink', 'Template sources cannot be symbolic links')
    }
  }

  private async removeIfExists(path: string): Promise<unknown | null> {
    try {
      if (await this.fs.fileExists(path)) await this.fs.deleteFile(path)
      return null
    } catch (cause) {
      return cause
    }
  }
}

export const projectTemplateService = new ProjectTemplateService()
