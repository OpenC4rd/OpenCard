import { isProjectCoverPath } from '../../workspace/model/projectCover'
import { isRecord } from '../../../shared/model/record'

export const PROJECT_TEMPLATE_SCHEMA_VERSION = 1 as const
export const PROJECT_TEMPLATE_NAME_MAX_LENGTH = 80
export const PROJECT_TEMPLATE_DESCRIPTION_MAX_LENGTH = 200
export const PROJECT_TEMPLATE_PACKAGE_EXTENSION = 'octemplate'
export const PROJECT_TEMPLATE_PACKAGE_SUFFIX = `.${PROJECT_TEMPLATE_PACKAGE_EXTENSION}`

export type ProjectTemplateSource = 'builtin' | 'user'
export type ProjectTemplateKey = `${ProjectTemplateSource}:${string}`

export type ProjectTemplateLocalizedText = Readonly<Record<string, string>>

export interface ProjectTemplateLocalization {
  name?: ProjectTemplateLocalizedText
  description?: ProjectTemplateLocalizedText
}

export interface ProjectTemplateManifest {
  schemaVersion: typeof PROJECT_TEMPLATE_SCHEMA_VERSION
  id: string
  name: string
  description: string
  entry?: string
  entries?: readonly string[]
  covers?: readonly string[]
  i18n?: ProjectTemplateLocalization
}

export interface ProjectTemplate extends ProjectTemplateManifest {
  key: ProjectTemplateKey
  source: ProjectTemplateSource
  rootPath: string
  contentPath: string
  coverPaths: readonly string[]
  entryNames?: Readonly<Record<string, string>>
}

export interface TemplateCatalogWarning {
  path: string
  reason: string
}

export interface TemplateCatalogSnapshot {
  templates: ProjectTemplate[]
  warnings: TemplateCatalogWarning[]
}

export interface TemplateProjectInspection {
  sourcePath: string
  suggestedName: string
  entries: string[]
  entryNames: Record<string, string>
  coverCandidates: string[]
}

export interface CreateUserTemplateRequest {
  sourcePath: string
  name: string
  description: string
  entry: string
  entries?: string[]
  covers: string[]
}

export interface ExportProjectTemplateRequest extends CreateUserTemplateRequest {
  outputPath: string
  excludedPaths: string[]
}

export interface CreateProjectFromTemplateRequest {
  template: ProjectTemplate
  parentPath: string
  projectName: string
  entry?: string
}

export interface TemplateExportSelection {
  excludedPaths: string[]
  entries: string[]
  entryNames: Record<string, string>
  covers: string[]
}

export interface CreatedProject {
  path: string
  entry?: string
}

export type TemplateServiceErrorCode =
  | 'invalid-catalog'
  | 'invalid-manifest'
  | 'invalid-project-name'
  | 'invalid-template-name'
  | 'description-too-long'
  | 'source-not-project'
  | 'source-not-template'
  | 'source-has-symlink'
  | 'entry-not-found'
  | 'cover-not-found'
  | 'parent-not-found'
  | 'target-exists'
  | 'template-exists'
  | 'builtin-delete-forbidden'
  | 'copy-failed'
  | 'invalid-package'
  | 'archive-failed'

export class TemplateServiceError extends Error {
  readonly cause?: unknown

  constructor(
    readonly code: TemplateServiceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = 'TemplateServiceError'
    this.cause = options?.cause
  }
}

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const INVALID_PROJECT_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/
const SAFE_TEMPLATE_ID = /^[a-z0-9][a-z0-9-]*$/

function parseLocalizedText(value: unknown): ProjectTemplateLocalizedText | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (entries.some(([locale, text]) => !locale || typeof text !== 'string' || !text.trim())) return null
  return Object.fromEntries(entries.map(([locale, text]) => [locale, (text as string).trim()]))
}

function parseLocalization(value: unknown): ProjectTemplateLocalization | null {
  if (!isRecord(value)) return null
  const name = value.name === undefined ? undefined : parseLocalizedText(value.name)
  const description = value.description === undefined ? undefined : parseLocalizedText(value.description)
  if (value.name !== undefined && !name) return null
  if (value.description !== undefined && !description) return null
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  }
}

function isSafeRelativePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').trim()
  return normalized.length > 0
    && !normalized.startsWith('/')
    && !/^[a-z]:/i.test(normalized)
    && !normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

