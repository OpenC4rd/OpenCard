import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  saveFile: vi.fn(),
  writeFile: vi.fn(),
  readExternalFile: vi.fn(),
}))

vi.mock('./projectStore', () => ({
  useProjectStore: () => ({
    projectPath: { value: 'D:/old-project' },
    readFile: mocks.readFile,
    saveFile: mocks.saveFile,
  }),
}))

vi.mock('../services/fileSystemService', () => ({
  fileSystemService: {
    writeFile: mocks.writeFile,
    readFile: mocks.readExternalFile,
  },
}))

import { createEditorSessionManager } from './editorSessionManager'

describe('editorSessionManager project switching', () => {
  it('coalesces pending reads without stealing a later selection', async () => {
    const store = createEditorSessionManager()
    let finish!: (content: string) => void
    mocks.readFile.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve }))
    const first = store.open('slow.ocdocument')
    const duplicate = store.open('slow.ocdocument')
    const selected = store.createDraftSession()
    finish('{}')
    const session = await first
    expect(await duplicate).toBe(session)
    expect(store.activeSession.value).toBe(selected)
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    session.updateViewState('card-designer', { mode: 'instance' })
    store.remapSessionPaths('slow.ocdocument', 'renamed.ocdocument')
    expect(store.sessions.value.find(item => item.state.path === 'renamed.ocdocument')).toBe(session)
    expect(session.state.viewState['card-designer']).toEqual({ mode: 'instance' })
    store.dispose()
  })

  it('disposes an open result arriving after application release', async () => {
    const store = createEditorSessionManager()
    let finish!: (content: string) => void
    mocks.readFile.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve }))
    const pending = store.open('slow.ocdocument')
    store.dispose()
    finish('{}')
    expect((await pending).disposed).toBe(true)
    expect(store.sessions.value).toEqual([])
  })

  beforeEach(() => {
    const store = createEditorSessionManager()
    for (const session of store.sessions.value) {
      store.closeSession(session.state.id)
    }
    vi.clearAllMocks()
    mocks.readFile.mockResolvedValue('{"project":"old"}')
    mocks.saveFile.mockResolvedValue(undefined)
    mocks.writeFile.mockResolvedValue(undefined)
    mocks.readExternalFile.mockResolvedValue('{"external":true}')
  })

  it('closes workspace sessions and keeps external ones on project close', async () => {
    const store = createEditorSessionManager()
    const workspaceSession = await store.open('main.ocdocument')
    const externalSession = await store.open('D:/outside/card.ocdocument')

    store.closeWorkspaceSessions()

    expect(store.sessions.value.some((session) => session.state.id === workspaceSession.state.id)).toBe(false)
    expect(store.sessions.value.map((session) => session.state.id)).toEqual([externalSession.state.id])
    expect(store.activeSessionId.value).toBe(externalSession.state.id)
    store.closeSession(externalSession.state.id)
  })

  it('closes sessions at and below a deleted workspace path', async () => {
    const store = createEditorSessionManager()
    const retained = await store.open('other.ocdocument')
    const removed = await store.open('cards/main.ocdocument')

    store.closeSessionsByPath('cards')

    expect(store.sessions.value.map((session) => session.state.id)).toEqual([retained.state.id])
    expect(store.activeSessionId.value).toBe(retained.state.id)
    expect(store.sessions.value.some((session) => session.state.id === removed.state.id)).toBe(false)
    store.closeSession(retained.state.id)
  })

  it('opens absolute paths outside the project as external sessions', async () => {
    const store = createEditorSessionManager()
    const session = await store.open('D:/outside/card.ocdocument')

    expect(session.state).toMatchObject({
      resourceKind: 'external',
      path: 'D:/outside/card.ocdocument',
      draftContent: '{"external":true}',
    })
    expect(mocks.readExternalFile).toHaveBeenCalledWith('D:/outside/card.ocdocument')
    expect(mocks.readFile).not.toHaveBeenCalled()
    store.closeSession(session.state.id)
  })

  it('opens font and unsupported sessions without reading binary content as text', async () => {
    const store = createEditorSessionManager()
    const fontSession = await store.open('assets/Brand.woff2')
    const unsupportedSession = await store.open('assets/archive.bin')

    expect(fontSession.state).toMatchObject({ editorId: 'font-preview', draftContent: '' })
    expect(unsupportedSession.state).toMatchObject({ editorId: 'unsupported-file', draftContent: '' })
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.readExternalFile).not.toHaveBeenCalled()

    store.closeSession(fontSession.state.id)
    store.closeSession(unsupportedSession.state.id)
  })
})
