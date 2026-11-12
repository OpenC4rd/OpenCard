/** 拼版：把卡片排到纸张上。只做 mm 单位的几何计算，不碰渲染和文件。 */
import { EXPORT_PAPER_SIZES, type ExportPaper } from '../workspace/model/projectExportProfile'

/** 裁切标记的长度和离卡边的距离，单位 mm。 */
const CROP_MARK_LENGTH = 3
const CROP_MARK_OFFSET = 1

/** 宽高含出血；`bleed` 是其中每边的出血量，裁切标记据此对齐成品线。 */
export type ExportSheetCard = { key: number; width: number; height: number; bleed?: number }
export type ExportPlacement = { entryIndex: number; x: number; y: number; width: number; height: number; bleed?: number }
export type ExportCropMark = readonly [x1: number, y1: number, x2: number, y2: number]

export type ExportPdfPage = {
  width: number
  height: number
  placements: readonly ExportPlacement[]
  cropMarks: readonly ExportCropMark[]
}

export function resolvePaperSheet(paper: ExportPaper): { width: number; height: number } {
  const [width, height] = paper.size === 'custom' ? [paper.width, paper.height] : EXPORT_PAPER_SIZES[paper.size]
  return paper.orientation === 'portrait' ? { width, height } : { width: height, height: width }
}

function fitCount(available: number, cell: number, gap: number): number {
  return Math.floor((available + gap + 1e-6) / (cell + gap))
}

function cropMarksFor(card: ExportPlacement): ExportCropMark[] {
  const { x, y, width, height, bleed = 0 } = card
  const right = x + width
  const bottom = y + height
  const near = CROP_MARK_OFFSET
  const far = CROP_MARK_OFFSET + CROP_MARK_LENGTH
  // 标记画在出血之外，位置对齐成品线。
  const [trimLeft, trimRight, trimTop, trimBottom] = [x + bleed, right - bleed, y + bleed, bottom - bleed]
  return [
    [trimLeft, y - far, trimLeft, y - near], [trimRight, y - far, trimRight, y - near],
    [trimLeft, bottom + near, trimLeft, bottom + far], [trimRight, bottom + near, trimRight, bottom + far],
    [x - far, trimTop, x - near, trimTop], [x - far, trimBottom, x - near, trimBottom],
    [right + near, trimTop, right + far, trimTop], [right + near, trimBottom, right + far, trimBottom],
  ]
}

/** 卡片紧贴时，朝向邻卡的标记会压在画面上，这些要去掉。 */
function overlapsCard([x1, y1, x2, y2]: ExportCropMark, card: ExportPlacement): boolean {
  return Math.max(x1, x2) > card.x && Math.min(x1, x2) < card.x + card.width
    && Math.max(y1, y2) > card.y && Math.min(y1, y2) < card.y + card.height
}

/**
 * `backs` 与 `fronts` 一一对应时生成正反交替的页面。背面的格子按整张纸镜像：
 * 长边翻转左右镜像，短边翻转上下镜像。只镜像行列顺序不够，
 * 靠左上或四边边距不等时整组卡不在纸张中央，背面的位置也要跟着翻过去。
 */
function imposeSameSizeCards(
  paper: ExportPaper,
  fronts: readonly ExportSheetCard[],
  backs: readonly ExportSheetCard[] | null,
): ExportPdfPage[] | null {
  const sheet = resolvePaperSheet(paper)
  const cards = [...fronts, ...(backs ?? [])]
  const cellWidth = Math.max(...cards.map(card => card.width))
  const cellHeight = Math.max(...cards.map(card => card.height))
  const contentWidth = sheet.width - paper.marginLeft - paper.marginRight
  const contentHeight = sheet.height - paper.marginTop - paper.marginBottom
  const distributed = paper.placement === 'distribute'
  const fixedGapX = distributed ? 0 : paper.gapX
  const fixedGapY = distributed ? 0 : paper.gapY
  const columns = paper.columns || fitCount(contentWidth, cellWidth, fixedGapX)
  const rows = paper.rows || fitCount(contentHeight, cellHeight, fixedGapY)
  const gridWidth = columns * cellWidth + (columns - 1) * fixedGapX
  const gridHeight = rows * cellHeight + (rows - 1) * fixedGapY
  if (columns < 1 || rows < 1 || gridWidth > contentWidth + 1e-6 || gridHeight > contentHeight + 1e-6) return null

  // 只有一列或一行时没有可分的间隙，这个方向退回居中。
  const gapX = distributed && columns > 1 ? (contentWidth - columns * cellWidth) / (columns - 1) : fixedGapX
  const gapY = distributed && rows > 1 ? (contentHeight - rows * cellHeight) / (rows - 1) : fixedGapY
  const anchored = paper.placement === 'top-left'
  const left = paper.marginLeft + (anchored ? 0 : (contentWidth - (columns * cellWidth + (columns - 1) * gapX)) / 2)
  const top = paper.marginTop + (anchored ? 0 : (contentHeight - (rows * cellHeight + (rows - 1) * gapY)) / 2)

  function layoutPage(batch: readonly ExportSheetCard[], side: 'front' | 'back'): ExportPdfPage {
    const placements = batch.map((card, index): ExportPlacement => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const cellX = left + column * (cellWidth + gapX)
      const cellY = top + row * (cellHeight + gapY)
      const placedX = side === 'back' && paper.duplex === 'long-edge' ? sheet.width - cellX - cellWidth : cellX
      const placedY = side === 'back' && paper.duplex === 'short-edge' ? sheet.height - cellY - cellHeight : cellY
      return {
        entryIndex: card.key,
        x: placedX + (cellWidth - card.width) / 2,
        y: placedY + (cellHeight - card.height) / 2,
        width: card.width,
        height: card.height,
        bleed: card.bleed,
      }
    })
    const cropMarks = paper.cropMarks
      ? placements.flatMap(cropMarksFor).filter(mark => !placements.some(card => overlapsCard(mark, card)))
      : []
    return { ...sheet, placements, cropMarks }
  }

  const perPage = columns * rows
  const pages: ExportPdfPage[] = []
  for (let start = 0; start < fronts.length; start += perPage) {
    pages.push(layoutPage(fronts.slice(start, start + perPage), 'front'))
    if (backs) pages.push(layoutPage(backs.slice(start, start + perPage), 'back'))
  }
  return pages
}

/**
 * 同尺寸的卡排在一起，每种尺寸从新的一页开始并用自己的格子，小卡不会被大卡撑出空隙。
 * 尺寸按首次出现的顺序排。纸张放不下其中一种时返回 null。
 */
export function imposeCards(
  paper: ExportPaper,
  fronts: readonly ExportSheetCard[],
  backs: readonly ExportSheetCard[] | null,
): ExportPdfPage[] | null {
  const groups = new Map<string, { fronts: ExportSheetCard[]; backs: ExportSheetCard[] }>()
  fronts.forEach((front, index) => {
    const back = backs?.[index]
    const key = [front.width, front.height, back?.width, back?.height].join('×')
    const group = groups.get(key) ?? groups.set(key, { fronts: [], backs: [] }).get(key)!
    group.fronts.push(front)
    if (back) group.backs.push(back)
  })

  const pages: ExportPdfPage[] = []
  for (const group of groups.values()) {
    const grouped = imposeSameSizeCards(paper, group.fronts, backs && group.backs)
    if (!grouped) return null
    pages.push(...grouped)
  }
  return pages
}
