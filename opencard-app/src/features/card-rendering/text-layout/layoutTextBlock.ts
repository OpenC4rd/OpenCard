import type {
  CardMarkupDocument,
  CardMarkupIconNode,
  CardMarkupImageNode,
  CardMarkupInlineNode,
  CardMarkupParagraphNode,
  InlineStyleSpec,
} from '../markup'
import { CJK_CHAR_CLASS, isCjkChar } from './textMeasure'
import type {
  PositionedGlyphRun,
  PositionedTextLine,
  PositionedTextRun,
  ResolvedRunStyle,
  TextLayoutInput,
  TextLayoutResult,
  TextMeasurePort,
} from './textLayout.types'

type Unit = {
  kind: 'text' | 'space' | 'icon' | 'img' | 'br'
  text: string
  icon?: CardMarkupIconNode
  image?: CardMarkupImageNode
  style: ResolvedRunStyle
  /** 沿行内方向占据的长度。 */
  advance: number
  /** 横排基线上下的度量；旋转的竖排西文也据此对齐。 */
  ascent: number
  descent: number
  /** 竖排里被顺时针旋转 90° 的西文。 */
  rotated: boolean
  /** 文字：直立字符宽度；图标/图片：自身宽高。 */
  objW: number
  objH: number
}

type Ctx = { input: TextLayoutInput; measurer: TextMeasurePort; vertical: boolean; limit: number }

type LogicalLine = {
  items: { unit: Unit; offset: number }[]
  start: number
  length: number
  ascent: number
  descent: number
  /** 横排 = 行高，竖排 = 列宽。 */
  cross: number
}

const SEGMENT = new RegExp(`\\s+|[${CJK_CHAR_CLASS}]|[^\\s${CJK_CHAR_CLASS}]+`, 'g')
/** 不能出现在行首的标点：溢出时挂在上一行行尾。 */
const NO_LINE_START = new Set([...'，。、；：！？）】」』》〉”’·…—～'])

function resolveSize(value: string | undefined, em: number, percentBase: number, rem: number): number | undefined {
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*(px|em|rem|%|pt|mm|cm|in)?\s*$/i.exec(value ?? '')
  if (!match) return undefined
  const n = Number(match[1])
  switch (match[2]?.toLowerCase()) {
    case 'em': return n * em
    case 'rem': return n * rem
    case '%': return (n * percentBase) / 100
    case 'pt': return (n * 25.4) / 72
    case 'cm': return n * 10
    case 'in': return n * 25.4
    case 'mm':
    default: return n
  }
}

function applySpan(parent: ResolvedRunStyle, spec: InlineStyleSpec, baseSize: number): ResolvedRunStyle {
  const style = { ...parent }
  if (spec.bold !== undefined) style.fontWeight = spec.bold ? 'bold' : 'normal'
  if (spec.italic !== undefined) style.italic = spec.italic
  if (spec.underline !== undefined) style.underline = spec.underline
  if (spec.strikethrough !== undefined) style.strikethrough = spec.strikethrough
  if (spec.markColor !== undefined) style.markColor = spec.markColor
  if (spec.color !== undefined) style.color = spec.color
  if (spec.backgroundColor !== undefined) style.backgroundColor = spec.backgroundColor
  if (spec.fontFamily !== undefined) style.fontFamily = spec.fontFamily
  if (spec.fontSize !== undefined) {
    const size = resolveSize(spec.fontSize, parent.fontSizePx, parent.fontSizePx, baseSize)
    if (size !== undefined && size > 0) style.fontSizePx = size
  }
  if (spec.strokeColor !== undefined) style.strokeColor = spec.strokeColor
  if (spec.strokeWidth !== undefined) style.strokeWidth = spec.strokeWidth
  if (spec.shadowColor !== undefined) style.shadowColor = spec.shadowColor
  if (spec.shadowOffsetX !== undefined) style.shadowOffsetX = spec.shadowOffsetX
  if (spec.shadowOffsetY !== undefined) style.shadowOffsetY = spec.shadowOffsetY
  if (spec.shadowBlur !== undefined) style.shadowBlur = spec.shadowBlur
  if (spec.fillType !== undefined) style.fillType = spec.fillType
  if (spec.fillSource !== undefined) style.fillSource = spec.fillSource
  return style
}

