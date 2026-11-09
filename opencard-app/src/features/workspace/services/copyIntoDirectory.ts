/**
 * 模块说明：
 * - 把外部文件或文件夹复制进某个目录：名字原样保留，撞名排下一个编号，从不覆盖
 * 职责边界：
 * - 只做复制与命名 不知道项目 不刷新索引 调用方负责失效自己的目录缓存
 */
import { getPathBasename, normalizePath } from '../../../shared/model/filePath'
import type { FileSystemService } from './fileSystemService'

type CopyFileSystem = Pick<FileSystemService, 'fileExists' | 'getFileInfo' | 'copyFile' | 'createDirectory' | 'readDirectory'>

export type CopyIntoDirectoryResult = {
  /** 复制后落在目标目录里的绝对路径，按来源顺序。 */
  added: string[]
  skipped: number
  failed: number
}

/** Windows 盘符路径与 UNC 路径不分大小写，其余按原样比较。 */
export function pathIdentity(path: string): string {
  const normalized = normalizePath(path)
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

export function isSameOrDescendantIdentity(path: string, ancestor: string): boolean {
  const target = pathIdentity(path)
  const root = pathIdentity(ancestor)
  return target === root || target.startsWith(`${root}/`)
}

export function isValidEntryName(name: string): boolean {
  if (!name || name === '.' || name === '..') return false
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(name) || /[. ]$/.test(name)) return false
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)
}

/** 下一个没被占用的名字：`名字 (2).ext`、`名字 (3).ext`…… */
export async function findAvailableName(
  fs: Pick<FileSystemService, 'fileExists'>,
  targetDirectory: string,
  fileName: string,
): Promise<string> {
  const dotIndex = fileName.lastIndexOf('.')
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const suffix = dotIndex > 0 ? fileName.slice(dotIndex) : ''
  let index = 2
  while (await fs.fileExists(`${targetDirectory}/${stem} (${index})${suffix}`)) index += 1
  return `${stem} (${index})${suffix}`
}

async function copyDirectory(fs: CopyFileSystem, sourceDirectory: string, targetDirectory: string): Promise<void> {
  await fs.createDirectory(targetDirectory)
  for (const entry of await fs.readDirectory(sourceDirectory)) {
    // 符号链接不复制：它要么复制一棵别人的子树，要么绕回自己。
    if (entry.isSymlink) continue
    const sourcePath = `${sourceDirectory}/${entry.name}`
    const targetPath = `${targetDirectory}/${entry.name}`
    if (entry.isDirectory) await copyDirectory(fs, sourcePath, targetPath)
    else await fs.copyFile(sourcePath, targetPath)
  }
}

/** 复制一项；返回落地路径，来源名非法或目标在来源之内（会无限套娃）时返回 null。 */
export async function copyEntryIntoDirectory(
  fs: CopyFileSystem,
  sourcePath: string,
  destinationDirectory: string,
): Promise<string | null> {
  const source = normalizePath(sourcePath)
  const destination = normalizePath(destinationDirectory)
  const sourceName = getPathBasename(source)
  if (!isValidEntryName(sourceName) || isSameOrDescendantIdentity(destination, source)) return null

  const info = await fs.getFileInfo(source)
  const targetName = await fs.fileExists(`${destination}/${sourceName}`)
    ? await findAvailableName(fs, destination, sourceName)
    : sourceName
  const targetPath = `${destination}/${targetName}`
  if (info.isDirectory) await copyDirectory(fs, source, targetPath)
  else await fs.copyFile(source, targetPath)
  return targetPath
}

export async function copyEntriesIntoDirectory(
  fs: CopyFileSystem,
  sourcePaths: readonly string[],
  destinationDirectory: string,
  onError?: (sourcePath: string, error: unknown) => void,
): Promise<CopyIntoDirectoryResult> {
  const result: CopyIntoDirectoryResult = { added: [], skipped: 0, failed: 0 }
  for (const sourcePath of sourcePaths) {
    if (!normalizePath(sourcePath)) {
      result.skipped += 1
      continue
    }
    try {
      const target = await copyEntryIntoDirectory(fs, sourcePath, destinationDirectory)
      if (target) result.added.push(target)
      else result.skipped += 1
    } catch (error) {
      result.failed += 1
      onError?.(sourcePath, error)
    }
  }
  return result
}
