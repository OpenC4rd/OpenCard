import { computed, markRaw, reactive, readonly } from 'vue'
import type * as Monaco from 'monaco-editor'
import { getPathBasename, isSameOrDescendantPath, normalizePath } from '../../../shared/model/filePath'
import type { EditorPresentation } from '../../../shared/ui/editorPresentation.types'
import { notifyAppError } from '../../notifications/titlebarNotices'
import { CARD_DOCUMENT_SUFFIX, resolveFileType, resolveFileTypeById } from '../../workspace/model/fileTypes'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { useProjectStore } from '../../workspace/store/projectStore'
import { editorHistoryManager } from '../history/editorHistoryManager'
import type { ContentHistoryOperationMeta } from '../history/contentHistory'
import type { EditorCapabilities, EditorInstance } from '../editorProtocol'
import type { EditorDiffUiState } from '../model/editorUiState'

type SessionResourceKind = 'workspace' | 'external' | 'draft'
export type SessionSaveResult = 'saved' | 'cancelled' | 'skipped'
type EditorSessionDiffState = {
  beforeRevisionId: string | null
  afterRevisionId: string | null
  uiState?: EditorDiffUiState
}
export type EditorSessionState = {
  id: string
  resourceKind: SessionResourceKind
  path: string | null
  fileTypeId: string
  name: string
  editorId: string
  savedContent: string
  draftContent: string
  isDirty: boolean
  isPreview: boolean
  /** undefined: not declared yet; null: use the resource name. */
  presentation?: EditorPresentation | null
  mode: 'edit' | 'diff'
  diff?: EditorSessionDiffState
  viewState: Record<string, unknown>
}

export type EditorSession = ReturnType<typeof createEditorSession>

