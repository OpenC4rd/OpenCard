/** 水印：一组平铺的旋转文字块，和页面信息、卡面走同一套渲染，所以能用富文本和项目图标。 */
import { createTextBlock, type RootChild } from '../../entities/card/model'
import type { ExportWatermark, ExportWatermarkDensity } from '../workspace/model/projectExportProfile'

/** 相邻两行的距离，单位 mm；同一行里的间距取它的两倍，内容就排在这样大小的格子里。 */
const ROW_SPACING: Readonly<Record<ExportWatermarkDensity, number>> = { sparse: 60, normal: 40, dense: 24 }

export function createExportWatermarkChildren(watermark: ExportWatermark, width: number, height: number): RootChild[] {
  if (!watermark.enabled || !watermark.text.trim()) return []

  const rowSpacing = ROW_SPACING[watermark.density]
  const columnSpacing = rowSpacing * 2
  const angle = watermark.angle * Math.PI / 180
  const reach = Math.hypot(width, height) / 2 + columnSpacing
  const children: RootChild[] = []

  // 网格本身跟着文字旋转，转过之后四角也要有字，所以按对角线的范围铺，再丢掉纸外的格子。
  for (let row = -Math.ceil(reach / rowSpacing); row * rowSpacing <= reach; row += 1) {
    const stagger = row % 2 === 0 ? 0 : columnSpacing / 2
    for (let column = -Math.ceil(reach / columnSpacing) - 1; column * columnSpacing <= reach; column += 1) {
      const across = column * columnSpacing + stagger
      const down = row * rowSpacing
      const x = width / 2 + across * Math.cos(angle) - down * Math.sin(angle)
      const y = height / 2 + across * Math.sin(angle) + down * Math.cos(angle)
      if (x < -columnSpacing || x > width + columnSpacing || y < -columnSpacing || y > height + columnSpacing) continue
      children.push({
        block: createTextBlock({
          content: watermark.text,
          width: `${columnSpacing}mm`,
          height: `${rowSpacing}mm`,
          fontSize: `${watermark.size}mm`,
          color: watermark.color,
          textAlign: 'center',
          verticalAlign: 'center',
          rotation: String(watermark.angle),
          opacity: String(watermark.opacity),
        }),
        location: {
          id: `watermark-${children.length}`, type: 'simple-container-location', anchor: 'lt',
          x: `${x - columnSpacing / 2}mm`, y: `${y - rowSpacing / 2}mm`,
        },
      })
    }
  }
  return children
}
