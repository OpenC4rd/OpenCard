import { resolveCardResource, type CardRenderResourceContext } from '../cardRenderResources'
import type { PositionedGlyphRun, PositionedTextRun } from '../text-layout'
import type { CanvasAssetStore, LoadedAsset } from './canvasAssetStore'
import type { IconShape } from '../../../shared/model/iconGeometry'
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
    const tile = img && res?.kind === 'icon' ? iconTile(img, res.entry) : img
    if (tile && typeof ctx.createPattern === 'function') {
      const pattern = ctx.createPattern(tile, 'repeat')
      if (pattern) return pattern
    }
  }
  return style.color || '#000000'
}

/** A pattern repeats the icon, so a cropped icon repeats its crop, never the whole file around it. */
function iconTile(img: LoadedAsset, icon: IconShape): CanvasImageSource | null {
  if (!icon.crop) return img
  const { x, y, w, h } = icon.crop
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const tileCtx = canvas?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
  if (!canvas || !tileCtx) return null
  tileCtx.drawImage(img, x, y, w, h, 0, 0, w, h)
  return canvas
}

export type GlyphPaintContext = {
  blockId: string
  baseFontFamily: string
  assets: CanvasAssetStore
  resourceContext?: CardRenderResourceContext
}

/**
 * 先把内容的完整外形画进遮罩，再从遮罩生成投影：字、描边、装饰线和行内对象
 * 共用一条链路，形状不随尺寸变化。模糊固定精度后放大，避开 WebKit 大半径模糊的块状。
 */
export function paintRunShadow(
  ctx: CanvasRenderingContext2D,
  run: PositionedTextRun,
  paintShape: (target: CanvasRenderingContext2D) => void,
): void {
  const { shadowBlur, shadowOffsetX, shadowOffsetY, shadowColor, fontSize, strokeWidth } = run.style
  const padding = shadowBlur * 1.5 + strokeWidth + fontSize / 2
  const left = run.x + Math.min(shadowOffsetX, 0) - padding
  const top = run.y + Math.min(shadowOffsetY, 0) - padding
  const width = run.width + Math.abs(shadowOffsetX) + padding * 2
  const height = run.height + Math.abs(shadowOffsetY) + padding * 2
  const maxScale = GLYPH_SHADOW_BLUR_MAX_DEVICE_PIXELS / shadowBlur
  const mask = createDeviceBuffer(ctx, width, height, maxScale)
  const shadow = createDeviceBuffer(ctx, width, height, maxScale)
  if (!mask || !shadow) return

  const { a, d } = readDeviceTransform(mask.offCtx)
  mask.offCtx.translate(-left, -top)
  paintShape(mask.offCtx)

  // 遮罩画在缓冲外，只留下投影；不透明地生成再上色，半透明投影才均匀
  const shift = mask.offscreen.width
  const shadowCtx = shadow.offCtx
  shadowCtx.setTransform(1, 0, 0, 1, 0, 0)
  shadowCtx.shadowColor = GLYPH_SHADOW_MASK_COLOR
  shadowCtx.shadowOffsetX = shadowOffsetX * a + shift
  shadowCtx.shadowOffsetY = shadowOffsetY * d
  shadowCtx.shadowBlur = shadowBlur * Math.sqrt(a * d)
  shadowCtx.drawImage(mask.offscreen, -shift, 0)
  shadowCtx.shadowColor = 'transparent'
  shadowCtx.globalCompositeOperation = 'source-in'
  shadowCtx.fillStyle = shadowColor!
  shadowCtx.fillRect(0, 0, shadow.offscreen.width, shadow.offscreen.height)

  ctx.save()
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(shadow.offscreen, left, top, shadow.offscreen.width / a, shadow.offscreen.height / d)
  ctx.restore()
}

/** 字形的完整外形：描边、填充与装饰线。 */
export function paintGlyphShape(ctx: CanvasRenderingContext2D, run: PositionedGlyphRun, paint: GlyphPaintContext): void {
  paintGlyphPass(ctx, run, 'shape', paint)
  paintGlyphDecorations(ctx, run, GLYPH_SHADOW_MASK_COLOR)
}

export function paintGlyphDecorations(ctx: CanvasRenderingContext2D, run: PositionedGlyphRun, color: string): void {
  const { underline, strikethrough, fontSize } = run.style
  if (!underline && !strikethrough) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(0.1, fontSize * 0.07)
  if (underline) {
    const lineY = run.baselineY + ctx.lineWidth * 1.5
    ctx.beginPath()
    ctx.moveTo(run.x, lineY)
    ctx.lineTo(run.x + run.width, lineY)
    ctx.stroke()
  }
  if (strikethrough) {
    const lineY = run.y + run.height / 2
    ctx.beginPath()
    ctx.moveTo(run.x, lineY)
    ctx.lineTo(run.x + run.width, lineY)
    ctx.stroke()
  }
  ctx.restore()
}

export function paintGlyphPass(
  ctx: CanvasRenderingContext2D,
  run: PositionedGlyphRun,
  pass: 'fill' | 'stroke' | 'shape',
  { blockId, baseFontFamily, assets, resourceContext }: GlyphPaintContext,
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
  let drawX = run.x
  let drawY = run.baselineY
  if (run.angleRad !== 0) {
    // 竖排旋转西文：绕中心旋转 π/2
    ctx.translate(run.x + run.width / 2, run.y + run.height / 2)
    ctx.rotate(run.angleRad)
    drawX = -run.height / 2
    drawY = -run.width / 2 + (run.baselineY - run.y)
  }

  if (pass !== 'fill' && hasGlyphOutline(style)) {
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = style.strokeWidth * 2
    ctx.strokeStyle = pass === 'shape' ? GLYPH_SHADOW_MASK_COLOR : style.strokeColor!
    ctx.strokeText(run.text, drawX, drawY)
  }
  if (pass !== 'stroke') {
    ctx.fillStyle = pass === 'shape'
      ? GLYPH_SHADOW_MASK_COLOR
      : resolveGlyphFillStyle(ctx, style, blockId, assets, resourceContext)
    ctx.fillText(run.text, drawX, drawY)
  }

  ctx.restore()
}

export function hasGlyphOutline(style: PositionedGlyphRun['style']): boolean {
  return style.strokeWidth > 0 && Boolean(style.strokeColor)
}