export function createEditorSession(initial: Omit<EditorSessionState, 'viewState'>, resolveCapabilities: (editorId: string) => EditorCapabilities | undefined) {
  const state = reactive<EditorSessionState>({ ...initial, viewState: {} })
  const project = useProjectStore()
  let closed = false
  let bindings = 0
  let editor: EditorInstance | null = null
  let lastCanSave = true
  const canSave = () => editor ? editor.canSave !== false : lastCanSave
  let saveQueue: Promise<unknown> = Promise.resolve()
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined
  const history = editorHistoryManager
  const declaration = () => resolveCapabilities(state.editorId)

  function publish(content: string, dirty: boolean): void {
    if (closed) return
    if (state.resourceKind === 'draft' && state.fileTypeId === 'opencard') {
      try {
        const document = JSON.parse(content)
        if (document.type === 'card-document' && typeof document.name === 'string') {
          const name = document.name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '')
          if (name) state.name = name.toLowerCase().endsWith(CARD_DOCUMENT_SUFFIX) ? name : `${name}${CARD_DOCUMENT_SUFFIX}`
        }
      } catch { /* Invalid source remains editable. */ }
    }
    state.draftContent = content
    state.isDirty = dirty
    if (dirty) state.isPreview = false
  }
  publish(state.draftContent, state.isDirty)
  history.initialize(state.id, declaration()?.history ?? 'none', state.draftContent, publish)

  function updateContent(content: string, meta?: ContentHistoryOperationMeta): void {
    if (closed || state.mode === 'diff') return
    if (history.kind(state.id) === 'none' || (history.kind(state.id) === 'monaco' && !history.getMonacoModel(state.id))) {
      publish(content, content !== state.savedContent)
    } else history.recordContent(state.id, content, meta)
    if (declaration()?.immediateSave) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = setTimeout(() => { void save().catch(error => notifyAppError('OC-E4002', error)) }, 0)
    }
  }

  async function flush(): Promise<void> {
    await editor?.flush?.()
    await history.flush(state.id)
  }

  async function write(targetPath?: string, saveAs = false): Promise<SessionSaveResult> {
    clearTimeout(autoSaveTimer)
    if (closed || state.mode === 'diff' || declaration()?.content === 'none') return 'skipped'
    await flush()
    if (closed || !canSave()) return 'skipped'
    let path = targetPath ?? (saveAs ? null : state.path)
    const fileType = state.path ? resolveFileType(state.path, project.projectPath.value) : resolveFileTypeById(state.fileTypeId)
    if (!path) {
      const { i18n } = await import('../../../i18n')
      path = await fileSystemService.pickSavePath({
        defaultPath: project.projectPath.value ? `${normalizePath(project.projectPath.value)}/${state.name}` : state.name,
        title: i18n.global.t(saveAs ? 'app.dialogs.saveFileAs' : 'app.dialogs.saveFile'),
        fileTypeName: fileType.id, extensions: fileType.extensions,
      })
      if (!path) return 'cancelled'
    }
    if (closed) return 'skipped'
    // Flush again after the picker: it may have stayed open while editing continued.
    await flush()
    if (closed || !canSave()) return 'skipped'
    path = normalizePath(path)
    const content = state.draftContent
    const absolute = /^[a-z]:\//i.test(path) || path.startsWith('/')
    const resourceKind = project.projectPath.value && (!absolute || isSameOrDescendantPath(path, project.projectPath.value)) ? 'workspace' : 'external'
    const nextType = resolveFileType(path, resourceKind === 'workspace' ? project.projectPath.value : undefined)
    const savers = {
      'opencard-project-profile': project.saveProjectConfiguration,
      'opencard-font-registry': project.saveProjectFontRegistry,
      'opencard-icon-registry': project.saveProjectIconRegistry,
      'opencard-custom-block-registry': project.saveProjectCustomBlockRegistry,
      'opencard-dictionary': project.saveProjectDictionary,
    }
    const saver = resourceKind === 'workspace' ? savers[nextType.id as keyof typeof savers] : undefined
    const sourcePath = state.path
    const savedContent = saver ? await saver(path, content) : content
    if (!saver) {
      if (resourceKind === 'workspace') await project.saveFile(path, savedContent)
      else await fileSystemService.writeFile(path, savedContent)
    }
    if (closed) return 'saved'
    const newerContent = state.draftContent !== content
    if (state.path === sourcePath) {
      const name = getPathBasename(path)
      if (name !== state.name) state.presentation = null
      state.path = path
      state.name = name
      state.resourceKind = resourceKind
      state.fileTypeId = nextType.id === 'plaintext' ? state.fileTypeId : nextType.id
      state.editorId = resolveFileTypeById(state.fileTypeId).editorId
    }
    state.savedContent = savedContent
    if (!newerContent && savedContent !== content) {
      history.recordContent(state.id, savedContent)
      state.draftContent = savedContent
    }
    history.markSaved(state.id, savedContent)
    state.isDirty = state.draftContent !== savedContent
    return 'saved'
  }

  function enqueueSave(path?: string, saveAs = false): Promise<SessionSaveResult> {
    const result = saveQueue.then(() => write(path, saveAs))
    saveQueue = result.catch(() => {})
    return result
  }
  function save(path?: string): Promise<SessionSaveResult> { return enqueueSave(path) }

  function release(): void {
    if (closed && bindings === 0) history.release(state.id)
  }
  function bind(instance: EditorInstance): () => void {
    if (closed) return () => {}
    bindings++
    editor = instance
    let attached = true
    return () => {
      if (!attached) return
      attached = false
      if (editor === instance) { lastCanSave = instance.canSave !== false; editor = null }
      bindings--
      release()
    }
  }

  return markRaw({
    state: readonly(state),
    get disposed() { return closed },
    canUndo: computed(() => history.state(state.id).canUndo),
    canRedo: computed(() => history.state(state.id).canRedo),
    updateContent,
    updateViewState(editorId: string, patch: Record<string, unknown>): void {
      if (!closed) state.viewState[editorId] = { ...(state.viewState[editorId] as object ?? {}), ...patch }
    },
    setPresentation(presentation: EditorPresentation | null): void {
      if (!closed) state.presentation = presentation
    },
    setPreview(preview: boolean): void { if (!closed) state.isPreview = preview },
    setMode(mode: 'edit' | 'diff', diff?: EditorSessionDiffState): void {
      if (!closed) { state.mode = mode; if (diff) state.diff = diff }
    },
    updateDiffUiState(uiState: EditorDiffUiState): void {
      if (!closed && state.diff) state.diff.uiState = uiState
    },
    remapPath(path: string): void {
      if (closed) return
      const type = resolveFileType(path, project.projectPath.value)
      Object.assign(state, { path, name: getPathBasename(path), fileTypeId: type.id, editorId: type.editorId, presentation: null })
    },
    flush, save,
    saveAs: () => enqueueSave(undefined, true),
    async undo(): Promise<void> { if (!closed && state.mode === 'edit') { await flush(); await history.undo(state.id) } },
    async redo(): Promise<void> { if (!closed && state.mode === 'edit') { await flush(); await history.redo(state.id) } },
    textModel: {
      get: () => history.getMonacoModel(state.id),
      attach: (model: Monaco.editor.ITextModel) => { if (!closed) history.attachMonacoModel(state.id, model); else model.dispose() },
    },
    bind,
    dispose(): void { closed = true; clearTimeout(autoSaveTimer); release() },
  })
}
