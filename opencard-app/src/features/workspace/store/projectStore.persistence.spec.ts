import { afterEach, describe, expect, it, vi } from 'vitest'
import * as disk from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const native = vi.hoisted(() => ({ home: '' }))

// Replace only the native bridge: project loading, sessions and persistence run unchanged.
vi.mock('@tauri-apps/plugin-fs', async () => {
  const fs = await import('node:fs/promises')
  return {
    exists: async (path: string) => { try { await fs.lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error } },
    readTextFile: (path: string) => fs.readFile(path, 'utf8'),
    writeTextFile: (path: string, content: string) => fs.writeFile(path, content),
    readDir: async (path: string) => (await fs.readdir(path, { withFileTypes: true })).map(entry => ({
      name: entry.name, isFile: entry.isFile(), isDirectory: entry.isDirectory(), isSymlink: entry.isSymbolicLink(),
    })),
    lstat: async (path: string) => { const info = await fs.lstat(path); return { isFile: info.isFile(), isDirectory: info.isDirectory(), isSymlink: info.isSymbolicLink() } },
    mkdir: (path: string, options: { recursive: boolean }) => fs.mkdir(path, options),
  }
})
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: async (command: string) => {
    if (command === 'watch_directory') return 'test-watcher'
    if (command === 'stop_watching') return
    throw new Error(`Unexpected native command: ${command}`)
  },
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }))
vi.mock('@tauri-apps/api/path', async importOriginal => ({
  ...await importOriginal<typeof import('@tauri-apps/api/path')>(),
  homeDir: async () => native.home,
  join: async (...parts: string[]) => parts.join('/'),
}))

vi.mock('../services/projectIndexWorker', async () => {
  const { sortDirectoryEntries } = await import('../services/projectIndexWorkerRuntime')
  return { sortProjectDirectory: async (entries: import('@tauri-apps/plugin-fs').DirEntry[]) => sortDirectoryEntries(entries), disposeProjectIndexWorker: () => {} }
})

import { useProjectStore } from './projectStore'
import { createEditorSessionManager } from './editorSessionManager'
import { PROJECT_INTERNAL_FILE_DEFAULTS } from '../model/projectStructure'

describe('project files on disk', () => {
  const project = useProjectStore()
  let temporaryRoot = ''
  let sessions: ReturnType<typeof createEditorSessionManager> | undefined

  afterEach(async () => {
    sessions?.dispose()
    await project.setProjectPath('')
    if (temporaryRoot) await disk.rm(temporaryRoot, { recursive: true, force: true })
  })

  it('publishes the file index only when directory entries change', async () => {
    temporaryRoot = (await disk.mkdtemp(join(tmpdir(), 'opencard-index-'))).replace(/\\/g, '/')
    native.home = `${temporaryRoot}/user`
    const root = `${temporaryRoot}/project`
    await disk.mkdir(root)
    await disk.writeFile(`${root}/card.ocdocument`, 'before')
    await project.setProjectPath(root)
    const before = project.indexedEntries.value

    await project.saveFile('card.ocdocument', 'after')
    expect(await disk.readFile(`${root}/card.ocdocument`, 'utf8')).toBe('after')
    expect(project.indexedEntries.value).toBe(before)

    await project.saveFile('new.txt', 'new')
    expect(project.indexedEntries.value).not.toBe(before)
    expect(project.indexedEntries.value.map(entry => entry.name)).toContain('new.txt')
    await disk.unlink(`${root}/new.txt`)
    await disk.mkdir(`${root}/new.txt`)
    await project.readDirectoryEntries('')
    expect(project.indexedEntries.value.find(entry => entry.name === 'new.txt')?.isDirectory).toBe(true)
    await disk.rmdir(`${root}/new.txt`)
    await project.readDirectoryEntries('')
    expect(project.indexedEntries.value.map(entry => entry.name)).not.toContain('new.txt')
  })

  it('keeps managed defaults in memory until each file is saved', async () => {
    temporaryRoot = (await disk.mkdtemp(join(tmpdir(), 'opencard-lazy-'))).replace(/\\/g, '/')
    native.home = `${temporaryRoot}/user`
    const root = `${temporaryRoot}/project`
    await disk.mkdir(root)
    await project.setProjectPath(root)
    sessions = createEditorSessionManager()

    for (const [relativePath, content] of Object.entries(PROJECT_INTERNAL_FILE_DEFAULTS)) {
      const session = await sessions.open(`${root}/${relativePath}`)
      expect(session.state.draftContent).toBe(content)
      expect(session.state.isDirty).toBe(false)
    }
    await sessions.open(`${root}/.opencard/packages`)
    await project.readDirectoryEntries('')
    expect(await disk.readdir(root)).toEqual([])
    await expect(project.readFile('missing.txt')).rejects.toThrow()

    const fonts = await sessions.open(`${root}/.opencard/fonts/fonts.json`)
    expect(await fonts.save()).toBe('saved')
    expect(await disk.readdir(`${root}/.opencard`)).toEqual(['fonts'])
    expect(await disk.readdir(`${root}/.opencard/fonts`)).toEqual(['fonts.json'])

    sessions.dispose()
    await project.setProjectPath('')
    await project.setProjectPath(root)
    expect(await disk.readdir(`${root}/.opencard`)).toEqual(['fonts'])
    expect(await project.readFile('.opencard/project.json')).toBe('{}\n')
    await project.saveProjectConfiguration('.opencard/project.json', '{"name":"Saved"}')
    expect(await disk.readdir(`${root}/.opencard`)).toEqual(['fonts', 'project.json'])
    expect(JSON.parse(await disk.readFile(`${root}/.opencard/project.json`, 'utf8')).name).toBe('Saved')

    await project.disposeResources()
    expect(project.resourceEnvironment.value).toBeNull()
    await project.setProjectPath(root)
    expect(project.resourceEnvironment.value?.state.value.rootPath).toBe(root)
    expect(project.isWatching.value).toBe(true)
  })
})
