import { describe, expect, it, vi } from 'vitest'
import type { FileSystemService } from './fileSystemService'
import {
  ensureProjectStructure,
  initializeProjectStructure,
} from './projectStructureService'

function createFileSystem(initial: Record<string, 'file' | 'directory' | 'symlink'> = {}) {
  const entries = new Map(Object.entries(initial))
  const writes = new Map<string, string>()
  const fs = {
    fileExists: vi.fn(async (path: string) => entries.has(path)),
    getFileInfo: vi.fn(async (path: string) => {
      const kind = entries.get(path)
      if (!kind) throw new Error(`Missing: ${path}`)
      return { isFile: kind === 'file', isDirectory: kind === 'directory', isSymlink: kind === 'symlink' }
    }),
    createDirectory: vi.fn(async (path: string) => { entries.set(path, 'directory') }),
    writeFile: vi.fn(async (path: string, content: string) => {
      entries.set(path, 'file')
      writes.set(path, content)
    }),
    renameFile: vi.fn(async (source: string, target: string) => {
      const moved = [...entries].filter(([path]) => path === source || path.startsWith(`${source}/`))
      for (const [path] of moved) entries.delete(path)
      for (const [path, kind] of moved) entries.set(`${target}${path.slice(source.length)}`, kind)
    }),
    deleteFile: vi.fn(async (path: string) => {
      for (const key of [...entries.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) entries.delete(key)
      }
    }),
  } as unknown as FileSystemService
  return { fs, entries, writes }
}

describe('projectStructureService', () => {
  it('builds a complete project internally and commits it with one rename', async () => {
    const { fs, entries, writes } = createFileSystem()
    await initializeProjectStructure(fs, 'D:/Cards', () => 'test')

    expect(fs.renameFile).toHaveBeenCalledWith('D:/Cards/.opencard-init-test', 'D:/Cards/.opencard')
    expect(entries.get('D:/Cards/.opencard/fonts')).toBe('directory')
    expect(entries.get('D:/Cards/.opencard/icons')).toBe('directory')
    expect(entries.get('D:/Cards/.opencard/packages')).toBe('directory')
    expect(entries.get('D:/Cards/.opencard/project.json')).toBe('file')
    expect([...writes.keys()].sort()).toEqual([
      'D:/Cards/.opencard-init-test/fonts/fonts.json',
      'D:/Cards/.opencard-init-test/icons/icons.json',
      'D:/Cards/.opencard-init-test/locale.json',
      'D:/Cards/.opencard-init-test/project.json',
    ])
    expect(writes.get('D:/Cards/.opencard-init-test/project.json')).toBe('{}\n')
  })

  it('repairs missing managed entries without overwriting existing files', async () => {
    const { fs, entries } = createFileSystem({
      'D:/Cards/.opencard': 'directory',
      'D:/Cards/.opencard/project.json': 'file',
    })
    await ensureProjectStructure(fs, 'D:/Cards')

    expect(entries.get('D:/Cards/.opencard/locale.json')).toBe('file')
    expect(entries.get('D:/Cards/.opencard/fonts')).toBe('directory')
    expect(fs.writeFile).not.toHaveBeenCalledWith('D:/Cards/.opencard/project.json', expect.anything())
  })

  it('ignores extra root files and rejects unsafe managed paths without writing', async () => {
    const extra = createFileSystem({ 'D:/Cards/.ocfonts': 'file' })
    await initializeProjectStructure(extra.fs, 'D:/Cards')
    expect(extra.entries.get('D:/Cards/.ocfonts')).toBe('file')
    expect(extra.entries.get('D:/Cards/.opencard/project.json')).toBe('file')

    const unsafe = createFileSystem({ 'D:/Cards/.opencard': 'symlink' })
    await expect(initializeProjectStructure(unsafe.fs, 'D:/Cards')).rejects.toThrow('Invalid OpenCard project directory')
    expect(unsafe.fs.createDirectory).not.toHaveBeenCalled()
  })

  it('cleans up the temporary directory when initial creation fails', async () => {
    const { fs, entries } = createFileSystem()
    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('disk full'))
    await expect(initializeProjectStructure(fs, 'D:/Cards', () => 'failed')).rejects.toThrow('disk full')
    expect(fs.deleteFile).toHaveBeenCalledWith('D:/Cards/.opencard-init-failed')
    expect(entries.has('D:/Cards/.opencard-init-failed')).toBe(false)
    expect(entries.has('D:/Cards/.opencard')).toBe(false)
  })
})
