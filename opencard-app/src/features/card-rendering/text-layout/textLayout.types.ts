import type { AlignmentPosition, TextWritingMode, VerticalAlignmentPosition } from '../../../entities/card/model'
import type { CardMarkupDocument, CardMarkupIconNode, CardMarkupImageNode } from '../markup'

export type TextMetricsSample = {
  width: number
  ascent: number
  descent: number
}

export type TextMeasurePort = {
  measureText(text: string, fontSpec: {
    fontFamily: string
    fontSizePx: number
    fontWeight: 'light' | 'normal' | 'bold'
    italic: boolean
  }): TextMetricsSample
  resolveIconAspectRatio?(icon: CardMarkupIconNode): number
}

export type ResolvedRunStyle = {
  fontFamily: string
  fontSizePx: number
  fontWeight: 'light' | 'normal' | 'bold'
  italic: boolean
  underline: boolean
  strikethrough: boolean
  color: string
  backgroundColor?: string
  markColor?: string
  strokeColor?: string
  strokeWidth: number
  shadowColor?: string
  shadowOffsetX: number
  shadowOffsetY: number
  shadowBlur: number
  fillType: 'color' | 'image'
  fillSource?: string
}

/**
 * 所有 Run 的 `x / y / width / height` 都是文字盒坐标系下**实际占据**的轴对齐矩形。
 * `angleRad` 只会是 0 或 π/2（竖排里被旋转的西文）。画家绘制旋转 Run 时：
 * 绕矩形中心旋转 `angleRad`，旋转前的盒子尺寸为 `(height, width)`；
 * `baselineY - y` 始终是基线到**旋转前盒子顶边**的距离。
 */
export type PositionedGlyphRun = {
  kind: 'glyph'
  text: string
  x: number
  y: number
  width: number
  height: number
  baselineY: number
  angleRad: number
  style: ResolvedRunStyle
}

export type PositionedIconRun = {
  kind: 'icon'
  icon: CardMarkupIconNode
  x: number
  y: number
  width: number
  height: number
  angleRad: number
  style: ResolvedRunStyle
}

export type PositionedImageRun = {
  kind: 'img'
  image: CardMarkupImageNode
  x: number
  y: number
  width: number
  height: number
  angleRad: number
}

export type PositionedTextRun = PositionedGlyphRun | PositionedIconRun | PositionedImageRun

/** 竖排时 `baselineY` 是这一列基线轴的 x 坐标（横排时是基线的 y 坐标）。 */
export type PositionedTextLine = {
  index: number
  x: number
  y: number
  width: number
  height: number
  baselineY: number
  runs: readonly PositionedTextRun[]
}

export type TextLayoutInput = {
  document: CardMarkupDocument
  boxWidth: number
  boxHeight: number
  baseFontFamily: string
  baseFontSizePx: number
  baseFontWeight: 'light' | 'normal' | 'bold'
  baseColor: string
  textAlign: AlignmentPosition
  verticalAlign: VerticalAlignmentPosition
  lineHeightPx: number
  writingMode: TextWritingMode
}

export type TextLayoutResult = {
  lines: readonly PositionedTextLine[]
  runs: readonly PositionedTextRun[]
  contentWidth: number
  contentHeight: number
}