function baseStyle(input: TextLayoutInput): ResolvedRunStyle {
  return {
    fontFamily: input.baseFontFamily,
    fontSizePx: input.baseFontSizePx,
    fontWeight: input.baseFontWeight,
    italic: false,
    underline: false,
    strikethrough: false,
    color: input.baseColor,
    strokeWidth: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,
    fillType: 'color',
  }
}

function measure(ctx: Ctx, text: string, style: ResolvedRunStyle) {
  return ctx.measurer.measureText(text, {
    fontFamily: style.fontFamily,
    fontSizePx: style.fontSizePx,
    fontWeight: style.fontWeight,
    italic: style.italic,
  })
}

function glyphUnit(ctx: Ctx, text: string, style: ResolvedRunStyle, kind: 'text' | 'space'): Unit {
  const sample = measure(ctx, text, style)
  const upright = ctx.vertical && kind === 'text' && isCjkChar(text[0]!)
  return {
    kind, text, style,
    advance: upright ? style.fontSizePx : sample.width,
    ascent: sample.ascent,
    descent: sample.descent,
    rotated: ctx.vertical && !upright,
    objW: sample.width,
    objH: sample.ascent + sample.descent,
  }
}

function textUnits(ctx: Ctx, value: string, style: ResolvedRunStyle): Unit[] {
  const units: Unit[] = []
  value.split('\n').forEach((line, index) => {
    if (index > 0) units.push(breakUnit(style))
    for (const segment of line.match(SEGMENT) ?? []) {
      if (/^\s/.test(segment)) {
        units.push(glyphUnit(ctx, ' '.repeat(segment.length), style, 'space'))
        continue
      }
      const word = glyphUnit(ctx, segment, style, 'text')
      const chars = Array.from(segment)
      if (word.advance > ctx.limit && chars.length > 1) {
        units.push(...chars.map((char) => glyphUnit(ctx, char, style, 'text')))
      } else units.push(word)
    }
  })
  return units
}

function breakUnit(style: ResolvedRunStyle): Unit {
  return { kind: 'br', text: '', style, advance: 0, ascent: 0, descent: 0, rotated: false, objW: 0, objH: 0 }
}

function iconUnit(ctx: Ctx, icon: CardMarkupIconNode, style: ResolvedRunStyle): Unit {
  const size = resolveSize(icon.size ?? '1em', style.fontSizePx, style.fontSizePx, ctx.input.baseFontSizePx) ?? style.fontSizePx
  const objH = Math.max(0, size)
  const objW = objH * (ctx.measurer.resolveIconAspectRatio?.(icon) ?? 1)
  return {
    kind: 'icon', text: '', icon, style,
    advance: ctx.vertical ? objH : objW,
    ascent: objH * 0.85, descent: objH * 0.15, rotated: false, objW, objH,
  }
}

function imageUnit(ctx: Ctx, image: CardMarkupImageNode, style: ResolvedRunStyle): Unit {
  const { input } = ctx
  const fs = style.fontSizePx
  const w = resolveSize(image.width, fs, input.boxWidth, input.baseFontSizePx)
  const h = resolveSize(image.height, fs, input.boxHeight, input.baseFontSizePx)
  const objW = Math.max(0, w ?? h ?? fs)
  const objH = Math.max(0, h ?? w ?? fs)
  let ascent = objH
  if (image.align === 'center') ascent = objH / 2 + fs * 0.3
  else if (image.align === 'start') ascent = Math.min(objH, fs * 0.8)
  return {
    kind: 'img', text: '', image, style,
    advance: ctx.vertical ? objH : objW,
    ascent, descent: objH - ascent, rotated: false, objW, objH,
  }
}

