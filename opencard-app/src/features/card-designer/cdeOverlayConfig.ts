import { readThemePixels } from '../../shared/ui/foundation/themeTokenPixels'
import type { CdeOverlayGeometryConfig } from './cdeOverlayGeometry'

/** CardEditor Overlay 的结构 token 投影；数值来源仍是 foundation shared tokens。 */
export const CDE_OVERLAY_GEOMETRY_CONFIG: CdeOverlayGeometryConfig = {
  collapsedExtent: 0,
  minExtent: readThemePixels('--oc-card-editor-dock-min-width'),
  maxExtent: readThemePixels('--oc-card-editor-dock-max-width'),
  expandDragThreshold: readThemePixels('--oc-card-editor-dock-expand-threshold'),
  collapseDragThreshold: readThemePixels('--oc-card-editor-dock-collapse-threshold'),
  floatingGap: readThemePixels('--oc-floating-surface-gap'),
}

export const CDE_OVERLAY_TOP_MIN_HEIGHT = readThemePixels('--oc-card-editor-dock-top-min-height')
export const CDE_OVERLAY_BOTTOM_MIN_HEIGHT = readThemePixels('--oc-card-editor-dock-bottom-min-height')
export const CDE_OVERLAY_RESPONSIVE_WIDTH = readThemePixels('--oc-card-editor-dock-responsive-width')
export const CDE_OVERLAY_SPLIT_GAP = readThemePixels('--oc-space-sm')
