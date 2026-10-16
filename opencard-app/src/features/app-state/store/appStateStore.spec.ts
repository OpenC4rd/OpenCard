import { describe, expect, it, vi } from 'vitest'
import { MemoryJsonPersistence } from '../../../shared/storage/jsonPersistence'
import { createAppStateStore } from './appStateStore'
import { createAppSettingsStore } from '../../settings/store/appSettingsStore'
import { clearAppCache } from '../../../shared/storage/appCache'

vi.mock('@tauri-apps/api/path', () => ({ homeDir: async () => '/home/test', join: async (...parts: string[]) => parts.join('/') }))

describe('appStateStore', () => {
  it('keeps recently opened projects in most-recent-first order', async () => {
    const persistence = new MemoryJsonPersistence()
    const store = createAppStateStore(persistence)
    await store.initialize()

    store.rememberRecentProject('D:\\Projects\\One\\')
    store.rememberRecentProject('D:/Projects/Two')
    store.rememberRecentProject('d:/projects/one')
    await store.flush()

    expect(store.state.value.projects.recent).toEqual([
      'd:/projects/one',
      'D:/Projects/Two',
    ])
    expect(await persistence.load()).toMatchObject({
      projects: {
        recent: ['d:/projects/one', 'D:/Projects/Two'],
      },
    })
  })

  it('forgets a recent project without touching its files', async () => {
    const persistence = new MemoryJsonPersistence()
    const store = createAppStateStore(persistence)
    await store.initialize()
    store.rememberRecentProject('D:/Projects/One')
    store.rememberRecentProject('D:/Projects/Two')
    store.updateProjects({ workspaces: { 'D:/Projects/One': { expandedDirectories: ['assets'] } } })

    store.forgetRecentProject('d:\\projects\\one\\')
    await store.flush()

    expect(store.state.value.projects.recent).toEqual(['D:/Projects/Two'])
    expect(store.state.value.projects.workspaces).not.toHaveProperty('D:/Projects/One')
  })

  it('keeps long-term state separate from unsaved preferences, preference resets, and cache cleanup', async () => {
    const preferenceFile = new MemoryJsonPersistence()
    const stateFile = new MemoryJsonPersistence()
    const settings = createAppSettingsStore(preferenceFile)
    const state = createAppStateStore(stateFile)
    await Promise.all([settings.initialize(), state.initialize()])
    settings.previewSetting('appearance.theme', 'light')
    state.rememberRecentProject('/projects/first')
    state.updateLayout({ sidebarWidth: 330 })
    await state.flush()
    expect(await preferenceFile.load()).toMatchObject({ appearance: { theme: 'system' } })

    settings.resetAll()
    await settings.flush()
    const deleteFile = vi.fn(async () => {})
    await clearAppCache({ fileExists: async () => true, deleteFile })
    expect(deleteFile.mock.calls).toHaveLength(3)
    for (const [path] of deleteFile.mock.calls as unknown as [string][]) expect(path).toContain('/cache/')
    const reloaded = createAppStateStore(stateFile)
    await reloaded.initialize()
    expect(reloaded.state.value).toMatchObject({
      layout: { sidebarWidth: 330 }, projects: { recent: ['/projects/first'] },
    })
    expect(await preferenceFile.load()).not.toHaveProperty('projects')
    expect(await stateFile.load()).not.toHaveProperty('appearance')
  })
})
