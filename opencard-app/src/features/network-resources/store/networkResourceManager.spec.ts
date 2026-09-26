import { describe, expect, it, vi } from 'vitest'
import type { CachedNetworkResource, NetworkResourceCacheProject } from '../services/networkResourceCacheService'
import { NetworkResourceManager } from './networkResourceManager'

const PROJECT = 'D:/Projects/OpenCard'
const URL = 'https://example.com/image.png'

function resource(path: string, refreshedAt = '2026-08-29T12:00:00.000Z'): CachedNetworkResource {
  return { url: URL, path, refreshedAt }
}

function createManager(cache: NetworkResourceCacheProject) {
  return new NetworkResourceManager({
    cacheService: { forProject: vi.fn(async () => cache) },
  })
}

describe('NetworkResourceManager', () => {
  it('deduplicates missing-resource acquisition and publishes the completed cache entry', async () => {
    const refresh = vi.fn(async () => resource('/cache/image.png'))
    const cache: NetworkResourceCacheProject = {
      getCached: vi.fn(async () => null),
      refresh,
    }
    const scope = createManager(cache).forProject(PROJECT, () => true)

    expect(scope.get(URL)).toBeNull()
    expect(scope.get(URL)).toBeNull()
    await vi.waitFor(() => expect(scope.get(URL)?.path).toBe('/cache/image.png'))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('loads an existing cache entry once and leaves refresh policy to the caller', async () => {
    const old = resource('/cache/image.png', '2026-08-27T12:00:00.000Z')
    const refresh = vi.fn(async () => resource('/cache/image.png', '2026-08-29T12:00:00.000Z'))
    const cache: NetworkResourceCacheProject = {
      getCached: vi.fn(async () => old),
      refresh,
    }
    const scope = createManager(cache).forProject(PROJECT, () => true)
    expect(scope.get(URL)).toBeNull()
    await vi.waitFor(() => expect(scope.get(URL)?.refreshedAt).toBe(old.refreshedAt))

    expect(refresh).not.toHaveBeenCalled()
  })
})
