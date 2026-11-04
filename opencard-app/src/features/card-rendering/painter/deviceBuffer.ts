const MAX_OFFSCREEN_BUFFER_SIDE = 4096

export function readDeviceTransform(ctx: CanvasRenderingContext2D): Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd'> {
  return typeof ctx.getTransform === 'function' ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1 }
}

/** 离屏缓冲跟随设备分辨率，但高倍缩放不能让它无限增长。 */
export function createDeviceBuffer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  maxPixelsPerUnit = Infinity,
) {
  const transform = readDeviceTransform(ctx)
  const deviceX = Math.hypot(transform.a, transform.b) || 1
  const deviceY = Math.hypot(transform.c, transform.d) || 1
  const fit = Math.min(
    1,
    MAX_OFFSCREEN_BUFFER_SIDE / Math.max(width * deviceX, height * deviceY, 1),
    maxPixelsPerUnit / Math.max(deviceX, deviceY),
  )
  const bufferW = Math.max(1, Math.ceil(width * deviceX * fit))
  const bufferH = Math.max(1, Math.ceil(height * deviceY * fit))
  // 优先使用 OffscreenCanvas 支持无头导出/Worker，其次降级到 document.createElement
  let offscreen: OffscreenCanvas | HTMLCanvasElement
  if (typeof OffscreenCanvas !== 'undefined') {
    offscreen = new OffscreenCanvas(bufferW, bufferH)
  } else if (typeof document !== 'undefined') {
    offscreen = Object.assign(document.createElement('canvas'), { width: bufferW, height: bufferH })
  } else {
    return null
  }
  const offCtx = offscreen.getContext('2d') as CanvasRenderingContext2D | null
  if (!offCtx) return null
  offCtx.imageSmoothingEnabled = true
  if ('imageSmoothingQuality' in offCtx) offCtx.imageSmoothingQuality = 'high'
  if (typeof offCtx.setTransform === 'function') offCtx.setTransform(deviceX * fit, 0, 0, deviceY * fit, 0, 0)
  return { offscreen, offCtx }
}