export function parseProjectTemplateManifest(value: unknown): ProjectTemplateManifest | null {
  if (!isRecord(value) || value.schemaVersion !== PROJECT_TEMPLATE_SCHEMA_VERSION) return null
  if (typeof value.id !== 'string' || !isSafeProjectTemplateId(value.id)) return null
  if (typeof value.name !== 'string' || validateTemplateName(value.name) !== null) return null
  if (typeof value.description !== 'string' || value.description.length > PROJECT_TEMPLATE_DESCRIPTION_MAX_LENGTH) {
    return null
  }
  if (value.entry !== undefined && (typeof value.entry !== 'string' || !isSafeRelativePath(value.entry))) return null
  if (value.entries !== undefined && (
    !Array.isArray(value.entries)
    || value.entries.length === 0
    || !value.entries.every((entry) => typeof entry === 'string' && isSafeRelativePath(entry))
  )) return null
  if (value.covers !== undefined && (
    !Array.isArray(value.covers)
    || !value.covers.every((cover) => (
      typeof cover === 'string'
      && isProjectCoverPath(cover)
    ))
  )) return null
  const i18n = value.i18n === undefined ? undefined : parseLocalization(value.i18n)
  if (value.i18n !== undefined && !i18n) return null

  const covers = Array.isArray(value.covers)
    ? [...new Set(value.covers.map((cover) => cover.replace(/\\/g, '/').trim()))]
    : []
  const entry = typeof value.entry === 'string' ? value.entry.replace(/\\/g, '/').trim() : undefined
  const entries = Array.isArray(value.entries)
    ? [...new Set(value.entries.map((candidate) => candidate.replace(/\\/g, '/').trim()))]
    : []
  if (entries.length > 0 && (!entry || !entries.includes(entry))) return null

  return {
    schemaVersion: PROJECT_TEMPLATE_SCHEMA_VERSION,
    id: value.id,
    name: value.name.trim(),
    description: value.description.trim(),
    ...(entry ? { entry } : {}),
    ...(entries.length > 0 ? { entries } : {}),
    ...(covers.length > 0 ? { covers } : {}),
    ...(i18n && Object.keys(i18n).length > 0 ? { i18n } : {}),
  }
}

export function resolveTemplateEntries(template: Pick<ProjectTemplateManifest, 'entry' | 'entries'>): string[] {
  return [...new Set([template.entry, ...(template.entries ?? [])].filter((entry): entry is string => Boolean(entry)))]
}

export function resolveProjectTemplateText(
  localized: ProjectTemplateLocalizedText | undefined,
  fallback: string,
  locale: string,
): string {
  const candidates = [
    locale,
    locale.toLocaleLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US',
    'en-US',
  ]
  for (const candidate of candidates) {
    const value = localized?.[candidate]
    if (value) return value
  }
  return Object.values(localized ?? {})[0] ?? fallback
}

export function resolveProjectTemplateName(template: ProjectTemplate, locale: string): string {
  return resolveProjectTemplateText(template.i18n?.name, template.name, locale)
}

export function resolveProjectTemplateDescription(template: ProjectTemplate, locale: string): string {
  return resolveProjectTemplateText(template.i18n?.description, template.description, locale)
}

export function isSafeProjectTemplateId(value: string): boolean {
  return SAFE_TEMPLATE_ID.test(value)
}

export function validateProjectName(value: string): TemplateServiceErrorCode | null {
  if (/[. ]$/.test(value)) return 'invalid-project-name'
  if (INVALID_PROJECT_NAME_CHARACTERS.test(value)) return 'invalid-project-name'
  const name = value.trim()
  if (!name || name.length > PROJECT_TEMPLATE_NAME_MAX_LENGTH) return 'invalid-project-name'
  if (name === '.' || name === '..') return 'invalid-project-name'
  if (WINDOWS_RESERVED_NAMES.test(name)) return 'invalid-project-name'
  return null
}

export function validateTemplateName(value: string): TemplateServiceErrorCode | null {
  const name = value.trim()
  return !name || name.length > PROJECT_TEMPLATE_NAME_MAX_LENGTH
    ? 'invalid-template-name'
    : null
}

export function validateTemplateDescription(value: string): TemplateServiceErrorCode | null {
  return value.trim().length > PROJECT_TEMPLATE_DESCRIPTION_MAX_LENGTH
    ? 'description-too-long'
    : null
}
