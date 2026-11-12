import { createDeviceLayer } from './deviceBuffer'

const SHADOW_BLUR_MAX_DEVICE_PIXELS = 16
const SHADOW_MASK_COLOR = '#000000'
const OUTLINE_MAX_STAMPS = 128

type Bounds = { x: number; y: number; width: number; height: number }
type PaintShape = (target: CanvasRenderingContext2D) => void
export type SilhouetteShadow = { shadowColor?: string; shadowBlur: number; shadowOffsetX: number; shadowOffsetY: number }

/**
 * 先把内容的完整外形画进遮罩，再从遮罩生成投影：投影贴合内容的透明度轮廓，形状不随尺寸变化。
 * bounds 是外形（含它自己的描边）的范围。模糊固定精度后放大，避开 WebKit 大半径模糊的块状。
 */
export function paintSilhouetteShadow(
  ctx: CanvasRenderingContext2D,
  bounds: Bounds,
  { shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY }: SilhouetteShadow,
  paintShape: PaintShape,
): void {
  const padding = shadowBlur * 1.5
  const left = bounds.x + Math.min(shadowOffsetX, 0) - padding
  const top = bounds.y + Math.min(shadowOffsetY, 0) - padding
  const width = bounds.width + Math.abs(shadowOffsetX) + padding * 2
  const height = bounds.height + Math.abs(shadowOffsetY) + padding * 2
  const maxScale = SHADOW_BLUR_MAX_DEVICE_PIXELS / shadowBlur
  const mask = createDeviceLayer(ctx, left, top, width, height, maxScale)
  const shadow = createDeviceLayer(ctx, left, top, width, height, maxScale)
  if (!mask || !shadow) return
  paintShape(mask.offCtx)

  // 遮罩画在缓冲外，只留下投影；不透明地生成再上色，半透明投影才均匀
  const shift = mask.offscreen.width
  const shadowCtx = shadow.offCtx
  shadowCtx.setTransform(1, 0, 0, 1, 0, 0)
  shadowCtx.shadowColor = SHADOW_MASK_COLOR
  shadowCtx.shadowOffsetX = shadowOffsetX * mask.scaleX + shift
  shadowCtx.shadowOffsetY = shadowOffsetY * mask.scaleY
  shadowCtx.shadowBlur = shadowBlur * Math.sqrt(mask.scaleX * mask.scaleY)
  shadowCtx.drawImage(mask.offscreen, -shift, 0)
  mask.release()
  shadowCtx.shadowColor = 'transparent'
  shadowCtx.globalCompositeOperation = 'source-in'
  shadowCtx.fillStyle = shadowColor!
  shadowCtx.fillRect(0, 0, shadow.offscreen.width, shadow.offscreen.height)

  ctx.save()
  ctx.imageSmoothingQuality = 'high'
  shadow.draw(ctx)
  ctx.restore()
  shadow.release()
}

/**
 * 位图内容没有路径可描，把它的外形沿半径为 radius 的圆周盖印一圈再上色，
 * 得到贴合透明度轮廓的外描边；画在内容下方。盖印间距不超过一个设备像素，细线也不会断。
 */
export function paintSilhouetteOutline(
  ctx: CanvasRenderingContext2D,
  { x, y, width, height }: Bounds,
  radius: number,
  color: string | CanvasGradient | CanvasPattern,
  paintShape: PaintShape,
): void {
  const shape = createDeviceLayer(ctx, x, y, width, height)
  const outline = createDeviceLayer(ctx, x - radius, y - radius, width + radius * 2, height + radius * 2)
  if (!shape || !outline) return
  paintShape(shape.offCtx)

  const outlineCtx = outline.offCtx
  const stamps = Math.min(OUTLINE_MAX_STAMPS, Math.max(8, Math.ceil(Math.PI * 2 * radius * Math.max(outline.scaleX, outline.scaleY))))
  for (let i = 0; i < stamps; i += 1) {
    const angle = (Math.PI * 2 * i) / stamps
    shape.draw(outlineCtx, Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  shape.release()
  outlineCtx.globalCompositeOperation = 'source-in'
  outlineCtx.fillStyle = color
  outlineCtx.fillRect(x - radius - 1, y - radius - 1, width + radius * 2 + 2, height + radius * 2 + 2)

  outline.draw(ctx)
  outline.release()
}
