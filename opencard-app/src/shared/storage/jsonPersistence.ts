import { isTauri } from '@tauri-apps/api/core'
import { LazyStore } from '@tauri-apps/plugin-store'

/** 设置和长期状态共用文件读写，不共享数据或保存时机。 */
export interface JsonPersistence {
  load(): Promise<unknown>
  save(value: unknown): Promise<void>
  flush(): Promise<void>
}

export class MemoryJsonPersistence implements JsonPersistence {
  constructor(private value?: unknown) {}
  async load(): Promise<unknown> { return this.value }
  async save(value: unknown): Promise<void> { this.value = structuredClone(value) }
  async flush(): Promise<void> {}
}

export function createJsonPersistence(path: () => Promise<string>, key: string): JsonPersistence {
  if (!isTauri()) return new MemoryJsonPersistence()
  let store: Promise<LazyStore> | undefined
  const getStore = () => store ??= path().then(file => new LazyStore(file, { defaults: {}, autoSave: 250 }))
  return {
    load: async () => (await getStore()).get(key),
    save: async value => { await (await getStore()).set(key, value) },
    flush: async () => { await (await getStore()).save() },
  }
}
