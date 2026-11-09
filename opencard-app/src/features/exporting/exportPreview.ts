/** 导出预览：走和正式导出相同的计划与合成，只把 DPI 降下来，看到的就是会印出来的。 */
import type { ExportFaceRenderer, ExportPageComposer, ExportPlan, ExportPlanEntry } from './exportTask'

const PREVIEW_DPI = 144

export function exportPreviewPageCount(plan: ExportPlan): number {
  return plan.pdf?.pages.length ?? plan.entries.length
}

function renderEntry(renderer: ExportFaceRenderer, entry: ExportPlanEntry, signal: AbortSignal): Promise<Uint8Array> {
  const { sourcePath, outputPath, faceKey, render } = entry
  return renderer.render({ sourcePath, outputPath, faceKey, render, scale: 1, dpi: PREVIEW_DPI }, signal)
}

/** PDF 按页合成；图片规则一个条目就是一页，并带上真实的格式和质量。 */
export async function renderExportPreviewPage(
  plan: ExportPlan,
  index: number,
  renderer: ExportFaceRenderer,
  composer: ExportPageComposer,
  signal: AbortSignal,
): Promise<Blob> {
  const page = plan.pdf?.pages[index]
  if (page) {
    const images = new Map<number, Uint8Array>()
    for (const { entryIndex } of page.placements) {
      if (!images.has(entryIndex)) images.set(entryIndex, await renderEntry(renderer, plan.entries[entryIndex]!, signal))
    }
    const { jpeg } = await composer.compose(page, images, PREVIEW_DPI, signal)
    return new Blob([jpeg as BlobPart], { type: 'image/jpeg' })
  }

  const entry = plan.entries[index]!
  const { rule } = plan.profile
  if (rule.kind !== 'images') throw new Error('Export preview page is out of range')
  const { sourcePath, outputPath, faceKey, render } = entry
  const bytes = await renderer.render({
    sourcePath, outputPath, faceKey, render, scale: 1, dpi: PREVIEW_DPI, format: rule.format, quality: rule.quality,
  }, signal)
  return new Blob([bytes as BlobPart], { type: `image/${rule.format}` })
}
