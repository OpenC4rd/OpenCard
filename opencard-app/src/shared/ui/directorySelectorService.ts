import { readonly, ref } from 'vue'
import type { FilePathFilter, FilePathScope } from '../model/filePath'

/** 打开全局目录选取器所需的一切；选取器本身不认识项目，作用域与导入都由调用方给。 */
export type DirectorySelectorOptions = {
  title: string
  scope: FilePathScope
  /** 起始并限定的相对目录，用户不能浏览到它之上。 */
  root?: string
  filter?: FilePathFilter
  multiple?: boolean
  view?: 'grid' | 'list'
  resolveThumbnailSrc?: (relativePath: string) => string | null
  /** 提供时显示"从磁盘导入"；把文件复制进相对目录 `directory`，复制了任何东西就返回 true。 */
  importInto?: (directory: string) => Promise<boolean>
}

type DirectorySelectorRequest = DirectorySelectorOptions & { resolve: (paths: string[] | null) => void }

const pending = ref<DirectorySelectorRequest | null>(null)
const selection = ref<string[]>([])
const refreshKey = ref(0)

export const directorySelectorRequest = readonly(pending)
export const directorySelectorSelection = selection
export const directorySelectorRefreshKey = readonly(refreshKey)

/** 打开选取器；确认时给出选中的相对路径，取消、被新请求顶替时给 null。 */
export function openDirectorySelector(options: DirectorySelectorOptions): Promise<string[] | null> {
  pending.value?.resolve(null)
  selection.value = []
  return new Promise((resolve) => { pending.value = { ...options, resolve } })
}

export function resolveDirectorySelector(paths: string[] | null): void {
  const request = pending.value
  pending.value = null
  request?.resolve(paths && paths.length > 0 ? paths : null)
}

export async function importIntoDirectorySelector(directory: string): Promise<void> {
  const request = pending.value
  if (!request?.importInto) return
  if (await request.importInto(directory) && pending.value === request) refreshKey.value += 1
}
