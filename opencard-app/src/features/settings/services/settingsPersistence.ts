/** Persistence adapters for the single versioned application settings document. */
import { isTauri } from '@tauri-apps/api/core'
import { LazyStore } from '@tauri-apps/plugin-store'
import { APP_SETTINGS_FILE_NAME, resolveAppStoragePath } from '../../../shared/storage/appStoragePaths'
import { createDefaultAppSettings, type AppSettings } from '../model/appSettings'

const SETTINGS_DOCUMENT_KEY = 'app-settings'
const SETTINGS_AUTO_SAVE_DELAY_MS = 250

export interface SettingsPersistence {
  load(): Promise<unknown>
  save(settings: AppSettings): Promise<void>
  flush(): Promise<void>
}

export class MemorySettingsPersistence implements SettingsPersistence {
  private value: unknown

  constructor(initialValue?: unknown) {
    this.value = initialValue
  }

  async load(): Promise<unknown> {
    return this.value
  }

  async save(settings: AppSettings): Promise<void> {
    this.value = structuredClone(settings)
  }

  async flush(): Promise<void> {}
}

class TauriSettingsPersistence implements SettingsPersistence {
  private storePromise: Promise<LazyStore> | null = null

  private getStore(): Promise<LazyStore> {
    this.storePromise ??= resolveAppStoragePath(APP_SETTINGS_FILE_NAME).then((path) => (
      new LazyStore(path, {
        defaults: {
          [SETTINGS_DOCUMENT_KEY]: createDefaultAppSettings(),
        },
        autoSave: SETTINGS_AUTO_SAVE_DELAY_MS,
      })
    ))
    return this.storePromise
  }

  async load(): Promise<unknown> {
    return await (await this.getStore()).get(SETTINGS_DOCUMENT_KEY)
  }

  async save(settings: AppSettings): Promise<void> {
    await (await this.getStore()).set(SETTINGS_DOCUMENT_KEY, settings)
  }

  async flush(): Promise<void> {
    await (await this.getStore()).save()
  }
}

export function createSettingsPersistence(): SettingsPersistence {
  return isTauri()
    ? new TauriSettingsPersistence()
    : new MemorySettingsPersistence()
}
