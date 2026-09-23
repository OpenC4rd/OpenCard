/**
 * 模块说明：
 * - 维护编辑会话状态 包括活动会话 草稿 脏状态 预览语义 与无地址会话保存流程
 * 职责边界：
 * - 只管理会话真相 不处理文件系统目录索引
 */
import { computed, nextTick, readonly, ref } from 'vue'
import { i18n } from '../../../i18n'
import { getPathBasename, isSameOrDescendantPath, normalizePath } from '../../../shared/model/filePath'
import type { EditorPresentation } from '../../../shared/ui/editorPresentation.types'
import {
  CARD_DOCUMENT_SUFFIX,
  resolveFileType,
  resolveFileTypeById,
} from '../model/fileTypes'
import { fileSystemService } from '../services/fileSystemService'
import { useProjectStore } from './projectStore'
import type {
  CardDesignerLayoutState,
  CardDesignerMode,
  CardDesignerViewState,
  EditorDiffUiState,
  EditorViewportTransform,
} from '../../editor-runtime/model/editorUiState'
import { taskScheduler } from '../../../utils/taskScheduler'
import {
  editorHistoryManager,
  resolveEditorHistoryKind,
} from '../../editor-runtime/history/editorHistoryManager'

const PROJECT_CONFIGURATION_AUTOSAVE_KEY_PREFIX = 'project-configuration-autosave:'
const CONTENTLESS_EDITOR_IDS = new Set(['image-preview', 'font-preview', 'package-manifest', 'unsupported-file'])

export type SessionResourceKind = 'workspace' | 'external' | 'draft'
export type SessionSaveResult = 'saved' | 'cancelled' | 'skipped'
export type EditorSessionMode = 'edit' | 'diff'
/** Opening a session: the only choice left to the caller is whether it opens as a preview. */
export type OpenSessionOptions = {
  preview?: boolean
}
export interface EditorSessionDiffState {
  beforeRevisionId: string | null
  afterRevisionId: string | null
  uiState?: EditorDiffUiState
}

export type EditorSession = {
  id: string
  resourceKind: SessionResourceKind
  path: string | null
  fileTypeId: string
  name: string
  /**
   * 这个会话要求自己在外部看起来是什么样，由渲染它的编辑器写回（`setSessionPresentation`）。
   * 三态：`undefined` = 还没有编辑器声明过（刚打开、编辑器正在挂载，壳层此处留空）；
   * `null` = 编辑器声明了"我没有呈现"（纯文本编辑器这类，壳层显示身份名）；
   * 对象 = 声明的内容。`name` 始终是文件或草稿的身份。
   */
  presentation?: EditorPresentation | null
  editorId: string
  savedContent: string
  draftContent: string
  isDirty: boolean
  isPreview: boolean
  mode?: EditorSessionMode
  diff?: EditorSessionDiffState
  uiState?: EditorSessionUiState
}

export type EditorSessionUiState = {
  cardDesigner?: {
    mode?: CardDesignerMode
    viewportTransform?: EditorViewportTransform
    layout?: CardDesignerLayoutState
    view?: CardDesignerViewState
  }
  imagePreview?: {
    viewportTransform?: EditorViewportTransform
    pixelated?: boolean
  }
}

type CreateDraftSessionOptions = {
  fileTypeId?: string
  name?: string
  content?: string
}

const sessions = ref<EditorSession[]>([])
const activeSessionId = ref<string>('')

function isPathInsideProject(path: string, projectPath: string) {
  if (!projectPath) {
    return false
  }

  return isSameOrDescendantPath(path, projectPath)
}

function stripFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
}

function resolveOpenCardDraftName(content: string, fallback: string): string {
  try {
    const document = JSON.parse(content) as { type?: unknown, name?: unknown }
    if (document.type !== 'card-document' || typeof document.name !== 'string') return fallback

    const fileName = document.name
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/[. ]+$/g, '')
    if (!fileName) return fallback
    return fileName.toLowerCase().endsWith(CARD_DOCUMENT_SUFFIX) ? fileName : `${fileName}${CARD_DOCUMENT_SUFFIX}`
  } catch {
    return fallback
  }
}

function isAbsolutePath(path: string): boolean {
  const normalizedPath = normalizePath(path)
  return /^[a-z]:\//i.test(normalizedPath) || normalizedPath.startsWith('/')
}

