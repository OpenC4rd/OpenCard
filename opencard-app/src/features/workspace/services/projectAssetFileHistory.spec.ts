import { describe, expect, it, vi } from 'vitest'
import type { FileSystemService } from './fileSystemService'
import { stageProjectAssetFiles } from './projectAssetFileHistory'

vi.mock('../../../shared/storage/appStoragePaths', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/storage/appStoragePaths')>(),
  resolveAppStoragePath: vi.fn(async (...segments: string[]) => `C:/Users/Test/.opencard/${segments.join('/')}`),
  resolveAppCachePath: vi.fn(async (...segments: string[]) => `C:/Users/Test/.opencard/cache/${segments.join('/')}`),
}))

function createFileSystem(initialFiles: readonly string[]) {
  const files = new Set(initialFiles)
  const directories = new Set<string>()
  const copyFile = vi.fn(async (source: string, target: string) => {
    if (!files.has(source)) throw new Error(`missing: ${source}`)
    files.add(target)
  })
  const deleteFile = vi.fn(async (path: string) => {
    files.delete(path)
    for (const file of files) {
      if (file.startsWith(`${path}/`)) files.delete(file)
    }
    directories.delete(path)
  })
  const fs = {
    copyFile,
    deleteFile,
    createDirectory: vi.fn(async (path: string) => { directories.add(path) }),
    fileExists: vi.fn(async (path: string) => files.has(path) || directories.has(path)),
  } as unknown as FileSystemService
  return { fs, files, directories, copyFile, deleteFile }
}

describe('project asset file history', () => {
  it('stages across storage volumes and follows undo, redo, and release', async () => {
    const original = 'D:/Cards/.opencard/assets/Brand.png'
    const staged = 'C:/Users/Test/.opencard/cache/staged/remove-1/0-Brand.png'
    const { fs, files, directories, copyFile } = createFileSystem([original])

    const resource = await stageProjectAssetFiles([original], 'remove-1', fs)
    expect(files.has(original)).toBe(false)
    expect(files.has(staged)).toBe(true)
    expect(copyFile).toHaveBeenCalledWith(original, staged)

    await resource.undo()
    expect(files.has(original)).toBe(true)
    expect(files.has(staged)).toBe(false)

    await resource.redo()
    expect(files.has(original)).toBe(false)
    expect(files.has(staged)).toBe(true)

    await resource.release()
    expect(files.has(staged)).toBe(false)
    expect(directories.has('C:/Users/Test/.opencard/cache/staged/remove-1')).toBe(false)
  })

  it('deduplicates source paths within one history operation', async () => {
    const original = 'D:/Cards/.opencard/assets/Brand.png'
    const { fs, copyFile } = createFileSystem([original])
    await stageProjectAssetFiles([original, original], 'remove-2', fs)
    expect(copyFile).toHaveBeenCalledTimes(1)
  })

  it('restores the moved files when a later file in the batch is missing', async () => {
    const present = 'D:/Cards/.opencard/assets/A.png'
    const missing = 'D:/Cards/.opencard/assets/Gone.png'
    const { fs, files } = createFileSystem([present])

    await expect(stageProjectAssetFiles([present, missing], 'remove-3', fs)).rejects.toThrow()
    // The first file is back where it started, and nothing is left staged.
    expect(files.has(present)).toBe(true)
    expect(files.has('C:/Users/Test/.opencard/cache/staged/remove-3/0-A.png')).toBe(false)
  })
})
