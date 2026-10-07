import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_SETTINGS,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../../settings/model/appSettings'
import { MemorySettingsPersistence } from '../../settings/services/settingsPersistence'
import { createAppSettingsStore } from '../../settings/store/appSettingsStore'
import { SHELL_SIDEBAR_COLLAPSE_THRESHOLD } from '../shellSidebarConfig'
import { useShellSidebarLayout } from './useShellSidebarLayout'

const PROJECT_PATH = 'D:/projects/demo'

function createSidebarLayout(options: {
  sidebarWidth?: number
  sidebarCollapsed?: boolean
  persistenceKey?: string
  viewportWidth?: number
  expandOnNarrowViewport?: boolean
} = {}) {
  const settingsStore = createAppSettingsStore(new MemorySettingsPersistence())
  settingsStore.updateShell({
    sidebarWidth: options.sidebarWidth ?? DEFAULT_APP_SETTINGS.shell.sidebarWidth,
    sidebarCollapsed: options.sidebarCollapsed ?? DEFAULT_APP_SETTINGS.shell.sidebarCollapsed,
  })
  const persistenceKey = ref(options.persistenceKey ?? '')
  const viewportWidth = ref(options.viewportWidth ?? 1440)
  const expandOnNarrowViewport = ref(options.expandOnNarrowViewport ?? false)
  const layout = useShellSidebarLayout({
    settings: settingsStore,
    persistenceKey,
    viewportWidth,
    expandOnNarrowViewport,
  })
  return { layout, settingsStore, persistenceKey, viewportWidth, expandOnNarrowViewport }
}

