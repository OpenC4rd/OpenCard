import { computed, ref, type Ref } from 'vue'
import { normalizePath } from '../../../shared/model/filePath'
import {
  type EditorSession,
  type SessionSaveResult,
} from '../../workspace/store/editorSessionStore'
import { resolveFileTypeById } from '../../workspace/model/fileTypes'
import type { ProjectCloseDestination } from '../shellLocation'

export type ApplicationCloseAction = 'close' | 'install-update'

export type UnsavedCloseIntent = {
  type: 'project' | 'app' | 'sessions' | 'trash'
  sessionIds: readonly string[]
  path?: string
  projectDestination?: ProjectCloseDestination
  applicationAction?: ApplicationCloseAction
}

export type UnsavedDecision = 'pending' | 'save' | 'discard'

export type UnsavedEditorDecision = {
  sessionId: string
  name: string
  fileTypeId: string
  resourceKind: EditorSession['resourceKind']
  path: string | null
  decision: UnsavedDecision
  savePath: string | null
  selected: boolean
  error: string
}

type UseUnsavedSessionGuardOptions = {
  sessions: Readonly<Ref<readonly EditorSession[]>>
  pickDraftDirectory: () => Promise<string | null>
  fileExists: (path: string) => Promise<boolean>
  saveSession: (sessionId: string, targetPath?: string) => Promise<SessionSaveResult>
  completeClose: (intent: UnsavedCloseIntent) => Promise<void>
}

function ensureFileExtension(name: string, extension: string | undefined): string {
  if (!extension || name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) return name
  return `${name}.${extension}`
}

function appendFileNameIndex(name: string, index: number): string {
  const extensionIndex = name.lastIndexOf('.')
  if (extensionIndex <= 0) return `${name}-${index}`
  return `${name.slice(0, extensionIndex)}-${index}${name.slice(extensionIndex)}`
}

export function sessionNeedsCloseProtection(session: EditorSession): boolean {
  return session.resourceKind === 'draft' || session.isDirty
}