function projectConfigurationAutosaveKey(sessionId: string): string {
  return `${PROJECT_CONFIGURATION_AUTOSAVE_KEY_PREFIX}${sessionId}`
}

export function createDefaultOpenCardContent(displayName: string) {
  const documentName = stripFileExtension(displayName) || 'UNTITLED'
  return JSON.stringify({
    type: 'card-document',
    id: `card-document-${crypto.randomUUID()}`,
    name: documentName,
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: `card-face-${crypto.randomUUID()}`,
        background: '#FFFFFF',
        children: [],
      },
      back: {
        type: 'card-face',
        id: `card-face-${crypto.randomUUID()}`,
        background: '#FFFFFF',
        children: [],
      },
    },
    instances: [],
  }, null, 2)
}

/** A draft card document names itself, so its content decides the session name; every other session keeps its file name. */
function resolvePublishedName(session: EditorSession, content: string): string {
  if (session.resourceKind !== 'draft' || session.fileTypeId !== 'opencard') {
    return session.name
  }
  return resolveOpenCardDraftName(content, session.name)
}

function buildDraftName(fileTypeId: string, existingNames: string[]) {  const fileType = resolveFileTypeById(fileTypeId)
  const extension = fileType.extensions?.[0]
  const suffix = extension ? `.${extension}` : ''
  const lowerCaseNames = new Set(existingNames.map((name) => name.toLowerCase()))

  let index = 1
  while (true) {
    const candidate = index === 1
      ? `UNTITLED${suffix}`
      : `UNTITLED-${index}${suffix}`
    if (!lowerCaseNames.has(candidate.toLowerCase())) {
      return candidate
    }
    index += 1
  }
}

function resolveSessionFileType(session: EditorSession) {
  if (session.path) {
    const fileTypeFromPath = resolveFileType(
      session.path,
      session.resourceKind === 'workspace' ? useProjectStore().projectPath.value : undefined,
    )
    if (!session.fileTypeId || fileTypeFromPath.id === session.fileTypeId) {
      return fileTypeFromPath
    }
  }

  return resolveFileTypeById(session.fileTypeId)
}

