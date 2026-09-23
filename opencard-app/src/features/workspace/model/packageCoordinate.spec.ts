import { describe, expect, it } from 'vitest'
import {
  comparePackageVersions,
  formatPackageCoordinate,
  formatPackageIdentity,
  normalizePackageVersion,
  parsePackageCoordinate,
  parsePackageQualifier,
  resolvePackageQualifier,
} from './packageCoordinate'

describe('package coordinate identity', () => {
  it('parses a bare package identity and refuses to call it a coordinate', () => {
    expect(parsePackageQualifier('alice/potion')).toEqual({ author: 'alice', name: 'potion' })
    expect(parsePackageCoordinate('alice/potion')).toBeNull()
  })

  it('parses a coordinate and normalizes the version prefix', () => {
    expect(parsePackageQualifier('alice/potion@1.1.0')).toEqual({ author: 'alice', name: 'potion', version: '1.1.0' })
    expect(parsePackageCoordinate('alice/potion@v1.1.0')).toEqual({ author: 'alice', name: 'potion', version: '1.1.0' })
    expect(parsePackageCoordinate('alice/potion@1.1.0-beta.1')).toEqual({ author: 'alice', name: 'potion', version: '1.1.0-beta.1' })
  })

  it('normalizes case instead of rejecting it', () => {
    expect(parsePackageCoordinate(' Alice/Potion@1.1.0 ')).toEqual({ author: 'alice', name: 'potion', version: '1.1.0' })
  })

  it('rejects a single-segment package key', () => {
    // 旧的单段 Key（引用里的 `theme@icon:…`）不再是一种身份：作者与包名两段缺一不可。
    expect(parsePackageQualifier('theme')).toBeNull()
  })

  it('rejects malformed qualifiers', () => {
    const invalid = [
      '', '   ', 'alice', 'alice/', '/potion', 'alice/potion/', 'a/b/c', 'alice//potion',
      'alice/potion@1.1', 'alice/potion@', 'alice/potion@1.1.0@2.0.0', 'alice/potion@latest',
      'al ice/potion', 'alice/pot ion', '@1.1.0',
    ]
    for (const value of invalid) {
      expect(parsePackageQualifier(value), value).toBeNull()
    }
    for (const value of [null, undefined, 7, {}, []]) {
      expect(parsePackageQualifier(value), String(value)).toBeNull()
    }
  })

  it('formats the canonical shapes it parses', () => {
    expect(formatPackageIdentity({ author: 'alice', name: 'potion' })).toBe('alice/potion')
    expect(formatPackageCoordinate({ author: 'alice', name: 'potion', version: '1.1.0' })).toBe('alice/potion@1.1.0')
    expect(parsePackageCoordinate(formatPackageCoordinate({ author: 'alice', name: 'potion', version: '1.1.0' })))
      .toEqual({ author: 'alice', name: 'potion', version: '1.1.0' })
  })
})

describe('package version normalization', () => {
  it('treats the v prefix as cosmetic', () => {
    expect(normalizePackageVersion('v2.0.0')).toBe('2.0.0')
    expect(normalizePackageVersion('2.0.0')).toBe('2.0.0')
    expect(normalizePackageVersion('2.0')).toBeNull()
  })
})

describe('picking the version a qualifier points at', () => {
  const installed = [
    'alice/theme@1.0.0',
    'alice/theme@1.10.0',
    'alice/theme@1.9.0',
    'alice/theme@2.0.0-beta.2',
    'bob/icons@1.0.0',
  ]

  it('takes the exact version when one is written', () => {
    expect(resolvePackageQualifier(installed, { author: 'alice', name: 'theme', version: '1.9.0' }))
      .toBe('alice/theme@1.9.0')
    expect(resolvePackageQualifier(installed, { author: 'alice', name: 'theme', version: '3.0.0' })).toBeNull()
  })

  it('takes the newest installed version when none is written', () => {
    // 1.10.0 比 1.9.0 新：版本号比的是数字，不是字符串。
    expect(resolvePackageQualifier(installed, { author: 'alice', name: 'theme' })).toBe('alice/theme@2.0.0-beta.2')
    expect(resolvePackageQualifier(['alice/theme@1.0.0', 'alice/theme@1.10.0', 'alice/theme@1.9.0'], { author: 'alice', name: 'theme' }))
      .toBe('alice/theme@1.10.0')
    expect(resolvePackageQualifier(installed, { author: 'carol', name: 'theme' })).toBeNull()
  })

  it('orders prereleases below the release they precede', () => {
    expect(comparePackageVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0)
    expect(comparePackageVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    expect(comparePackageVersions('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0)
    expect(comparePackageVersions('1.0.0+build.9', '1.0.0+build.1')).toBe(0)
  })
})
