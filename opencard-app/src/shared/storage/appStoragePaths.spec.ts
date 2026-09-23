import { beforeEach, describe, expect, it, vi } from 'vitest'
import { homeDir, join } from '@tauri-apps/api/path'
import {
  APP_CACHE_DIRECTORY_NAME,
  APP_CACHE_NETWORK_DIRECTORY_NAME,
  APP_CACHE_PACKAGES_DIRECTORY_NAME,
  APP_CACHE_STAGED_DIRECTORY_NAME,
  APP_STORAGE_DIRECTORY_NAME,
  APP_TEMPLATE_DIRECTORY_NAME,
  resolveAppCachePath,
  resolveAppStoragePath,
  resolveAppStorageRoot,
} from './appStoragePaths'

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: vi.fn(),
  join: vi.fn(),
}))

describe('appStoragePaths', () => {
  beforeEach(() => {
    vi.mocked(homeDir).mockResolvedValue('C:/Users/Test')
    vi.mocked(join).mockImplementation(async (...segments) => segments.join('/'))
  })

  it('resolves application data below the user home directory', async () => {
    expect(APP_STORAGE_DIRECTORY_NAME).toBe('.opencard')
    await expect(resolveAppStorageRoot()).resolves.toBe('C:/Users/Test/.opencard')
    await expect(resolveAppStoragePath(APP_TEMPLATE_DIRECTORY_NAME, 'sample')).resolves.toBe(
      'C:/Users/Test/.opencard/templates/sample',
    )
  })

  it('keeps every throwaway cache under one directory of its own', async () => {
    expect([
      APP_CACHE_DIRECTORY_NAME,
      APP_CACHE_PACKAGES_DIRECTORY_NAME,
      APP_CACHE_NETWORK_DIRECTORY_NAME,
      APP_CACHE_STAGED_DIRECTORY_NAME,
    ]).toEqual(['cache', 'packages', 'network', 'staged'])
    await expect(resolveAppCachePath(APP_CACHE_NETWORK_DIRECTORY_NAME)).resolves.toBe(
      'C:/Users/Test/.opencard/cache/network',
    )
    await expect(resolveAppCachePath(APP_CACHE_STAGED_DIRECTORY_NAME, 'operation-1')).resolves.toBe(
      'C:/Users/Test/.opencard/cache/staged/operation-1',
    )
  })
})
