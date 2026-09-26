import type { CardDocument, CardFaceKey, CardInstanceRecord } from '../../entities/card/model'
import type { CardRenderEnvironment, PreparedCardRender } from '../card-rendering/renderPipeline'
import type { CardPipelineIssue } from '../card-rendering/cardPipelineIssue'
import type { ProjectExportTask } from '../workspace/model/projectMetadata'

export type ExportTaskValidationCode =
  | 'documents-required'
  | 'duplicate-document'
  | 'invalid-document-path'
  | 'invalid-scale'
  | 'layout-unavailable'
  | 'output-required'
  | 'invalid-error-policy'
  | 'output-unavailable'
  | 'document-unavailable'
  | 'empty-plan'

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

export type ExportPlan = {
  task: ProjectExportTask
  entries: readonly ExportPlanEntry[]
  outputDirectory: string
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

export type ExportRenderRequest = {
  sourcePath: string
  outputPath: string
  faceKey: CardFaceKey
  render: PreparedCardRender
  scale: number
}

export interface ExportDocumentSource {
  load(relativePath: string): Promise<ExportDocumentSnapshot>
}

export interface ExportFaceRenderer {
  render(request: ExportRenderRequest, signal: AbortSignal): Promise<Uint8Array>
  reset(): void
}

export interface ExportDestination {
  exists(path: string): Promise<boolean>
  ensureDirectory(path: string): Promise<void>
  write(path: string, bytes: Uint8Array): Promise<void>
}

export type PrepareExportTaskOptions = {
  task: ProjectExportTask
  source: ExportDocumentSource
  destination: ExportDestination
  environment: Readonly<CardRenderEnvironment>
}

export type ExportProjection = {
  suffix: string
  instance: CardInstanceRecord | null
}

export function resolveExportErrorPolicy(task: ProjectExportTask): 'continue' | 'stop' {
  return task.errorPolicy ?? 'continue'
}

export function createDefaultProjectExportTask(): ProjectExportTask {
  return {
    documentPaths: [],
    selectionMode: 'blueprint-and-instances',
    scale: 1,
    layoutMode: 'none',
    outputDirectory: '',
    conflictMode: 'replace',
    errorPolicy: 'continue',
  }
}

export function validateExportTask(task: ProjectExportTask): ExportTaskValidationIssue[] {
  const issues: ExportTaskValidationIssue[] = []
  if (task.documentPaths.length === 0) issues.push({ code: 'documents-required' })

  const identities = new Set<string>()
  for (const path of task.documentPaths) {
    const normalized = path.trim().replace(/\\/g, '/')
    if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)
      || normalized.split('/').includes('..') || !normalized.toLocaleLowerCase().endsWith('.ocdocument')) {
      issues.push({ code: 'invalid-document-path', path })
    }
    const identity = normalized.toLocaleLowerCase()
    if (identities.has(identity)) issues.push({ code: 'duplicate-document', path })
    identities.add(identity)
  }

  if (!Number.isFinite(task.scale) || task.scale < 0.1) issues.push({ code: 'invalid-scale' })
  if (task.layoutMode !== 'none') issues.push({ code: 'layout-unavailable' })
  if (!task.outputDirectory.trim()) issues.push({ code: 'output-required' })
  if (!['continue', 'stop'].includes(resolveExportErrorPolicy(task))) {
    issues.push({ code: 'invalid-error-policy' })
  }
  return issues
}
