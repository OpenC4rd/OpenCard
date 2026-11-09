/** 页面信息和水印：做成一份整页大小的透明卡片文档，叠在拼好的页面上，和卡面走同一套渲染。 */
import { createCardFace, createTextBlock, type CardDocument, type RootChild } from '../../entities/card/model'
import {
  EXPORT_PAGE_REGIONS,
  type ExportPageRegion,
  type ExportPaper,
  type ExportRegion,
  type ExportWatermark,
} from '../workspace/model/projectExportProfile'
import { createExportWatermarkChildren } from './exportWatermark'

type PageSize = { width: number; height: number }

function regionChild(key: ExportPageRegion, region: ExportRegion, paper: ExportPaper, { width, height }: PageSize): RootChild {
  const [column, row] = key as `${'l' | 'c' | 'r'}${'t' | 'c' | 'b'}`
  const x = { l: 0, c: paper.marginLeft, r: width - paper.marginRight }[column!]
  const y = { t: 0, c: paper.marginTop, b: height - paper.marginBottom }[row!]
  const blockWidth = { l: paper.marginLeft, c: width - paper.marginLeft - paper.marginRight, r: paper.marginRight }[column!]
  const blockHeight = { t: paper.marginTop, c: height - paper.marginTop - paper.marginBottom, b: paper.marginBottom }[row!]
  return {
    block: createTextBlock({
      content: region.content,
      width: `${blockWidth}mm`,
      height: `${blockHeight}mm`,
      textAlign: region.textAlign,
      verticalAlign: region.verticalAlign,
    }),
    location: { id: `region-${key}`, type: 'simple-container-location', anchor: 'lt', x: `${x}mm`, y: `${y}mm` },
  }
}

/** 水印垫在下面，页面信息盖在上面。没有可见内容的页面返回 null：不多渲染一层。 */
export function createExportPageOverlay(
  regions: ExportPaper['regions'],
  watermark: ExportWatermark,
  paper: ExportPaper,
  page: PageSize,
): CardDocument | null {
  const children = [
    ...createExportWatermarkChildren(watermark, page.width, page.height),
    ...EXPORT_PAGE_REGIONS.flatMap(key => regions[key]?.content ? [regionChild(key, regions[key]!, paper, page)] : []),
  ]
  if (children.length === 0) return null
  return {
    type: 'card-document', id: 'export-page-overlay', name: 'Page', version: '1',
    width: String(page.width), height: String(page.height),
    faces: { front: createCardFace({ background: 'transparent', children }), back: createCardFace() },
    instances: [],
  } as CardDocument
}
