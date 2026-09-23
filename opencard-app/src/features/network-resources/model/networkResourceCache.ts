/**
 * 模块说明：
 * - 网络资源缓存的清单结构与路径规范化：什么算同一个 URL、什么算同一个项目、清单长什么样。
 * 职责边界：
 * - 只管"读得懂的形状"；磁盘布局与读写时序在 services/networkResourceCacheService。
 *
 * 清单只有一个，放在缓存根里；项目目录名由项目路径推导（见 services 的 projectKey），
 * 所以清单里**没有**"项目路径 → 目录名"的映射表 —— 那种表会随项目改名、移动而漂移。
 */
import { isRecord } from '../../../shared/model/record'

export type NetworkResourceCacheEntry = {
  uid: string
  extension: string
  /** 期望占用的字节数。实际文件大小以磁盘为准，它只用于淘汰。 */
  bytes: number
  refreshedAt: string
}

/** 一个项目的缓存清单：它自己缓了哪些 URL，以及最后一次被用到的时刻。 */
export type NetworkResourceProjectEntry = {
  lastUsedAt: string
  resources: Record<string, NetworkResourceCacheEntry>
}

export type NetworkResourceCacheIndex = {
  projects: Record<string, NetworkResourceProjectEntry>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/i
const EPOCH = new Date(0).toISOString()

export function normalizeNetworkResourceProjectPath(path: string): string | null {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized || (!/^[a-z]:\//i.test(normalized) && !normalized.startsWith('/'))) return null
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLocaleLowerCase()
    : normalized
}

export function normalizeNetworkResourceUrl(source: string): string | null {
  try {
    const url = new URL(source.trim())
    if (url.protocol !== 'https:') return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

/** 一个项目占了多少：由它自己的条目求和，不另外存一份会漂移的总数。 */
export function projectCacheBytes(entry: NetworkResourceProjectEntry): number {
  return Object.values(entry.resources).reduce((total, resource) => total + resource.bytes, 0)
}

function parseCacheEntry(value: unknown): NetworkResourceCacheEntry | null {
  if (!isRecord(value)
    || typeof value.uid !== 'string' || !UUID_PATTERN.test(value.uid)
    || typeof value.extension !== 'string' || !EXTENSION_PATTERN.test(value.extension)
    || typeof value.refreshedAt !== 'string' || !Number.isFinite(Date.parse(value.refreshedAt))) return null
  const bytes = typeof value.bytes === 'number' && Number.isFinite(value.bytes) && value.bytes >= 0
    ? Math.floor(value.bytes)
    : 0
  return {
    uid: value.uid,
    extension: value.extension.toLocaleLowerCase(),
    bytes,
    refreshedAt: new Date(value.refreshedAt).toISOString(),
  }
}

function parseProjectEntry(value: unknown): NetworkResourceProjectEntry {
  const resources: Record<string, NetworkResourceCacheEntry> = {}
  if (isRecord(value) && isRecord(value.resources)) {
    for (const [source, candidate] of Object.entries(value.resources)) {
      const url = normalizeNetworkResourceUrl(source)
      const entry = parseCacheEntry(candidate)
      if (url && entry) resources[url] = entry
    }
  }
  const lastUsedAt = isRecord(value) && typeof value.lastUsedAt === 'string'
    && Number.isFinite(Date.parse(value.lastUsedAt))
    ? new Date(value.lastUsedAt).toISOString()
    : EPOCH
  return { lastUsedAt, resources }
}

/** 清单读不懂时就是空的：缓存丢了只是要重新下载，不该拦住任何东西。 */
export function parseNetworkResourceCacheIndex(value: unknown): NetworkResourceCacheIndex {
  const projects: Record<string, NetworkResourceProjectEntry> = {}
  if (!isRecord(value) || !isRecord(value.projects)) return { projects }
  for (const [key, candidate] of Object.entries(value.projects)) {
    if (key) projects[key] = parseProjectEntry(candidate)
  }
  return { projects }
}

const CONTENT_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'font/otf': '.otf',
  'font/ttf': '.ttf',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'application/font-woff': '.woff',
}

export function networkResourceExtension(url: string, contentType?: string | null): string {
  const normalized = normalizeNetworkResourceUrl(url)
  if (normalized) {
    const match = /(?:^|\/)\.?.*?(\.[a-z0-9]{1,10})$/i.exec(new URL(normalized).pathname)
    if (match?.[1] && EXTENSION_PATTERN.test(match[1])) return match[1].toLocaleLowerCase()
  }
  const mime = contentType?.split(';', 1)[0]?.trim().toLocaleLowerCase() ?? ''
  return CONTENT_TYPE_EXTENSIONS[mime] ?? '.bin'
}
