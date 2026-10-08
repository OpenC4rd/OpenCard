import { computed, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../workspace/store/projectStore'
import type { OcNodeActionEvent, OcNodeActivateEvent } from '../../../shared/ui/node/node.types'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { useOcdocumentDiffSession } from '../../version-control/useOcdocumentDiffSession'
import type { DiffRevisionOption } from '../../version-control/diff.types'
import { CHANGED_FOLDER_KEY_MARK } from '../../version-control/changedPathTree'
import { TIMELINE_COMPARE_WITH_DISK_ACTION_KEY } from '../../version-control/useProjectTimeline'

export function useWorkbenchVersionActions(options: {
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
  onChangesExpansionChange: (event: { key: string; expanded: boolean }) => void
}) {
  const project = useProjectStore()
  const { t } = useI18n()
  function runtime(session: EditorSession) {
    let current = project.comparisons.get(session.state.id)
    if (!current) {
      current = useOcdocumentDiffSession({
        translate: t, projectRoot: options.projectRoot, environment: project.resourceEnvironment,
        filePath: computed(() => session.state.path ? project.getRelativeProjectPath(session.state.path) : null),
        fileName: computed(() => session.state.name), revisions: options.timelineRevisionOptions,
      })
      project.comparisons.set(session.state.id, current)
    }
    return current
  }
  const current = computed(() => options.activeSession.value ? project.comparisons.get(options.activeSession.value.state.id) : undefined)
  const diffSessionState = {
    before: computed(() => current.value?.before.value ?? null), after: computed(() => current.value?.after.value ?? null),
    error: computed(() => current.value?.error.value ?? null), loading: computed(() => current.value?.loading.value ?? false),
    diffSession: computed(() => current.value?.diffSession.value ?? null),
    beforeSnapshotRoot: computed(() => current.value?.beforeSnapshotRoot.value ?? null), afterSnapshotRoot: computed(() => current.value?.afterSnapshotRoot.value ?? null),
  }
  watch(() => [options.activeSession.value, options.activeSession.value?.state.mode] as const, ([session, mode]) => {
    if (!session) return
    if (mode !== 'diff') { void project.releaseComparison(session.state.id); return }
    const state = runtime(session)
    if (!state.diffSession.value && !state.loading.value) void state.selectComparison(session.state.diff?.beforeRevisionId ?? null, session.state.diff?.afterRevisionId ?? null)
  }, { immediate: true })
  const editorComparison = computed(() => {
    if (options.activeSession.value?.state.mode !== 'diff') return null
    const session = diffSessionState.diffSession.value
    if (!session) return null
    return {
      before: { ...session.before, revisionId: session.before.commitId, resourceRootPath: diffSessionState.beforeSnapshotRoot.value },
      after: { ...session.after, revisionId: session.after.commitId, resourceRootPath: diffSessionState.afterSnapshotRoot.value },
    }
  })
  async function enterDiffComparison(sessionId: string, beforeCommitId: string): Promise<void> {
    const owner = options.activeSession.value
    if (!owner || owner.state.id !== sessionId) return
    const comparison = runtime(owner)
    await comparison.selectComparison(beforeCommitId, null)
    if (diffSessionState.error.value || diffSessionState.before.value?.commitId !== beforeCommitId
      || diffSessionState.after.value?.commitId !== null || options.activeSession.value?.state.id !== sessionId) return
    options.activeSession.value?.setMode('diff', { beforeRevisionId: beforeCommitId, afterRevisionId: null })
  }
  async function handleTimelineAction(event: OcNodeActionEvent): Promise<void> {
    if (event.actionKey !== TIMELINE_COMPARE_WITH_DISK_ACTION_KEY || !options.timelineFilePath.value) return
    const commitId = event.key.startsWith('timeline:') ? event.key.slice('timeline:'.length) : null
    const sessionId = options.activeSession.value?.state.id
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
    if (beforeCommitId) await enterDiffComparison(session.state.id, beforeCommitId)
  }
  async function selectWorkspaceDiff(side: 'before' | 'after', revisionId: string | null): Promise<void> {
    const currentBefore = diffSessionState.before.value?.commitId ?? null
    const currentAfter = diffSessionState.after.value?.commitId ?? null
    const nextBefore = side === 'before' ? revisionId : currentBefore
    const nextAfter = side === 'after' ? revisionId : currentAfter
    const sessionId = options.activeSession.value?.state.id
    if (nextBefore === nextAfter || !sessionId) return
    const owner = options.activeSession.value!
    await runtime(owner).selectComparison(nextBefore, nextAfter)
    if (diffSessionState.error.value || diffSessionState.before.value?.commitId !== nextBefore
      || diffSessionState.after.value?.commitId !== nextAfter || options.activeSession.value?.state.id !== sessionId) return
    options.activeSession.value?.setMode('diff', { beforeRevisionId: nextBefore, afterRevisionId: nextAfter })
  }
  return { diffSessionState, editorComparison, handleTimelineAction, handleChangesNodeActivate, selectWorkspaceDiff }
}
