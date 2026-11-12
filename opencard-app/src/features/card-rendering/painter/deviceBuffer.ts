const MAX_OFFSCREEN_BUFFER_SIDE = 4096

export type DeviceLayer = {
  offscreen: OffscreenCanvas | HTMLCanvasElement
  /** 坐标系与创建它的画布一致，直接按原坐标往里画。 */
  offCtx: CanvasRenderingContext2D
  /** 每个坐标单位对应的缓冲像素数。 */
  scaleX: number
  scaleY: number
  /** 把缓冲按原位置贴到同一坐标系的画布上，可整体平移。 */
  draw(target: CanvasRenderingContext2D, dx?: number, dy?: number): void
  /**
   * 用完立即归还像素内存。WebKit 给全部画布的总内存设了上限，等垃圾回收来不及：
   * 连续缩放时每帧新建的缓冲会把额度占满，之后新缓冲建不出来，主画布也无法按新尺寸重建。
   */
  release(): void
}

/**
 * 为画布坐标系里的一块矩形创建离屏缓冲。缓冲跟随设备分辨率，但高倍缩放不能让它无限增长。
 * 画布未旋转且缓冲未降采样时，缓冲对齐到设备像素格，贴回去是逐像素拷贝：
 * 否则每次缩放小数偏移都不同，边缘会忽虚忽实、整体跳动。
 */
export function createDeviceLayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  maxPixelsPerUnit = Infinity,
): DeviceLayer | null {
  const { a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = typeof ctx.getTransform === 'function' ? ctx.getTransform() : {}
  const deviceX = Math.hypot(a, b) || 1
  const deviceY = Math.hypot(c, d) || 1
  const fit = Math.min(
    1,
    MAX_OFFSCREEN_BUFFER_SIDE / Math.max(width * deviceX, height * deviceY, 1),
    maxPixelsPerUnit / Math.max(deviceX, deviceY),
  )
  const scaleX = deviceX * fit
  const scaleY = deviceY * fit
  const aligned = fit === 1 && b === 0 && c === 0 && a > 0 && d > 0
  const originX = aligned ? e : 0
  const originY = aligned ? f : 0
  const left = aligned ? Math.floor(x * scaleX + originX) : x * scaleX
  const top = aligned ? Math.floor(y * scaleY + originY) : y * scaleY
  const bufferW = Math.max(1, Math.ceil((x + width) * scaleX + originX - left))
  const bufferH = Math.max(1, Math.ceil((y + height) * scaleY + originY - top))
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
  if (typeof offCtx.setTransform === 'function') offCtx.setTransform(scaleX, 0, 0, scaleY, originX - left, originY - top)
  return {
    offscreen,
    offCtx,
    scaleX,
    scaleY,
    draw(target, dx = 0, dy = 0) {
      target.drawImage(offscreen, (left - originX) / scaleX + dx, (top - originY) / scaleY + dy, bufferW / scaleX, bufferH / scaleY)
    },
    release() {
      offscreen.width = 0
      offscreen.height = 0
    },
  }
}
