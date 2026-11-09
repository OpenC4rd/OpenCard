import { describe, expect, it, vi } from 'vitest'
import { copyEntriesIntoDirectory, findAvailableName, isValidEntryName } from './copyIntoDirectory'

function createFs(existing: string[], directories: Record<string, { name: string, isDirectory?: boolean, isSymlink?: boolean }[]> = {}) {
  const taken = new Set(existing)
  return {
    fileExists: vi.fn(async (path: string) => taken.has(path)),
    getFileInfo: vi.fn(async (path: string) => ({ isDirectory: path in directories })),
    copyFile: vi.fn(async (_from: string, to: string) => void taken.add(to)),
    createDirectory: vi.fn(async () => undefined),
    readDirectory: vi.fn(async (path: string) => directories[path] ?? []),
  } as unknown as Parameters<typeof copyEntriesIntoDirectory>[0]
}

describe('copyEntriesIntoDirectory', () => {
  it('numbers a taken name instead of overwriting it', async () => {
    const fs = createFs(['D:/P/a.png', 'D:/P/a (2).png'])
    const result = await copyEntriesIntoDirectory(fs, ['D:/Out/a.png'], 'D:/P')
    expect(result).toEqual({ added: ['D:/P/a (3).png'], skipped: 0, failed: 0 })
  })

  it('skips invalid names and a destination inside the source', async () => {
    const fs = createFs([], { 'D:/P': [] })
    const result = await copyEntriesIntoDirectory(fs, ['D:/Out/CON.png', 'D:/P'], 'D:/P/sub')
    expect(result.added).toEqual([])
    expect(result.skipped).toBe(2)
  })

  it('copies a folder recursively and leaves symlinks out', async () => {
    const fs = createFs([], {
      'D:/Out/set': [{ name: 'a.svg' }, { name: 'link', isSymlink: true }, { name: 'inner', isDirectory: true }],
      'D:/Out/set/inner': [{ name: 'b.svg' }],
    })
    const result = await copyEntriesIntoDirectory(fs, ['D:/Out/set'], 'D:/P')
    expect(result.added).toEqual(['D:/P/set'])
    expect(vi.mocked(fs.copyFile).mock.calls.map(call => call[1])).toEqual(['D:/P/set/a.svg', 'D:/P/set/inner/b.svg'])
  })

  it('counts a failing source and carries on with the rest', async () => {
    const fs = createFs([])
    vi.mocked(fs.copyFile).mockRejectedValueOnce(new Error('denied'))
    const onError = vi.fn()
    const result = await copyEntriesIntoDirectory(fs, ['D:/Out/a.png', 'D:/Out/b.png'], 'D:/P', onError)
    expect(result).toEqual({ added: ['D:/P/b.png'], skipped: 0, failed: 1 })
    expect(onError).toHaveBeenCalledWith('D:/Out/a.png', expect.any(Error))
  })
})

describe('entry names', () => {
  it('rejects reserved and unsafe names', () => {
    expect(['', '..', 'a:b', 'nul.txt', 'x.']).toSatisfy((names: string[]) => names.every(name => !isValidEntryName(name)))
    expect(isValidEntryName('sword (2).png')).toBe(true)
  })

  it('finds the next free numbered name', async () => {
    expect(await findAvailableName({ fileExists: async path => path === 'D:/P/a (2)' }, 'D:/P', 'a')).toBe('a (3)')
  })
})
