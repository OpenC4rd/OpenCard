import type { CardInstanceRecord } from '../../entities/card/model'
import { prepareCardRender } from '../card-rendering/renderPipeline'
import {
  type ExportDocumentSnapshot,
  type ExportPlan,
  type ExportPlanEntry,
  type ExportProjection,
  type ExportTaskValidationIssue,
  type PrepareExportTaskOptions,
  type ExportPreparationResult,
  validateExportTask,
} from './exportTask'

function sanitizeSegment(value: string, fallback: string): string {
  const sanitized = value.trim()
    .replace(/\.ocdocument$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[. _]+$/g, '')
  return sanitized || fallback
}

function joinPath(directory: string, fileName: string): string {
  const separator = directory.includes('\\') ? '\\' : '/'
  return `${directory.replace(/[\\/]+$/, '')}${separator}${fileName}`
}

function projectionsFor(snapshot: ExportDocumentSnapshot, selectionMode: PrepareExportTaskOptions['task']['selectionMode']): ExportProjection[] {
  const projections: ExportProjection[] = []
  if (selectionMode !== 'instances') projections.push({ suffix: 'blueprint', instance: null })
  if (selectionMode !== 'blueprint') {
    for (const instance of snapshot.document.instances) {
      projections.push({
        suffix: `instance_${sanitizeSegment(instance.name || instance.id, 'instance')}`,
        instance: instance as CardInstanceRecord,
      })
    }
  }
  return projections
}

function uniqueFileName(stem: string, suffix: string, used: Set<string>): string {
  const base = `${stem}_${suffix}`
  let candidate = `${base}.png`
  let index = 2
  while (used.has(candidate.toLocaleLowerCase())) {
    candidate = `${base}_${index}.png`
    index += 1
  }
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

export async function prepareExportTask(options: PrepareExportTaskOptions): Promise<ExportPreparationResult> {
  const issues = validateExportTask(options.task)
  if (issues.length > 0) return { ok: false, issues }
  let outputAvailable = false
  try {
    outputAvailable = await options.destination.exists(options.task.outputDirectory)
  } catch {
    outputAvailable = false
  }
  if (!outputAvailable) {
    return { ok: false, issues: [{ code: 'output-unavailable' }] }
  }

  const snapshots: ExportDocumentSnapshot[] = []
  const loadIssues: ExportTaskValidationIssue[] = []
  for (const path of options.task.documentPaths) {
    try {
      snapshots.push(await options.source.load(path))
    } catch (error) {
      loadIssues.push({
        code: 'document-unavailable',
        path,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (loadIssues.length > 0) return { ok: false, issues: loadIssues }

  const usedFileNames = new Set<string>()
  const entries: ExportPlanEntry[] = []
  const planningIssues: ExportTaskValidationIssue[] = []
  for (const snapshot of snapshots) {
    try {
      const sourceStem = sanitizeSegment(snapshot.sourcePath.replace(/[\\/]+/g, '_'), 'card')
      for (const projection of projectionsFor(snapshot, options.task.selectionMode)) {
        const render = prepareCardRender({
          document: snapshot.document,
          instance: projection.instance,
          resourceRootPath: snapshot.resourceRootPath,
          sourceFilePath: snapshot.sourceFilePath,
          environment: options.environment,
        })
        for (const faceKey of ['front', 'back'] as const) {
          const fileName = uniqueFileName(sourceStem, `${projection.suffix}_${faceKey}`, usedFileNames)
          entries.push({
            sourcePath: snapshot.sourcePath,
            outputPath: joinPath(options.task.outputDirectory, fileName),
            faceKey,
            render,
          })
        }
      }
    } catch (error) {
      planningIssues.push({
        code: 'document-unavailable',
        path: snapshot.sourcePath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (planningIssues.length > 0) return { ok: false, issues: planningIssues }
  if (entries.length === 0) return { ok: false, issues: [{ code: 'empty-plan' }] }
  const plan: ExportPlan = {
    task: { ...options.task, documentPaths: [...options.task.documentPaths] },
    entries,
    outputDirectory: options.task.outputDirectory,
  }
  return { ok: true, plan }
}
