import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ICON_TOKEN,
  UNKNOWN_ICON_TOKEN,
  iconGlyphs,
  isIconToken,
  resolveIcon,
} from './iconRegistry'

describe('icon registry', () => {
  it('resolves every registered token to a glyph', () => {
    for (const token of Object.keys(iconGlyphs)) {
      expect(resolveIcon(token as keyof typeof iconGlyphs).path).toBeTruthy()
    }
  })

  it('keeps runtime token checks aligned with the registry', () => {
    expect(isIconToken(DEFAULT_ICON_TOKEN)).toBe(true)
    expect(isIconToken('missing.icon')).toBe(false)
  })

  it('falls back to the unknown glyph for an unresolved runtime token', () => {
    expect(resolveIcon('missing.icon' as keyof typeof iconGlyphs, 'iconRegistry.spec')).toEqual(
      iconGlyphs[UNKNOWN_ICON_TOKEN],
    )
  })
})
