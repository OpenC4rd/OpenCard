import { resolveCardResource, type CardRenderResourceContext } from '../cardRenderResources'
import type { PositionedGlyphRun, PositionedTextRun } from '../text-layout'
import type { CanvasAssetStore, LoadedAsset } from './canvasAssetStore'
import type { IconShape } from '../../../shared/model/iconGeometry'
import { paintSilhouetteShadow } from './paintSilhouette'

const GLYPH_SHADOW_MASK_COLOR = '#000000'
/**
 * 画布横平竖直时，浏览器把字形基线对齐到整数像素，缩放过程中文字会逐帧跳动；
 * 只要画布带一点旋转就改用亚像素定位。这个角度绕每段文字的中心转，500 像素宽的一段两端只偏约 0.1 像素。
 */
const GLYPH_UNSNAP_ANGLE = 5e-4

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

/** 字、描边、装饰线和行内对象共用一条投影链路；范围留出描边与字形出格的余量。 */
export function paintRunShadow(
  ctx: CanvasRenderingContext2D,
  run: PositionedTextRun,
  paintShape: (target: CanvasRenderingContext2D) => void,
): void {
  const padding = run.style.strokeWidth + run.style.fontSize / 2
  paintSilhouetteShadow(ctx, {
    x: run.x - padding,
    y: run.y - padding,
    width: run.width + padding * 2,
    height: run.height + padding * 2,
  }, run.style, paintShape)
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
  ctx.letterSpacing = `${style.letterSpacing}px`
  let drawX = run.x
  let drawY = run.baselineY
  const centerX = run.x + run.width / 2
  const centerY = run.y + run.height / 2
  ctx.translate(centerX, centerY)
  ctx.rotate(run.angleRad + GLYPH_UNSNAP_ANGLE)
  if (run.angleRad !== 0) {
    // 竖排旋转西文：绕中心旋转 π/2
    drawX = -run.height / 2
    drawY = -run.width / 2 + (run.baselineY - run.y)
  } else {
    // 横排回到原坐标系，图片填充的平铺才能跨字连续
    ctx.translate(-centerX, -centerY)
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
