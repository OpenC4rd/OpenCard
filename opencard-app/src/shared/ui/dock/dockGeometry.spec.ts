import { describe, expect, it } from 'vitest'
import {
  clampDockExtent,
  resolveDockGeometry,
  resolveDockViewportInsets,
  resolveSettledDockExtent,
  type DockGeometryConfig,
} from './dockGeometry'

const GEOMETRY: DockGeometryConfig = {
  collapsedExtent: 0,
  minExtent: 280,
  maxExtent: 420,
  expandDragThreshold: 28,
  collapseDragThreshold: 70,
  floatingGap: 6,
}

describe('dockGeometry', () => {
  it('clamps drag extents without forcing a premature expanded width', () => {
    expect(clampDockExtent(-20, GEOMETRY)).toBe(GEOMETRY.collapsedExtent)
    expect(clampDockExtent(120, GEOMETRY)).toBe(120)
    expect(clampDockExtent(500, GEOMETRY)).toBe(GEOMETRY.maxExtent)
  })

  it('settles symmetrically from collapsed and expanded starts', () => {
    expect(resolveSettledDockExtent(28, 0, GEOMETRY)).toBe(0)
    expect(resolveSettledDockExtent(29, 0, GEOMETRY)).toBe(GEOMETRY.minExtent)
    expect(resolveSettledDockExtent(209, 280, GEOMETRY)).toBe(0)
    expect(resolveSettledDockExtent(210, 280, GEOMETRY)).toBe(GEOMETRY.minExtent)
    expect(resolveSettledDockExtent(360, 280, GEOMETRY)).toBe(360)
  })

  it('keeps glass content width intact while translating both sides as mirrors', () => {
    const left = resolveDockGeometry('left', 120, GEOMETRY)
    const right = resolveDockGeometry('right', 120, GEOMETRY)

    expect(left.contentWidth).toBe(GEOMETRY.minExtent)
    expect(left.expansionProgress).toBeCloseTo(120 / 280)
    expect(left.edgeGap).toBeCloseTo(6 * (120 / 280))
    expect(left.translationX).toBeCloseTo(-right.translationX)
    expect(left.viewportInset).toBeCloseTo(120 + left.edgeGap)
  })

  it('uses the full gap at the minimum expanded width and no gap when collapsed', () => {
    const collapsed = resolveDockGeometry('left', 0, GEOMETRY)
    const expanded = resolveDockGeometry('left', 280, GEOMETRY)

    expect(collapsed.expansionProgress).toBe(0)
    expect(collapsed.edgeGap).toBe(0)
    expect(collapsed.viewportInset).toBe(0)
    expect(expanded.expansionProgress).toBe(1)
    expect(expanded.edgeGap).toBe(GEOMETRY.floatingGap)
    expect(expanded.viewportInset).toBe(286)
  })

  it('combines both side extents into one viewport inset contract', () => {
    const insets = resolveDockViewportInsets(280, 120, GEOMETRY)
    expect(insets.left).toBe(286)
    expect(insets.right).toBeCloseTo(120 + 6 * (120 / 280))
    expect(insets.top).toBeUndefined()
    expect(insets.bottom).toBeUndefined()
  })

  it('rejects invalid injected geometry instead of silently introducing fallback dimensions', () => {
    expect(() => resolveDockGeometry('left', 0, {
      ...GEOMETRY,
      minExtent: Number.NaN,
    })).toThrow(RangeError)
    expect(() => resolveDockGeometry('left', 0, {
      ...GEOMETRY,
      floatingGap: -1,
    })).toThrow(RangeError)
  })
})