function collect(ctx: Ctx, nodes: readonly CardMarkupInlineNode[], style: ResolvedRunStyle, out: Unit[]) {
  for (const node of nodes) {
    switch (node.type) {
      case 'text': out.push(...textUnits(ctx, node.value, style)); break
      case 'binding': out.push(...textUnits(ctx, `{{${node.expression}}}`, style)); break
      case 'br': out.push(breakUnit(style)); break
      case 'icon': out.push(iconUnit(ctx, node, style)); break
      case 'img': out.push(imageUnit(ctx, node, style)); break
      case 'span': collect(ctx, node.children, applySpan(style, node.style, ctx.input.baseFontSizePx), out); break
    }
  }
}

/** 贪心断行：行首空白丢弃，行尾空白裁掉；单个超长词已在生成单元时拆成字符。 */
function breakLines(units: Unit[], limit: number): { units: Unit[]; hard: boolean }[] {
  const lines: { units: Unit[]; hard: boolean }[] = []
  let current: Unit[] = []
  let width = 0
  const push = (hard: boolean) => {
    while (current[current.length - 1]?.kind === 'space') current.pop()
    lines.push({ units: current, hard })
    current = []
    width = 0
  }
  for (const unit of units) {
    if (unit.kind === 'br') push(true)
    else if (unit.kind === 'space') {
      if (current.length === 0) continue
      current.push(unit)
      width += unit.advance
    } else {
      if (current.length > 0 && width + unit.advance > limit + 1e-6 && !NO_LINE_START.has(unit.text)) push(false)
      current.push(unit)
      width += unit.advance
    }
  }
  push(true)
  return lines
}

function layoutParagraph(
  ctx: Ctx,
  units: Unit[],
  align: TextLayoutInput['textAlign'],
  indent: number,
  marker: Unit | null,
  emptyMetrics: { ascent: number; descent: number },
): LogicalLine[] {
  const available = Math.max(0, ctx.limit - indent)
  const lineRatio = (ctx.input.baseFontSizePx > 0 && ctx.input.lineHeightPx > 0)
    ? ctx.input.lineHeightPx / ctx.input.baseFontSizePx
    : 1.2
  return breakLines(units, available).map(({ units: row, hard }, index) => {
    const natural = row.reduce((sum, unit) => sum + unit.advance, 0)
    const extra = Math.max(0, available - natural)
    const after = row.map(() => 0)
    if (align === 'justify' && !hard && extra > 0 && row.length > 1) {
      const spaces = row.flatMap((unit, i) => (unit.kind === 'space' && i < row.length - 1 ? [i] : []))
      const targets = spaces.length > 0 ? spaces : row.slice(0, -1).map((_, i) => i)
      for (const i of targets) after[i] = extra / targets.length
    }
    const start = indent + (align === 'center' ? extra / 2 : align === 'end' ? extra : 0)
    let cursor = start
    const items = row.map((unit, i) => {
      const item = { unit, offset: cursor }
      cursor += unit.advance + after[i]!
      return item
    })
    if (index === 0 && marker) {
      items.unshift({ unit: marker, offset: Math.max(0, indent - marker.advance - marker.style.fontSizePx * 0.25) })
    }

    let ascent = items.length > 0 ? -Infinity : emptyMetrics.ascent
    let descent = items.length > 0 ? -Infinity : emptyMetrics.descent
    let growth = 0
    for (const { unit } of items) {
      ascent = Math.max(ascent, unit.ascent)
      descent = Math.max(descent, unit.descent)
      if (unit.kind === 'icon' || unit.kind === 'img') {
        growth = Math.max(growth, ctx.vertical ? unit.objW : unit.ascent + unit.descent)
      } else if (unit.kind === 'text' || unit.kind === 'space') {
        const unitCross = ctx.vertical
          ? Math.max(unit.style.fontSizePx * lineRatio, unit.rotated ? unit.ascent + unit.descent : unit.objW)
          : Math.max(unit.style.fontSizePx * lineRatio, unit.ascent + unit.descent)
        growth = Math.max(growth, unitCross)
      }
    }
    const lineCross = items.length > 0 && !ctx.vertical
      ? Math.max(ctx.input.lineHeightPx, growth, ascent + descent)
      : Math.max(ctx.input.lineHeightPx, growth)
    return {
      items,
      start,
      length: cursor - start,
      ascent,
      descent,
      cross: lineCross,
    }
  })
}

