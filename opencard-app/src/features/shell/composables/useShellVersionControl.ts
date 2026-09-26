/**
 * 模块说明：
 * - 组装版本库切片：项目时间线与版本图状态、提交版本流程，以及直接按设置初始化仓库。
 * 职责边界：
 * - 只维护版本库状态与其动作；不渲染侧栏与对话框，也不创建编辑器对比会话。
 */
import { computed, ref, watch, type DeepReadonly, type Ref } from 'vue'
import type {
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeExpansionSyncEvent,
} from '../../../shared/ui/node/node.types'
import type { DiffRevisionOption } from '../../version-control/diff.types'
import { createCommit, initializeRepository, readFileHistory, stageAll } from '../../version-control/gitService'
import type { GitStatusEntry } from '../../version-control/git.types'
import {
  commitSelectedPaths,
  discardTrackedPaths,
  discardUntrackedPaths,
  ignoreGitPath,
} from '../../version-control/changeActions'
import { changedPathsUnder, decorateChangedPathTree } from '../../version-control/changedPathActions'
import { gitignorePatternForExtension, gitignorePatternForPath } from '../../version-control/gitignorePatterns'
import { useProjectTimeline } from '../../version-control/useProjectTimeline'
import { notifyError, notifyWarning } from '../../notifications/titlebarNotices'
import { resolveCommitterIdentity, type AppSettingKey, type AppSettings } from '../../settings/model/appSettings'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { isRepositorySidebarReady } from '../shellSidebarConfig'

/**
 * 版本库切片要读取的 shell 状态与项目仓储投影。
 * 时间线跟随当前工作区文档，因此编辑器会话按名字直接注入。
 */
type ShellVersionControlOptions = {
  /** 当前项目根路径；空字符串表示未打开项目。 */
  projectPath: Readonly<Ref<string>>
  /** 当前编辑器会话；时间线只跟随其中的工作区文档。 */
  activeSession: Readonly<Ref<EditorSession | null>>
  /** 当前语言；时间线节点文案与相对时间由它决定。 */
  locale: Ref<string>
  /** i18n 翻译函数；第二参可以是插值参数，也可以是缺省文案。 */
  translate: (key: string, paramsOrFallback?: Record<string, unknown> | string) => string
  /** 项目文件变化版本号；变化后刷新版本库状态。 */
  fileChangeRevision: Readonly<Ref<number>>
  /** 工作区绝对路径转项目相对路径。 */
  getRelativeProjectPath: (path: string) => string
  /** 把项目相对路径移入回收站：放弃新增内容时用它，磁盘上的文件还留得下来。 */
  moveProjectEntryToTrash: (relativePath: string) => Promise<void>
  /** 跳到某个设置项：提交者身份不合法时用它把用户带到该行。 */
  openSetting: (key: AppSettingKey) => void
  /** 应用设置：初始化仓库时直接取提交者身份与是否创建首次提交。 */
  settings: Readonly<Ref<DeepReadonly<AppSettings>>>
}

