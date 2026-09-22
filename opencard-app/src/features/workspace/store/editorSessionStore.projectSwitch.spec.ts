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

import { useEditorSessionStore } from './editorSessionStore'

describe('editorSessionStore project switching', () => {
  beforeEach(() => {
    const store = useEditorSessionStore()
    for (const session of store.sessions.value) {
      store.closeSession(session.id)
    }
    vi.clearAllMocks()
    mocks.readFile.mockResolvedValue('{"project":"old"}')
    mocks.saveFile.mockResolvedValue(undefined)
    mocks.writeFile.mockResolvedValue(undefined)
    mocks.readExternalFile.mockResolvedValue('{"external":true}')
  })

  it('closes workspace sessions and keeps external ones on project close', async () => {
    const store = useEditorSessionStore()
    const workspaceSession = await store.open('main.ocdocument')
    const externalSession = await store.open('D:/outside/card.ocdocument')

    store.closeWorkspaceSessions()

    expect(store.sessions.value.some((session) => session.id === workspaceSession.id)).toBe(false)
    expect(store.sessions.value.map((session) => session.id)).toEqual([externalSession.id])
    expect(store.activeSessionId.value).toBe(externalSession.id)
    store.closeSession(externalSession.id)
  })

  it('closes sessions at and below a deleted workspace path', async () => {
    const store = useEditorSessionStore()
    const retained = await store.open('other.ocdocument')
    const removed = await store.open('cards/main.ocdocument')

    store.closeSessionsByPath('cards')

    expect(store.sessions.value.map((session) => session.id)).toEqual([retained.id])
    expect(store.activeSessionId.value).toBe(retained.id)
    expect(store.sessions.value.some((session) => session.id === removed.id)).toBe(false)
    store.closeSession(retained.id)
  })

  it('opens absolute paths outside the project as external sessions', async () => {
    const store = useEditorSessionStore()
    const session = await store.open('D:/outside/card.ocdocument')

    expect(session).toMatchObject({
      resourceKind: 'external',
      path: 'D:/outside/card.ocdocument',
      draftContent: '{"external":true}',
    })
    expect(mocks.readExternalFile).toHaveBeenCalledWith('D:/outside/card.ocdocument')
    expect(mocks.readFile).not.toHaveBeenCalled()
    store.closeSession(session.id)
  })

  it('opens font and unsupported sessions without reading binary content as text', async () => {
    const store = useEditorSessionStore()
    const fontSession = await store.open('assets/Brand.woff2')
    const unsupportedSession = await store.open('assets/archive.bin')

    expect(fontSession).toMatchObject({ editorId: 'font-preview', draftContent: '' })
    expect(unsupportedSession).toMatchObject({ editorId: 'unsupported-file', draftContent: '' })
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.readExternalFile).not.toHaveBeenCalled()

    store.closeSession(fontSession.id)
    store.closeSession(unsupportedSession.id)
  })
})
