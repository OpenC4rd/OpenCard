import { readThemePixels } from '../../shared/ui/foundation/themeTokenPixels'
import type { CdeOverlayGeometryConfig } from './cdeOverlayGeometry'

/** CardEditor Overlay 的结构尺寸；只有 TS 读取，所以直接写成常量，不进主题 token。 */
export const CDE_OVERLAY_GEOMETRY_CONFIG: CdeOverlayGeometryConfig = {
  collapsedExtent: 0,
  minExtent: 280,
  maxExtent: 420,
  expandDragThreshold: 28,
  collapseDragThreshold: 70,
  floatingGap: readThemePixels('--oc-space-xs'),
}

export const CDE_OVERLAY_TOP_MIN_HEIGHT = 160
export const CDE_OVERLAY_BOTTOM_MIN_HEIGHT = 220
export const CDE_OVERLAY_RESPONSIVE_WIDTH = 720
export const CDE_OVERLAY_SPLIT_GAP = readThemePixels('--oc-space-sm')
