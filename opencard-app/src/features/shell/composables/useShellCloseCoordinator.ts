/** Coordinates guarded close requests without owning session or resource truth. */
import type { Ref } from 'vue'
import { isSameOrDescendantPath } from '../../../shared/model/filePath'
import type {
  EditorSession,
  SessionSaveResult,
} from '../../workspace/store/editorSessionStore'
import type { ProjectCloseDestination } from '../shellLocation'
import {
  useUnsavedSessionGuard,
  type ApplicationCloseAction,
  type UnsavedCloseIntent,
} from './useUnsavedSessionGuard'

type CloseResult = void | Promise<void>
/** 关闭请求的结果：已完成，或因为要确认未保存的编辑器而交给了用户。 */
export type CloseOutcome = 'completed' | 'prompted'

type ShellCloseCompletions = {
  sessions: (sessionIds: readonly string[]) => CloseResult
  project: (destination: ProjectCloseDestination) => CloseResult
  trash: (path: string) => CloseResult
  application: (action: ApplicationCloseAction) => CloseResult
}

type UseShellCloseCoordinatorOptions = {
  sessions: Readonly<Ref<readonly EditorSession[]>>
  flushAffectedSessions: (sessionIds: readonly string[]) => Promise<void>
  pickDraftDirectory: () => Promise<string | null>
  fileExists: (path: string) => Promise<boolean>
  saveSession: (sessionId: string, targetPath?: string) => Promise<SessionSaveResult>
  completions: ShellCloseCompletions
}

export function useShellCloseCoordinator(options: UseShellCloseCoordinatorOptions) {
  async function completeClose(intent: UnsavedCloseIntent): Promise<void> {
    if (intent.type === 'project') {
      await options.completions.project(intent.projectDestination ?? 'current')
      return
    }
    if (intent.type === 'app') {
      await options.completions.application(intent.applicationAction ?? 'close')
      return
    }
    if (intent.type === 'trash') {
      if (!intent.path) throw new Error('trash close intent requires a path')
      await options.completions.trash(intent.path)
      return
    }
    await options.completions.sessions(intent.sessionIds)
  }

  const guard = useUnsavedSessionGuard({
    sessions: options.sessions,
    pickDraftDirectory: options.pickDraftDirectory,
    fileExists: options.fileExists,
    saveSession: options.saveSession,
    completeClose,
  })

  async function request(intent: UnsavedCloseIntent): Promise<CloseOutcome> {
    await options.flushAffectedSessions(intent.sessionIds)
    return await guard.requestClose(intent)
  }

  async function requestSessionClose(sessionIds: readonly string[]): Promise<CloseOutcome> {
    return await request({ type: 'sessions', sessionIds })
  }

  async function requestProjectClose(
    destination: ProjectCloseDestination = 'current',
  ): Promise<CloseOutcome> {
    return await request({
      type: 'project',
      sessionIds: options.sessions.value
        .filter(session => session.resourceKind === 'workspace')
        .map(session => session.id),
      projectDestination: destination,
    })
  }

  async function requestPathTrash(path: string): Promise<CloseOutcome> {
    return await request({
      type: 'trash',
      sessionIds: options.sessions.value
        .filter(session => session.path && isSameOrDescendantPath(session.path, path))
        .map(session => session.id),
      path,
    })
  }

  async function requestApplicationClose(action: ApplicationCloseAction = 'close'): Promise<CloseOutcome> {
    return await request({
      type: 'app',
      sessionIds: options.sessions.value.map(session => session.id),
      applicationAction: action,
    })
  }

  async function discardSingle(): Promise<void> {
    const row = guard.decisions.value[0]
    if (!row || guard.isBusy.value) return
    if (row.decision !== 'pending') guard.resetDecision(row.sessionId)
    guard.setRowSelected(row.sessionId, true)
    guard.markSelectedDiscard()
    await guard.confirm()
  }

  async function saveSingle(): Promise<void> {
    const row = guard.decisions.value[0]
    if (!row || guard.isBusy.value) return
    if (row.decision !== 'pending') guard.resetDecision(row.sessionId)
    guard.setRowSelected(row.sessionId, true)
    if (await guard.markSelectedSave()) await guard.confirm()
  }

  return {
    pendingIntent: guard.pendingIntent,
    decisions: guard.decisions,
    isOpen: guard.isOpen,
    isBusy: guard.isBusy,
    globalError: guard.globalError,
    selectedCount: guard.selectedCount,
    pendingCount: guard.pendingCount,
    saveCount: guard.saveCount,
    discardCount: guard.discardCount,
    allPendingSelected: guard.allPendingSelected,
    somePendingSelected: guard.somePendingSelected,
    canConfirm: guard.canConfirm,
    setRowSelected: guard.setRowSelected,
    setAllPendingSelected: guard.setAllPendingSelected,
    markSelectedDiscard: guard.markSelectedDiscard,
    markSelectedSave: guard.markSelectedSave,
    resetDecision: guard.resetDecision,
    confirm: guard.confirm,
    cancel: guard.cancel,
    requestSessionClose,
    requestProjectClose,
    requestPathTrash,
    requestApplicationClose,
    discardSingle,
    saveSingle,
  }
}
