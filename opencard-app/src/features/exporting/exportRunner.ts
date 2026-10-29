import {
  type ExportDestination,
  type ExportFaceRenderer,
  type ExportFailure,
  type ExportPlan,
  type ExportProgressCounts,
  type ExportProgressEvent,
  type ExportRunResult,
  resolveExportErrorPolicy,
} from './exportTask'
import { ExportRenderDiagnosticsError } from './exportRenderingError'

export type RunExportPlanOptions = {
  plan: ExportPlan
  renderer: ExportFaceRenderer
  destination: ExportDestination
  signal: AbortSignal
  report: (event: ExportProgressEvent) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runExportPlan(options: RunExportPlanOptions): Promise<ExportRunResult> {
  const counts: ExportProgressCounts = { succeeded: 0, skipped: 0, failed: 0 }
  const failures: ExportFailure[] = []
  const totalUnits = options.plan.entries.length * 2
  let completedUnits = 0
  let stoppedByFailure = false

  const report = (phase: ExportProgressEvent['phase'], current?: ExportProgressEvent['current']) => {
    options.report({ phase, completedUnits, totalUnits, ...(current ? { current } : {}), counts: { ...counts } })
  }
  const finish = (status: ExportRunResult['status']): ExportRunResult => ({
    status,
    total: options.plan.entries.length,
    ...counts,
    outputDirectory: options.plan.outputDirectory,
    failures,
  })

  try {
    await options.destination.ensureDirectory(options.plan.outputDirectory)
    for (const entry of options.plan.entries) {
      if (options.signal.aborted) {
        report('cancelled')
        return finish('cancelled')
      }
      const current = { sourcePath: entry.sourcePath, outputPath: entry.outputPath }

      try {
        if (options.plan.task.conflictMode === 'skip' && await options.destination.exists(entry.outputPath)) {
          counts.skipped += 1
          completedUnits += 2
          report('writing', current)
          continue
        }
      } catch (error) {
        counts.failed += 1
        completedUnits += 2
        failures.push({ ...current, stage: 'writing', message: errorMessage(error) })
        report('failed', current)
        if (resolveExportErrorPolicy(options.plan.task) === 'stop') {
          stoppedByFailure = true
          break
        }
        continue
      }

      report('rendering', current)
      let bytes: Uint8Array
      try {
        bytes = await options.renderer.render({
          ...current,
          faceKey: entry.faceKey,
          render: entry.render,
          scale: options.plan.task.scale ?? 1,
          dpi: options.plan.task.dpi,
        }, options.signal)
        completedUnits += 1
      } catch (error) {
        if (options.signal.aborted) {
          report('cancelled', current)
          return finish('cancelled')
        }
        counts.failed += 1
        completedUnits += 2
        failures.push({
          ...current,
          stage: 'rendering',
          message: errorMessage(error),
          ...(error instanceof ExportRenderDiagnosticsError ? { runtimeIssues: error.issues } : {}),
        })
        report('failed', current)
        if (resolveExportErrorPolicy(options.plan.task) === 'stop') {
          stoppedByFailure = true
          break
        }
        continue
      }

      if (options.signal.aborted) {
        report('cancelled', current)
        return finish('cancelled')
      }
      report('writing', current)
      try {
        await options.destination.write(entry.outputPath, bytes)
        counts.succeeded += 1
      } catch (error) {
        counts.failed += 1
        failures.push({ ...current, stage: 'writing', message: errorMessage(error) })
        if (resolveExportErrorPolicy(options.plan.task) === 'stop') stoppedByFailure = true
      }
      completedUnits += 1
      report(stoppedByFailure ? 'failed' : 'writing', current)
      if (stoppedByFailure) break
    }

    const status = stoppedByFailure || counts.failed > 0 ? 'failed' : 'completed'
    report(status)
    return finish(status)
  } finally {
    options.renderer.reset()
  }
}
