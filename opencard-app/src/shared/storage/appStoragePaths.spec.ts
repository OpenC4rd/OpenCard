import { beforeEach, describe, expect, it, vi } from 'vitest'
import { homeDir, join } from '@tauri-apps/api/path'
import {
  APP_CACHE_DIRECTORY_NAME,
  APP_CACHE_NETWORK_DIRECTORY_NAME,
  APP_CACHE_PACKAGES_DIRECTORY_NAME,
  APP_CACHE_STAGED_DIRECTORY_NAME,
  APP_FEEDBACK_RECEIPTS_FILE_NAME,
  APP_PACKAGE_DIRECTORY_NAME,
  APP_SETTINGS_FILE_NAME,
  APP_STORAGE_DIRECTORY_NAME,
  APP_STORAGE_TOP_LEVEL_ENTRIES,
  APP_TEMPLATE_DIRECTORY_NAME,
  APP_UPDATE_STATE_FILE_NAME,
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

  it('keeps the top level a closed set of the six documented entries', () => {
    expect(APP_STORAGE_TOP_LEVEL_ENTRIES).toEqual([
      APP_SETTINGS_FILE_NAME,
      APP_UPDATE_STATE_FILE_NAME,
      APP_FEEDBACK_RECEIPTS_FILE_NAME,
      APP_PACKAGE_DIRECTORY_NAME,
      APP_TEMPLATE_DIRECTORY_NAME,
      APP_CACHE_DIRECTORY_NAME,
    ])
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
