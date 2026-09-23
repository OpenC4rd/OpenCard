import { describe, expect, it } from 'vitest'
import {
  networkResourceExtension,
  normalizeNetworkResourceProjectPath,
  normalizeNetworkResourceUrl,
  parseNetworkResourceCacheIndex,
  projectCacheBytes,
} from './networkResourceCache'

const UID = '550e8400-e29b-41d4-a716-446655440000'

describe('network resource cache model', () => {
  it('normalizes project identities and remote URL keys', () => {
    expect(normalizeNetworkResourceProjectPath('D:\\Projects\\OpenCard\\')).toBe('d:/projects/opencard')
    expect(normalizeNetworkResourceProjectPath('/home/user/OpenCard/')).toBe('/home/user/OpenCard')
    expect(normalizeNetworkResourceProjectPath('relative/project')).toBeNull()
    expect(normalizeNetworkResourceUrl(' HTTPS://Example.com:443/image.png?v=2#preview '))
      .toBe('https://example.com/image.png?v=2')
    expect(normalizeNetworkResourceUrl('http://example.com/image.png')).toBeNull()
  })

  it('keeps valid index entries and ignores damaged cache data', () => {
    const index = parseNetworkResourceCacheIndex({ projects: {
      'opencard-1a2b3c4d': {
        lastUsedAt: '2026-08-30T12:00:00.000Z',
        resources: {
          'https://EXAMPLE.com/image.png#preview': {
            uid: UID,
            extension: '.PNG',
            bytes: 2048,
            refreshedAt: '2026-08-29T12:00:00+00:00',
          },
          'http://example.com/unsafe.png': {
            uid: UID,
            extension: '.png',
            bytes: 1,
            refreshedAt: '2026-08-29T12:00:00.000Z',
          },
          'https://example.com/broken.png': { uid: 'not-a-uuid', extension: '.png', refreshedAt: 'nope' },
        },
      },
      '': { lastUsedAt: '2026-08-30T12:00:00.000Z', resources: {} },
    } })

    expect(Object.keys(index.projects)).toEqual(['opencard-1a2b3c4d'])
    expect(index.projects['opencard-1a2b3c4d']).toEqual({
      lastUsedAt: '2026-08-30T12:00:00.000Z',
      resources: {
        'https://example.com/image.png': {
          uid: UID,
          extension: '.png',
          bytes: 2048,
          refreshedAt: '2026-08-29T12:00:00.000Z',
        },
      },
    })
    expect(projectCacheBytes(index.projects['opencard-1a2b3c4d']!)).toBe(2048)

    // 读不懂就是空的：缓存丢了只是要重新下载，不该拦住任何东西。
    for (const damaged of [null, [], {}, { projects: [] }]) {
      expect(parseNetworkResourceCacheIndex(damaged)).toEqual({ projects: {} })
    }
    // 单个条目读不懂时只是一条空条目：目录名还在，里面没有可用资源。
    expect(parseNetworkResourceCacheIndex({ projects: { key: 'not-an-entry' } })).toEqual({
      projects: { key: { lastUsedAt: new Date(0).toISOString(), resources: {} } },
    })
  })

  it('prefers a safe URL extension and falls back to content type or bin', () => {
    expect(networkResourceExtension('https://example.com/image.WEBP', 'image/png')).toBe('.webp')
    expect(networkResourceExtension('https://example.com/download?id=1', 'image/png; charset=binary')).toBe('.png')
    expect(networkResourceExtension('https://example.com/download?id=1', 'application/octet-stream')).toBe('.bin')
  })

})