type ShellVersionControl = {
  /** 提交版本对话框；开关由 shell 的动作分发与下面的处理器共同维护。 */
  commitVersionDialogOpen: Ref<boolean>
  isCommittingVersion: Readonly<Ref<boolean>>
  commitVersionError: Ref<string>
  /** 初始化仓库：直接用设置里的提交者身份，没有对话框。 */
  isInitializingRepository: Readonly<Ref<boolean>>
  initializeProjectRepository: () => Promise<void>

  /** 当前工作区文档；没有工作区文档时时间线为空。 */
  timelineFilePath: Readonly<Ref<string | null>>
  timelineFileName: Readonly<Ref<string>>
  timelineTreeData: Readonly<Ref<OcNodeCollection>>
  timelineProjectTreeData: Readonly<Ref<OcNodeCollection>>
  changesTreeData: Readonly<Ref<OcNodeCollection>>
  /** 勾选进下一次提交的改动路径；默认是全部改动。 */
  selectedChangePaths: Readonly<Ref<readonly string[]>>
  selectedChangeCount: Readonly<Ref<number>>
  selectChangeNode: (key: string, selected: boolean) => void
  discardChanges: (targets: { tracked: readonly string[]; untracked: readonly string[] }) => Promise<void>
  ignoreChangePath: (path: string, kind: 'file' | 'folder') => Promise<void>
  ignoreChangeExtension: (path: string) => Promise<void>
  /** 更改列表背后的原始状态；调用方据此判断某条改动在磁盘上是否还有文件。 */
  statusEntries: Readonly<Ref<readonly GitStatusEntry[]>>
  timelineLoading: Readonly<Ref<boolean>>
  timelineRevisionOptions: Readonly<Ref<readonly DiffRevisionOption[]>>
  /** 某条改动最后一次提交的版本 id；没有提交过（新增的文件）返回 null。 */
  latestCommitIdForPath: (relativePath: string) => Promise<string | null>
  refreshTimeline: () => Promise<void>
  refreshTimelineStatus: () => Promise<void>
  timelinePlaceholder: Readonly<Ref<string>>
  versionGraphExpandedKeys: Readonly<Ref<string[]>>
  /** 变更列表里展开的节点：点目录分组默认展开，用户收起后保持收起。 */
  changesExpandedKeys: Readonly<Ref<string[]>>

  /** 版本库就绪状态；侧栏据此决定显示变更与版本图，还是显示初始化入口。 */
  repositoryReady: Readonly<Ref<boolean>>
  repositoryNeedsInitialization: Readonly<Ref<boolean>>

  handleVersionGraphExpansionChange: (event: OcNodeExpansionEvent) => void
  handleVersionGraphExpansionSync: (event: OcNodeExpansionSyncEvent) => void
  handleChangesExpansionChange: (event: OcNodeExpansionEvent) => void
  handleChangesExpansionSync: (event: OcNodeExpansionSyncEvent) => void
  closeCommitVersionDialog: () => void
  commitVersion: (value: { summary: string; description: string }) => Promise<void>
}

