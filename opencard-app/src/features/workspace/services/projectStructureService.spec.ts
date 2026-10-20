import { describe, expect, it, vi } from 'vitest'
import type { FileSystemService } from './fileSystemService'
import { writeProjectManagementFile } from './projectStructureService'

function createFileSystem(initial: Record<string, 'file' | 'directory' | 'symlink'> = {}) {
  const entries = new Map(Object.entries(initial))
  const fs = {
    fileExists: vi.fn(async (path: string) => entries.has(path)),
    getFileInfo: vi.fn(async (path: string) => {
      const kind = entries.get(path)
      if (!kind) throw new Error(`Missing: ${path}`)
      return { isFile: kind === 'file', isDirectory: kind === 'directory', isSymlink: kind === 'symlink' }
    }),
    createDirectory: vi.fn(async (path: string) => { entries.set(path, 'directory') }),
    writeFile: vi.fn(async (path: string, _content: string) => {
      entries.set(path, 'file')
    }),
  } as unknown as FileSystemService
  return { fs, entries }
}

describe('projectStructureService', () => {
  it('writes only the requested file without filling in missing siblings', async () => {
    const { fs, entries } = createFileSystem({
      'D:/Cards/.opencard': 'directory',
      'D:/Cards/.opencard/project.json': 'file',
    })
    await writeProjectManagementFile(fs, 'D:/Cards', '.opencard/fonts/fonts.json', '{"families":[]}')

    expect(entries.get('D:/Cards/.opencard/fonts')).toBe('directory')
    expect(fs.writeFile).toHaveBeenCalledExactlyOnceWith('D:/Cards/.opencard/fonts/fonts.json', '{"families":[]}')
    expect(entries.has('D:/Cards/.opencard/locale.json')).toBe(false)
    expect(entries.has('D:/Cards/.opencard/icons')).toBe(false)
  })

  it.each([
    ['D:/Cards/.opencard', 'symlink'],
    ['D:/Cards/.opencard/fonts', 'file'],
    ['D:/Cards/.opencard/fonts/fonts.json', 'symlink'],
  ] as const)('rejects an unsafe path at %s before writing', async (path, kind) => {
    const { fs } = createFileSystem({ [path]: kind })
    await expect(writeProjectManagementFile(fs, 'D:/Cards', '.opencard/fonts/fonts.json', '{}')).rejects.toThrow('Invalid OpenCard project')
    expect(fs.createDirectory).not.toHaveBeenCalled()
    expect(fs.writeFile).not.toHaveBeenCalled()
  })
})
