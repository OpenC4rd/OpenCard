import { describe, expect, it, vi } from 'vitest'
import type { StoredResourcePackageLibraryService } from '../services/storedResourcePackageLibrary'
import { createStoredResourcePackageStore } from './storedResourcePackageStore'

type LibraryService = Pick<
  StoredResourcePackageLibraryService,
  'loadLibrary' | 'pickSourceFile' | 'importPackage' | 'removePackage'
>

const theme = {
  path: '/app/packages/alice-theme-1.0.0.ocpack',
  coordinate: 'alice/theme@1.0.0',
  title: 'Theme',
  fingerprint: 'fp-theme',
}

function createService(): LibraryService & { loadLibrary: ReturnType<typeof vi.fn> } {
  return {
    loadLibrary: vi.fn(async () => ({ packs: [theme], warnings: [] })),
    pickSourceFile: vi.fn(async () => '/incoming/theme.ocpack'),
    importPackage: vi.fn(async () => theme),
    removePackage: vi.fn(async () => undefined),
  }
}

describe('storedResourcePackageStore', () => {
  it('publishes the loaded add-on packages and their warnings', async () => {
    const service = createService()
    service.loadLibrary.mockResolvedValue({
      packs: [theme],
      warnings: [{ path: '/app/packages/broken.ocpack', reason: 'Package manifest is invalid' }],
    })
    const store = createStoredResourcePackageStore(service as unknown as StoredResourcePackageLibraryService)

    await store.load()

    expect(store.packs.value).toEqual([theme])
    expect(store.warnings.value).toEqual([
      { path: '/app/packages/broken.ocpack', reason: 'Package manifest is invalid' },
    ])
    expect(store.isLoading.value).toBe(false)
    expect(store.findPackage(theme.path)).toEqual(theme)
    expect(store.findPackage('/app/packages/missing.ocpack')).toBeNull()
  })

  it('shares one load between concurrent callers and stops blocking when it fails', async () => {
    const service = createService()
    let rejectLoad: (cause: unknown) => void = () => undefined
    service.loadLibrary.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectLoad = reject
    }))
    const store = createStoredResourcePackageStore(service as unknown as StoredResourcePackageLibraryService)

    // 立刻接住拒绝，避免在断言之前出现未处理的 Promise 拒绝。
    const first = store.load().then(() => null, (cause: Error) => cause)
    const second = store.load().then(() => null, (cause: Error) => cause)
    expect(service.loadLibrary).toHaveBeenCalledOnce()
    expect(store.isLoading.value).toBe(true)

    rejectLoad(new Error('Cannot read app storage'))
    expect((await first)?.message).toBe('Cannot read app storage')
    expect((await second)?.message).toBe('Cannot read app storage')

    expect(store.isLoading.value).toBe(false)
    service.loadLibrary.mockResolvedValue({ packs: [theme], warnings: [] })
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.packs.value).toEqual([theme])
  })

  it('reloads after importing a package so the list matches app storage', async () => {
    const service = createService()
    const store = createStoredResourcePackageStore(service as unknown as StoredResourcePackageLibraryService)

    const imported = await store.importPackage('/incoming/theme.ocpack')

    expect(service.importPackage).toHaveBeenCalledWith('/incoming/theme.ocpack')
    expect(imported).toEqual(theme)
    expect(store.packs.value).toEqual([theme])
  })

  it('reloads after removing a package', async () => {
    const service = createService()
    const store = createStoredResourcePackageStore(service as unknown as StoredResourcePackageLibraryService)
    await store.load()
    service.loadLibrary.mockResolvedValue({ packs: [], warnings: [] })

    await store.removePackage(theme.path)

    expect(service.removePackage).toHaveBeenCalledWith(theme.path)
    expect(store.packs.value).toEqual([])
  })
})
