import { describe, expect, it } from 'vitest'
import { resolveFullFaceRasterScale, resolveVisibleCardFaceView } from './cardFaceView'

const face = { width: 63, height: 88 }
const viewport = { width: 800, height: 600 }

describe('resolveVisibleCardFaceView', () => {
  it('covers the whole face when it fits inside the viewport', () => {
    const view = resolveVisibleCardFaceView(face, { x: 100, y: 50 }, 4, viewport, 2)
    expect(view).toEqual({ left: 0, top: 0, width: 63, height: 88, pixelScale: 8, screenScale: 4 })
  })

  it('clips to the viewport so the bitmap never outgrows the screen at high zoom', () => {
    const view = resolveVisibleCardFaceView(face, { x: -5000, y: -3000 }, 150, viewport, 2)!
    expect(view.left).toBeCloseTo(5000 / 150)
    expect(view.top).toBeCloseTo(3000 / 150)
    expect(view.width * view.pixelScale).toBeCloseTo(1600)
    expect(view.height * view.pixelScale).toBeCloseTo(1200)
  })

  it('snaps screen edges to device pixels', () => {
    const view = resolveVisibleCardFaceView(face, { x: 10.3, y: 20.3 }, 4, viewport, 2)!
    expect((10.3 + view.left * 4) * 2 % 1).toBeCloseTo(0)
    expect((20.3 + view.top * 4) * 2 % 1).toBeCloseTo(0)
  })

  it('extends the view over the bleed', () => {
    const view = resolveVisibleCardFaceView({ ...face, bleed: 3 }, { x: 100, y: 100 }, 4, viewport, 1)!
    expect(view).toMatchObject({ left: -3, top: -3, width: face.width + 6, height: face.height + 6 })
  })

  it('returns null when the face is off screen', () => {
    expect(resolveVisibleCardFaceView(face, { x: 900, y: 0 }, 4, viewport, 2)).toBeNull()
    expect(resolveVisibleCardFaceView(face, { x: 0, y: 0 }, 4, { width: 0, height: 0 }, 2)).toBeNull()
  })
})

describe('resolveFullFaceRasterScale', () => {
  it('keeps the longest physical side constant regardless of device ratio', () => {
    expect(88 * 2 * resolveFullFaceRasterScale(face, 2)).toBeCloseTo(2048)
    expect(88 * resolveFullFaceRasterScale(face, 1)).toBeCloseTo(2048)
  })
})
