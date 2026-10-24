import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  readDir: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readDir: mocks.readDir,
  mkdir: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  exists: vi.fn(),
  lstat: vi.fn(),
}))

import { fileSystemService } from './fileSystemService'

describe('fileSystemService native file actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invoke.mockResolvedValue(undefined)
  })

  it('reveals the requested path through the native command', async () => {
    await fileSystemService.revealInFileManager('D:/cards/a.ocdocument')

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('reveal_path', { path: 'D:/cards/a.ocdocument' })
  })

  it('uses trash_path for user deletion and propagates failure', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('trash unavailable'))
    await expect(fileSystemService.trashFile('D:/cards/a.ocdocument')).rejects.toThrow('trash unavailable')
    expect(mocks.invoke).toHaveBeenCalledWith('trash_path', { path: 'D:/cards/a.ocdocument' })
  })

  it('uses the native default-app command instead of the reveal command', async () => {
    await fileSystemService.openWithDefaultApp('D:/cards/reference.bin')

    expect(mocks.invoke).toHaveBeenCalledWith('open_path', { path: 'D:/cards/reference.bin' })
    expect(mocks.invoke).not.toHaveBeenCalledWith('reveal_path', expect.anything())
  })

})

describe('fileSystemService recursive listing', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invoke.mockResolvedValue(undefined)
  })

  const tree: Record<string, { name: string, isDirectory: boolean }[]> = {
    'D:/Project': [
      { name: 'cards', isDirectory: true },
      { name: '.opencard', isDirectory: true },
    ],
    'D:/Project/cards': [{ name: 'main.ocdocument', isDirectory: false }],
    'D:/Project/.opencard': [{ name: 'icons', isDirectory: true }],
    'D:/Project/.opencard/icons': [
      { name: 'outline', isDirectory: true },
      { name: 'icons.json', isDirectory: false },
    ],
    'D:/Project/.opencard/icons/outline': [
      { name: 'warn.svg', isDirectory: false },
      { name: 'coin.svg', isDirectory: false },
    ],
  }

  it('pulls native pages sequentially and releases the cursor when aborted', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    const controller = new AbortController()
    let completePage!: (page: { entries: unknown[]; done: boolean }) => void
    let pageRequests = 0
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'cancel_project_directory') return Promise.resolve()
      pageRequests++
      return new Promise(resolve => { completePage = resolve })
    })
    const listing = fileSystemService.readDirectoryEntries('D:/Project', 1, '', { signal: controller.signal })
    const cancelled = expect(listing).rejects.toMatchObject({ name: 'AbortError' })
    expect(pageRequests).toBe(1)
    controller.abort()
    completePage({ entries: [{ name: 'stale.png', isDirectory: false, isFile: true, isSymlink: false }], done: false })
    await cancelled
    expect(pageRequests).toBe(1)
    expect(mocks.readDir).not.toHaveBeenCalled()
    expect(mocks.invoke).toHaveBeenCalledWith('cancel_project_directory', expect.objectContaining({ requestId: expect.any(String) }))
  })

  it('lists a skipped directory without reading what is inside it', async () => {
    const readPaths: string[] = []
    mocks.readDir.mockImplementation(async (path: string) => {
      readPaths.push(path)
      return (tree[path] ?? []).map(entry => ({ ...entry, isFile: !entry.isDirectory, isSymlink: false }))
    })

    const entries = await fileSystemService.readDirectoryEntries('D:/Project', Number.POSITIVE_INFINITY, '', {
      skipDirectory: relativePath => relativePath === '.opencard/icons',
    })

    // The skipped directory stays visible, but its own children are never enumerated.
    expect(entries.map(entry => entry.name)).toEqual([
      'cards',
      'cards/main.ocdocument',
      '.opencard',
      '.opencard/icons',
    ])
    expect(readPaths).not.toContain('D:/Project/.opencard/icons')
    expect(readPaths).not.toContain('D:/Project/.opencard/icons/outline')
  })
})