export function useUnsavedSessionGuard(options: UseUnsavedSessionGuardOptions) {
  const pendingIntent = ref<UnsavedCloseIntent | null>(null)
  const decisions = ref<UnsavedEditorDecision[]>([])
  const isBusy = ref(false)
  const globalError = ref('')

  const isOpen = computed(() => pendingIntent.value !== null)
  const pendingDecisions = computed(() => decisions.value.filter(row => row.decision === 'pending'))
  const selectedCount = computed(() => pendingDecisions.value.filter(row => row.selected).length)
  const pendingCount = computed(() => pendingDecisions.value.length)
  const saveCount = computed(() => decisions.value.filter(row => row.decision === 'save').length)
  const discardCount = computed(() => decisions.value.filter(row => row.decision === 'discard').length)
  const allPendingSelected = computed(() => (
    pendingCount.value > 0 && selectedCount.value === pendingCount.value
  ))
  const somePendingSelected = computed(() => (
    selectedCount.value > 0 && selectedCount.value < pendingCount.value
  ))
  const canConfirm = computed(() => pendingCount.value === 0 && decisions.value.length > 0 && !isBusy.value)

  function clear(): void {
    pendingIntent.value = null
    decisions.value = []
    isBusy.value = false
    globalError.value = ''
  }

  async function requestClose(intent: UnsavedCloseIntent): Promise<'completed' | 'prompted'> {
    if (pendingIntent.value) return 'prompted'

    const affectedIds = new Set(intent.sessionIds)
    const protectedSessions = options.sessions.value.filter(session => (
      affectedIds.has(session.id) && sessionNeedsCloseProtection(session)
    ))

    if (protectedSessions.length === 0) {
      await options.completeClose(intent)
      return 'completed'
    }

    pendingIntent.value = intent
    decisions.value = protectedSessions.map(session => ({
      sessionId: session.id,
      name: session.name,
      fileTypeId: session.fileTypeId,
      resourceKind: session.resourceKind,
      path: session.path,
      decision: 'pending',
      savePath: null,
      selected: true,
      error: '',
    }))
    globalError.value = ''
    return 'prompted'
  }

  function setRowSelected(sessionId: string, selected: boolean): void {
    decisions.value = decisions.value.map(row => (
      row.sessionId === sessionId && row.decision === 'pending'
        ? { ...row, selected }
        : row
    ))
  }

  function setAllPendingSelected(selected: boolean): void {
    decisions.value = decisions.value.map(row => (
      row.decision === 'pending' ? { ...row, selected } : row
    ))
  }

  function markSelectedDiscard(): void {
    decisions.value = decisions.value.map(row => (
      row.decision === 'pending' && row.selected
        ? { ...row, decision: 'discard', savePath: null, selected: false, error: '' }
        : row
    ))
  }

  async function createAvailableDraftPath(
    directory: string,
    row: UnsavedEditorDecision,
    usedPaths: Set<string>,
  ): Promise<string> {
    const extension = resolveFileTypeById(row.fileTypeId).extensions?.[0]
    const baseName = ensureFileExtension(row.name, extension)
    let candidateName = baseName
    let index = 2

    while (true) {
      const candidatePath = `${directory}/${candidateName}`
      const identity = candidatePath.toLowerCase()
      if (!usedPaths.has(identity) && !(await options.fileExists(candidatePath))) {
        usedPaths.add(identity)
        return candidatePath
      }
      candidateName = appendFileNameIndex(baseName, index)
      index += 1
    }
  }

  async function markSelectedSave(): Promise<boolean> {
    const selectedRows = decisions.value.filter(row => row.decision === 'pending' && row.selected)
    if (selectedRows.length === 0) return false

    try {
      const draftRows = selectedRows.filter(row => row.resourceKind === 'draft')
      const directory = draftRows.length > 0
        ? await options.pickDraftDirectory()
        : null
      if (draftRows.length > 0 && !directory) return false

      const normalizedDirectory = directory ? normalizePath(directory) : ''
      const usedPaths = new Set<string>()
      const draftTargets = new Map<string, string>()
      for (const row of draftRows) {
        draftTargets.set(
          row.sessionId,
          await createAvailableDraftPath(normalizedDirectory, row, usedPaths),
        )
      }

      decisions.value = decisions.value.map(row => {
        if (row.decision !== 'pending' || !row.selected) return row
        return {
          ...row,
          decision: 'save',
          savePath: draftTargets.get(row.sessionId) ?? row.path,
          selected: false,
          error: '',
        }
      })
      globalError.value = ''
      return true
    } catch (error) {
      globalError.value = error instanceof Error ? error.message : 'save-failed'
      return false
    }
  }

  function resetDecision(sessionId: string): void {
    decisions.value = decisions.value.map(row => (
      row.sessionId === sessionId
        ? { ...row, decision: 'pending', savePath: null, selected: false, error: '' }
        : row
    ))
  }

  function updateRowError(sessionId: string, error: string): void {
    decisions.value = decisions.value.map(row => (
      row.sessionId === sessionId ? { ...row, error } : row
    ))
  }

  async function confirm(): Promise<boolean> {
    const intent = pendingIntent.value
    if (!intent || !canConfirm.value) return false

    isBusy.value = true
    globalError.value = ''
    const saveRows = decisions.value.filter(row => row.decision === 'save')

    for (const row of saveRows) {
      try {
        const result = await options.saveSession(
          row.sessionId,
          row.resourceKind === 'draft' ? row.savePath ?? undefined : undefined,
        )
        if (result !== 'saved') {
          updateRowError(row.sessionId, result === 'cancelled' ? 'cancelled' : 'save-failed')
          isBusy.value = false
          return false
        }
        decisions.value = decisions.value.filter(candidate => candidate.sessionId !== row.sessionId)
      } catch (error) {
        updateRowError(row.sessionId, error instanceof Error ? error.message : 'save-failed')
        isBusy.value = false
        return false
      }
    }

    try {
      await options.completeClose(intent)
      clear()
      return true
    } catch (error) {
      globalError.value = error instanceof Error ? error.message : 'close-failed'
      isBusy.value = false
      return false
    }
  }

  return {
    pendingIntent,
    decisions,
    isOpen,
    isBusy,
    globalError,
    selectedCount,
    pendingCount,
    saveCount,
    discardCount,
    allPendingSelected,
    somePendingSelected,
    canConfirm,
    requestClose,
    setRowSelected,
    setAllPendingSelected,
    markSelectedDiscard,
    markSelectedSave,
    resetDecision,
    confirm,
    cancel: clear,
  }
}