export function useEditorSessionStore() {
  const {
    projectPath,
    readFile,
    saveFile,
    saveProjectConfiguration,
    saveProjectFontRegistry,
    saveProjectIconRegistry,
    saveProjectDictionary,
  } = useProjectStore()

  function publishHistoryContent(sessionId: string, content: string, isDirty: boolean): void {
    sessions.value = sessions.value.map(session => session.id === sessionId
      ? {
          ...session,
          name: resolvePublishedName(session, content),
          draftContent: content,
          isDirty,
          isPreview: isDirty ? false : session.isPreview,
        }
      : session)
  }

  function initializeSessionHistory(session: EditorSession): void {
    editorHistoryManager.initialize(
      session.id,
      resolveEditorHistoryKind(session.editorId),
      session.draftContent,
      (content, isDirty) => publishHistoryContent(session.id, content, isDirty),
    )
  }

  const activeSession = computed(() =>
    sessions.value.find((session) => session.id === activeSessionId.value) ?? null
  )

  function setSessionPreviewState(sessionId: string, isPreview: boolean) {
    sessions.value = sessions.value.map((session) =>
      session.id === sessionId
        ? {
          ...session,
          isPreview,
        }
        : session
    )
  }

  /**
   * 编辑器声明它要求自己对外长什么样；`null` 表示这个编辑器没有呈现可声明。
   * 声明与现状相同就不写，于是"读会话的呈现再写回同样值"不会形成循环。
   */
  function setSessionPresentation(sessionId: string, presentation: EditorPresentation | null): void {
    sessions.value = sessions.value.map((session) => {
      if (session.id !== sessionId) return session
      const current = session.presentation
      if (current === presentation) return session
      if (current && presentation
        && current.title === presentation.title
        && current.description === presentation.description
        && current.icon === presentation.icon
        && current.iconTone === presentation.iconTone) {
        return session
      }
      return { ...session, presentation }
    })
  }

  async function openSession(path: string, options?: OpenSessionOptions) {
    const normalizedPath = normalizePath(path)
    const preview = options?.preview ?? false
    const existingSession = sessions.value.find((session) => session.path === normalizedPath)
    if (existingSession) {
      if (!preview && existingSession.isPreview) {
        setSessionPreviewState(existingSession.id, false)
      }

      activeSessionId.value = existingSession.id
      return existingSession
    }

    const resourceKind: SessionResourceKind = projectPath.value && (
      !isAbsolutePath(normalizedPath) || isPathInsideProject(normalizedPath, projectPath.value)
    )
      ? 'workspace'
      : 'external'
    const fileType = resolveFileType(
      normalizedPath,
      resourceKind === 'workspace' ? projectPath.value : undefined,
    )
    const content = CONTENTLESS_EDITOR_IDS.has(fileType.editorId)
      ? ''
      : resourceKind === 'workspace'
        ? await readFile(normalizedPath)
        : await fileSystemService.readFile(normalizedPath)

    const session: EditorSession = {
      id: crypto.randomUUID(),
      resourceKind,
      path: normalizedPath,
      fileTypeId: fileType.id,
      name: getPathBasename(normalizedPath),
      editorId: fileType.editorId,
      savedContent: content,
      draftContent: content,
      isDirty: false,
          isPreview: preview,
          mode: 'edit',
    }

    const replacedPreviewSessionIds = preview
      ? sessions.value.filter((candidate) => candidate.isPreview).map(candidate => candidate.id)
      : []
    const nextSessions = preview
      ? sessions.value.filter((candidate) => !candidate.isPreview)
      : sessions.value

    sessions.value = [...nextSessions, session]
    initializeSessionHistory(session)
    activeSessionId.value = session.id
    if (preview) {
      await nextTick()
      await new Promise<void>(resolve => setTimeout(resolve, 250))
      editorHistoryManager.releaseMany(replacedPreviewSessionIds)
    }
    return session
  }

  /** 打开一份工作；`preview` 表示它会被下一次预览替换。入口只有一个，名字不再随入口变化。 */
  async function open(path: string, options?: OpenSessionOptions) {
    return await openSession(path, options)
  }

  function createDraftSession(options: CreateDraftSessionOptions = {}) {
    const fileTypeId = options.fileTypeId ?? 'opencard'
    const fileType = resolveFileTypeById(fileTypeId)
    const fallbackName = options.name ?? buildDraftName(fileTypeId, sessions.value.map((session) => session.name))
    const content = options.content ?? (fileType.id === 'opencard' ? createDefaultOpenCardContent(fallbackName) : '')
    const name = fileType.id === 'opencard'
      ? resolveOpenCardDraftName(content, fallbackName)
      : fallbackName

    const session: EditorSession = {
      id: crypto.randomUUID(),
      resourceKind: 'draft',
      path: null,
      fileTypeId: fileType.id,
      name,
      editorId: fileType.editorId,
      savedContent: content,
      draftContent: content,
      isDirty: false,
      isPreview: false,
      mode: 'edit',
    }

    sessions.value = [...sessions.value, session]
    initializeSessionHistory(session)
    activeSessionId.value = session.id
    return session
  }

  function activateSession(sessionId: string) {
    if (sessions.value.some((session) => session.id === sessionId)) {
      activeSessionId.value = sessionId
    }
  }

  function updateDraftContent(sessionId: string, content: string) {
    if (editorHistoryManager.has(sessionId)) {
      editorHistoryManager.recordContent(sessionId, content)
      return
    }
    sessions.value = sessions.value.map((session) => {
      if (session.id !== sessionId) {
        return session
      }

      const isDirty = content !== session.savedContent
      return {
        ...session,
        name: resolvePublishedName(session, content),
        draftContent: content,
        isDirty,
        isPreview: isDirty ? false : session.isPreview,
      }
    }
    )

  }

  function setSessionDirtyState(sessionId: string, isDirty: boolean) {
    sessions.value = sessions.value.map((session) => {
      if (session.id !== sessionId) {
        return session
      }

      if (session.isDirty === isDirty) {
        return session
      }

      return {
        ...session,
        isDirty,
        isPreview: isDirty ? false : session.isPreview,
      }
    })
  }

  function updateSessionUiState(sessionId: string, patch: EditorSessionUiState) {
    sessions.value = sessions.value.map((session) => {
      if (session.id !== sessionId) {
        return session
      }

      return {
        ...session,
        uiState: {
          ...session.uiState,
          ...patch,
          cardDesigner: patch.cardDesigner
            ? {
              ...session.uiState?.cardDesigner,
              ...patch.cardDesigner,
            }
            : session.uiState?.cardDesigner,
          imagePreview: patch.imagePreview
            ? {
              ...session.uiState?.imagePreview,
              ...patch.imagePreview,
            }
            : session.uiState?.imagePreview,
        },
      }
    })
  }

  function setSessionMode(sessionId: string, mode: EditorSessionMode, diff?: EditorSessionDiffState): void {
    sessions.value = sessions.value.map(session => session.id === sessionId
      ? { ...session, mode, diff: mode === 'diff' ? diff ?? session.diff : session.diff }
      : session)
  }

  function updateSessionDiffUiState(sessionId: string, uiState: EditorDiffUiState): void {
    sessions.value = sessions.value.map(session => session.id === sessionId && session.diff
      ? { ...session, diff: { ...session.diff, uiState } }
      : session)
  }

  /** 会话结束时要清掉的附属状态（自动保存任务与编辑历史）只在这里实现一次，三条关闭路径都调它。 */
  function disposeSessions(sessionIds: readonly string[]): void {
    for (const sessionId of sessionIds) {
      taskScheduler.cancel(projectConfigurationAutosaveKey(sessionId))
    }
    editorHistoryManager.releaseMany(sessionIds)
  }

  function closeSession(sessionId: string) {
    const index = sessions.value.findIndex((session) => session.id === sessionId)
    if (index === -1) {
      return
    }

    disposeSessions([sessionId])

    const nextSessions = [...sessions.value]
    nextSessions.splice(index, 1)
    sessions.value = nextSessions

    if (activeSessionId.value !== sessionId) {
      return
    }

    const fallbackSession = nextSessions[index] ?? nextSessions[index - 1] ?? null
    activeSessionId.value = fallbackSession?.id ?? ''
  }

  function closeWorkspaceSessions() {
    disposeSessions(sessions.value
      .filter(session => session.resourceKind === 'workspace')
      .map(session => session.id))
    const activeSessionWasClosed = sessions.value.some(
      (session) => session.id === activeSessionId.value && session.resourceKind === 'workspace',
    )
    sessions.value = sessions.value.filter((session) => session.resourceKind !== 'workspace')

    if (activeSessionWasClosed) {
      activeSessionId.value = sessions.value[sessions.value.length - 1]?.id ?? ''
    }
  }

  function closeSessionsByPath(path: string) {
    const normalizedPath = normalizePath(path)
    const closedSessionIds = new Set(
      sessions.value
        .filter((session) => session.path && isSameOrDescendantPath(session.path, normalizedPath))
        .map((session) => session.id),
    )
    if (closedSessionIds.size === 0) return

    disposeSessions([...closedSessionIds])

    const activeSessionWasClosed = closedSessionIds.has(activeSessionId.value)
    sessions.value = sessions.value.filter((session) => !closedSessionIds.has(session.id))
    if (activeSessionWasClosed) {
      activeSessionId.value = sessions.value[sessions.value.length - 1]?.id ?? ''
    }
  }

  async function writeContentByResourceKind(resourceKind: SessionResourceKind, path: string, content: string) {
    if (resourceKind === 'workspace') {
      await saveFile(path, content)
      return
    }

    await fileSystemService.writeFile(path, content)
  }

  async function saveSession(sessionId: string, targetPath?: string): Promise<SessionSaveResult> {
    taskScheduler.cancel(projectConfigurationAutosaveKey(sessionId))
    const session = sessions.value.find((candidate) => candidate.id === sessionId)
    if (!session) {
      return 'skipped'
    }

    if (CONTENTLESS_EDITOR_IDS.has(session.editorId)) {
      return 'skipped'
    }

    const normalizedTargetPath = targetPath ? normalizePath(targetPath) : null
    let nextPath = normalizedTargetPath ?? session.path
    let nextResourceKind = normalizedTargetPath
      ? (isPathInsideProject(normalizedTargetPath, projectPath.value) ? 'workspace' : 'external')
      : session.resourceKind

    if (!nextPath) {
      const fileType = resolveSessionFileType(session)
      const selectedPath = await fileSystemService.pickSavePath({
        defaultPath: projectPath.value ? `${normalizePath(projectPath.value)}/${session.name}` : session.name,
        title: i18n.global.t('app.dialogs.saveFile'),
        fileTypeName: fileType.id,
        extensions: fileType.extensions,
      })

      if (!selectedPath) {
        return 'cancelled'
      }

      nextPath = normalizePath(selectedPath)
      nextResourceKind = isPathInsideProject(nextPath, projectPath.value) ? 'workspace' : 'external'
    }

    if (nextResourceKind === 'draft') {
      nextResourceKind = isPathInsideProject(nextPath, projectPath.value) ? 'workspace' : 'external'
    }

    const nextFileType = resolveFileType(
      nextPath,
      nextResourceKind === 'workspace' ? projectPath.value : undefined,
    )
    const structuredProjectSavers = {
      'opencard-project-profile': saveProjectConfiguration,
      'opencard-font-registry': saveProjectFontRegistry,
      'opencard-icon-registry': saveProjectIconRegistry,
      'opencard-dictionary': saveProjectDictionary,
    } as const
    const structuredSaver = nextResourceKind === 'workspace'
      ? structuredProjectSavers[nextFileType.id as keyof typeof structuredProjectSavers]
      : undefined
    const savedContent = structuredSaver
      ? await structuredSaver(nextPath, session.draftContent)
      : session.draftContent

    if (!structuredSaver) {
      await writeContentByResourceKind(nextResourceKind, nextPath, savedContent)
    }

    const nextFileTypeId = nextFileType.id === 'plaintext'
      ? session.fileTypeId
      : nextFileType.id

    sessions.value = sessions.value.map((candidate) =>
      candidate.id === sessionId
        ? (() => {
          const hasNewerDraft = candidate.draftContent !== session.draftContent
          const draftContent = hasNewerDraft ? candidate.draftContent : savedContent
          const nextName = getPathBasename(nextPath)
          return {
            ...candidate,
            path: nextPath,
            resourceKind: nextResourceKind,
            name: nextName,
            // 文件名真的变了（另存为、草稿落盘）说明会话换了身份，编辑器先前的声明随之作废；
            // 记为"没有呈现"而不是"尚未声明"，这样没挂载时列表显示的是新身份名而不是空着。
            presentation: nextName === candidate.name ? candidate.presentation : null,
            fileTypeId: nextFileTypeId,
            editorId: resolveFileTypeById(nextFileTypeId).editorId,
            savedContent,
            draftContent,
            isDirty: draftContent !== savedContent,
          }
        })()
        : candidate
    )
    editorHistoryManager.markSaved(sessionId, savedContent)

    return 'saved'
  }

  async function saveDirtySessions(): Promise<string[]> {
    const dirtySessions = sessions.value
      .filter(session => session.isDirty && Boolean(session.path) && session.resourceKind !== 'draft')
    await Promise.all(dirtySessions.map(session => saveSession(session.id)))
    return dirtySessions.map(session => session.name)
  }

  function remapSessionPaths(oldPath: string, newPath: string) {
    const normalizedOldPath = normalizePath(oldPath)
    const normalizedNewPath = normalizePath(newPath)

    sessions.value = sessions.value.map((session) => {
      if (session.resourceKind !== 'workspace' || !session.path) {
        return session
      }

      if (!isSameOrDescendantPath(session.path, normalizedOldPath)) {
        return session
      }

      const nextPath = normalizedNewPath + session.path.slice(normalizedOldPath.length)
      const nextFileType = resolveFileType(nextPath, projectPath.value)
      return {
        ...session,
        path: nextPath,
        name: getPathBasename(nextPath),
        // 同上：身份变了，旧声明作废，记成"没有呈现"以便列表先显示新身份名。
        presentation: null,
        fileTypeId: nextFileType.id,
        editorId: nextFileType.editorId,
      }
    })
  }

  return {
    sessions: readonly(sessions),
    activeSessionId: readonly(activeSessionId),
    activeSession,
    open,
    createDraftSession,
    activateSession,
    updateDraftContent,
    setSessionDirtyState,
    setSessionPresentation,
    updateSessionUiState,
    updateSessionDiffUiState,
    setSessionMode,
    closeSession,
    closeWorkspaceSessions,
    closeSessionsByPath,
    saveSession,
    saveDirtySessions,
    remapSessionPaths,
  }
}
