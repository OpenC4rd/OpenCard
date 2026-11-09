/** 把渲染好的卡面合成一页打印图：白底、卡面、裁切标记，输出给 PDF 嵌入的 JPEG。 */
import type { ExportPdfPage } from './exportImposition'
import type { PdfImagePage } from './imagePdf'

const JPEG_QUALITY = 0.95
/** 裁切标记线宽，约 0.25pt。 */
const CROP_MARK_WIDTH_MM = 0.09

export async function composeExportPage(
  page: ExportPdfPage,
  images: ReadonlyMap<number, Uint8Array>,
  dpi: number,
  signal: AbortSignal,
): Promise<PdfImagePage> {
  const scale = dpi / 25.4
  const pixelWidth = Math.max(1, Math.round(page.width * scale))
  const pixelHeight = Math.max(1, Math.round(page.height * scale))
  const canvas = new OffscreenCanvas(pixelWidth, pixelHeight)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Export page canvas is unavailable')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, pixelWidth, pixelHeight)

  for (const placement of page.placements) {
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
    const bytes = images.get(placement.entryIndex)
    if (!bytes) continue
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }))
    context.drawImage(
      bitmap,
      Math.round(placement.x * scale), Math.round(placement.y * scale),
      Math.round(placement.width * scale), Math.round(placement.height * scale),
    )
    bitmap.close()
  }

  context.strokeStyle = '#000000'
  context.lineWidth = Math.max(1, CROP_MARK_WIDTH_MM * scale)
  context.beginPath()
  for (const [x1, y1, x2, y2] of page.cropMarks) {
    context.moveTo(x1 * scale, y1 * scale)
    context.lineTo(x2 * scale, y2 * scale)
  }
  context.stroke()

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  return {
    width: page.width, height: page.height, pixelWidth, pixelHeight,
    jpeg: new Uint8Array(await blob.arrayBuffer()),
  }
}
