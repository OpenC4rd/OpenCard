import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  saveProjectConfiguration: vi.fn(),
  saveProjectDictionary: vi.fn(),
}))
vi.mock('./projectStore', () => ({
  useProjectStore: () => ({
    projectPath: { value: 'D:/project' },
    readFile: mocks.readFile,
    saveFile: vi.fn(),
    saveProjectConfiguration: mocks.saveProjectConfiguration,
    saveProjectDictionary: mocks.saveProjectDictionary,
  }),
}))

import { useEditorSessionStore } from './editorSessionStore'

describe('editorSessionStore project profile manual save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readFile.mockResolvedValue('{}')
    mocks.saveProjectConfiguration.mockImplementation(async (_path: string, content: string) => content)
    mocks.saveProjectDictionary.mockImplementation(async (_path: string, content: string) => content)
  })

  it('keeps profile edits dirty until explicitly saved', async () => {
    const store = useEditorSessionStore()
    const session = await store.open('.opencard/project.json')
    store.updateDraftContent(session.id, '{"name":"Demo"}')
    expect(mocks.saveProjectConfiguration).not.toHaveBeenCalled()
    expect(store.sessions.value.find(candidate => candidate.id === session.id)?.isDirty).toBe(true)
    await store.saveSession(session.id)
    expect(mocks.saveProjectConfiguration).toHaveBeenCalledWith('.opencard/project.json', '{"name":"Demo"}')
    expect(store.sessions.value.find(candidate => candidate.id === session.id)?.isDirty).toBe(false)
  })

  it('preserves a newer draft while an explicit save is running', async () => {
    let finishSave: ((content: string) => void) | undefined
    mocks.saveProjectConfiguration.mockImplementationOnce(() => new Promise<string>(resolve => { finishSave = resolve }))
    const store = useEditorSessionStore()
    const session = await store.open('.opencard/project.json')
    store.updateDraftContent(session.id, '{"name":"First"}')
    const saving = store.saveSession(session.id)
    store.updateDraftContent(session.id, '{"name":"Second"}')
    finishSave?.('{"name":"First"}')
    await saving
    expect(store.sessions.value.find(candidate => candidate.id === session.id)).toMatchObject({
      savedContent: '{"name":"First"}',
      draftContent: '{"name":"Second"}',
      isDirty: true,
    })
  })

  it('keeps dictionary edits isolated until explicit save', async () => {
    const store = useEditorSessionStore()
    const session = await store.open('.opencard/locale.json')
    store.updateDraftContent(session.id, '{"base":{"title":"Hello"}}')
    expect(mocks.saveProjectDictionary).not.toHaveBeenCalled()

    await store.saveSession(session.id)
    expect(mocks.saveProjectDictionary).toHaveBeenCalledWith(
      '.opencard/locale.json',
      '{"base":{"title":"Hello"}}',
    )
  })
})
