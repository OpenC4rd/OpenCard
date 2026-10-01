import { computed, watch, type Ref } from 'vue'
import type { OcNodeActionEvent, OcNodeActivateEvent } from '../../../shared/ui/node/node.types'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { useOcdocumentDiffSession } from '../../version-control/useOcdocumentDiffSession'
import type { DiffRevisionOption } from '../../version-control/diff.types'
import { CHANGED_FOLDER_KEY_MARK } from '../../version-control/changedPathTree'
import { TIMELINE_COMPARE_WITH_DISK_ACTION_KEY } from '../../version-control/useProjectTimeline'

export function useShellWorkbenchVersionActions(options: {
  projectRoot: Readonly<Ref<string>>
  activeSession: Readonly<Ref<EditorSession | null>>
  timelineFilePath: Readonly<Ref<string | null>>
  timelineFileName: Readonly<Ref<string>>
  timelineRevisionOptions: Readonly<Ref<readonly DiffRevisionOption[]>>
  changesExpandedKeys: Readonly<Ref<string[]>>
  statusEntries: Readonly<Ref<readonly { path: string; indexDeleted?: boolean; worktreeDeleted?: boolean }[]>>
  latestCommitIdForPath: (path: string) => Promise<string | null>
  handleOpenFile: (path: string) => Promise<EditorSession | null>
  resolveProjectPath: (path: string) => string
  setSessionMode: (id: string, mode: 'edit' | 'diff', diff?: { beforeRevisionId: string | null; afterRevisionId: string | null }) => void
  onChangesExpansionChange: (event: { key: string; expanded: boolean }) => void
}) {
  const diffSessionState = useOcdocumentDiffSession({
    projectRoot: options.projectRoot,
    filePath: options.timelineFilePath,
    fileName: options.timelineFileName,
    revisions: options.timelineRevisionOptions,
  })
  let synchronizedDiffSessionKey = ''
  watch(() => [
    options.activeSession.value?.id ?? '',
    options.activeSession.value?.mode ?? 'edit',
    options.activeSession.value?.diff?.beforeRevisionId ?? null,
    options.activeSession.value?.diff?.afterRevisionId ?? null,
  ] as const, ([sessionId, mode, beforeId, afterId]) => {
    if (mode !== 'diff' || !sessionId || beforeId === afterId) return
    const key = `${sessionId}|${beforeId ?? 'current'}|${afterId ?? 'current'}`
    if (key === synchronizedDiffSessionKey) return
    synchronizedDiffSessionKey = key
    void diffSessionState.selectComparison(beforeId, afterId)
  }, { immediate: true })
  const editorComparison = computed(() => {
    if (options.activeSession.value?.mode !== 'diff') return null
    const session = diffSessionState.diffSession.value
    if (!session) return null
    return {
      before: { ...session.before, revisionId: session.before.commitId, resourceRootPath: diffSessionState.beforeSnapshotRoot.value },
      after: { ...session.after, revisionId: session.after.commitId, resourceRootPath: diffSessionState.afterSnapshotRoot.value },
    }
  })
  async function enterDiffComparison(sessionId: string, beforeCommitId: string): Promise<void> {
    await diffSessionState.selectComparison(beforeCommitId, null)
    if (diffSessionState.error.value || diffSessionState.before.value?.commitId !== beforeCommitId
      || diffSessionState.after.value?.commitId !== null || options.activeSession.value?.id !== sessionId) return
    synchronizedDiffSessionKey = `${sessionId}|${beforeCommitId}|current`
    options.setSessionMode(sessionId, 'diff', { beforeRevisionId: beforeCommitId, afterRevisionId: null })
  }
  async function handleTimelineAction(event: OcNodeActionEvent): Promise<void> {
    if (event.actionKey !== TIMELINE_COMPARE_WITH_DISK_ACTION_KEY || !options.timelineFilePath.value) return
    const commitId = event.key.startsWith('timeline:') ? event.key.slice('timeline:'.length) : null
    const sessionId = options.activeSession.value?.id
    if (commitId && sessionId) await enterDiffComparison(sessionId, commitId)
  }
  async function handleChangesNodeActivate(event: OcNodeActivateEvent): Promise<void> {
    if (event.key.startsWith(CHANGED_FOLDER_KEY_MARK)) {
      options.onChangesExpansionChange({ key: event.key, expanded: !options.changesExpandedKeys.value.includes(event.key) })
      return
    }
    if (event.key.endsWith('/')) return
    const entry = options.statusEntries.value.find(candidate => candidate.path === event.key)
    if (!entry || entry.indexDeleted || entry.worktreeDeleted) return
    const session = await options.handleOpenFile(options.resolveProjectPath(event.key))
    if (!session || options.timelineFilePath.value !== event.key) return
    const beforeCommitId = await options.latestCommitIdForPath(event.key)
    if (beforeCommitId) await enterDiffComparison(session.id, beforeCommitId)
  }
  async function selectWorkspaceDiff(side: 'before' | 'after', revisionId: string | null): Promise<void> {
    const currentBefore = diffSessionState.before.value?.commitId ?? null
    const currentAfter = diffSessionState.after.value?.commitId ?? null
    const nextBefore = side === 'before' ? revisionId : currentBefore
    const nextAfter = side === 'after' ? revisionId : currentAfter
    const sessionId = options.activeSession.value?.id
    if (nextBefore === nextAfter || !sessionId) return
    await diffSessionState.selectComparison(nextBefore, nextAfter)
    if (diffSessionState.error.value || diffSessionState.before.value?.commitId !== nextBefore
      || diffSessionState.after.value?.commitId !== nextAfter || options.activeSession.value?.id !== sessionId) return
    synchronizedDiffSessionKey = `${sessionId}|${nextBefore ?? 'current'}|${nextAfter ?? 'current'}`
    options.setSessionMode(sessionId, 'diff', { beforeRevisionId: nextBefore, afterRevisionId: nextAfter })
  }
  return { diffSessionState, editorComparison, handleTimelineAction, handleChangesNodeActivate, selectWorkspaceDiff }
}
