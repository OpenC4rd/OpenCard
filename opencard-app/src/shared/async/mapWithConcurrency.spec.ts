// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './mapWithConcurrency'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('mapWithConcurrency', () => {
  it('preserves input order even when later items finish first', async () => {
    const result = await mapWithConcurrency([30, 10, 20], 3, async (delay) => {
      await new Promise(resolve => setTimeout(resolve, delay))
      return delay
    })
    expect(result).toEqual([30, 10, 20])
  })

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await tick()
      inFlight -= 1
      return null
    })
    expect(peak).toBe(4)
  })

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 8, async () => 1)).toEqual([])
    expect(await mapWithConcurrency([1, 2], 99, async (n) => n * 2)).toEqual([2, 4])
  })

  it('treats a non-positive limit as one at a time', async () => {
    expect(await mapWithConcurrency([1, 2, 3], 0, async (n) => n)).toEqual([1, 2, 3])
  })
})
