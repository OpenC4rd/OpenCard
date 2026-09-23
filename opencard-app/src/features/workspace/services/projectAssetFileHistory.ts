import { normalizePath } from '../../../shared/model/filePath'
import { APP_CACHE_STAGED_DIRECTORY_NAME, resolveAppCachePath } from '../../../shared/storage/appStoragePaths'
import type { HistoryResourceLifecycle } from '../../editor-runtime/history/contentHistory'
import { fileSystemService, type FileSystemService } from './fileSystemService'

type StagedFile = {
  originalPath: string
  stagedPath: string
}

/**
 * Moves project asset files out of the project into the app's staged cache, so removing a registry
 * entry can be undone. The bytes are copied before the originals are dropped and the staged copies
 * are released once the history entry falls out of the undo stack; a failure at any point restores
 * what it moved.
 *
 * 暂存属于"随进程生死"的东西：撤销栈本身不跨进程，所以启动维护会把整个 `cache/staged` 清空。
 */
export async function stageProjectAssetFiles(
  originalPaths: readonly string[],
  operationId: string = crypto.randomUUID(),
  fs: FileSystemService = fileSystemService,
  label = 'asset',
): Promise<HistoryResourceLifecycle> {
  const uniquePaths = [...new Set(originalPaths.map(normalizePath))]
  if (uniquePaths.length === 0) throw new Error(`No project ${label} files were provided for staging.`)

  const operationDirectory = await resolveAppCachePath(APP_CACHE_STAGED_DIRECTORY_NAME, operationId)
  const files = uniquePaths.map((originalPath, index): StagedFile => ({
    originalPath,
    stagedPath: `${normalizePath(operationDirectory)}/${index}-${basename(originalPath, label)}`,
  }))

  await fs.createDirectory(operationDirectory)
  try {
    await transferFiles(files, 'originalPath', 'stagedPath', fs)
  } catch (error) {
    const originalsIntact = (await Promise.all(files.map(file => fs.fileExists(file.originalPath)))).every(Boolean)
    if (originalsIntact) await removeDirectoryIfPresent(operationDirectory, fs)
    throw error
  }

  return {
    undo: async () => transferFiles(files, 'stagedPath', 'originalPath', fs),
    redo: async () => transferFiles(files, 'originalPath', 'stagedPath', fs),
    release: async () => removeDirectoryIfPresent(operationDirectory, fs),
  }
}

async function transferFiles(
  files: readonly StagedFile[],
  sourceKey: keyof StagedFile,
  targetKey: keyof StagedFile,
  fs: FileSystemService,
): Promise<void> {
  const copied: StagedFile[] = []
  try {
    for (const file of files) {
      const source = file[sourceKey]
      const target = file[targetKey]
      if (!await fs.fileExists(source)) throw new Error(`History source does not exist: ${source}`)
      if (await fs.fileExists(target)) throw new Error(`History target already exists: ${target}`)
      await fs.copyFile(source, target)
      copied.push(file)
    }
  } catch (error) {
    await Promise.allSettled(copied.map(file => fs.deleteFile(file[targetKey])))
    throw error
  }

  const removed: StagedFile[] = []
  try {
    for (const file of files) {
      await fs.deleteFile(file[sourceKey])
      removed.push(file)
    }
  } catch (error) {
    const restoredTargets = new Set<string>()
    for (const file of removed) {
      try {
        await fs.copyFile(file[targetKey], file[sourceKey])
        restoredTargets.add(file[targetKey])
      } catch {
        // Keep the staged copy when restoration fails so the user's file bytes are not lost.
      }
    }
    await Promise.allSettled(copied
      .filter(file => !removed.includes(file) || restoredTargets.has(file[targetKey]))
      .map(file => fs.deleteFile(file[targetKey])))
    throw error
  }
}

async function removeDirectoryIfPresent(path: string, fs: FileSystemService): Promise<void> {
  if (await fs.fileExists(path)) await fs.deleteFile(path)
}

function basename(path: string, label: string): string {
  const normalized = normalizePath(path)
  return normalized.slice(normalized.lastIndexOf('/') + 1) || `${label}-file`
}
