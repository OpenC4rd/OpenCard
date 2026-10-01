/**
 * 模块说明：
 * - 封装 Tauri 文件系统 API 提供统一文件服务接口
 * 职责边界：
 * - 只负责 IO 适配 不处理路径合法性业务规则
 */
import { open, save } from '@tauri-apps/plugin-dialog'
import {
  readTextFile,
  writeTextFile,
  readFile as readBinaryFile,
  writeFile as writeBinaryFile,
  readDir,
  mkdir,
  remove,
  rename,
  copyFile,
  exists,
  lstat,
  type DirEntry,
  type FileInfo,
} from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'

/**
 * Directory-walk cost for the last measurement window. A recursive walk issues one directory read
 * per directory and the recursion itself runs here rather than in Rust, so "how many reads and how
 * long" is the difference between a slow disk and a slow walk.
 */
export type DirectoryWalkMetrics = { reads: number, entries: number, totalMs: number, worstMs: number, worstPath: string }

const directoryWalkMetrics: DirectoryWalkMetrics = { reads: 0, entries: 0, totalMs: 0, worstMs: 0, worstPath: '' }

/** Reads and resets the directory-walk counters, so a caller can measure just its own window. */
export function takeDirectoryWalkMetrics(): DirectoryWalkMetrics {
  const taken = { ...directoryWalkMetrics }
  directoryWalkMetrics.reads = 0
  directoryWalkMetrics.entries = 0
  directoryWalkMetrics.totalMs = 0
  directoryWalkMetrics.worstMs = 0
  directoryWalkMetrics.worstPath = ''
  return taken
}

/**
 * Caller-supplied recursion policy: a directory whose project-relative path satisfies
 * `skipDirectory` is still listed, but its own children are not read. That lets a caller keep a
 * directory visible while refusing to walk a subtree it has no use for.
 */
export interface ReadDirectoryEntriesOptions {
  skipDirectory?: (relativePath: string) => boolean
}

export interface FileSystemService {
  openProject(title: string): Promise<string | null>
  pickDirectory(title: string): Promise<string | null>
  pickFile(options: {
    title: string
    fileTypeName: string
    extensions?: string[]
    defaultPath?: string
  }): Promise<string | null>
  pickFiles?(options: {
    title: string
    fileTypeName: string
    extensions: string[]
    defaultPath?: string
  }): Promise<string[]>
  pickSavePath(options: {
    defaultPath: string
    fileTypeName?: string
    extensions?: string[]
    title?: string
  }): Promise<string | null>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  readBinaryFile(path: string): Promise<Uint8Array>
  writeBinaryFile(path: string, content: Uint8Array): Promise<void>
  copyFile(sourcePath: string, targetPath: string): Promise<void>
  deleteFile(path: string): Promise<void>
  trashFile(path: string): Promise<void>
  renameFile(oldPath: string, newPath: string): Promise<void>
  revealInFileManager(path: string): Promise<void>
  openWithDefaultApp(path: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  getFileInfo(path: string): Promise<FileInfo>
  readDirectory(path: string, recursive?: boolean): Promise<DirEntry[]>
  readDirectoryEntries(
    path: string,
    depth?: number,
    basePath?: string,
    options?: ReadDirectoryEntriesOptions,
  ): Promise<DirEntry[]>
  createDirectory(path: string): Promise<void>
  startWatching(path: string): Promise<void>
  stopWatching(): Promise<void>
}

class FileSystemServiceImpl implements FileSystemService {
  async openProject(title: string): Promise<string | null> {
    return await this.pickDirectory(title)
  }

