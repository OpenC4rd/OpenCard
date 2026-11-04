import { describe, expect, it } from 'vitest'
import { VIEWPORT_MAX_SCALE, VIEWPORT_MIN_SCALE } from '../../shared/ui/viewport/viewportNavigation'
import { resolveScaleBar, SCALE_BAR_MAX_WIDTH } from './scaleBar'

describe('resolveScaleBar', () => {
  it.each([
    [96 / 25.4, 20],
    [1, 100],
    [2.4, 50],
    [6, 20],
    [120, 1],
    [240, 0.5],
  ])('picks a round length at %f px/mm', (pixelsPerMm, lengthMm) => {
    expect(resolveScaleBar(pixelsPerMm)).toEqual({ lengthMm, width: lengthMm * pixelsPerMm })
  })

  it('stays round and in range across the whole zoom range', () => {
    for (let scale = VIEWPORT_MIN_SCALE; scale <= VIEWPORT_MAX_SCALE; scale *= 1.07) {
      const { lengthMm, width } = resolveScaleBar(scale)
      expect(String(lengthMm)).toMatch(/^[125]0*$|^0\.0*[125]$/)
      expect(width).toBeLessThanOrEqual(SCALE_BAR_MAX_WIDTH)
      expect(width).toBeGreaterThanOrEqual(SCALE_BAR_MAX_WIDTH * 0.4 - 1e-9)
    }
  })
})
