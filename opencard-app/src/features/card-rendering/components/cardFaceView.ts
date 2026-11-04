export type CardFaceSize = { width: number; height: number }

/** 画布在卡面中绘制的矩形（卡片单位）及其每单位的设备像素数。 */
export type CardFaceView = {
  left: number
  top: number
  width: number
  height: number
  pixelScale: number
}

const FULL_FACE_RASTER_MAX_SIDE = 2048

/** 没有可见视图（图层视图、卡面完全移出视口）时的整卡分辨率。 */
export function resolveFullFaceRasterScale(face: CardFaceSize, pixelRatio: number): number {
  return FULL_FACE_RASTER_MAX_SIDE / Math.max(face.width, face.height, 1) / pixelRatio
}

/** 取卡面与视口的可见交集，并把屏幕边界对齐到设备像素，保证位图 1:1 上屏。 */
export function resolveVisibleCardFaceView(
  face: CardFaceSize,
  origin: { x: number; y: number },
  scale: number,
  viewport: CardFaceSize,
  pixelRatio: number,
): CardFaceView | null {
  const screenLeft = Math.floor(Math.max(origin.x, 0) * pixelRatio) / pixelRatio
  const screenTop = Math.floor(Math.max(origin.y, 0) * pixelRatio) / pixelRatio
  const screenRight = Math.ceil(Math.min(origin.x + face.width * scale, viewport.width) * pixelRatio) / pixelRatio
  const screenBottom = Math.ceil(Math.min(origin.y + face.height * scale, viewport.height) * pixelRatio) / pixelRatio
  if (screenRight <= screenLeft || screenBottom <= screenTop) return null
  return {
    left: (screenLeft - origin.x) / scale,
    top: (screenTop - origin.y) / scale,
    width: (screenRight - screenLeft) / scale,
    height: (screenBottom - screenTop) / scale,
    pixelScale: scale * pixelRatio,
  }
}
