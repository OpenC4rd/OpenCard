// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CARD_DIMENSION_PRESETS, findMatchingPreset } from './cardDimensionPresets'

describe('cardDimensionPresets', () => {
  it('finds standard poker preset by dimensions', () => {
    const preset = findMatchingPreset(63, 88)
    expect(preset?.id).toBe('standard-poker')
  })

  it('finds preset with small float deviation', () => {
    const preset = findMatchingPreset(57.01, 88.99)
    expect(preset?.id).toBe('bridge')
  })

  it('returns null for non-preset dimensions', () => {
    expect(findMatchingPreset(100, 100)).toBeNull()
  })

  it('contains essential physical card formats', () => {
    const ids = CARD_DIMENSION_PRESETS.map((p) => p.id)
    expect(ids).toContain('standard-poker')
    expect(ids).toContain('bridge')
    expect(ids).toContain('tarot')
    expect(ids).toContain('mini-european')
  })
})
