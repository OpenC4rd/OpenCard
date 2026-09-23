import { isTauri } from '@tauri-apps/api/core'
import { LazyStore } from '@tauri-apps/plugin-store'
import { APP_UPDATE_STATE_FILE_NAME, resolveAppStoragePath } from '../../../shared/storage/appStoragePaths'

const UPDATE_STATE_KEY = 'update-state'

export interface ReleaseNotesSnapshot {
  version: string
  body: string
  publishedAt: string | null
}

export interface CurrentReleaseNotes extends ReleaseNotesSnapshot {
  seenAt: string | null
}

export interface UpdateStateDocument {
  current: CurrentReleaseNotes | null
  pending: ReleaseNotesSnapshot | null
}

export interface UpdateStatePersistence {
  load(): Promise<unknown>
  save(state: UpdateStateDocument): Promise<void>
}

export class MemoryUpdateStatePersistence implements UpdateStatePersistence {
  constructor(private value: unknown = null) {}

  async load(): Promise<unknown> {
    return structuredClone(this.value)
  }

  async save(state: UpdateStateDocument): Promise<void> {
    this.value = structuredClone(state)
  }
}

class TauriUpdateStatePersistence implements UpdateStatePersistence {
  private storePromise: Promise<LazyStore> | null = null

  private getStore(): Promise<LazyStore> {
    this.storePromise ??= resolveAppStoragePath(APP_UPDATE_STATE_FILE_NAME).then(path => new LazyStore(path))
    return this.storePromise
  }

  async load(): Promise<unknown> {
    return await (await this.getStore()).get(UPDATE_STATE_KEY)
  }

  async save(state: UpdateStateDocument): Promise<void> {
    const store = await this.getStore()
    await store.set(UPDATE_STATE_KEY, state)
    await store.save()
  }
}

export function createUpdateStatePersistence(): UpdateStatePersistence {
  return isTauri()
    ? new TauriUpdateStatePersistence()
    : new MemoryUpdateStatePersistence()
}
