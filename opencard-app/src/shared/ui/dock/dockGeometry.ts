import type { ViewportInsets } from '../viewport/viewportNavigation'
import { clamp } from '../../model/number'

export type DockGeometryConfig = Readonly<{
  collapsedExtent: number
  minExtent: number
  maxExtent: number
  expandDragThreshold: number
  collapseDragThreshold: number
  floatingGap: number
}>

export type DockSide = 'left' | 'right'

export interface DockLayoutState {
  leftTopHeight: number | null
  rightTopHeight: number | null
  leftDockExtent: number
  rightDockExtent: number
  leftExpandedDockExtent: number
  rightExpandedDockExtent: number
}

type DockGeometry = Readonly<{
  side: DockSide
  extent: number
  contentWidth: number
  expansionProgress: number
  edgeGap: number
  translationX: number
  viewportInset: number
}>

export function clampDockExtent(extent: number, config: DockGeometryConfig): number {
  assertGeometryConfig(config)
  return clamp(Number.isFinite(extent) ? extent : config.collapsedExtent, config.collapsedExtent, config.maxExtent)
}

export function resolveSettledDockExtent(
  extent: number,
  startExtent: number,
  config: DockGeometryConfig,
): number {
  const current = clampDockExtent(extent, config)
  const start = clampDockExtent(startExtent, config)
  if (start <= config.collapsedExtent) {
    return current > config.collapsedExtent + config.expandDragThreshold
      ? clamp(current, config.minExtent, config.maxExtent)
      : config.collapsedExtent
  }
  return current < config.minExtent - config.collapseDragThreshold
    ? config.collapsedExtent
    : clamp(current, config.minExtent, config.maxExtent)
}

export function resolveDockGeometry(
  side: DockSide,
  extent: number,
  config: DockGeometryConfig,
): DockGeometry {
  const resolvedExtent = clampDockExtent(extent, config)
  const span = config.minExtent - config.collapsedExtent
  const expansionProgress = span === 0
    ? 1
    : clamp((resolvedExtent - config.collapsedExtent) / span, 0, 1)
  const contentWidth = Math.max(config.minExtent, resolvedExtent)
  const edgeGap = config.floatingGap * expansionProgress
  const translationX = side === 'left'
    ? resolvedExtent + edgeGap - contentWidth
    : contentWidth - resolvedExtent - edgeGap
  return {
    side,
    extent: resolvedExtent,
    contentWidth,
    expansionProgress,
    edgeGap,
    translationX,
    viewportInset: resolvedExtent <= config.collapsedExtent ? 0 : resolvedExtent + edgeGap,
  }
}

export function resolveDockViewportInsets(
  leftExtent: number,
  rightExtent: number,
  config: DockGeometryConfig,
): ViewportInsets {
  return {
    left: resolveDockGeometry('left', leftExtent, config).viewportInset,
    right: resolveDockGeometry('right', rightExtent, config).viewportInset,
  }
}

function assertGeometryConfig(config: DockGeometryConfig): void {
  const values = [
    config.collapsedExtent,
    config.minExtent,
    config.maxExtent,
    config.expandDragThreshold,
    config.collapseDragThreshold,
    config.floatingGap,
  ]
  if (values.some(value => !Number.isFinite(value))) throw new RangeError('Dock geometry must be finite')
  if (config.collapsedExtent < 0 || config.minExtent < config.collapsedExtent) {
    throw new RangeError('Dock extents are invalid')
  }
  if (config.maxExtent < config.minExtent) throw new RangeError('Dock maximum extent is invalid')
  if (config.expandDragThreshold < 0 || config.collapseDragThreshold < 0 || config.floatingGap < 0) {
    throw new RangeError('Dock thresholds are invalid')
  }
}
