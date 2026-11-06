import { readThemePixels } from '../foundation/themeTokenPixels'
import type { DockGeometryConfig } from './dockGeometry'

/** 悬浮面板 的结构尺寸；只有 TS 读取，所以直接写成常量，不进主题 token。 */
export const DOCK_GEOMETRY_CONFIG: DockGeometryConfig = {
  collapsedExtent: 0,
  minExtent: 280,
  maxExtent: 420,
  expandDragThreshold: 28,
  collapseDragThreshold: 70,
  floatingGap: readThemePixels('--oc-space-xs'),
}

export const DOCK_TOP_MIN_HEIGHT = 160
export const DOCK_BOTTOM_MIN_HEIGHT = 220
export const DOCK_RESPONSIVE_WIDTH = 720
export const DOCK_SPLIT_GAP = readThemePixels('--oc-space-sm')
