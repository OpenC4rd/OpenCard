import type { ViewportInsets } from '../../shared/ui/viewport/viewportNavigation'
import { clamp } from '../../shared/model/number'

export type CdeOverlayGeometryConfig = Readonly<{
  collapsedExtent: number
  minExtent: number
  maxExtent: number
  expandDragThreshold: number
  collapseDragThreshold: number
  floatingGap: number
}>

export type CdeOverlaySide = 'left' | 'right'

export type CdeOverlayDockGeometry = Readonly<{
  side: CdeOverlaySide
  extent: number
  contentWidth: number
  expansionProgress: number
  edgeGap: number
  translationX: number
  viewportInset: number
}>

export function clampCdeOverlayExtent(extent: number, config: CdeOverlayGeometryConfig): number {
  assertGeometryConfig(config)
  return clamp(Number.isFinite(extent) ? extent : config.collapsedExtent, config.collapsedExtent, config.maxExtent)
}

export function settleCdeOverlayExtent(
  extent: number,
  startExtent: number,
  config: CdeOverlayGeometryConfig,
): number {
  const current = clampCdeOverlayExtent(extent, config)
  const start = clampCdeOverlayExtent(startExtent, config)
  if (start <= config.collapsedExtent) {
    return current > config.collapsedExtent + config.expandDragThreshold
      ? clamp(current, config.minExtent, config.maxExtent)
      : config.collapsedExtent
  }
  return current < config.minExtent - config.collapseDragThreshold
    ? config.collapsedExtent
    : clamp(current, config.minExtent, config.maxExtent)
}

export function resolveCdeOverlayDockGeometry(
  side: CdeOverlaySide,
  extent: number,
  config: CdeOverlayGeometryConfig,
): CdeOverlayDockGeometry {
  const resolvedExtent = clampCdeOverlayExtent(extent, config)
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

export function resolveCdeOverlayViewportInsets(
  leftExtent: number,
  rightExtent: number,
  config: CdeOverlayGeometryConfig,
): ViewportInsets {
  return {
    left: resolveCdeOverlayDockGeometry('left', leftExtent, config).viewportInset,
    right: resolveCdeOverlayDockGeometry('right', rightExtent, config).viewportInset,
  }
}

function assertGeometryConfig(config: CdeOverlayGeometryConfig): void {
  const values = [
    config.collapsedExtent,
    config.minExtent,
    config.maxExtent,
    config.expandDragThreshold,
    config.collapseDragThreshold,
    config.floatingGap,
  ]
  if (values.some(value => !Number.isFinite(value))) throw new RangeError('CDE overlay geometry must be finite')
  if (config.collapsedExtent < 0 || config.minExtent < config.collapsedExtent) {
    throw new RangeError('CDE overlay extents are invalid')
  }
  if (config.maxExtent < config.minExtent) throw new RangeError('CDE overlay maximum extent is invalid')
  if (config.expandDragThreshold < 0 || config.collapseDragThreshold < 0 || config.floatingGap < 0) {
    throw new RangeError('CDE overlay thresholds are invalid')
  }
}