describe('useShellSidebarLayout', () => {
  it('starts from the width and collapsed state stored in settings', () => {
    const { layout } = createSidebarLayout({ sidebarWidth: 320, sidebarCollapsed: true })

    expect(layout.sidebarWidth.value).toBe(320)
    expect(layout.sidebarCollapsed.value).toBe(true)
    expect(layout.effectiveSidebarCollapsed.value).toBe(true)
  })

  it('follows sidebar width changes made outside the resize interaction', async () => {
    const { layout, settingsStore } = createSidebarLayout({ sidebarWidth: 260 })

    settingsStore.updateShell({ sidebarWidth: 300 })
    await nextTick()

    expect(layout.sidebarWidth.value).toBe(300)
  })

  it('keeps the local width while a resize interaction is active', async () => {
    const { layout, settingsStore } = createSidebarLayout({ sidebarWidth: 260 })
    layout.handleSidebarResizeStart()
    layout.handleSidebarResize(300)

    settingsStore.updateShell({ sidebarWidth: 240 })
    await nextTick()

    expect(layout.sidebarWidth.value).toBe(300)
  })

  it('toggles between collapsed and expanded and restores the last expanded width', () => {
    const { layout, settingsStore } = createSidebarLayout({ sidebarWidth: 300 })

    layout.toggleSidebarCollapsed()
    expect(settingsStore.settings.value.shell.sidebarCollapsed).toBe(true)
    expect(layout.effectiveSidebarCollapsed.value).toBe(true)
    expect(settingsStore.settings.value.shell.sidebarWidth).toBe(300)

    settingsStore.updateShell({ sidebarWidth: 260 })
    layout.toggleSidebarCollapsed()
    expect(settingsStore.settings.value.shell.sidebarCollapsed).toBe(false)
    expect(settingsStore.settings.value.shell.sidebarWidth).toBe(300)
    expect(layout.effectiveSidebarCollapsed.value).toBe(false)
  })

  it('computes the effective collapse from settings, resize preview, and viewport', async () => {
    const { layout, expandOnNarrowViewport, viewportWidth } = createSidebarLayout({ sidebarWidth: 300 })
    expect(layout.effectiveSidebarCollapsed.value).toBe(false)

    viewportWidth.value = 900
    await nextTick()
    expect(layout.effectiveSidebarCollapsed.value).toBe(true)

    expandOnNarrowViewport.value = true
    await nextTick()
    expect(layout.effectiveSidebarCollapsed.value).toBe(false)

    expandOnNarrowViewport.value = false
    viewportWidth.value = 1440
    layout.handleSidebarResize(SHELL_SIDEBAR_COLLAPSE_THRESHOLD)
    expect(layout.effectiveSidebarCollapsed.value).toBe(true)
  })

  it('clamps the dragged width and persists it with the collapsed state on resize end', async () => {
    const { layout, settingsStore } = createSidebarLayout({ sidebarWidth: 300 })

    layout.handleSidebarResizeStart()
    expect(layout.sidebarResizeActive.value).toBe(true)

    layout.handleSidebarResize(MAX_SIDEBAR_WIDTH + 80)
    expect(layout.sidebarWidth.value).toBe(MAX_SIDEBAR_WIDTH)

    layout.handleSidebarResize(MIN_SIDEBAR_WIDTH - 20)
    expect(layout.sidebarWidth.value).toBe(MIN_SIDEBAR_WIDTH)

    layout.handleSidebarResizeEnd()
    await nextTick()

    expect(settingsStore.settings.value.shell.sidebarWidth).toBe(MIN_SIDEBAR_WIDTH)
    expect(settingsStore.settings.value.shell.sidebarCollapsed).toBe(false)
    expect(layout.sidebarResizeActive.value).toBe(false)
    expect(layout.sidebarResizeToggleAnimating.value).toBe(false)
  })

  it('collapses on a drag below the threshold and keeps the expanded width', async () => {
    const { layout, settingsStore } = createSidebarLayout({ sidebarWidth: 300 })

    layout.handleSidebarResizeStart()
    layout.handleSidebarResize(SHELL_SIDEBAR_COLLAPSE_THRESHOLD - 1)

    expect(layout.sidebarWidth.value).toBe(300)
    expect(layout.effectiveSidebarCollapsed.value).toBe(true)
    expect(layout.sidebarResizeToggleAnimating.value).toBe(true)

    layout.handleSidebarResizeEnd()
    await nextTick()

    expect(settingsStore.settings.value.shell.sidebarCollapsed).toBe(true)
    expect(settingsStore.settings.value.shell.sidebarWidth).toBe(300)
    expect(layout.sidebarResizeActive.value).toBe(false)
  })

  it('clears the resize animation flag only for the sidebar grid transition', () => {
    const { layout } = createSidebarLayout()
    layout.handleSidebarResizeStart()
    layout.handleSidebarResize(SHELL_SIDEBAR_COLLAPSE_THRESHOLD - 1)

    layout.handleSidebarTransitionEnd(new TransitionEvent('transitionend', { propertyName: 'width' }))
    expect(layout.sidebarResizeToggleAnimating.value).toBe(true)

    layout.handleSidebarTransitionEnd(
      new TransitionEvent('transitionend', { propertyName: 'grid-template-columns' }),
    )
    expect(layout.sidebarResizeToggleAnimating.value).toBe(false)
  })

  it('stores the reported sidebar layout for the open project', () => {
    const { layout, settingsStore } = createSidebarLayout({ persistenceKey: PROJECT_PATH })
    expect(layout.sidebarPersistedLayout.value).toBeUndefined()

    const reported = { collapsedLists: ['project-files'], listWeights: { 'project-files': 2 } }
    layout.handleSidebarLayoutChange(reported)

    expect(settingsStore.settings.value.projectCreation.workspaceStates[PROJECT_PATH]?.sidebar)
      .toEqual(reported)
    expect(layout.sidebarPersistedLayout.value).toEqual(reported)

    reported.collapsedLists.push('timeline')
    expect(layout.sidebarPersistedLayout.value?.collapsedLists).toEqual(['project-files'])
  })

  it('ignores the reported sidebar layout while no project is open', () => {
    const { layout, settingsStore } = createSidebarLayout()

    layout.handleSidebarLayoutChange({ collapsedLists: ['project-files'], listWeights: {} })

    expect(settingsStore.settings.value.projectCreation.workspaceStates).toEqual({})
    expect(layout.sidebarPersistedLayout.value).toBeUndefined()
  })
})
