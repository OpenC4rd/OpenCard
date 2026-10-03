import { computed, ref, watch, type Ref } from 'vue'

import type { OcNode, OcNodeAction, OcNodeBadge, OcNodeCollection } from '../../shared/ui/node/node.types'
import { createChangedPathTree } from './changedPathTree'
import { inspectRepository, readFileHistory, readHistory, readStatus } from './gitService'
import { formatRelativeTime } from '../../shared/i18n/relativeTime'
import type { CommitChangedFile, CommitSummary, GitErrorKind, GitStatusEntry } from './git.types'
import type { DiffRevisionOption } from './diff.types'
import { resolveEntryIcon } from '../workspace/model/fileTypes'

const HISTORY_LIMIT = 50
export const TIMELINE_COMPARE_WITH_DISK_ACTION_KEY = 'timeline.compare-with-disk'
const STATUS_REFRESH_DEBOUNCE_MS = 120

const emptyHistoryResult = () => ({
  ok: true as const,
  value: [] as CommitSummary[],
  error: null,
  retryable: false,
  authenticationRequired: false,
  conflicted: false,
  continuable: false,
  abortable: false,
})

export function useProjectTimeline(
  projectPath: Ref<string | null | undefined>,
  currentFilePath: Ref<string | null | undefined>,
  locale: Ref<string>,
  compareWithDiskLabel: Ref<string>,
) {
  const commits = ref<CommitSummary[]>([])
  const projectCommits = ref<CommitSummary[]>([])
  const statusEntries = ref<GitStatusEntry[]>([])
  const statusUpdatedAt = ref<number | null>(null)
  const statusStale = ref(false)
  const loading = ref(false)
  const historyLoaded = ref(false)
  const initialized = ref<boolean | null>(null)
  const errorKind = ref<GitErrorKind | null>(null)
  let requestRevision = 0
  let statusRequestRevision = 0
  let inspectedRoot: string | null = null
  let statusRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let statusRefreshResolvers: Array<() => void> = []

  function changedFileTail(file: CommitChangedFile): OcNodeBadge {
    const titles = locale.value === 'zh-CN'
      ? { added: '新增', modified: '修改', deleted: '删除' }
      : { added: 'Added', modified: 'Modified', deleted: 'Deleted' }
    if (file.status === 'added') return { type: 'badge', label: titles.added, icon: 'action.add', tone: 'success' }
    if (file.status === 'deleted') return { type: 'badge', label: titles.deleted, icon: 'action.minus', tone: 'danger' }
    return { type: 'badge', label: titles.modified, icon: 'status.circle-medium', tone: 'warning' }
  }

  function statusTail(entry: GitStatusEntry): OcNodeBadge {
    const titles = locale.value === 'zh-CN'
      ? { added: '新增', modified: '修改', deleted: '删除' }
      : { added: 'Added', modified: 'Modified', deleted: 'Deleted' }
    if (entry.indexDeleted || entry.worktreeDeleted) return { type: 'badge', label: titles.deleted, icon: 'action.minus', tone: 'danger' }
    if (entry.indexNew || entry.worktreeNew) return { type: 'badge', label: titles.added, icon: 'action.add', tone: 'success' }
    return { type: 'badge', label: titles.modified, icon: 'status.circle-medium', tone: 'warning' }
  }

  function createCommitTree(
    commits: CommitSummary[],
    keyPrefix: string,
    visible = historyLoaded.value,
    actions: readonly OcNodeAction[] = [],
    includeChangedPaths = false,
  ): OcNodeCollection {
    if (!visible) return { rootKeys: [], items: new Map(), children: new Map() }
    const items = new Map<string, OcNode>()
    const children = new Map<string, readonly string[]>()
    const rootKeys = commits.map(commit => `${keyPrefix}:${commit.id}`)
    for (const commit of commits) {
      const key = `${keyPrefix}:${commit.id}`
      items.set(key, {
        label: `${commit.summary.trim() || commit.shortId} ${commit.shortId}`,
        tail: [formatRelativeTime(commit.authoredAtSeconds * 1000, locale.value), ...actions],
        visual: { type: 'icon', icon: 'file.git' },
      })
      const changedFiles = Array.isArray(commit.changedFiles) ? commit.changedFiles : []
      if (!includeChangedPaths || changedFiles.length === 0) continue
      const fileTree = createChangedPathTree(changedFiles.map(file => {
        const presentation = resolveEntryIcon(file.path, file.path.endsWith('/'))
        return {
          path: file.path,
          node: {
            label: file.path,
            visual: { type: 'icon', icon: presentation.icon, iconTone: presentation.tone },
            tail: changedFileTail(file),
          } satisfies OcNode,
        }
      }), key)
      children.set(key, fileTree.rootKeys)
      // 点目录分组本身也要挂到 commit 下面，所以连它自己的父子关系一起并进来。
      for (const [fileKey, node] of fileTree.items) items.set(fileKey, node)
      for (const [parentKey, childKeys] of fileTree.children) children.set(parentKey, childKeys)
    }
    return { rootKeys, items, children }
  }

  const compareWithDiskAction = computed<OcNodeAction>(() => ({
    key: TIMELINE_COMPARE_WITH_DISK_ACTION_KEY,
    title: compareWithDiskLabel.value,
    icon: 'action.file-arrow-up-down',
  }))

  const treeData = computed(() => createCommitTree(
    commits.value,
    'timeline',
    Boolean(currentFilePath.value) && historyLoaded.value,
    [compareWithDiskAction.value],
  ))
  const projectTreeData = computed(() => createCommitTree(
    projectCommits.value,
    'project-timeline',
    historyLoaded.value,
    [],
    true,
  ))

  const changeEntries = computed(() => statusEntries.value.filter(entry => (
    entry.indexNew || entry.indexModified || entry.indexDeleted
    || entry.worktreeNew || entry.worktreeModified || entry.worktreeDeleted
    || entry.conflicted
  )))

  /** 更改列表的节点 key 就是项目相对路径。 */
  const changesTreeData = computed<OcNodeCollection>(() => createChangedPathTree(
    changeEntries.value.map(entry => {
      const presentation = resolveEntryIcon(entry.path, entry.path.endsWith('/'))
      return {
        path: entry.path,
        node: {
          label: entry.path,
          visual: { type: 'icon', icon: presentation.icon, iconTone: presentation.tone },
          tail: statusTail(entry),
        } satisfies OcNode,
      }
    }),
    '',
  ))

  const revisionOptions = computed<DiffRevisionOption[]>(() => [
    { commitId: null, label: locale.value === 'zh-CN' ? '磁盘版本' : 'Disk version' },
    ...commits.value.map(commit => ({
      commitId: commit.id,
      label: commit.summary.trim() || commit.shortId,
      shortId: commit.shortId,
      authoredAtSeconds: commit.authoredAtSeconds,
    })),
  ])

  function updateStatus(entries: readonly GitStatusEntry[]): void {
    statusEntries.value = [...entries]
    statusUpdatedAt.value = Date.now()
    statusStale.value = false
  }

  async function runStatusRefresh(): Promise<void> {
    const revision = ++statusRequestRevision
    const root = projectPath.value
    if (!root || initialized.value === false) return
    try {
      const result = await readStatus(root)
      if (revision !== statusRequestRevision || root !== projectPath.value) return
      if (!result.ok || !result.value) {
        statusStale.value = true
        return
      }
      updateStatus(result.value.entries)
    } catch {
      if (revision === statusRequestRevision && root === projectPath.value) statusStale.value = true
    }
  }

  function refreshStatus(): Promise<void> {
    return new Promise(resolve => {
      statusRefreshResolvers.push(resolve)
      if (statusRefreshTimer) clearTimeout(statusRefreshTimer)
      statusRefreshTimer = setTimeout(() => {
        statusRefreshTimer = null
        const resolvers = statusRefreshResolvers
        statusRefreshResolvers = []
        void runStatusRefresh().finally(() => {
          resolvers.forEach(resolveRefresh => resolveRefresh())
        })
      }, STATUS_REFRESH_DEBOUNCE_MS)
    })
  }

  async function refresh() {
    const revision = ++requestRevision
    const root = projectPath.value
    const hasCurrentFile = Boolean(currentFilePath.value)
    const rootChanged = root !== inspectedRoot
    commits.value = []
    projectCommits.value = []
    statusEntries.value = []
    statusUpdatedAt.value = null
    statusStale.value = false
    historyLoaded.value = false
    if (rootChanged) initialized.value = null
    errorKind.value = null
    if (!root) {
      inspectedRoot = null
      initialized.value = null
      loading.value = false
      return
    }
    inspectedRoot = root

    loading.value = true
    try {
      const inspection = await inspectRepository(root)
      if (revision !== requestRevision) return
      if (!inspection.ok || !inspection.value) {
        errorKind.value = inspection.error?.kind ?? 'git'
        initialized.value = false
        return
      }
      initialized.value = inspection.value.initialized
      if (!inspection.value.initialized) return

      const [history, fileHistory, statusResult] = await Promise.all([
        readHistory(root, { limit: HISTORY_LIMIT, start: null }),
        hasCurrentFile
          ? readFileHistory(root, { path: currentFilePath.value!, limit: HISTORY_LIMIT })
          : Promise.resolve(emptyHistoryResult()),
        readStatus(root),
      ])
      if (revision !== requestRevision) return
      if (!history.ok || !history.value || !fileHistory.ok || !fileHistory.value) {
        errorKind.value = history.error?.kind ?? fileHistory.error?.kind ?? 'git'
        return
      }
      projectCommits.value = history.value
      commits.value = fileHistory.value
      if (statusResult.ok && statusResult.value) updateStatus(statusResult.value.entries)
      else statusStale.value = true
      historyLoaded.value = true
    } catch {
      if (revision === requestRevision) {
        initialized.value = false
        errorKind.value = 'io'
      }
    } finally {
      if (revision === requestRevision) loading.value = false
    }
  }


  watch(
    [projectPath, currentFilePath],
    () => { void refresh() },
    { immediate: true },
  )

  return {
    treeData,
    projectTreeData,
    changesTreeData,
    statusEntries,
    statusUpdatedAt,
    statusStale,
    loading,
    initialized,
    errorKind,
    refresh,
    refreshStatus,
    hasHistory: computed(() => commits.value.length > 0),
    revisionOptions,
  }
}