export function useShellVersionControl(options: ShellVersionControlOptions): ShellVersionControl {
  const {
    projectPath,
    activeSession,
    locale,
    translate: t,
    fileChangeRevision,
    getRelativeProjectPath,
    moveProjectEntryToTrash,
    settings,
  } = options

  const commitVersionDialogOpen = ref(false)
  const isCommittingVersion = ref(false)
  const commitVersionError = ref('')
  const isInitializingRepository = ref(false)

  const timelineFilePath = computed(() => {
    const session = activeSession.value
    if (!projectPath.value || session?.resourceKind !== 'workspace' || !session.path) return null
    return getRelativeProjectPath(session.path)
  })
  const projectTimeline = useProjectTimeline(
    projectPath,
    timelineFilePath,
    locale,
    computed(() => t('sidebar.timelineCompareWithDisk')),
  )
  const {
    treeData: timelineTreeData,
    projectTreeData: timelineProjectTreeData,
    changesTreeData: timelineChangesTreeData,
    statusEntries,
    loading: timelineLoading,
    initialized: timelineInitialized,
    errorKind: timelineErrorKind,
    refresh: refreshTimeline,
    refreshStatus: refreshTimelineStatus,
    revisionOptions: timelineRevisionOptions,
  } = projectTimeline

  /**
   * 勾选状态记的是"被取消勾选的路径"：默认全选，所以新出现的改动一进来就是选中的，
   * 用户取消过的那些在下一轮刷新后仍然保持取消。
   */
  const uncheckedChangePaths = ref<string[]>([])
  function isChangeSelected(path: string): boolean {
    return !uncheckedChangePaths.value.includes(path)
  }
  function selectChangeNode(key: string, selected: boolean): void {
    const paths = changedPathsUnder(timelineChangesTreeData.value, key)
    if (paths.length === 0) return
    const next = new Set(uncheckedChangePaths.value)
    for (const path of paths) {
      if (selected) next.delete(path)
      else next.add(path)
    }
    uncheckedChangePaths.value = [...next]
  }
  // 换项目后路径没有可比性，勾选从"全选"重新开始。
  watch(projectPath, () => { uncheckedChangePaths.value = [] })
  /** 勾选的改动 = 列表里的每条路径减去取消勾选的。 */
  const selectedChangePaths = computed<readonly string[]>(() => {
    const collection = timelineChangesTreeData.value
    return collection.rootKeys
      .flatMap(key => changedPathsUnder(collection, key))
      .filter(isChangeSelected)
  })
  const changesTreeData = computed<OcNodeCollection>(() => decorateChangedPathTree(
    timelineChangesTreeData.value,
    {
      statusEntries: statusEntries.value,
      isSelected: isChangeSelected,
      translate: t,
    },
  ))
  const repositoryReady = computed(() => isRepositorySidebarReady(timelineInitialized.value))
  const repositoryNeedsInitialization = computed(() => (
    timelineInitialized.value === false && !timelineErrorKind.value
  ))
  const versionGraphExpandedKeys = ref<string[]>([])
  watch(timelineProjectTreeData, data => {
    // 重载期间时间线会先发布一棵空树：数据已清空，历史尚未载入。
    // 空树不携带任何节点信息，不能据此判定展开键已失效，否则每次刷新都会丢掉展开状态。
    if (data.rootKeys.length === 0) return
    versionGraphExpandedKeys.value = versionGraphExpandedKeys.value.filter(key => data.children.has(key))
  })
  watch(fileChangeRevision, () => {
    if (projectPath.value) void refreshTimelineStatus()
  })
  const timelineFileName = computed(() => activeSession.value?.name ?? timelineFilePath.value?.split(/[\\/]/).pop() ?? 'ocdocument')

  function handleVersionGraphExpansionChange(event: OcNodeExpansionEvent): void {
    versionGraphExpandedKeys.value = event.expanded
      ? [...new Set([...versionGraphExpandedKeys.value, event.key])]
      : versionGraphExpandedKeys.value.filter(key => key !== event.key)
  }

  function handleVersionGraphExpansionSync(event: OcNodeExpansionSyncEvent): void {
    versionGraphExpandedKeys.value = event.expandedKeys
  }

  /**
   * 变更列表的展开状态由"哪些分组被收起"反推：新出现的分组默认展开，
   * 于是点目录里的文件一出现就是可见的，用户收起后也不会被下一次刷新顶开。
   */
  const collapsedChangeGroupKeys = ref<string[]>([])
  const changesExpandedKeys = computed(() => [...changesTreeData.value.children.keys()]
    .filter(key => !collapsedChangeGroupKeys.value.includes(key)))

  function handleChangesExpansionChange(event: OcNodeExpansionEvent): void {
    collapsedChangeGroupKeys.value = event.expanded
      ? collapsedChangeGroupKeys.value.filter(key => key !== event.key)
      : [...new Set([...collapsedChangeGroupKeys.value, event.key])]
  }

  function handleChangesExpansionSync(event: OcNodeExpansionSyncEvent): void {
    const expanded = new Set(event.expandedKeys)
    collapsedChangeGroupKeys.value = [...changesTreeData.value.children.keys()]
      .filter(key => !expanded.has(key))
  }

  const timelinePlaceholder = computed(() => {
    if (!timelineFilePath.value) return t('sidebar.timelineNoFile')
    if (timelineLoading.value) return t('sidebar.timelineLoading')
    if (timelineErrorKind.value) return t('sidebar.timelineFailed')
    if (timelineInitialized.value === false) return t('sidebar.timelineNotInitialized')
    if (timelineInitialized.value === true && !projectTimeline.hasHistory.value) {
      return t('sidebar.timelineNoCommits')
    }
    return t('sidebar.timelineNoFile')
  })

  /**
   * 某条改动最后一次提交的版本：更改列表点开对比时，"最新提交 ↔ 磁盘"的左半边就是它。
   * 没有历史可读（新增的文件、读不到历史）时返回 null，调用方保持普通编辑，不切差异模式。
   */
  async function latestCommitIdForPath(relativePath: string): Promise<string | null> {
    const root = projectPath.value
    if (!root) return null
    const result = await readFileHistory(root, { path: relativePath, limit: 1 })
    return result.ok ? result.value?.[0]?.id ?? null : null
  }

  function closeCommitVersionDialog(): void {
    if (isCommittingVersion.value) return
    commitVersionDialogOpen.value = false
    commitVersionError.value = ''
  }

  /** 首次提交：仓库已经建好，这一步失败只提示，不把整次初始化判为失败。 */
  async function createInitialCommit(root: string): Promise<boolean> {
    try {
      const staged = await stageAll(root)
      if (!staged.ok || !staged.value) {
        notifyWarning(t('sidebar.initialCommitFailed'))
        return false
      }
      const committed = await createCommit(root, { message: t('sidebar.initialCommitMessage') })
      if (!committed.ok || !committed.value) {
        notifyWarning(t('sidebar.initialCommitFailed'))
        return false
      }
      return true
    } catch {
      notifyWarning(t('sidebar.initialCommitFailed'))
      return false
    }
  }

  /**
   * 初始化仓库：提交者身份与"是否创建首次提交"都取设置里的值。
   * 名称、邮箱都能从作者身份兜底，所以这里不再打断用户；只有 git 明确拒绝这套身份时，
   * 才把用户送到"协作"设置里改。
   */
  async function initializeProjectRepository(): Promise<void> {
    const root = projectPath.value
    if (!root || isInitializingRepository.value) return
    const identity = resolveCommitterIdentity(settings.value)
    isInitializingRepository.value = true
    try {
      try {
        const initialized = await initializeRepository(root, identity)
        if (!initialized.ok || !initialized.value) {
          const failure = initialized.error
          if (failure?.kind === 'invalid-input') {
            notifyWarning(failure.message)
            options.openSetting('versionControl.committerName')
            return
          }
          notifyError(failure?.message ?? t('sidebar.initializeFailed'))
          return
        }
      } catch (error) {
        notifyError(error instanceof Error && error.message ? error.message : t('sidebar.initializeFailed'))
        return
      }
      await refreshTimeline()

      if (!settings.value.versionControl.createInitialCommit) return
      if (!await createInitialCommit(root)) return
      await refreshTimeline()
    } finally {
      isInitializingRepository.value = false
    }
  }

  /**
   * 放弃更改：已提交过的路径恢复到 HEAD，新增的路径移入回收站。
   * 两类一起处理，所以一条分组行的"放弃"也能同时覆盖它下面的两种内容。
   */
  async function discardChanges(targets: {
    tracked: readonly string[]
    untracked: readonly string[]
  }): Promise<void> {
    const root = projectPath.value
    if (!root) return
    try {
      await discardTrackedPaths(root, targets.tracked)
      await discardUntrackedPaths({
        projectRoot: root,
        paths: targets.untracked,
        moveToTrash: moveProjectEntryToTrash,
      })
      await refreshTimelineStatus()
    } catch (error) {
      notifyError(error instanceof Error && error.message ? error.message : t('sidebar.changesDiscardFailed'))
    }
  }

  /** 写一条忽略规则；写完刷新状态，被忽略的未跟踪内容会立刻从改动列表消失。 */
  async function writeIgnorePattern(pattern: string): Promise<void> {
    const root = projectPath.value
    if (!root) return
    try {
      await ignoreGitPath({ projectRoot: root, pattern })
      await refreshTimelineStatus()
    } catch (error) {
      notifyError(error instanceof Error && error.message ? error.message : t('sidebar.changesIgnoreFailed'))
    }
  }

  async function ignoreChangePath(path: string, kind: 'file' | 'folder'): Promise<void> {
    await writeIgnorePattern(gitignorePatternForPath(path, kind))
  }

  async function ignoreChangeExtension(path: string): Promise<void> {
    const pattern = gitignorePatternForExtension(path)
    if (pattern) await writeIgnorePattern(pattern)
  }

  /** 提交勾选项：索引里只留下勾选的路径，未勾选的改动原样留在工作区。 */
  async function commitVersion(value: { summary: string; description: string }): Promise<void> {
    const root = projectPath.value
    const paths = selectedChangePaths.value
    if (!root || isCommittingVersion.value || paths.length === 0) return
    isCommittingVersion.value = true
    commitVersionError.value = ''
    try {
      const message = value.description ? `${value.summary}\n\n${value.description}` : value.summary
      await commitSelectedPaths({ projectRoot: root, paths, message })
      commitVersionDialogOpen.value = false
      await refreshTimeline()
    } catch (error) {
      commitVersionError.value = error instanceof Error && error.message
        ? error.message
        : t('sidebar.commitDialog.failed')
    } finally {
      isCommittingVersion.value = false
    }
  }

  return {
    commitVersionDialogOpen,
    isCommittingVersion,
    commitVersionError,
    isInitializingRepository,
    timelineFilePath,
    timelineFileName,
    timelineTreeData,
    timelineProjectTreeData,
    changesTreeData,
    selectedChangePaths,
    selectedChangeCount: computed(() => selectedChangePaths.value.length),
    selectChangeNode,
    discardChanges,
    ignoreChangePath,
    ignoreChangeExtension,
    statusEntries,
    timelineLoading,
    timelineRevisionOptions,
    latestCommitIdForPath,
    refreshTimeline,
    refreshTimelineStatus,
    timelinePlaceholder,
    versionGraphExpandedKeys,
    changesExpandedKeys,
    repositoryReady,
    repositoryNeedsInitialization,
    handleVersionGraphExpansionChange,
    handleVersionGraphExpansionSync,
    handleChangesExpansionChange,
    handleChangesExpansionSync,
    closeCommitVersionDialog,
    initializeProjectRepository,
    commitVersion,
  }
}
