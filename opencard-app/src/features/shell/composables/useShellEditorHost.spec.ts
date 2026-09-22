import { nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DictionaryEditor from '../../../components/editors/DictionaryEditor.vue'
import MonacoEditor from '../../../components/editors/MonacoEditor.vue'
import ImagePreviewEditor from '../../../components/editors/ImagePreviewEditor.vue'
import FontPreviewEditor from '../../../components/editors/FontPreviewEditor.vue'
import UnsupportedFileEditor from '../../../components/editors/UnsupportedFileEditor.vue'
import { createDefaultAppSettings } from '../../settings/model/appSettings'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { useShellEditorHost } from './useShellEditorHost'
import { editorHistoryManager, resolveEditorHistoryKind } from '../../editor-runtime/history/editorHistoryManager'

const notificationMocks = vi.hoisted(() => ({
  notifyAppError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}))

vi.mock('../../../components/editors/MonacoEditor.vue', () => ({
  default: { name: 'MockMonacoEditor' },
}))
vi.mock('../../notifications/titlebarNotices', () => notificationMocks)

function createSession(patch: Partial<EditorSession> = {}): EditorSession {
  return {
    id: 'session-a',
    resourceKind: 'draft',
    path: null,
    fileTypeId: 'opencard',
    name: 'card.ocdocument',
    editorId: 'card-designer',
    savedContent: '{}',
    draftContent: '{}',
    isDirty: false,
    isPreview: false,
    ...patch,
  }
}

function createHost(session = createSession()) {
  const activeSession = ref<EditorSession | null>(session)
  const updateDraftContent = vi.fn()
  const setSessionDirtyState = vi.fn()
  const setSessionPresentation = vi.fn()
  const updateSessionUiState = vi.fn()
  const saveActiveSession = vi.fn(async () => 'saved' as const)
  editorHistoryManager.initialize(
    session.id,
    resolveEditorHistoryKind(session.editorId),
    session.draftContent,
    (content, dirty) => {
      updateDraftContent(session.id, content)
      setSessionDirtyState(session.id, dirty)
    },
  )
  const host = useShellEditorHost({
    activeSession,
    projectPath: ref('D:/project'),
    projectProfile: ref({
      remoteResources: { mode: 'allowlist', allowedHosts: ['images.example.com'] },
    }),
    settings: ref(createDefaultAppSettings()),
    translate: (key, params) => `${key}:${String(params?.name ?? '')}`,
    sessionActions: {
      updateDraftContent,
      setSessionDirtyState,
      setSessionPresentation,
      updateSessionUiState,
      saveActiveSession,
    },
  })
  return {
    host,
    activeSession,
    updateDraftContent,
    setSessionDirtyState,
    setSessionPresentation,
    updateSessionUiState,
    saveActiveSession,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  editorHistoryManager.release('session-a')
})

describe('useShellEditorHost', () => {
  it('publishes the active editor presentation into its session', async () => {
    const { host, activeSession, setSessionPresentation } = createHost()
    const presentation = {
      title: 'Main',
      description: 'Edit the card document',
      icon: 'file.opencard' as const,
    }

    host.editorRef.value = { presentation }
    await nextTick()

    expect(setSessionPresentation).toHaveBeenCalledWith('session-a', presentation)

    // 另存为/重命名会丢掉旧呈现，而编辑器的呈现未必跟着文件变，所以身份一变要重新声明。
    setSessionPresentation.mockClear()
    activeSession.value = { ...activeSession.value!, name: 'renamed.ocdocument' }
    await nextTick()

    expect(setSessionPresentation).toHaveBeenCalledWith('session-a', presentation)
    host.dispose()
  })

  it('publishes nothing for an editor that declares no presentation', async () => {
    const { host, setSessionPresentation } = createHost()

    host.editorRef.value = {}
    await nextTick()

    expect(setSessionPresentation).not.toHaveBeenCalled()
    host.dispose()
  })

  it('projects registered editor props and resource roots', () => {
    const workspace = createHost(createSession({
      resourceKind: 'workspace',
      path: 'D:/project/cards/card.ocdocument',
    }))

    expect(workspace.host.key.value).toBe('session-a|D:/project/cards/card.ocdocument|card-designer')
    expect(workspace.host.resourceRootPath.value).toBe('D:/project')
    expect(workspace.host.props.value).toMatchObject({
      filePath: 'D:/project/cards/card.ocdocument',
      fileName: 'card.ocdocument',
      cardDesignerMode: 'design',
      alignmentSnappingEnabledByDefault: true,
      resourceRootPath: 'D:/project',
      remoteResourcePolicy: { mode: 'allowlist', allowedHosts: ['images.example.com'] },
      themeOverrides: {},
    })
    workspace.host.dispose()

    const external = createHost(createSession({
      resourceKind: 'external',
      path: 'D:/cards/card.ocdocument',
    }))
    expect(external.host.resourceRootPath.value).toBe('D:/cards')
    expect(external.host.props.value.remoteResourcePolicy).toBeUndefined()
    external.host.dispose()

    const draft = createHost()
    expect(draft.host.resourceRootPath.value).toBeNull()
    draft.host.dispose()

    const dataTable = createHost(createSession({
      uiState: { cardDesigner: { mode: 'data-table' } },
    }))
    expect(dataTable.host.cardDesignerMode.value).toBe('data-table')
    expect(dataTable.host.props.value.cardDesignerMode).toBe('data-table')
    dataTable.host.dispose()
  })

  it('does not provide a content write callback in diff mode', () => {
    const workspace = createHost(createSession({
      mode: 'diff',
      diff: { beforeRevisionId: 'abc', afterRevisionId: null },
    }))
    expect(workspace.host.props.value.mode).toBe('diff')
    expect(workspace.host.props.value['onUpdate:modelValue']).toBeUndefined()
    workspace.host.dispose()
  })

  it('keeps image files in the native preview editor during diff mode', () => {
    const image = createHost(createSession({
      resourceKind: 'workspace',
      path: 'D:/project/assets/cover.png',
      fileTypeId: 'image',
      name: 'cover.png',
      editorId: 'image-preview',
      mode: 'diff',
      diff: { beforeRevisionId: 'abc', afterRevisionId: null },
    }))

    expect(image.host.component.value).toBe(ImagePreviewEditor)
    expect(image.host.props.value).toMatchObject({
      mode: 'diff',
      filePath: 'D:/project/assets/cover.png',
      resourceRootPath: 'D:/project',
    })
    image.host.dispose()
  })

  it('uses Monaco only for explicitly supported text files', () => {
    const { host } = createHost(createSession({
      fileTypeId: 'plaintext',
      editorId: 'monaco',
      name: 'notes.txt',
      path: 'D:/notes.txt',
      resourceKind: 'external',
    }))

    expect(host.component.value).toBe(MonacoEditor)
    expect(host.props.value).toMatchObject({ language: 'plaintext', modelValue: '{}', themeOverrides: {} })
    host.dispose()
  })

  it('resolves a managed project file type from its path when the session id agrees', () => {
    const matching = createHost(createSession({
      fileTypeId: 'opencard-dictionary',
      editorId: 'dictionary',
      name: 'locale.json',
      path: 'D:/project/.opencard/locale.json',
      resourceKind: 'workspace',
      mode: 'diff',
      diff: { beforeRevisionId: 'abc', afterRevisionId: null },
    }))

    expect(matching.host.component.value).toBe(MonacoEditor)
    expect(matching.host.props.value).toMatchObject({ mode: 'diff', language: 'json' })
    matching.host.dispose()

    // A declared file type that disagrees with the path keeps its own type instead of the path one.
    const mismatched = createHost(createSession({
      fileTypeId: 'unsupported',
      editorId: 'dictionary',
      name: 'locale.json',
      path: 'D:/project/.opencard/locale.json',
      resourceKind: 'workspace',
      mode: 'diff',
      diff: { beforeRevisionId: 'abc', afterRevisionId: null },
    }))

    expect(mismatched.host.component.value).toBe(DictionaryEditor)
    expect(mismatched.host.props.value.language).toBeUndefined()
    mismatched.host.dispose()
  })

  it('routes font files and missing editors to safe preview sessions', () => {
    const font = createHost(createSession({
      fileTypeId: 'font',
      editorId: 'font-preview',
      name: 'Brand.woff2',
      path: 'assets/Brand.woff2',
      resourceKind: 'workspace',
    }))
    expect(font.host.component.value).toBe(FontPreviewEditor)
    expect(font.host.props.value).toMatchObject({
      filePath: 'assets/Brand.woff2',
      fileName: 'Brand.woff2',
      resourceRootPath: 'D:/project',
    })
    font.host.dispose()

    const unsupported = createHost(createSession({
      fileTypeId: 'unsupported',
      editorId: 'missing-editor',
      name: 'reference.bin',
      path: 'D:/reference.bin',
      resourceKind: 'external',
    }))
    expect(unsupported.host.component.value).toBe(UnsupportedFileEditor)
    expect(unsupported.host.props.value).toMatchObject({
      filePath: 'D:/reference.bin',
      fileName: 'reference.bin',
    })
    unsupported.host.dispose()
  })

  it('binds draft updates to the session that produced the props', () => {
    const { host, activeSession, updateDraftContent } = createHost()
    const update = host.props.value['onUpdate:modelValue'] as (value: string) => void

    activeSession.value = createSession({ id: 'session-b' })
    update('{"changed":true}')

    expect(updateDraftContent).toHaveBeenCalledWith('session-a', '{"changed":true}')
    host.dispose()
  })

  it('auto-saves structured font and icon registry draft updates', async () => {
    const { host, saveActiveSession } = createHost(createSession({
      editorId: 'font-registry',
      fileTypeId: 'opencard-font-registry',
      name: 'fonts.json',
      path: 'D:/project/.opencard/fonts/fonts.json',
    }))
    const update = host.props.value['onUpdate:modelValue'] as (value: string) => void

    update('{"families":[]}')
    await nextTick()

    expect(saveActiveSession).toHaveBeenCalledTimes(1)
    host.dispose()
  })

  it('coalesces viewport updates and persists the latest value', () => {
    vi.useFakeTimers()
    const { host, updateSessionUiState } = createHost()

    host.handleViewportTransform({ x: 1, y: 2, scale: 1.1 })
    host.handleViewportTransform({ x: 3, y: 4, scale: 1.2 })
    vi.advanceTimersByTime(199)
    expect(updateSessionUiState).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(updateSessionUiState).toHaveBeenCalledTimes(1)
    expect(updateSessionUiState).toHaveBeenCalledWith('session-a', {
      cardDesigner: { viewportTransform: { x: 3, y: 4, scale: 1.2 } },
    })
    host.dispose()
  })

  it('flushes a pending viewport update when the active session changes', async () => {
    vi.useFakeTimers()
    const { host, activeSession, updateSessionUiState } = createHost()
    host.handleViewportTransform({ x: 8, y: 9, scale: 2 })

    activeSession.value = createSession({ id: 'session-b' })
    await nextTick()

    expect(updateSessionUiState).toHaveBeenCalledWith('session-a', {
      cardDesigner: { viewportTransform: { x: 8, y: 9, scale: 2 } },
    })
    vi.runAllTimers()
    expect(updateSessionUiState).toHaveBeenCalledTimes(1)
    host.dispose()
  })

  it('persists image viewport state and flushes it during dispose', () => {
    vi.useFakeTimers()
    const { host, updateSessionUiState } = createHost(createSession({
      fileTypeId: 'image',
      editorId: 'image-preview',
      name: 'cover.png',
    }))

    host.handleViewportTransform({ x: -4, y: 7, scale: 0.8 })
    host.dispose()
    host.dispose()
    vi.runAllTimers()

    expect(updateSessionUiState).toHaveBeenCalledTimes(1)
    expect(updateSessionUiState).toHaveBeenCalledWith('session-a', {
      imagePreview: { viewportTransform: { x: -4, y: 7, scale: 0.8 } },
    })
  })

  it('defaults image pixel mode off and stores changes in the active image session', () => {
    const { host, updateSessionUiState } = createHost(createSession({
      fileTypeId: 'image',
      editorId: 'image-preview',
      name: 'cover.png',
    }))

    expect(host.props.value.pixelated).toBe(false)
    host.handleImagePreviewPixelated(true)

    expect(updateSessionUiState).toHaveBeenCalledWith('session-a', {
      imagePreview: { pixelated: true },
    })
    host.dispose()
  })

  it('routes Card Designer mode, layout and view state to the active session', () => {
    const { host, updateSessionUiState } = createHost()
    const layout = {
      panels: {
        instanceExpanded: true,
        previewExpanded: false,
        structureExpanded: true,
        propertyExpanded: false,
      },
      leftTopHeight: 240,
      rightTopHeight: null,
      leftDockExtent: 320,
      rightDockExtent: 360,
      leftExpandedDockExtent: 320,
      rightExpandedDockExtent: 360,
    }
    const view = {
      activeFace: 'back' as const,
      clipToFace: true,
      selectedInstanceId: 'instance-1',
    }

    host.handleCardDesignerMode('data-table')
    host.handleCardDesignerLayout(layout)
    host.handleCardDesignerView(view)

    expect(updateSessionUiState).toHaveBeenNthCalledWith(1, 'session-a', {
      cardDesigner: { mode: 'data-table' },
    })
    expect(updateSessionUiState).toHaveBeenNthCalledWith(2, 'session-a', {
      cardDesigner: { layout },
    })
    expect(updateSessionUiState).toHaveBeenNthCalledWith(3, 'session-a', {
      cardDesigner: { view },
    })
    host.dispose()
  })

  it('routes save, flush, dirty, undo and redo through the editor boundary', async () => {
    const { host, setSessionDirtyState, saveActiveSession, updateDraftContent } = createHost()
    const save = vi.fn()
    const flush = vi.fn()
    host.editorRef.value = { save, flush }
    const updateContent = host.props.value['onUpdate:modelValue'] as (value: string) => void
    updateContent('{"changed":true}')

    host.handleModified(true)
    await host.save()
    await host.flushAffectedSessions(['session-a'])
    await host.undo()
    await host.redo()

    expect(setSessionDirtyState).toHaveBeenCalledWith('session-a', true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(saveActiveSession).not.toHaveBeenCalled()
    expect(flush).toHaveBeenCalledTimes(3)
    expect(updateDraftContent).toHaveBeenLastCalledWith('session-a', '{"changed":true}')
    host.dispose()
  })

  it.each([
    ['Card Designer', createSession()],
    ['Dictionary', createSession({
      fileTypeId: 'opencard-dictionary', editorId: 'dictionary', name: 'locale.json', path: 'D:/project/.opencard/locale.json',
    })],
  ])('projects and routes %s workbook actions through a narrow editor boundary', async (_name, session) => {
    const { host } = createHost(session)
    const importDataTableWorkbook = vi.fn()
    const exportDataTableWorkbook = vi.fn()
    host.editorRef.value = {
      importDataTableWorkbook,
      exportDataTableWorkbook,
      dataTableWorkbookBusy: false,
      canExportDataTableWorkbook: true,
    }

    expect(host.dataTableWorkbookBusy.value).toBe(false)
    expect(host.canExportDataTableWorkbook.value).toBe(true)
    await host.importDataTableWorkbook()
    await host.exportDataTableWorkbook()

    host.editorRef.value.dataTableWorkbookBusy = true
    await host.importDataTableWorkbook()
    await host.exportDataTableWorkbook()

    expect(importDataTableWorkbook).toHaveBeenCalledTimes(1)
    expect(exportDataTableWorkbook).toHaveBeenCalledTimes(1)
    host.dispose()
  })

  it('uses the session save path for Monaco editors', async () => {
    const { host, saveActiveSession } = createHost(createSession({
      fileTypeId: 'text',
      editorId: 'monaco',
      name: 'notes.txt',
    }))
    host.editorRef.value = { save: vi.fn() }

    await host.save()

    expect(saveActiveSession).toHaveBeenCalledTimes(1)
    expect(notificationMocks.notifySuccess).toHaveBeenCalledWith(
      'app.notifications.saved:notes.txt',
      'action.save',
    )
    host.dispose()
  })
})
