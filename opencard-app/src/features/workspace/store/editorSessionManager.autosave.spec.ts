import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import { useWorkbenchEditorHost } from '../../shell/composables/useWorkbenchEditorHost'
import ProjectCustomBlockCollectionSettingsDialog from '../../../components/editors/ProjectCustomBlockCollectionSettingsDialog.vue'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  saveProjectConfiguration: vi.fn(),
  saveProjectDictionary: vi.fn(),
  saveProjectCustomBlockRegistry: vi.fn(),
}))
vi.mock('./projectStore', () => ({
  useProjectStore: () => ({
    projectPath: { value: 'D:/project' }, resourceEnvironment: { value: null },
    readFile: mocks.readFile,
    saveFile: vi.fn(),
    saveProjectConfiguration: mocks.saveProjectConfiguration,
    saveProjectDictionary: mocks.saveProjectDictionary,
    saveProjectCustomBlockRegistry: mocks.saveProjectCustomBlockRegistry,
  }),
}))
vi.mock('../../../components/editors/MonacoEditor.vue', () => ({ default: {} }))

import { createEditorSessionManager } from './editorSessionManager'

describe('editorSessionManager project profile manual save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readFile.mockResolvedValue('{}')
    mocks.saveProjectConfiguration.mockImplementation(async (_path: string, content: string) => content)
    mocks.saveProjectDictionary.mockImplementation(async (_path: string, content: string) => content)
  })

  it('persists a real custom-block editor update through history and automatic saving, then reopens it', async () => {
    let diskContent = '{"collections":[]}'
    mocks.readFile.mockImplementation(async () => diskContent)
    mocks.saveProjectCustomBlockRegistry.mockImplementation(async (_path: string, content: string) => {
      diskContent = content
      return content
    })
    const store = createEditorSessionManager()
    const session = await store.open('D:/project/.opencard/blocks/blocks.json')
    const host = useWorkbenchEditorHost({
      activeSession: store.activeSession, comparison: ref(null), cardProps: ref({}),
      reportIssues: () => {}, openFile: () => {}, trashFile: () => {}, translate: key => key,
    })
    const wrapper = mount(defineComponent({ setup: () => () => h(host.mount.value!.component, { ...host.mount.value!.props, ref: host.mount.value!.capture }) }), {
      global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
    })
    try {
      wrapper.getComponent(ProjectCustomBlockCollectionSettingsDialog).vm.$emit('submit', { name: 'Cards', key: 'cards', sources: [] })
      await flushPromises()
      await vi.waitFor(() => expect(mocks.saveProjectCustomBlockRegistry).toHaveBeenCalledOnce())
      expect(JSON.parse(diskContent).collections).toEqual([{ key: 'cards', name: 'Cards', blocks: [] }])
      expect(store.activeSession.value?.state.isDirty).toBe(false)
      wrapper.unmount()
      store.closeSession(session.state.id)
      const reopened = await store.open('D:/project/.opencard/blocks/blocks.json')
      expect(JSON.parse(reopened.state.draftContent).collections[0].key).toBe('cards')
      store.closeSession(reopened.state.id)
    } finally { if (wrapper.exists()) wrapper.unmount(); store.dispose() }
  })

  it('keeps profile edits dirty until explicitly saved', async () => {
    const store = createEditorSessionManager()
    const session = await store.open('.opencard/project.json')
    session.updateContent('{"name":"Demo"}')
    expect(mocks.saveProjectConfiguration).not.toHaveBeenCalled()
    expect(store.sessions.value.find(candidate => candidate.state.id === session.state.id)?.state.isDirty).toBe(true)
    await session.save()
    expect(mocks.saveProjectConfiguration).toHaveBeenCalledWith('.opencard/project.json', '{"name":"Demo"}')
    expect(store.sessions.value.find(candidate => candidate.state.id === session.state.id)?.state.isDirty).toBe(false)
  })

  it('keeps normalized saved content and its undo baseline consistent', async () => {
    const store = createEditorSessionManager()
    const session = await store.open('.opencard/project.json')
    session.updateContent('{ "name": "Demo" }')
    mocks.saveProjectConfiguration.mockResolvedValueOnce('{"name":"Demo"}')
    await session.save()
    expect(session.state.draftContent).toBe('{"name":"Demo"}')
    expect(session.state.isDirty).toBe(false)
    await session.undo()
    expect(session.state.isDirty).toBe(true)
    await session.redo()
    expect(session.state.isDirty).toBe(false)
    store.dispose()
  })

  it('preserves a newer draft while an explicit save is running', async () => {
    let finishSave: ((content: string) => void) | undefined
    mocks.saveProjectConfiguration.mockImplementationOnce(() => new Promise<string>(resolve => { finishSave = resolve }))
    const store = createEditorSessionManager()
    const session = await store.open('.opencard/project.json')
    session.updateContent('{"name":"First"}')
    const saving = session.save()
    await vi.waitFor(() => expect(finishSave).toBeTypeOf('function'))
    session.updateContent('{"name":"Second"}')
    finishSave?.('{"name":"First"}')
    await saving
    expect(store.sessions.value.find(candidate => candidate.state.id === session.state.id)?.state).toMatchObject({
      savedContent: '{"name":"First"}',
      draftContent: '{"name":"Second"}',
      isDirty: true,
    })
  })

  it('does not restore an old path when a pending save finishes after rename', async () => {
    const store = createEditorSessionManager()
    const session = await store.open('.opencard/project.json')
    session.updateContent('{"name":"Demo"}')
    let finish!: (content: string) => void
    mocks.saveProjectConfiguration.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve }))
    const saving = session.save()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    store.remapSessionPaths('.opencard/project.json', '.opencard/renamed.json')
    finish('{"name":"Demo"}')
    await saving
    expect(session.state.path).toBe('.opencard/renamed.json')
    expect(store.activeSession.value).toBe(session)
    store.dispose()
  })

  it('keeps dictionary edits isolated until explicit save', async () => {
    const store = createEditorSessionManager()
    const session = await store.open('.opencard/locale.json')
    session.updateContent('{"base":{"title":"Hello"}}')
    expect(mocks.saveProjectDictionary).not.toHaveBeenCalled()

    await session.save()
    expect(mocks.saveProjectDictionary).toHaveBeenCalledWith(
      '.opencard/locale.json',
      '{"base":{"title":"Hello"}}',
    )
  })
})
