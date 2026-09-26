/**
 * 模块说明：
 * - 网上资源（卡片引用的 https 图片/字体）在本机的缓存：下载、按 URL 复用、以及淘汰。
 * 职责边界：
 * - 只管缓存；决定"哪些 URL 该下"是 networkResourceManager 的事。
 *
 * 布局（见 docs/存储布局.md）：`<软件存储>/cache/network/` 下**一个** `index.json` 加一堆项目目录，
 * 项目目录名由项目路径直接推导，因此清单里不需要任何"路径 → 目录名"的映射表。
 * 整个目录都是派生数据：删掉只会让下次重新下载。
 */
import { Channel, invoke } from '@tauri-apps/api/core'
import { basename, join } from '@tauri-apps/api/path'
import { toKeySlug } from '../../../shared/model/keySlug'
import {
  APP_CACHE_NETWORK_DIRECTORY_NAME,
  resolveAppCachePath,
} from '../../../shared/storage/appStoragePaths'
import { fileSystemService, type FileSystemService } from '../../workspace/services/fileSystemService'
import {
  networkResourceExtension,
  normalizeNetworkResourceProjectPath,
  normalizeNetworkResourceUrl,
  parseNetworkResourceCacheIndex,
  projectCacheBytes,
  type NetworkResourceCacheEntry,
  type NetworkResourceCacheIndex,
  type NetworkResourceProjectEntry,
} from '../model/networkResourceCache'

/** 清单文件名。缓存根里只有它一个文件，其余都是项目目录。 */
const INDEX_FILE_NAME = 'index.json'
const EPOCH = new Date(0).toISOString()

export type CachedNetworkResource = {
  url: string
  path: string
  refreshedAt: string
}

export interface NetworkResourceCacheProject {
  getCached(url: string): Promise<CachedNetworkResource | null>
  refresh(url: string): Promise<CachedNetworkResource>
}

type DownloadResult = {
  contentType?: string | null
  receivedBytes: number
}

type DownloadTransport = (
  url: string,
  destinationPath: string,
  /** 缓存根：下载只能落在这里面，所以校验它的也是同一个根。 */
  cacheRoot: string,
) => Promise<DownloadResult>

type CacheServiceDependencies = {
  fs: FileSystemService
  download: DownloadTransport
  cacheRoot: () => Promise<string>
  projectKey: (projectPath: string) => Promise<string>
  joinPath: (...segments: string[]) => Promise<string>
  randomUuid: () => string
  now: () => Date
}

/**
 * 下载进度目前没有界面消费，但 Rust 命令要求这个通道存在，所以照旧带上一个空通道。
 */