  async pickDirectory(title: string): Promise<string | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title,
    })

    return selected as string | null
  }

  async pickFile(options: {
    title: string
    fileTypeName: string
    extensions?: string[]
    defaultPath?: string
  }): Promise<string | null> {
    const selected = await open({
      directory: false,
      multiple: false,
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.extensions?.length ? [{ name: options.fileTypeName, extensions: options.extensions }] : undefined,
    })
    return selected as string | null
  }

  async pickFiles(options: {
    title: string
    fileTypeName: string
    extensions: string[]
    defaultPath?: string
  }): Promise<string[]> {
    const selected = await open({
      directory: false,
      multiple: true,
      title: options.title,
      defaultPath: options.defaultPath,
      filters: [{ name: options.fileTypeName, extensions: options.extensions }],
    })
    return Array.isArray(selected) ? selected : selected ? [selected] : []
  }

  async readFile(path: string): Promise<string> {
    return await readTextFile(path)
  }

  async pickSavePath(options: {
    defaultPath: string
    fileTypeName?: string
    extensions?: string[]
    title?: string
  }): Promise<string | null> {
    const selected = await save({
      defaultPath: options.defaultPath,
      title: options.title,
      filters: options.extensions && options.extensions.length > 0
        ? [{ name: options.fileTypeName ?? 'File', extensions: options.extensions }]
        : undefined,
    })

    return selected as string | null
  }

  async writeFile(path: string, content: string): Promise<void> {
    await writeTextFile(path, content)
  }

  async readBinaryFile(path: string): Promise<Uint8Array> {
    return await readBinaryFile(path)
  }

  async writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
    await writeBinaryFile(path, content)
  }

  async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    await copyFile(sourcePath, targetPath)
  }

  async deleteFile(path: string): Promise<void> {
    await remove(path, { recursive: true })
  }

  async trashFile(path: string): Promise<void> {
    await invoke('trash_path', { path })
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await rename(oldPath, newPath)
  }

  async revealInFileManager(path: string): Promise<void> {
    await invoke('reveal_path', { path })
  }

  async openWithDefaultApp(path: string): Promise<void> {
    await invoke('open_path', { path })
  }

  async fileExists(path: string): Promise<boolean> {
    return await exists(path)
  }

  async getFileInfo(path: string): Promise<FileInfo> {
    return await lstat(path)
  }

  async readDirectory(path: string, recursive: boolean = false): Promise<DirEntry[]> {
    if (!recursive) {
      return await readDir(path)
    }

    return await this.readDirectoryEntries(path, Number.POSITIVE_INFINITY)
  }

  async readDirectoryEntries(
    path: string,
    depth: number = 1,
    basePath: string = '',
    options: ReadDirectoryEntriesOptions = {},
  ): Promise<DirEntry[]> {
    const maxDepth = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : Number.POSITIVE_INFINITY
    const result: DirEntry[] = []

    async function readRecursive(dirPath: string, currentBasePath: string, currentDepth: number) {
      const readStartedAt = performance.now()
      const entries = await readDir(dirPath)
      const readMs = performance.now() - readStartedAt
      directoryWalkMetrics.reads += 1
      directoryWalkMetrics.entries += entries.length
      directoryWalkMetrics.totalMs += readMs
      if (readMs > directoryWalkMetrics.worstMs) {
        directoryWalkMetrics.worstMs = readMs
        directoryWalkMetrics.worstPath = dirPath
      }

      for (const entry of entries) {
        const relativePath = currentBasePath ? `${currentBasePath}/${entry.name}` : entry.name
        result.push({
          ...entry,
          name: relativePath,
        })

        if (entry.isDirectory && !entry.isSymlink && currentDepth < maxDepth
          && !options.skipDirectory?.(relativePath)) {
          const fullPath = `${dirPath}/${entry.name}`
          await readRecursive(fullPath, relativePath, currentDepth + 1)
        }
      }
    }

    await readRecursive(path, basePath, 1)
    return result
  }

  async createDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true })
  }

  async startWatching(path: string): Promise<void> {
    await invoke('watch_directory', { path })
  }

  async stopWatching(): Promise<void> {
    await invoke('stop_watching')
  }
}

export const fileSystemService = new FileSystemServiceImpl()
