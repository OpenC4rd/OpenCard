import { describe, expect, it } from 'vitest'
import { normalizeUnicodeRanges, parseProjectFontRegistry, serializeProjectFontRegistry } from './projectFontRegistry'

describe('project font registry', () => {
  it('normalizes six font slots and composition font keys', () => {
    expect(parseProjectFontRegistry({
      families: [{ key: 'brand', name: ' Brand ', files: {
        normal: { upright: 'alice/brand@1.0.0#Brand-Regular.woff2' },
        bold: { italic: '#shared/Brand-BoldItalic.ttf' },
      } }],
      compositions: [{ key: 'body', name: ' Body ', members: [
        { fontKey: 'brand', ranges: [{ start: 65, end: 90 }, { start: 91, end: 122 }] },
        { fontKey: 'fallback' },
      ] }],
    })).toEqual({ families: [{ key: 'brand', name: 'Brand', files: {
      normal: { upright: 'alice/brand@1.0.0#Brand-Regular.woff2' }, bold: { italic: '#shared/Brand-BoldItalic.ttf' },
    } }], compositions: [{ key: 'body', name: 'Body', members: [
      { fontKey: 'brand', ranges: [{ start: 65, end: 122 }] }, { fontKey: 'fallback' },
    ] }] })
  })

  it('keeps usable entries, ignores malformed slots and duplicate keys', () => {
    expect(parseProjectFontRegistry({ families: [
      { key: 'brand', name: 'Brand', files: { normal: { upright: 'fonts/Brand.ttf', italic: '../bad.ttf' } } },
      { key: 'broken', name: 'Broken', files: { normal: { upright: '../Broken.ttf' } } },
      { key: 'BRAND', name: 'Duplicate', files: { normal: { upright: 'fonts/Duplicate.ttf' } } },
    ], compositions: [{ key: 'body', name: 'Body', members: [{ fontKey: 'brand' }, { fontKey: '?' }] }] })).toEqual({
      families: [{ key: 'brand', name: 'Brand', files: { normal: { upright: 'fonts/Brand.ttf' } } }],
      compositions: [{ key: 'body', name: 'Body', members: [{ fontKey: 'brand' }] }],
    })
  })

  it('normalizes Unicode ranges and rejects invalid top-level values', () => {
    expect(normalizeUnicodeRanges([{ start: 0xd7ff, end: 0xe001 }, { start: 0x41, end: 0x7a }]))
      .toEqual([{ start: 0x41, end: 0x7a }, { start: 0xd7ff, end: 0xd7ff }, { start: 0xe000, end: 0xe001 }])
    expect(parseProjectFontRegistry({ families: {} })).toBeNull()
    expect(parseProjectFontRegistry({ families: [{ key: 'empty', name: 'Empty', files: {} }] })).toEqual({})
    expect(JSON.parse(serializeProjectFontRegistry({}))).toEqual({})
  })
})
