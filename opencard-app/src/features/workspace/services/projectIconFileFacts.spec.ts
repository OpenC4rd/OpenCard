import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectProjectIconTint, inspectProjectIconFile } from './projectIconFileFacts'

const bytes = (text: string) => new TextEncoder().encode(text)

/** jsdom does not decode images; stub one that always reports the given natural size. */
function stubImageSize(width: number, height: number): void {
  vi.stubGlobal('Image', class {
    naturalWidth = width
    naturalHeight = height
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) { queueMicrotask(() => this.onload?.()) }
  })
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:stub', revokeObjectURL: () => undefined })
}

describe('detectProjectIconTint', () => {
  it('tints vector files that paint through the surrounding color', () => {
    expect(detectProjectIconTint('icons/warn.svg', '<svg><path stroke="currentColor" fill="none"/></svg>')).toBe('context')
    expect(detectProjectIconTint('icons/warn.svg', '<svg><path style="stroke: currentColor"/></svg>')).toBe('context')
  })

  it('tints single-color vector files and ignores non-color paints', () => {
    expect(detectProjectIconTint('icons/warn.svg', '<svg><path fill="#000000"/></svg>')).toBe('context')
    expect(detectProjectIconTint('icons/warn.svg', '<svg><path/></svg>')).toBe('context')
    expect(detectProjectIconTint('icons/warn.svg', '<svg><style>.a{fill:#fff;stroke:none}</style><path class="a"/></svg>')).toBe('context')
  })

  it('keeps multi-color and raster-bearing vector files in their original palette', () => {
    expect(detectProjectIconTint('icons/logo.svg', '<svg><path fill="#ffffff"/><path fill="#111111"/></svg>')).toBe('original')
    expect(detectProjectIconTint('icons/logo.svg', '<svg><image href="data:image/png;base64,AA"/></svg>')).toBe('original')
    expect(detectProjectIconTint('icons/logo.svg',
      '<svg><defs><linearGradient id="g"><stop stop-color="#fff"/><stop stop-color="#000"/></linearGradient></defs><path fill="url(#g)"/></svg>',
    )).toBe('original')
  })

  it('keeps every raster icon in its original colors regardless of markup', () => {
    // A bitmap's alpha could be masked, but that would flatten art the artist already colored.
    expect(detectProjectIconTint('icons/pixel.png', '')).toBe('original')
    expect(detectProjectIconTint('icons/photo.jpg', 'currentColor')).toBe('original')
    expect(detectProjectIconTint('icons/shot.webp', '')).toBe('original')
  })
})

describe('inspectProjectIconFile', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('derives the tint without probing dimensions for a vector source', async () => {
    stubImageSize(16, 16)
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    await expect(inspectProjectIconFile('a.svg', bytes('<svg><path fill="#0f0"/></svg>')))
      .resolves.toEqual({ tint: 'context' })
    // A vector never needs nearest-neighbour scaling, so it must not decode an image at all.
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('flags a small raster as pixel art and a large one as not pixel art', async () => {
    stubImageSize(16, 16)
    await expect(inspectProjectIconFile('small.png', new Uint8Array([1])))
      .resolves.toEqual({ tint: 'original', pixelated: true })

    stubImageSize(512, 512)
    await expect(inspectProjectIconFile('large.png', new Uint8Array([1])))
      .resolves.toEqual({ tint: 'original' })
  })

  it('keeps the raster tint when its dimensions cannot be read', async () => {
    vi.stubGlobal('Image', class {
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
    })
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:stub', revokeObjectURL: () => undefined })
    await expect(inspectProjectIconFile('broken.png', new Uint8Array([1])))
      .resolves.toEqual({ tint: 'original' })
  })

  it('does not probe an unknown raster extension', async () => {
    const createObjectURL = vi.fn(() => 'blob:stub')
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: () => undefined })
    await expect(inspectProjectIconFile('weird.bmp', new Uint8Array([1])))
      .resolves.toEqual({ tint: 'original' })
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