async function defaultDownload(
  url: string,
  destinationPath: string,
  cacheRoot: string,
): Promise<DownloadResult> {
  return await invoke<DownloadResult>('download_network_resource', {
    url,
    destinationPath,
    cacheRoot,
    onProgress: new Channel(),
  })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 项目目录名：项目自己的名字让人能认出它，路径哈希让人不会把两个同名项目混成一个。
 * 名字直接从输入算出来，所以项目改名或移动只是换一个缓存目录，靠淘汰收掉旧的。
 */
async function defaultProjectKey(projectPath: string): Promise<string> {
  const name = toKeySlug(await basename(projectPath), 'project')
  return `${name}-${(await sha256Hex(projectPath)).slice(0, 8)}`
}

const defaultDependencies: CacheServiceDependencies = {
  fs: fileSystemService,
  download: defaultDownload,
  cacheRoot: () => resolveAppCachePath(APP_CACHE_NETWORK_DIRECTORY_NAME),
  projectKey: defaultProjectKey,
  joinPath: join,
  randomUuid: () => crypto.randomUUID(),
  now: () => new Date(),
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

export class NetworkResourceCacheService {
  private readonly dependencies: CacheServiceDependencies
  private rootPromise: Promise<string> | null = null
  private indexPromise: Promise<NetworkResourceCacheIndex> | null = null
  private mutationQueue = Promise.resolve()
  private readonly projects = new Map<string, Promise<NetworkResourceCacheProject>>()

  constructor(dependencies: Partial<CacheServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  async forProject(projectPath: string): Promise<NetworkResourceCacheProject> {
    const projectIdentity = normalizeNetworkResourceProjectPath(projectPath)
    if (!projectIdentity) throw new Error('Network resource cache requires an absolute project path')
    let pending = this.projects.get(projectIdentity)
    if (!pending) {
      pending = this.openProject(projectIdentity)
      this.projects.set(projectIdentity, pending)
    }
    try {
      return await pending
    } catch (error) {
      this.projects.delete(projectIdentity)
      throw error
    }
  }

  /**
   * 只该在软件没在用这些缓存时调用（启动维护一处）。它删索引之外的孤儿目录，
   * 把指向已消失目录的条目清掉，并在超上限时按"最后一次用到"淘汰整个项目目录。
   * 上限由调用方按设置给出。
   */
  async prune(maxBytes: number): Promise<void> {
    const root = await this.root()
    if (!await this.dependencies.fs.fileExists(root)) return
    const index = await this.loadIndex()
    const directories = (await this.dependencies.fs.readDirectory(root))
      .filter(entry => entry.isDirectory && !entry.isSymlink)
      .map(entry => entry.name)

    const orphanDirectories = directories.filter(name => !(name in index.projects))
    const missingDirectories = Object.keys(index.projects).filter(key => !directories.includes(key))
    const cachedDirectories = directories.filter(name => name in index.projects)
    const oldestFirst = [...cachedDirectories].sort((left, right) => (
      index.projects[left]!.lastUsedAt.localeCompare(index.projects[right]!.lastUsedAt)
    ))
    let total = cachedDirectories.reduce((sum, name) => sum + projectCacheBytes(index.projects[name]!), 0)
    const overLimit: string[] = []
    for (const name of oldestFirst) {
      if (total <= maxBytes) break
      overLimit.push(name)
      total -= projectCacheBytes(index.projects[name]!)
    }

    for (const name of [...orphanDirectories, ...overLimit]) {
      await this.dependencies.fs.deleteFile(await this.dependencies.joinPath(root, name))
    }
    const dropped = new Set([...missingDirectories, ...overLimit])
    if (dropped.size > 0) {
      await this.commit(current => ({
        projects: Object.fromEntries(
          Object.entries(current.projects).filter(([key]) => !dropped.has(key)),
        ),
      }))
    }
  }

  /** 缓存占用的字节数，取索引里的簿记；给人看的度量，不遍历磁盘。 */
  async usage(): Promise<number> {
    const index = await this.loadIndex()
    return Object.values(index.projects).reduce((total, project) => total + projectCacheBytes(project), 0)
  }

  /** 缓存目录被外部清掉之后丢掉记忆，否则下一次写入会落到一个已经不存在的目录里。 */
  forget(): void {
    this.rootPromise = null
    this.indexPromise = null
    this.projects.clear()
  }

  private async root(): Promise<string> {
    this.rootPromise ??= this.dependencies.cacheRoot()
    return await this.rootPromise
  }

  private async indexPath(): Promise<string> {
    return await this.dependencies.joinPath(await this.root(), INDEX_FILE_NAME)
  }

  private async readJson(path: string): Promise<unknown> {
    if (!await this.dependencies.fs.fileExists(path)) return null
    try {
      return parseJson(await this.dependencies.fs.readFile(path))
    } catch {
      return null
    }
  }

  private async writeJsonAtomically(path: string, value: unknown): Promise<void> {
    const temporaryPath = `${path}.${this.dependencies.randomUuid()}.tmp`
    await this.dependencies.fs.writeFile(temporaryPath, JSON.stringify(value, null, 2))
    try {
      await this.dependencies.fs.renameFile(temporaryPath, path)
    } catch (error) {
      if (await this.dependencies.fs.fileExists(temporaryPath)) await this.dependencies.fs.deleteFile(temporaryPath)
      throw error
    }
  }

  private async loadIndex(): Promise<NetworkResourceCacheIndex> {
    if (!this.indexPromise) {
      this.indexPromise = (async () => {
        const root = await this.root()
        await this.dependencies.fs.createDirectory(root)
        return parseNetworkResourceCacheIndex(await this.readJson(await this.indexPath()))
      })()
    }
    return await this.indexPromise
  }

  /** 索引的读改写串行化：两个项目同时刷新时不会互相覆盖对方的条目。 */
  private async commit(build: (current: NetworkResourceCacheIndex) => NetworkResourceCacheIndex): Promise<void> {
    const run = this.mutationQueue.catch(() => undefined).then(async () => {
      const next = build(await this.loadIndex())
      await this.writeJsonAtomically(await this.indexPath(), next)
      this.indexPromise = Promise.resolve(next)
    })
    this.mutationQueue = run
    await run
  }

  private async openProject(projectIdentity: string): Promise<NetworkResourceCacheProject> {
    const cacheKey = await this.dependencies.projectKey(projectIdentity)
    const directory = await this.dependencies.joinPath(await this.root(), cacheKey)
    await this.dependencies.fs.createDirectory(directory)

    const refreshRequests = new Map<string, Promise<CachedNetworkResource>>()
    const loadEntry = async (): Promise<NetworkResourceProjectEntry> => (
      (await this.loadIndex()).projects[cacheKey] ?? { lastUsedAt: EPOCH, resources: {} }
    )
    const resourcePath = async (entry: NetworkResourceCacheEntry): Promise<string> => (
      await this.dependencies.joinPath(directory, `${entry.uid}${entry.extension}`)
    )
    const getCached = async (source: string): Promise<CachedNetworkResource | null> => {
      const url = normalizeNetworkResourceUrl(source)
      if (!url) return null
      const entry = (await loadEntry()).resources[url]
      if (!entry) return null
      const path = await resourcePath(entry)
      return await this.dependencies.fs.fileExists(path) ? { url, path, refreshedAt: entry.refreshedAt } : null
    }
    const refresh = async (source: string): Promise<CachedNetworkResource> => {
      const url = normalizeNetworkResourceUrl(source)
      if (!url) throw new Error('Network resources must use a valid HTTPS URL')
      const existingRequest = refreshRequests.get(url)
      if (existingRequest) return await existingRequest
      const result = (async () => {
        const known = (await loadEntry()).resources[url]
        const uid = known?.uid ?? this.dependencies.randomUuid()
        const temporaryPath = await this.dependencies.joinPath(
          directory,
          `${uid}.${this.dependencies.randomUuid()}.download`,
        )
        let committed!: CachedNetworkResource
        try {
          const download = await this.dependencies.download(url, temporaryPath, await this.root())
          const extension = known?.extension ?? networkResourceExtension(url, download.contentType)
          const finalPath = await this.dependencies.joinPath(directory, `${uid}${extension}`)
          const backupPath = await this.dependencies.joinPath(directory, `${uid}.backup`)
          const hasExistingFile = Boolean(known) && await this.dependencies.fs.fileExists(finalPath)
          if (hasExistingFile) await this.dependencies.fs.copyFile(finalPath, backupPath)
          try {
            await this.dependencies.fs.renameFile(temporaryPath, finalPath)
          } catch (error) {
            if (await this.dependencies.fs.fileExists(backupPath)) await this.dependencies.fs.deleteFile(backupPath)
            throw error
          }
          const refreshedAt = this.dependencies.now().toISOString()
          try {
            await this.commit(current => {
              const project = current.projects[cacheKey] ?? { lastUsedAt: refreshedAt, resources: {} }
              return {
                projects: {
                  ...current.projects,
                  [cacheKey]: {
                    lastUsedAt: refreshedAt,
                    resources: {
                      ...project.resources,
                      [url]: { uid, extension, bytes: download.receivedBytes, refreshedAt },
                    },
                  },
                },
              }
            })
          } catch (error) {
            if (hasExistingFile && await this.dependencies.fs.fileExists(backupPath)) {
              await this.dependencies.fs.renameFile(backupPath, finalPath)
            }
            throw error
          }
          if (await this.dependencies.fs.fileExists(backupPath)) await this.dependencies.fs.deleteFile(backupPath)
          committed = { url, path: finalPath, refreshedAt }
        } finally {
          if (await this.dependencies.fs.fileExists(temporaryPath)) {
            await this.dependencies.fs.deleteFile(temporaryPath)
          }
        }
        return committed
      })()
      refreshRequests.set(url, result)
      void result.finally(() => refreshRequests.delete(url)).catch(() => undefined)
      return await result
    }

    return {
      getCached,
      refresh,
    }
  }
}

export const networkResourceCacheService = new NetworkResourceCacheService()
