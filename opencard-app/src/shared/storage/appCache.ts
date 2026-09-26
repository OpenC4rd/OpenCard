/**
 * 模块说明：
 * - `cache/` 的度量与清理：派生数据，删掉不丢东西（见 docs/存储布局.md）
 * 职责边界：
 * - 只走 appStoragePaths 给的路径，不认识缓存里的格式，也不碰 `cache/` 之外的任何位置
 */

import { invoke } from '@tauri-apps/api/core'
import {
  APP_CACHE_NETWORK_DIRECTORY_NAME,
  APP_CACHE_SNAPSHOTS_DIRECTORY_NAME,
  APP_CACHE_STAGED_DIRECTORY_NAME,
  resolveAppCachePath,
} from './appStoragePaths'

/** 清理只用到这两个动作，注入进来也就够了。 */
type CacheFileSystem = {
  fileExists(path: string): Promise<boolean>
  deleteFile(path: string): Promise<void>
}

export type AppCacheUsage = {
  /** 包快照（解开的包），所有项目共用。 */
  snapshots: number
  /** 从网上取过的图片资源。 */
  network: number
  /** 撤销要恢复的字节，随进程生死。 */
  staged: number
}

export const EMPTY_APP_CACHE_USAGE: AppCacheUsage = { snapshots: 0, network: 0, staged: 0 }

/** 设置里的上限按 GiB 记，缓存自己按字节算。 */
export const CACHE_GIB_BYTES = 1024 ** 3

/** 现量两个目录。网络缓存自己有簿记，由它的服务报数。 */
export async function measureAppCacheDirectories(): Promise<Pick<AppCacheUsage, 'snapshots' | 'staged'>> {
  const directories = await Promise.all([
    resolveAppCachePath(APP_CACHE_SNAPSHOTS_DIRECTORY_NAME),
    resolveAppCachePath(APP_CACHE_STAGED_DIRECTORY_NAME),
  ])
  const [snapshots = 0, staged = 0] = await invoke<number[]>('measure_directories_bytes', { directories })
  return { snapshots, staged }
}

/** 清空 `cache/` 的三块。只该在没有项目在用这些缓存时调用。 */
export async function clearAppCache(fs: CacheFileSystem): Promise<void> {
  const roots = await Promise.all([
    resolveAppCachePath(APP_CACHE_SNAPSHOTS_DIRECTORY_NAME),
    resolveAppCachePath(APP_CACHE_NETWORK_DIRECTORY_NAME),
    resolveAppCachePath(APP_CACHE_STAGED_DIRECTORY_NAME),
  ])
  for (const root of roots) {
    if (await fs.fileExists(root)) await fs.deleteFile(root)
  }
}

/** 给人看的体积：字节 → `1.5GB`。单位不翻译，两种语言里都这么认。 */
export function formatCacheBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${units[unit]}`
}

/** `已用 / 上限`；没有上限的那一块只报已用。 */
export function formatCacheUsage(bytes: number, limitBytes?: number): string {
  const used = formatCacheBytes(bytes)
  return limitBytes === undefined ? used : `${used} / ${formatCacheBytes(limitBytes)}`
}
