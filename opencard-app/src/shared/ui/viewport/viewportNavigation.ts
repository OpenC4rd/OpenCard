/** 屏幕物理像素基准（96 CSS DPI）：1 mm 对应的屏幕 CSS 像素数 ≈ 3.7795 px */
export const SCREEN_PIXELS_PER_MM = 96 / 25.4
export const VIEWPORT_MIN_SCALE = 0.1 * SCREEN_PIXELS_PER_MM
export const VIEWPORT_MAX_SCALE = 20 * SCREEN_PIXELS_PER_MM
export const VIEWPORT_WHEEL_ZOOM_SENSITIVITY = 0.0015
export const VIEWPORT_ZOOM_ANIMATION_SMOOTHING = 0.25
export const VIEWPORT_ZOOM_ANIMATION_EPSILON = 0.001
export const VIEWPORT_FIT_PADDING = 32

export type ViewportInsets = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export type ViewportSafeRegion = {
  left: number
  top: number
  width: number
  height: number
  centerX: number
  centerY: number
}

const VIEWPORT_WHEEL_LINE_HEIGHT = 16
const VIEWPORT_MAX_WHEEL_DELTA_PX = 240


export function normalizeViewportWheelDelta(
  deltaY: number,
  deltaMode: number,
  pageHeight: number,
): number {
  let delta = deltaY
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= VIEWPORT_WHEEL_LINE_HEIGHT
  else if (deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= pageHeight
  return Math.min(VIEWPORT_MAX_WHEEL_DELTA_PX, Math.max(-VIEWPORT_MAX_WHEEL_DELTA_PX, delta))
}

export function resolveViewportSafeRegion(
  width: number,
  height: number,
  insets: ViewportInsets = {},
): ViewportSafeRegion {
  const left = clampInset(insets.left, width)
  const top = clampInset(insets.top, height)
  const right = clampInset(insets.right, Math.max(0, width - left))
  const bottom = clampInset(insets.bottom, Math.max(0, height - top))
  const safeWidth = Math.max(1, width - left - right)
  const safeHeight = Math.max(1, height - top - bottom)
  return {
    left,
    top,
    width: safeWidth,
    height: safeHeight,
    centerX: left + safeWidth / 2,
    centerY: top + safeHeight / 2,
  }
}

function clampInset(value: number | undefined, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(maximum, Math.max(0, value))
}
