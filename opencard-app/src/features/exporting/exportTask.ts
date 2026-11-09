import type { CardDocument, CardFaceKey } from '../../entities/card/model'
import type { CardRenderEnvironment, PreparedCardRender } from '../card-rendering/renderPipeline'
import type { CardPipelineIssue } from '../card-rendering/cardPipelineIssue'
import type { ExportProfile } from '../workspace/model/projectExportProfile'
import type { ExportPdfPage } from './exportImposition'
import { findExportVariable } from './exportVariables'
import type { PdfImagePage } from './imagePdf'

type ExportTaskValidationCode =
  | 'documents-required'
  | 'invalid-document-path'
  | 'invalid-scale'
  | 'output-required'
  | 'invalid-file-name'
  | 'unknown-variable'
  | 'paper-too-small'
  | 'document-unavailable'
  | 'empty-plan'
  | 'preview-failed'

export type ExportTaskValidationIssue = {
  code: ExportTaskValidationCode
  path?: string
  message?: string
}

export type ExportDocumentSnapshot = {
  sourcePath: string
  resourceRootPath: string
  sourceFilePath: string
  document: CardDocument
}

export type ExportPlanEntry = {
  sourcePath: string
  outputPath: string
  faceKey: CardFaceKey
  render: PreparedCardRender
}

/** 整份导出合成一个 PDF：`entries` 是要渲染的卡面，`pages` 按下标引用它们。 */
export type ExportPdfPlan = {
  outputPath: string
  pages: readonly ExportPdfPage[]
}

export type ExportPlan = {
  profile: ExportProfile
  entries: readonly ExportPlanEntry[]
  outputDirectory: string
  pdf?: ExportPdfPlan
}

export type ExportPreparationResult =
  | { ok: true; plan: ExportPlan }
  | { ok: false; issues: readonly ExportTaskValidationIssue[] }

export type ExportFailure = {
  sourcePath: string
  outputPath: string
  stage: 'rendering' | 'writing'
  message: string
  runtimeIssues?: readonly CardPipelineIssue[]
}

export type ExportProgressCounts = {
  succeeded: number
  skipped: number
  failed: number
}

export type ExportProgressEvent = {
  phase: 'rendering' | 'writing' | 'completed' | 'cancelled' | 'failed'
  completedUnits: number
  totalUnits: number
  current?: { sourcePath: string; outputPath: string }
  counts: ExportProgressCounts
}

export type ExportRunResult = {
  status: 'completed' | 'cancelled' | 'failed'
  total: number
  succeeded: number
  skipped: number
  failed: number
  outputDirectory: string
  failures: readonly ExportFailure[]
}

type ExportRenderRequest = {
  sourcePath: string
  outputPath: string
  faceKey: CardFaceKey
  render: PreparedCardRender
  scale: number
  dpi?: number
  format?: 'png' | 'jpeg'
  quality?: number
}

interface ExportDocumentSource {
  list(): Promise<readonly string[]>
  load(relativePath: string): Promise<ExportDocumentSnapshot>
}

export interface ExportFaceRenderer {
  render(request: ExportRenderRequest, signal: AbortSignal): Promise<Uint8Array>
  reset(): void
}

export interface ExportPageComposer {
  compose(
    page: ExportPdfPage,
    images: ReadonlyMap<number, Uint8Array>,
    dpi: number,
    signal: AbortSignal,
  ): Promise<PdfImagePage>
}

export interface ExportDestination {
  exists(path: string): Promise<boolean>
  ensureDirectory(path: string): Promise<void>
  write(path: string, bytes: Uint8Array): Promise<void>
}

export type PrepareExportTaskOptions = {
  profile: ExportProfile
  source: ExportDocumentSource
  destination: ExportDestination
  environment: Readonly<CardRenderEnvironment>
}

const WILDCARD = /[*?]/

function isProjectRelativePattern(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/')
  return Boolean(normalized) && !normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)
    && !normalized.split('/').includes('..')
}

/** 不以 `.ocdocument` 结尾的都当文件夹：等于它下面的所有文档，之后新建的也算进去。 */
function toDocumentPattern(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/')
  return normalized.toLocaleLowerCase().endsWith('.ocdocument')
    ? normalized
    : `${normalized.replace(/\/+$/, '')}/**/*.ocdocument`
}

function patternToRegExp(pattern: string): RegExp {
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*')
  return new RegExp(`^${source}$`, 'i')
}

/** 按配置的先后顺序展开路径和通配符；不含通配符的路径原样保留，文件不存在时由读取环节报告。 */
export function matchExportDocuments(patterns: readonly string[], paths: readonly string[]): string[] {
  const matched = new Map<string, string>()
  const add = (path: string): void => { if (!matched.has(path.toLocaleLowerCase())) matched.set(path.toLocaleLowerCase(), path) }
  for (const raw of patterns) {
    const pattern = toDocumentPattern(raw)
    if (!WILDCARD.test(pattern)) {
      add(pattern)
      continue
    }
    const expression = patternToRegExp(pattern)
    paths.filter(path => expression.test(path)).forEach(add)
  }
  return [...matched.values()]
}

export function validateExportProfile(profile: ExportProfile): ExportTaskValidationIssue[] {
  const issues: ExportTaskValidationIssue[] = []
  if (profile.documents.length === 0) issues.push({ code: 'documents-required' })
  for (const path of profile.documents) {
    if (!isProjectRelativePattern(path)) issues.push({ code: 'invalid-document-path', path })
  }
  if (!Number.isFinite(profile.rule.dpi) || profile.rule.dpi < 72) issues.push({ code: 'invalid-scale' })
  if (!profile.rule.fileName.trim()) issues.push({ code: 'invalid-file-name' })
  if (!profile.output.directory.trim()) issues.push({ code: 'output-required' })
  const templates = [profile.output.directory, ...(profile.rule.kind === 'pdf' ? [profile.rule.fileName] : [])]
  for (const template of templates) {
    const token = findExportVariable(template)
    if (token) issues.push({ code: 'unknown-variable', path: token })
  }
  return issues
}
