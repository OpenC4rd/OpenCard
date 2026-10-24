import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  pickSavePath: vi.fn(),
}))

vi.mock('./projectStore', () => ({
  useProjectStore: () => ({
    projectPath: { value: 'D:/project' },
    readFile: vi.fn(async () => '{}'),
    saveFile: vi.fn(),
    saveProjectConfiguration: vi.fn(),
    saveProjectFontRegistry: vi.fn(),
    saveProjectIconRegistry: vi.fn(),
    saveProjectDictionary: vi.fn(),
  }),
}))

vi.mock('../services/fileSystemService', () => ({
  fileSystemService: {
    writeFile: mocks.writeFile,
    pickSavePath: mocks.pickSavePath,
  },
}))

import { createEditorSessionManager } from './editorSessionManager'

describe('editorSessionManager explicit save path', () => {
  it('serializes saves while retaining edits made during an earlier write', async () => {
    const store = createEditorSessionManager()
    const session = store.createDraftSession({ content: '{"value":1}' })
    let finish!: () => void
    let started!: () => void
    const writing = new Promise<void>(resolve => { started = resolve })
    mocks.writeFile.mockImplementationOnce(() => {
      started()
      return new Promise<void>(resolve => { finish = resolve })
    })
    const first = session.save('D:/exports/card.ocdocument')
    await writing
    session.updateContent('{"value":2}')
    const second = session.save('D:/exports/card.ocdocument')
    expect(mocks.writeFile).toHaveBeenCalledTimes(1)
    finish()
    await first
    expect(session.state.isDirty).toBe(true)
    await second
    expect(mocks.writeFile).toHaveBeenLastCalledWith('D:/exports/card.ocdocument', '{"value":2}')
    expect(session.state.isDirty).toBe(false)
    store.dispose()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.writeFile.mockResolvedValue(undefined)
  })

  it('persists a draft to the supplied path without opening Save As', async () => {
    const store = createEditorSessionManager()
    const session = store.createDraftSession({
      name: 'Draft.ocdocument',
      content: '{"draft":true}',
    })

    await session.save('D:/exports/Draft.ocdocument')

    expect(mocks.pickSavePath).not.toHaveBeenCalled()
    expect(mocks.writeFile).toHaveBeenCalledWith('D:/exports/Draft.ocdocument', '{"draft":true}')
    expect(store.sessions.value.find(candidate => candidate.state.id === session.state.id)?.state).toMatchObject({
      resourceKind: 'external',
      path: 'D:/exports/Draft.ocdocument',
      savedContent: '{"draft":true}',
      draftContent: '{"draft":true}',
      isDirty: false,
    })

    store.closeSession(session.state.id)
  })

  it('uses the current OpenCard document name across draft display and Save As', async () => {
    const store = createEditorSessionManager()
    const session = store.createDraftSession({
      name: 'Untitled-1.ocdocument',
      content: JSON.stringify({ type: 'card-document', name: 'Current Card' }),
    })
    mocks.pickSavePath.mockResolvedValueOnce(null)

    expect(session.state.name).toBe('Current Card.ocdocument')
    expect(store.sessions.value.find(candidate => candidate.state.id === session.state.id)?.state.name)
      .toBe('Current Card.ocdocument')

    await expect(session.save()).resolves.toBe('cancelled')

    store.closeSession(session.state.id)
  })

  it('updates only an OpenCard draft name when its document name changes', () => {
    const store = createEditorSessionManager()
    const session = store.createDraftSession({
      name: 'Untitled-1.ocdocument',
      content: JSON.stringify({ type: 'card-document', name: 'Before' }),
    })

    session.updateContent(JSON.stringify({ type: 'card-document', name: 'After' }),
    )

    const updated = store.sessions.value.find(candidate => candidate.state.id === session.state.id)
    expect(updated?.state.name).toBe('After.ocdocument')
    expect(updated?.state.isDirty).toBe(true)

    store.closeSession(session.state.id)
  })
})
