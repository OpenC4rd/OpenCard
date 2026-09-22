import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  readExternalFile: vi.fn(),
  pickSavePath: vi.fn(),
}))

vi.mock('./projectStore', () => ({
  useProjectStore: () => ({
    projectPath: { value: 'D:/project' },
    readFile: mocks.readFile,
    saveFile: vi.fn(async () => undefined),
  }),
}))

vi.mock('../services/fileSystemService', () => ({
  fileSystemService: {
    readFile: mocks.readExternalFile,
    writeFile: vi.fn(async () => undefined),
    pickSavePath: mocks.pickSavePath,
  },
}))

import { useEditorSessionStore } from './editorSessionStore'

function cardDocumentContent(name: string): string {
  return JSON.stringify({ type: 'card-document', name, faces: {} })
}

/** 一份编辑器会声明的呈现，用来验证会话把它整份存下来。 */
const PACKAGE_PRESENTATION = {
  title: '包',
  description: '查看包信息和对外提供的资源。',
  icon: 'file.package' as const,
  iconTone: 'config' as const,
}

describe('editorSessionStore presentation', () => {
  beforeEach(() => {
    const store = useEditorSessionStore()
    for (const session of store.sessions.value) {
      store.closeSession(session.id)
    }
    vi.clearAllMocks()
    mocks.readFile.mockResolvedValue(cardDocumentContent('card'))
    mocks.readExternalFile.mockResolvedValue(cardDocumentContent('external'))
  })

  it('opens a file under its own identity and carries no presentation', async () => {
    const store = useEditorSessionStore()
    const session = await store.openFile('D:/project/.opencard/packages/packages.json')

    expect(session.name).toBe('packages.json')
    expect(session.presentation).toBeUndefined()
  })

  it('holds the presentation its editor declares, and every reader sees that one', async () => {
    const store = useEditorSessionStore()
    const session = await store.openFile('D:/project/.opencard/packages/packages.json')

    store.setSessionPresentation(session.id, PACKAGE_PRESENTATION)

    expect(store.activeSession.value?.presentation).toEqual(PACKAGE_PRESENTATION)
    expect(store.sessions.value.find(candidate => candidate.id === session.id)?.presentation)
      .toEqual(PACKAGE_PRESENTATION)
  })

  it('leaves the session object alone when the same presentation is declared again', async () => {
    const store = useEditorSessionStore()
    const session = await store.openFile('D:/project/.opencard/packages/packages.json')
    store.setSessionPresentation(session.id, PACKAGE_PRESENTATION)
    const before = store.sessions.value.find(candidate => candidate.id === session.id)

    store.setSessionPresentation(session.id, { ...PACKAGE_PRESENTATION })

    expect(store.sessions.value.find(candidate => candidate.id === session.id)).toBe(before)
  })

  it('ignores a declaration for a session that is not open', async () => {
    const store = useEditorSessionStore()
    const session = await store.openFile('D:/project/.opencard/packages/packages.json')

    store.setSessionPresentation('missing-session', PACKAGE_PRESENTATION)

    expect(store.sessions.value.find(candidate => candidate.id === session.id)?.presentation).toBeUndefined()
  })

  it('keeps the declaration while the content changes', () => {
    const store = useEditorSessionStore()
    const draft = store.createDraftSession({ name: 'draft.ocdocument' })
    store.setSessionPresentation(draft.id, { title: '草稿占位', description: '正在编辑', icon: 'file.opencard' })

    store.updateDraftContent(draft.id, cardDocumentContent('红桃A'))

    const updated = store.sessions.value.find(candidate => candidate.id === draft.id)
    // 草稿身份跟着文档里的名字走，呈现不参与这个推导，仍是编辑器声明的那一份。
    expect(updated?.name).toBe('红桃A.ocdocument')
    expect(updated?.presentation?.title).toBe('草稿占位')
  })

  it('drops the declaration when a rename rewrites the file name', async () => {
    const store = useEditorSessionStore()
    const session = await store.openFile('D:/project/cards/main.ocdocument')
    store.setSessionPresentation(session.id, { title: '主卡', description: '', icon: 'file.opencard' })

    store.remapSessionPaths('D:/project/cards', 'D:/project/archive')

    const renamed = store.sessions.value.find(candidate => candidate.id === session.id)
    expect(renamed?.name).toBe('main.ocdocument')
    expect(renamed?.path).toBe('D:/project/archive/main.ocdocument')
    expect(renamed?.presentation).toBeUndefined()
  })

  it('keeps the declaration when an existing file is saved in place', async () => {
    const store = useEditorSessionStore()
    const session = await store.openFile('D:/project/.opencard/locale.json')
    store.setSessionPresentation(session.id, { title: '字典', description: '维护词条', icon: 'file.dictionary' })
    store.updateDraftContent(session.id, '{"entries":[]}')

    await store.saveSession(session.id)

    const saved = store.sessions.value.find(candidate => candidate.id === session.id)
    expect(saved?.name).toBe('locale.json')
    expect(saved?.presentation?.title).toBe('字典')
    expect(saved?.isDirty).toBe(false)
  })

  it('drops the declaration when the file name changes on save', async () => {
    const store = useEditorSessionStore()
    const draft = store.createDraftSession()
    store.setSessionPresentation(draft.id, { title: '未命名占位', description: '', icon: 'file.opencard' })
    store.updateDraftContent(draft.id, cardDocumentContent('卡片'))

    await store.saveSession(draft.id, 'D:/project/cards/卡片-final.ocdocument')

    const saved = store.sessions.value.find(candidate => candidate.id === draft.id)
    expect(saved?.name).toBe('卡片-final.ocdocument')
    // 会话换了身份，旧呈现随之作废；编辑器（若还开着）会按新身份重新声明。
    expect(saved?.presentation).toBeUndefined()
  })
})