function listMarker(ctx: Ctx, style: ResolvedRunStyle, ordered: boolean, number: number): Unit {
  return glyphUnit(ctx, ordered ? `${number}.` : '•', style, 'text')
}

function mergeGlyphRuns(runs: PositionedTextRun[]): PositionedTextRun[] {
  const merged: PositionedTextRun[] = []
  for (const run of runs) {
    const prev = merged[merged.length - 1]
    if (
      prev?.kind === 'glyph' && run.kind === 'glyph' && prev.style === run.style &&
      prev.angleRad === 0 && run.angleRad === 0 && Math.abs(prev.x + prev.width - run.x) < 1e-6 &&
      prev.baselineY === run.baselineY
    ) {
      const next: PositionedGlyphRun = { ...prev, text: prev.text + run.text, width: prev.width + run.width, height: Math.max(prev.height, run.height) }
      merged[merged.length - 1] = next
    } else merged.push(run)
  }
  return merged
}

function placeHorizontal(ctx: Ctx, lines: LogicalLine[]): TextLayoutResult {
  const { boxHeight, verticalAlign } = ctx.input
  const contentHeight = lines.reduce((sum, line) => sum + line.cross, 0)
  const contentWidth = lines.reduce((max, line) => Math.max(max, line.start + line.length), 0)
  const free = Math.max(0, boxHeight - contentHeight)
  let top = verticalAlign === 'center' ? free / 2 : verticalAlign === 'bottom' ? free : 0

  const placed: PositionedTextLine[] = lines.map((line, index) => {
    const baseline = top + (line.cross - (line.ascent + line.descent)) / 2 + line.ascent
    const runs: PositionedTextRun[] = []
    for (const { unit, offset } of line.items) {
      if (unit.kind === 'text' || unit.kind === 'space') {
        runs.push({
          kind: 'glyph', text: unit.text, x: offset, y: baseline - unit.ascent, width: unit.advance,
          height: unit.ascent + unit.descent, baselineY: baseline, angleRad: 0, style: unit.style,
        })
      } else if (unit.kind === 'icon') {
        runs.push({ kind: 'icon', icon: unit.icon!, x: offset, y: baseline - unit.ascent, width: unit.objW, height: unit.objH, angleRad: 0, style: unit.style })
      } else if (unit.kind === 'img') {
        runs.push({ kind: 'img', image: unit.image!, x: offset, y: baseline - unit.ascent, width: unit.objW, height: unit.objH, angleRad: 0 })
      }
    }
    const result = { index, x: line.start, y: top, width: line.length, height: line.cross, baselineY: baseline, runs: mergeGlyphRuns(runs) }
    top += line.cross
    return result
  })
  return finish(placed, contentWidth, contentHeight)
}

