import {
  type ExportDestination,
  type ExportFaceRenderer,
  type ExportFailure,
  type ExportPageComposer,
  type ExportPdfPlan,
  type ExportPlan,
  type ExportProgressCounts,
  type ExportProgressEvent,
  type ExportRunResult,
} from './exportTask'
import { buildImagePdf, type PdfImagePage } from './imagePdf'
import { ExportRenderDiagnosticsError } from './exportRenderingError'

type RunExportPlanOptions = {
  plan: ExportPlan
  renderer: ExportFaceRenderer
  composer: ExportPageComposer
  destination: ExportDestination
  signal: AbortSignal
  report: (event: ExportProgressEvent) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 整份导出只有一个文件：渲染失败的卡位留白并记录，`stop` 时不写文件。 */
async function runPdfPlan(options: RunExportPlanOptions, pdf: ExportPdfPlan): Promise<ExportRunResult> {
  const { plan, renderer, composer, destination, signal } = options
  const counts: ExportProgressCounts = { succeeded: 0, skipped: 0, failed: 0 }
  const failures: ExportFailure[] = []
  const totalUnits = pdf.pages.length + 1
  const current = { sourcePath: plan.profile.name, outputPath: pdf.outputPath }
  let completedUnits = 0
  const report = (phase: ExportProgressEvent['phase']) => {
    options.report({ phase, completedUnits, totalUnits, current, counts: { ...counts } })
  }
  const finish = (status: ExportRunResult['status']): ExportRunResult => {
    report(status)
    return { status, total: 1, ...counts, outputDirectory: plan.outputDirectory, failures }
  }

  try {
    await destination.ensureDirectory(plan.outputDirectory)
    if (plan.profile.output.conflict === 'skip' && await destination.exists(pdf.outputPath)) {
      counts.skipped += 1
      completedUnits = totalUnits
      return finish('completed')
    }

    const dpi = plan.profile.rule.dpi
    const pages: PdfImagePage[] = []
    const unavailable = new Set<number>()
    for (const page of pdf.pages) {
      const images = new Map<number, Uint8Array>()
      for (const { entryIndex } of page.placements) {
        if (signal.aborted) return finish('cancelled')
        if (images.has(entryIndex) || unavailable.has(entryIndex)) continue
        const entry = plan.entries[entryIndex]!
        report('rendering')
        try {
          images.set(entryIndex, await renderer.render({
            sourcePath: entry.sourcePath, outputPath: entry.outputPath, faceKey: entry.faceKey,
            render: entry.render, scale: 1, dpi,
          }, signal))
        } catch (error) {
          if (signal.aborted) return finish('cancelled')
          unavailable.add(entryIndex)
          counts.failed += 1
          failures.push({
            sourcePath: entry.sourcePath, outputPath: entry.outputPath, stage: 'rendering', message: errorMessage(error),
            ...(error instanceof ExportRenderDiagnosticsError ? { runtimeIssues: error.issues } : {}),
          })
          if (plan.profile.errorPolicy === 'stop') return finish('failed')
        }
      }
      pages.push(await composer.compose(page, images, dpi, signal))
      completedUnits += 1
      report('rendering')
    }

    if (signal.aborted) return finish('cancelled')
    report('writing')
    await destination.write(pdf.outputPath, buildImagePdf(pages))
    completedUnits = totalUnits
    counts.succeeded += 1
    return finish(counts.failed > 0 ? 'failed' : 'completed')
  } catch (error) {
    if (signal.aborted) return finish('cancelled')
    counts.failed += 1
    failures.push({ ...current, stage: 'writing', message: errorMessage(error) })
    return finish('failed')
  } finally {
    renderer.reset()
  }
}

export async function runExportPlan(options: RunExportPlanOptions): Promise<ExportRunResult> {
  if (options.plan.pdf) return runPdfPlan(options, options.plan.pdf)

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
        if (options.plan.profile.output.conflict === 'skip' && await options.destination.exists(entry.outputPath)) {
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
        if (options.plan.profile.errorPolicy === 'stop') {
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
          scale: 1,
          dpi: options.plan.profile.rule.dpi,
          ...(options.plan.profile.rule.kind === 'images'
            ? { format: options.plan.profile.rule.format, quality: options.plan.profile.rule.quality }
            : {}),
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
        if (options.plan.profile.errorPolicy === 'stop') {
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
        if (options.plan.profile.errorPolicy === 'stop') stoppedByFailure = true
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
