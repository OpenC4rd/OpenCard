import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCdeFaceFlip } from './useCdeFaceFlip'

function createElement(animate?: unknown): HTMLElement {
  const viewport = document.createElement('div')
  const stage = document.createElement('div')
  stage.className = 'card-viewport-stage'
  if (animate) (stage as unknown as { animate: unknown }).animate = animate
  viewport.append(stage)
  return viewport
}

function fakeAnimation(): { finished: Promise<void>, cancel: () => void } {
  return { finished: Promise.resolve(), cancel: vi.fn() }
}

describe('useCdeFaceFlip', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--oc-duration')
  })

  it('swaps immediately without the Web Animations API', async () => {
    const swap = vi.fn()
    const { flip } = useCdeFaceFlip({ getViewport: () => createElement() })
    await flip(swap)
    expect(swap).toHaveBeenCalledTimes(1)
  })

  it('swaps immediately when transitions are off', async () => {
    document.documentElement.style.setProperty('--oc-duration', '0ms')
    const animate = vi.fn(fakeAnimation)
    const swap = vi.fn()
    const { flip } = useCdeFaceFlip({ getViewport: () => createElement(animate) })
    await flip(swap)
    expect(swap).toHaveBeenCalledTimes(1)
    expect(animate).not.toHaveBeenCalled()
  })

  it('swaps between the flip-out and flip-in and ignores overlapping flips', async () => {
    document.documentElement.style.setProperty('--oc-duration', '300ms')
    const order: string[] = []
    const animate = vi.fn(() => { order.push('animate'); return fakeAnimation() })
    const swap = vi.fn(() => { order.push('swap') })
    const { flip, flipping } = useCdeFaceFlip({ getViewport: () => createElement(animate) })
    const first = flip(swap)
    expect(flipping.value).toBe(true)
    await flip(swap)
    await first
    expect(order).toEqual(['animate', 'swap', 'animate'])
    expect(flipping.value).toBe(false)
  })
})