function placeVertical(ctx: Ctx, lines: LogicalLine[]): TextLayoutResult {
  const { boxWidth, verticalAlign, writingMode } = ctx.input
  const contentWidth = lines.reduce((sum, line) => sum + line.cross, 0)
  const contentHeight = lines.reduce((max, line) => Math.max(max, line.start + line.length), 0)
  const free = Math.max(0, boxWidth - contentWidth)
  const shift = verticalAlign === 'center' ? free / 2 : verticalAlign === 'bottom' ? free : 0
  let consumed = 0

  const placed: PositionedTextLine[] = lines.map((line, index) => {
    const colX = writingMode === 'vertical-rl' ? boxWidth - shift - consumed - line.cross : shift + consumed
    consumed += line.cross
    const runs: PositionedTextRun[] = []
    for (const { unit, offset } of line.items) {
      const glyphSpan = unit.ascent + unit.descent
      if (unit.kind === 'text' && unit.rotated) {
        runs.push({
          kind: 'glyph', text: unit.text, x: colX, y: offset, width: line.cross, height: unit.advance,
          baselineY: offset + (line.cross - glyphSpan) / 2 + unit.ascent, angleRad: Math.PI / 2, style: unit.style,
        })
      } else if (unit.kind === 'text') {
        runs.push({
          kind: 'glyph', text: unit.text, x: colX + (line.cross - unit.objW) / 2, y: offset, width: unit.objW, height: unit.advance,
          baselineY: offset + (unit.advance - glyphSpan) / 2 + unit.ascent, angleRad: 0, style: unit.style,
        })
      } else if (unit.kind === 'icon') {
        runs.push({ kind: 'icon', icon: unit.icon!, x: colX + (line.cross - unit.objW) / 2, y: offset, width: unit.objW, height: unit.objH, angleRad: 0, style: unit.style })
      } else if (unit.kind === 'img') {
        runs.push({ kind: 'img', image: unit.image!, x: colX + (line.cross - unit.objW) / 2, y: offset, width: unit.objW, height: unit.objH, angleRad: 0 })
      }
    }
    return { index, x: colX, y: line.start, width: line.cross, height: line.length, baselineY: colX + line.cross / 2, runs }
  })
  return finish(placed, contentWidth, contentHeight)
}

function finish(lines: PositionedTextLine[], contentWidth: number, contentHeight: number): TextLayoutResult {
  return { lines, runs: lines.flatMap((line) => line.runs), contentWidth, contentHeight }
}

function paragraphLines(
  ctx: Ctx,
  paragraph: CardMarkupParagraphNode,
  base: ResolvedRunStyle,
  emptyMetrics: { ascent: number; descent: number },
  indent = 0,
  marker: Unit | null = null,
): LogicalLine[] {
  const units: Unit[] = []
  collect(ctx, paragraph.children, base, units)
  return layoutParagraph(ctx, units, paragraph.align ?? ctx.input.textAlign, indent, marker, emptyMetrics)
}

function documentLines(ctx: Ctx, document: CardMarkupDocument): LogicalLine[] {
  const base = baseStyle(ctx.input)
  const sample = measure(ctx, 'M', base)
  const empty = { ascent: sample.ascent, descent: sample.descent }
  const lines: LogicalLine[] = []
  for (const block of document.blocks) {
    if (block.type === 'paragraph') {
      lines.push(...paragraphLines(ctx, block, base, empty))
      continue
    }
    const indent = base.fontSizePx * (block.ordered ? 2 : 1.5)
    block.items.forEach((item, itemIndex) => {
      const marker = listMarker(ctx, base, block.ordered, itemIndex + 1)
      const paragraphs = item.length > 0 ? item : [{ type: 'paragraph', children: [] } as CardMarkupParagraphNode]
      paragraphs.forEach((paragraph, index) => {
        lines.push(...paragraphLines(ctx, paragraph, base, empty, indent, index === 0 ? marker : null))
      })
    })
  }
  return lines
}

/**
 * 把富文本文档排成带坐标的行与 Run。纯函数：所有字形尺寸来自注入的 measurer。
 * 竖排时：textAlign 沿列方向（start = 顶部），verticalAlign 决定列组在盒内的横向位置
 * （top = 靠起始边：vertical-rl 为右边、vertical-lr 为左边）。
 */
export function layoutTextBlock(input: TextLayoutInput, measurer: TextMeasurePort): TextLayoutResult {
  const vertical = input.writingMode !== 'horizontal-tb'
  const ctx: Ctx = { input, measurer, vertical, limit: vertical ? input.boxHeight : input.boxWidth }
  const lines = documentLines(ctx, input.document)
  return vertical ? placeVertical(ctx, lines) : placeHorizontal(ctx, lines)
}
