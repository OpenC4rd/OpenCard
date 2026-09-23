import { describe, expect, it } from 'vitest'
import {
  normalizeResourcePackageManifest,
  resourcePackageCoordinate,
} from './resourcePackage'

function manifest(publicFonts: unknown, publicIconSeries: unknown = []) {
  return {
    type: 'opencard-resource-package',
    author: 'alice',
    name: 'theme',
    version: '1.0.0',
    title: 'Theme',
    public: { fonts: publicFonts, iconSeries: publicIconSeries },
  }
}

describe('package manifest identity', () => {
  it('reads the coordinate out of the package own declaration', () => {
    const normalized = normalizeResourcePackageManifest(manifest([]))
    expect(normalized.issues).toEqual([])
    expect(resourcePackageCoordinate(normalized.manifest)).toBe('alice/theme@1.0.0')
  })

  it('normalizes case rather than rejecting it, exactly like a reference does', () => {
    const normalized = normalizeResourcePackageManifest({ ...manifest([]), author: ' Alice ', title: '' })
    expect(resourcePackageCoordinate(normalized.manifest)).toBe('alice/theme@1.0.0')
    // 显示名缺省就是包名。
    expect(normalized.manifest.title).toBe('theme')
  })

  it('refuses to invent an identity when one is missing or malformed', () => {
    for (const broken of [
      { ...manifest([]), author: undefined },
      { ...manifest([]), name: 'Not A Slug' },
      { ...manifest([]), version: '1.0' },
      { ...manifest([]), version: undefined },
    ]) {
      const normalized = normalizeResourcePackageManifest(broken)
      expect(normalized.issues.map(issue => issue.path)).toContain('author')
      expect(resourcePackageCoordinate(normalized.manifest)).toBeNull()
    }
  })
})

describe('package manifest public fonts', () => {
  it('normalizes key and title objects and rejects the removed string shape', () => {
    const normalized = normalizeResourcePackageManifest(manifest([
      { key: 'body', title: ' Body ' },
      { key: 'BODY', title: 'Duplicate' },
      'legacy-font',
      { key: 'heading', title: '' },
    ]))

    expect(normalized.manifest.public.fonts).toEqual([{ key: 'body', title: 'Body' }])
    expect(normalized.issues.map(issue => issue.path)).toEqual([
      'public.fonts[1].key',
      'public.fonts[2]',
      'public.fonts[3]',
    ])
  })

  it('defaults a missing public font index to an empty list', () => {
    const value = manifest(undefined)
    expect(normalizeResourcePackageManifest(value).manifest.public.fonts).toEqual([])
  })
})

describe('package manifest cover', () => {
  it('normalizes a declared package cover and ignores unsafe or missing ones', () => {
    expect(normalizeResourcePackageManifest({ ...manifest([]), cover: ' .opencard\\cover.png ' })
      .manifest.cover).toBe('.opencard/cover.png')
    expect(normalizeResourcePackageManifest({ ...manifest([]), cover: '../cover.png' })
      .manifest.cover).toBeUndefined()
    expect(normalizeResourcePackageManifest({ ...manifest([]), cover: 7 })
      .manifest.cover).toBeUndefined()
    expect(normalizeResourcePackageManifest(manifest([])).manifest.cover).toBeUndefined()
  })

  it('never reports a cover problem as a manifest issue', () => {
    expect(normalizeResourcePackageManifest({ ...manifest([]), cover: 'nested/../cover.png' }).issues)
      .toEqual([])
  })
})

describe('package manifest public icon series', () => {
  it('normalizes summaries and rejects duplicates, invalid counts, and the removed string shape', () => {
    const normalized = normalizeResourcePackageManifest(manifest([], [
      { key: 'status', title: ' Status ', count: 3 },
      { key: 'STATUS', title: 'Duplicate', count: 1 },
      { key: 'empty', title: 'Empty', count: 0 },
      { key: 'invalid', title: 'Invalid', count: -1 },
      'legacy-series',
    ]))

    expect(normalized.manifest.public.iconSeries).toEqual([
      { key: 'status', title: 'Status', count: 3 },
      { key: 'empty', title: 'Empty', count: 0 },
    ])
    expect(normalized.issues.map(issue => issue.path)).toEqual([
      'public.iconSeries[1].key',
      'public.iconSeries[3]',
      'public.iconSeries[4]',
    ])
  })

  it('defaults a missing public icon series index to an empty list', () => {
    const value = manifest([])
    delete (value.public as Partial<typeof value.public>).iconSeries
    expect(normalizeResourcePackageManifest(value).manifest.public.iconSeries).toEqual([])
  })
})
