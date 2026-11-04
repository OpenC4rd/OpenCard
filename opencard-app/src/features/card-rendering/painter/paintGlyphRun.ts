import { resolveCardResource, type CardRenderResourceContext } from '../cardRenderResources'
import type { PositionedGlyphRun } from '../text-layout'
import type { CanvasAssetStore } from './canvasAssetStore'
import { createDeviceBuffer, readDeviceTransform } from './deviceBuffer'

const GLYPH_SHADOW_BLUR_MAX_DEVICE_PIXELS = 16
const GLYPH_SHADOW_MASK_COLOR = '#000000'

export function resolveBlockFontFamily(
  fontReference: string | undefined,
  blockId: string,
  fieldKey: 'fontFamily' | 'content',
  resourceContext?: CardRenderResourceContext,
): string {
  const raw = (fontReference ?? '').trim()
  if (!raw) return 'sans-serif'
  if (resourceContext) {
    const res = resolveCardResource({
      value: raw,
      expect: 'font',
      blockId,
      fieldKey,
    }, resourceContext)
    if (res.kind === 'font' && res.cssFamily) return res.cssFamily
  }
  return raw
}

function resolveGlyphFillStyle(
  ctx: CanvasRenderingContext2D,
  style: PositionedGlyphRun['style'],
  blockId: string,
  assets: CanvasAssetStore,
  resourceContext?: CardRenderResourceContext,
): string | CanvasGradient | CanvasPattern {
  if (style.fillSource) {
    const res = resourceContext
      ? resolveCardResource({
          value: style.fillSource,
          expect: 'asset',
          blockId,
          fieldKey: 'content',
        }, resourceContext)
      : undefined
    const src = res?.kind === 'url' ? res.src : res?.kind === 'icon' ? res.entry.src : (!resourceContext ? style.fillSource : '')
    const img = src ? assets.getImage(src) : null
    if (img && typeof ctx.createPattern === 'function') {
      const pattern = ctx.createPattern(img, 'repeat')
      if (pattern) return pattern
    }
  }
  return style.color || '#000000'
}

export type GlyphPaintContext = {
  blockId: string
  baseFontFamily: string
  assets: CanvasAssetStore
  resourceContext?: CardRenderResourceContext
}

/**
 * 投影在缓冲里按完整字形（填充加描边）生成，形状不随尺寸变化。
 * 模糊固定精度后再放大：WebKit 的大半径模糊会出现块状。
 */
export function paintBufferedGlyphShadow(ctx: CanvasRenderingContext2D, run: PositionedGlyphRun, paint: GlyphPaintContext): void {
  const { shadowBlur, shadowOffsetX, shadowOffsetY, shadowColor, fontSize, strokeWidth } = run.style
  const padding = shadowBlur * 1.5 + strokeWidth + fontSize / 2
  const left = run.x + Math.min(shadowOffsetX, 0) - padding
  const top = run.y + Math.min(shadowOffsetY, 0) - padding
  const width = run.width + Math.abs(shadowOffsetX) + padding * 2
  const height = run.height + Math.abs(shadowOffsetY) + padding * 2
  const buffer = createDeviceBuffer(ctx, width, height, GLYPH_SHADOW_BLUR_MAX_DEVICE_PIXELS / shadowBlur)
  if (!buffer) {
    paintGlyphPass(ctx, run, 'shadow', paint)
    return
  }
  const { offscreen, offCtx } = buffer
  const { a, d } = readDeviceTransform(offCtx)
  offCtx.translate(-left, -top)
  // 字形移出缓冲，只留下投影
  paintGlyphPass(offCtx, run, 'shadow', paint, width)
  // 不透明地生成再上色，填充与描边重叠处不会叠深半透明投影
  offCtx.globalCompositeOperation = 'source-in'
  offCtx.fillStyle = shadowColor!
  offCtx.fillRect(left, top, width, height)
  ctx.save()
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(offscreen, left, top, offscreen.width / a, offscreen.height / d)
  ctx.restore()
}

export function paintGlyphPass(
  ctx: CanvasRenderingContext2D,
  run: PositionedGlyphRun,
  pass: 'fill' | 'stroke' | 'shadow',
  { blockId, baseFontFamily, assets, resourceContext }: GlyphPaintContext,
  glyphShift = 0,
): void {
  ctx.save()
  const style = run.style
  const weight = style.fontWeight === 'bold' ? '700' : style.fontWeight === 'light' ? '300' : '400'
  const italic = style.italic ? 'italic ' : ''
  const resolvedFont = style.fontFamily === baseFontFamily
    ? baseFontFamily
    : resolveBlockFontFamily(style.fontFamily, blockId, 'content', resourceContext)
  ctx.font = `${italic}${weight} ${style.fontSize}px ${resolvedFont}`
  ctx.textBaseline = 'alphabetic'
  // 在竖排旋转之前换算：投影方向跟随文字块，不跟随单个字形
  if (pass === 'shadow' || (pass === 'stroke' && hasDirectGlyphShadow(style))) applyGlyphShadow(ctx, style)
  if (glyphShift) {
    ctx.shadowColor = GLYPH_SHADOW_MASK_COLOR
    ctx.shadowOffsetX += glyphShift * readDeviceTransform(ctx).a
    ctx.translate(-glyphShift, 0)
  }

  let drawX = run.x
  let drawY = run.baselineY
  if (run.angleRad !== 0) {
    // 竖排旋转西文：绕中心旋转 π/2
    ctx.translate(run.x + run.width / 2, run.y + run.height / 2)
    ctx.rotate(run.angleRad)
    drawX = -run.height / 2
    drawY = -run.width / 2 + (run.baselineY - run.y)
  }

  const outlined = pass !== 'fill' && hasGlyphOutline(style)
  if (outlined) {
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = style.strokeWidth * 2
    ctx.strokeStyle = pass === 'shadow' ? GLYPH_SHADOW_MASK_COLOR : style.strokeColor!
    ctx.strokeText(run.text, drawX, drawY)
  }
  if (!outlined || pass === 'shadow') {
    ctx.fillStyle = pass === 'shadow'
      ? GLYPH_SHADOW_MASK_COLOR
      : resolveGlyphFillStyle(ctx, style, blockId, assets, resourceContext)
    ctx.fillText(run.text, drawX, drawY)
  }

  ctx.restore()
}

export function hasGlyphOutline(style: PositionedGlyphRun['style']): boolean {
  return style.strokeWidth > 0 && Boolean(style.strokeColor)
}

export function hasBufferedGlyphShadow(style: PositionedGlyphRun['style']): boolean {
  return Boolean(style.shadowColor) && (style.shadowBlur > 0 || hasGlyphOutline(style))
}

export function hasDirectGlyphShadow(style: PositionedGlyphRun['style']): boolean {
  return Boolean(style.shadowColor) && !hasBufferedGlyphShadow(style)
}

/** Canvas 的 shadow* 以设备像素计且不受 CTM 影响，这里把卡片坐标换算到当前位图。 */
function applyGlyphShadow(ctx: CanvasRenderingContext2D, style: PositionedGlyphRun['style']): void {
  if (!style.shadowColor) return
  const { a, b, c, d } = readDeviceTransform(ctx)
  ctx.shadowColor = style.shadowColor
  ctx.shadowOffsetX = a * style.shadowOffsetX + c * style.shadowOffsetY
  ctx.shadowOffsetY = b * style.shadowOffsetX + d * style.shadowOffsetY
  ctx.shadowBlur = style.shadowBlur * Math.sqrt(Math.abs(a * d - b * c))
}
