import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { appOutputEntries, clearAppOutputEntries, publishAppOutput } from '../../logging/appOutput'
import { initializeAppPages, useAppPages } from './useAppPages'
import { useAppProjectActions } from '../services/appProjectActions'
import { useShellNavigation } from './useShellNavigation'
import { useShellProgressTasks } from './useShellProgressTasks'
import { networkResourceCacheService } from '../../network-resources/services/networkResourceCacheService'
import type { EditorIssueSnapshot } from '../../editor-runtime/model/editorIssue'

// Monaco loads browser workers; these tests exercise page runtimes, not its DOM.
vi.mock('../../../components/editors/MonacoEditor.vue', () => ({ default: {} }))
vi.mock('../../../shared/storage/appCache', async importOriginal => ({
  ...await importOriginal<typeof import('../../../shared/storage/appCache')>(),
  measureAppCacheDirectories: async () => ({ snapshots: 0, staged: 0 }),
}))

afterEach(() => {
  useShellNavigation().selectSpace('welcome')
  useShellProgressTasks().removeTask('page-test')
  clearAppOutputEntries()
  vi.restoreAllMocks()
})

describe('application page ownership', () => {
  it('switches all page projections while retaining workbench state and global channels', async () => {
    vi.spyOn(networkResourceCacheService, 'usage').mockResolvedValue(0)
    expect(() => useAppPages()).toThrow('Application pages have not been initialized')
    const listeners = vi.spyOn(window, 'addEventListener')
    let app!: ReturnType<typeof useAppPages>
    const wrapper = mount(defineComponent({ setup() {
      app = initializeAppPages(async () => undefined)
      return () => h('div')
    } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
    try {
      await flushPromises()
      const listenerCount = listeners.mock.calls.length
      expect(useAppPages()).toBe(app)
      expect(initializeAppPages(async () => undefined)).toBe(app)
      expect(useAppPages().pages.welcome).toBe(app.pages.welcome)
      expect(listeners.mock.calls.length).toBe(listenerCount)
      const navigation = useShellNavigation()
      expect(app.pages.welcome.header.value).toBeNull()
      expect(app.pages.workbench.header.value).toBeNull()
      await app.pages.workbench.menuContribution!.value.file!.onAction('new-open-card')
      const session = (app.pages.workbench.contentProps.value.editor as { props: { session: EditorSession } }).props.session
      session.updateContent( '{"base":{"title":"edited"}}')
      session.updateViewState('image-preview', { pixelated: true })
      session.setMode( 'diff', { beforeRevisionId: 'before', afterRevisionId: 'after' })
      navigation.selectSpace('workbench')
      await nextTick()
      const workbench = app.currentPage.value
      const oldEditor = workbench.contentProps.value.editor as { props: Record<string, unknown> }
      const snapshot: EditorIssueSnapshot = { scopeKey: 'test', scopeOrder: ['test'], issues: [{
        id: 'invalid', type: 'test.invalid', severity: 'warning', locationText: 'notes', description: 'Invalid',
      }] }
      ;(oldEditor.props.onIssueSnapshot as (value: EditorIssueSnapshot) => void)(snapshot)
      expect(workbench.bottomPanel?.value.count).toBe(1)
      publishAppOutput({ severity: 'info', message: 'background output' })
      useShellProgressTasks().setTask({ key: 'page-test', title: 'Background task', progress: 0.5 })

      for (const space of ['welcome', 'settings', 'market', 'test'] as const) {
        navigation.selectSpace(space)
        await nextTick()
        expect(app.currentPage.value).toBe(app.pages[space])
        if (space === 'welcome') expect(app.currentPage.value.header.value).toBeNull()
        else expect(app.currentPage.value.header.value?.title).toBeTruthy()
        expect(app.currentPage.value.bottomPanel).toBeUndefined()
        expect(app.pages.workbench.menuContribution?.value.edit?.actions[0]).toMatchObject({ disabled: true })
      }
      navigation.selectSpace('workbench')
      await nextTick()
      expect(app.currentPage.value).toBe(workbench)
      expect((workbench.contentProps.value.editor as { props: { session: EditorSession } }).props.session.state).toMatchObject({ id: session.state.id, draftContent: '{"base":{"title":"edited"}}', mode: 'diff',
        diff: { beforeRevisionId: 'before', afterRevisionId: 'after' }, viewState: { 'image-preview': { pixelated: true } } })
      expect(workbench.bottomPanel?.value.count).toBe(1)
      expect(appOutputEntries.value.some(entry => entry.message === 'background output')).toBe(true)
      expect(useShellProgressTasks().tasks.value.some(task => task.key === 'page-test')).toBe(true)

      const diffAction = workbench.header.value!.onAction!
      await diffAction('diff.exit')
      expect(session.state.mode).toBe('edit')
      const onHeaderAction = vi.fn()
      const editor = workbench.contentProps.value.editor as { capture: (value: unknown) => void }
      editor.capture({ headerActions: [{ key: 'local', title: 'Local' }], onHeaderAction })
      await nextTick()
      const action = workbench.header.value!.onAction!
      await action('local')
      expect(onHeaderAction).toHaveBeenCalledTimes(1)
      navigation.selectSpace('settings')
      await action('local')
      expect(onHeaderAction).toHaveBeenCalledTimes(1)
      navigation.selectSpace('workbench')

      await app.pages.workbench.menuContribution!.value.file!.onAction('new-open-card')
      const second = (workbench.contentProps.value.editor as { props: { session: EditorSession } }).props.session
      await action('local')
      await diffAction('diff.exit')
      expect(onHeaderAction).toHaveBeenCalledTimes(1)
      ;(oldEditor.props.onIssueSnapshot as (value: EditorIssueSnapshot) => void)(snapshot)
      await nextTick()
      await workbench.bottomPanel!.value.activate(`workspace-issue-session:${session.state.id}`)
      expect((workbench.contentProps.value.editor as { props: { session: EditorSession } }).props.session).toBe(second)
      expect(workbench.bottomPanel!.value.count).toBe(1)
    } finally { wrapper.unmount() }
    expect(() => useAppPages()).toThrow('Application pages have not been initialized')
    expect(() => useAppProjectActions()).toThrow('Application project actions have not been initialized')
  })
})
