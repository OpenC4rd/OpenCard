/** Binds a mounted editor to its captured session and projects its contributions. */
import { computed, shallowRef, watch, type Ref } from 'vue'
import MonacoEditor from '../../../components/editors/MonacoEditor.vue'
import { getOcTheme } from '../../../shared/ui/foundation'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import { useProjectStore } from '../../workspace/store/projectStore'
import { editorRegistry } from '../../editor-runtime/registry/editorRegistry'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import type { EditorInstance, EditorComparisonInput } from '../../editor-runtime/editorProtocol'
import type { EditorDiffUiState } from '../../editor-runtime/model/editorUiState'
import type { EditorIssueSnapshot } from '../../editor-runtime/model/editorIssue'
import { resolveFileType, resolveFileTypeById } from '../../workspace/model/fileTypes'
import { notifyAppError, notifySuccess, notifyWarning } from '../../notifications/titlebarNotices'
import type { CardDesignerProps } from '../../card-designer/cardDesigner.types'

export function useWorkbenchEditorHost(options: {
  activeSession: Readonly<Ref<EditorSession | null>>
  comparison: Readonly<Ref<EditorComparisonInput | null>>
  cardProps: Readonly<Ref<Omit<CardDesignerProps, 'session'>>>
  reportIssues: (id: string, snapshot: EditorIssueSnapshot) => void
  openFile: (path: string) => unknown
  trashFile: (path: string) => unknown
  translate: (key: string, params?: Record<string, unknown>) => string
}) {
  const editorRef = shallowRef<EditorInstance | null>(null)
  const settings = useAppSettingsStore().settings
  const project = useProjectStore()
  const key = computed(() => {
    const state = options.activeSession.value?.state
    return state ? [state.id, state.editorId, state.mode, state.diff?.beforeRevisionId ?? '', state.diff?.afterRevisionId ?? ''].join('|') : 'none'
  })
  const binding = computed(() => {
    const session = options.activeSession.value
    const identity = key.value
    if (!session) return null
    let instance: EditorInstance | null = null
    let unbind: (() => void) | undefined
    let stop: (() => void) | undefined
    const current = () => !session.disposed && options.activeSession.value === session && key.value === identity
    return {
      session, key: identity, current,
      capture(value: unknown): void {
        if (!value) {
          stop?.()
          const detach = unbind
          unbind = undefined
          if (editorRef.value === instance) editorRef.value = null
          instance = null
          // Vue calls the ref before unmounted hooks. Release after those hooks save model view state.
          queueMicrotask(() => detach?.())
        } else if (current()) {
          instance = value as EditorInstance
          editorRef.value = instance
          if (!unbind) unbind = session.bind(instance)
          stop?.()
          stop = watch(() => [instance?.presentation, session.state.path, session.state.name], () => {
            if (current() && instance) session.setPresentation(instance.presentation ?? null)
          }, { immediate: true, flush: 'post' })
        }
      },
      get contribution() {
        const owner = instance
        return {
          actions: current() ? owner?.headerActions ?? [] : [],
          onAction: (action: string) => { if (current() && owner === instance) return owner?.onHeaderAction?.(action) },
        }
      },
      events: {
        onIssueSnapshot: (snapshot: EditorIssueSnapshot) => { if (current()) options.reportIssues(session.state.id, snapshot) },
        onUpdateDiffUiState: (value: EditorDiffUiState) => { if (current()) session.updateDiffUiState(value) },
        onOpenFile: (path: string) => { if (current()) return options.openFile(path) },
        onTrashFile: (path: string) => { if (current()) return options.trashFile(path) },
      },
    }
  })
  const mount = computed(() => {
    const bound = binding.value
    if (!bound) return undefined
    const state = bound.session.state
    const definition = editorRegistry.getEditor(state.editorId) ?? editorRegistry.getEditor('unsupported-file')!
    const fileType = state.path ? resolveFileType(state.path) : resolveFileTypeById(state.fileTypeId)
    const fallback = state.mode === 'diff' && !definition.supportsDiff && fileType.language
    const theme = settings.value.appearance.theme === 'system' ? getOcTheme() : settings.value.appearance.theme
    return {
      component: fallback ? MonacoEditor : definition.component, key: bound.key, capture: bound.capture,
      props: {
        session: bound.session,
        comparison: options.comparison.value ?? undefined,
        resourceRootPath: project.projectPath.value || null,
        resourceEnvironment: project.resourceEnvironment.value,
        themeId: theme, themeOverrides: settings.value.appearance.themes[theme].colors,
        language: fileType.language ?? 'plaintext',
        ...(state.editorId === 'card-designer' && !fallback ? options.cardProps.value : {}),
        ...bound.events,
      },
    }
  })
  async function save(): Promise<void> {
    const session = options.activeSession.value
    if (!session) return
    try {
      const result = await session.save()
      const name = session.state.name
      if (result === 'saved') notifySuccess(options.translate('app.notifications.saved', { name }), 'action.save')
      else notifyWarning(options.translate(result === 'cancelled' ? 'app.notifications.saveCancelled' : 'app.notifications.saveSkipped', { name }))
    } catch (error) { notifyAppError('OC-E4002', error) }
  }
  return {
    editorRef, key, mount, contribution: computed(() => { editorRef.value; return binding.value?.contribution ?? { actions: [], onAction: () => {} } }),
    canUndo: computed(() => options.activeSession.value?.canUndo.value ?? false),
    canRedo: computed(() => options.activeSession.value?.canRedo.value ?? false),
    save, undo: () => options.activeSession.value?.undo(), redo: () => options.activeSession.value?.redo(),
  }
}
