import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  inspectRepository: vi.fn(),
  readFileHistory: vi.fn(),
  readHistory: vi.fn(),
  readStatus: vi.fn(),
  initializeRepository: vi.fn(),
  stageAll: vi.fn(),
  stagePaths: vi.fn(),
  unstageAll: vi.fn(),
  unstagePaths: vi.fn(),
  discardPaths: vi.fn(),
  createCommit: vi.fn(),
}))
vi.mock('../../version-control/gitService', () => mocks)

import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { createDefaultAppSettings, defaultCommitterEmail } from '../../settings/model/appSettings'
import { titleBarNotices } from '../../notifications/titlebarNotices'
import { useShellVersionControl } from './useShellVersionControl'

const PROJECT_ROOT = 'D:/Cards/demo'
const DOCUMENT_PATH = 'cards/main.ocdocument'

const ok = <T>(value: T) => ({
  ok: true,
  value,
  error: null,
  retryable: false,
  authenticationRequired: false,
  conflicted: false,
  continuable: false,
  abortable: false,
})

const failure = (message: string, kind = 'git') => ({
  ok: false,
  value: null,
  error: { kind, message, retryable: false, authenticationRequired: false },
  retryable: false,
  authenticationRequired: false,
  conflicted: false,
  continuable: false,
  abortable: false,
})

const repository = (initialized: boolean) => ({
  initialized,
  projectRoot: PROJECT_ROOT,
  head: null,
  currentBranch: null,
  state: 'clean',
  hasConflicts: false,
  hasChanges: false,
})

const commitSummary = (
  id: string,
  changedFiles: Array<{ path: string, status: 'added' | 'modified' | 'deleted' }> = [],
) => ({
  id,
  shortId: id.slice(0, 7),
  summary: `Commit ${id}`,
  message: `Commit ${id}`,
  authorName: 'Author',
  authorEmail: 'author@example.com',
  authoredAtSeconds: 0,
  parentIds: [],
  changedFiles,
})

function workspaceSession(): EditorSession {
  return {
    id: 'session-1',
    resourceKind: 'workspace',
    path: `${PROJECT_ROOT}/${DOCUMENT_PATH}`,
    fileTypeId: 'opencard',
    name: 'main.ocdocument',
    editorId: 'opencard',
    savedContent: '',
    draftContent: '',
    isDirty: false,
    isPreview: false,
    mode: 'edit',
  }
}

function createVersionControl(
  committer: Partial<{ committerName: string; committerEmail: string; createInitialCommit: boolean }> = {},
  openSetting: (key: string) => void = vi.fn(),
) {
  const projectPath = ref('')
  const activeSession = ref<EditorSession | null>(null)
  const fileChangeRevision = ref(0)
  const settings = ref({
    ...createDefaultAppSettings(),
    versionControl: { ...createDefaultAppSettings().versionControl, ...committer },
  })
  const versionControl = useShellVersionControl({
    projectPath,
    activeSession,
    locale: ref('en-US'),
    translate: key => key,
    fileChangeRevision,
    getRelativeProjectPath: path => path.slice(`${PROJECT_ROOT}/`.length),
    moveProjectEntryToTrash: vi.fn(),
    requestConfirmation: vi.fn().mockResolvedValue(true),
    openSetting,
    settings,
  })
  return { versionControl, projectPath, activeSession, fileChangeRevision, settings }
}

/** 未提交状态条目：默认按"工作区已修改"造，够用来驱动更改列表。 */
const statusEntry = (path: string) => ({
  path,
  indexNew: false,
  indexModified: false,
  indexDeleted: false,
  worktreeNew: false,
  worktreeModified: true,
  worktreeDeleted: false,
  conflicted: false,
})

/** 通知是共享列表：只比对本次动作新追加的那几条。 */
function noticesAfter(count: number): string[] {
  return titleBarNotices.value.slice(count).map(notice => notice.message)
}

describe('useShellVersionControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.inspectRepository.mockResolvedValue(ok(repository(true)))
    mocks.readHistory.mockResolvedValue(ok([]))
    mocks.readFileHistory.mockResolvedValue(ok([]))
    mocks.readStatus.mockResolvedValue(ok({ entries: [] }))
    mocks.initializeRepository.mockResolvedValue(ok(true))
    mocks.stageAll.mockResolvedValue(ok(true))
    mocks.stagePaths.mockResolvedValue(ok(true))
    mocks.unstageAll.mockResolvedValue(ok(true))
    mocks.unstagePaths.mockResolvedValue(ok(true))
    mocks.discardPaths.mockResolvedValue(ok(true))
    mocks.createCommit.mockResolvedValue(ok({ id: 'commit-1' }))
  })

  it('derives repository readiness and the timeline placeholder from the repository inspection', async () => {
    const { versionControl, projectPath, activeSession } = createVersionControl()

    expect(versionControl.repositoryReady.value).toBe(false)
    expect(versionControl.repositoryNeedsInitialization.value).toBe(false)
    expect(versionControl.timelinePlaceholder.value).toBe('sidebar.timelineNoFile')

    projectPath.value = PROJECT_ROOT
    activeSession.value = workspaceSession()
    await vi.waitFor(() => expect(versionControl.repositoryReady.value).toBe(true))

    expect(versionControl.timelineFilePath.value).toBe(DOCUMENT_PATH)
    expect(versionControl.timelineFileName.value).toBe('main.ocdocument')
    expect(versionControl.repositoryNeedsInitialization.value).toBe(false)
    expect(versionControl.timelinePlaceholder.value).toBe('sidebar.timelineNoCommits')

    mocks.inspectRepository.mockResolvedValue(ok(repository(false)))
    await versionControl.refreshTimeline()

    expect(versionControl.repositoryReady.value).toBe(false)
    expect(versionControl.repositoryNeedsInitialization.value).toBe(true)
    expect(versionControl.timelinePlaceholder.value).toBe('sidebar.timelineNotInitialized')

    mocks.inspectRepository.mockResolvedValue(failure('git unavailable'))
    await versionControl.refreshTimeline()

    expect(versionControl.repositoryReady.value).toBe(false)
    expect(versionControl.repositoryNeedsInitialization.value).toBe(false)
    expect(versionControl.timelinePlaceholder.value).toBe('sidebar.timelineFailed')
  })

  it('keeps version graph expansion in step with the commit graph', async () => {
    mocks.readHistory.mockResolvedValue(ok([commitSummary('a1', [{ path: DOCUMENT_PATH, status: 'modified' }])]))
    const { versionControl, projectPath, activeSession } = createVersionControl()
    projectPath.value = PROJECT_ROOT
    activeSession.value = workspaceSession()
    await vi.waitFor(() => expect(versionControl.timelineProjectTreeData.value.rootKeys).toEqual(['project-timeline:a1']))

    versionControl.handleVersionGraphExpansionChange({ key: 'project-timeline:a1', expanded: true })
    versionControl.handleVersionGraphExpansionChange({ key: 'project-timeline:a1', expanded: true })
    expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:a1'])

    versionControl.handleVersionGraphExpansionChange({ key: 'project-timeline:b2', expanded: true })
    expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:a1', 'project-timeline:b2'])

    await versionControl.refreshTimelineStatus()
    expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:a1', 'project-timeline:b2'])

    mocks.readHistory.mockResolvedValue(ok([commitSummary('b2', [{ path: DOCUMENT_PATH, status: 'modified' }])]))
    await versionControl.refreshTimeline()
    // 重载后 a1 真的不在数据里了：仍然存在的 b2 保留展开，只有消失的 a1 被剪掉。
    await vi.waitFor(() => expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:b2']))

    versionControl.handleVersionGraphExpansionChange({ key: 'project-timeline:b2', expanded: true })
    expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:b2'])

    versionControl.handleVersionGraphExpansionChange({ key: 'project-timeline:b2', expanded: false })
    expect(versionControl.versionGraphExpandedKeys.value).toEqual([])

    versionControl.handleVersionGraphExpansionSync({ expandedKeys: ['project-timeline:c3'] })
    expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:c3'])
  })

  it('keeps expanded version graph nodes when the timeline is refreshed', async () => {
    mocks.readHistory.mockResolvedValue(ok([
      commitSummary('a1', [{ path: DOCUMENT_PATH, status: 'modified' }]),
      commitSummary('b2', [{ path: DOCUMENT_PATH, status: 'modified' }]),
    ]))
    const { versionControl, projectPath, activeSession } = createVersionControl()
    projectPath.value = PROJECT_ROOT
    activeSession.value = workspaceSession()
    await vi.waitFor(() => expect(versionControl.timelineProjectTreeData.value.rootKeys).toEqual([
      'project-timeline:a1',
      'project-timeline:b2',
    ]))

    versionControl.handleVersionGraphExpansionChange({ key: 'project-timeline:a1', expanded: true })
    versionControl.handleVersionGraphExpansionChange({ key: 'project-timeline:b2', expanded: true })
    expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:a1', 'project-timeline:b2'])

    await versionControl.refreshTimeline()
    await nextTick()

    expect(versionControl.timelineProjectTreeData.value.rootKeys).toEqual([
      'project-timeline:a1',
      'project-timeline:b2',
    ])
    expect(versionControl.versionGraphExpandedKeys.value).toEqual(['project-timeline:a1', 'project-timeline:b2'])
  })

  it('keeps the commit dialog open while a commit runs and closes it on success', async () => {
    mocks.readStatus.mockResolvedValue(ok({ entries: [statusEntry(DOCUMENT_PATH)] }))
    const { versionControl, projectPath } = createVersionControl()
    projectPath.value = PROJECT_ROOT
    await vi.waitFor(() => expect(versionControl.selectedChangeCount.value).toBe(1))
    versionControl.commitVersionDialogOpen.value = true
    versionControl.commitVersionError.value = 'stale error'

    let releaseStage: ((value: unknown) => void) | undefined
    mocks.stagePaths.mockImplementationOnce(() => new Promise(resolve => { releaseStage = resolve }))

    const pending = versionControl.commitVersion({ summary: 'Publish', description: 'Details' })
    expect(versionControl.isCommittingVersion.value).toBe(true)
    expect(versionControl.commitVersionError.value).toBe('')

    versionControl.closeCommitVersionDialog()
    expect(versionControl.commitVersionDialogOpen.value).toBe(true)

    await vi.waitFor(() => expect(releaseStage).toBeTypeOf('function'))
    releaseStage?.(ok(true))
    await pending

    expect(versionControl.isCommittingVersion.value).toBe(false)
    expect(versionControl.commitVersionDialogOpen.value).toBe(false)
    // 只暂存勾选项：索引先回到 HEAD，再放上这一条改动。
    expect(mocks.unstageAll).toHaveBeenCalledWith(PROJECT_ROOT)
    expect(mocks.stagePaths).toHaveBeenCalledWith(PROJECT_ROOT, { paths: [DOCUMENT_PATH] })
    expect(mocks.createCommit).toHaveBeenCalledWith(PROJECT_ROOT, { message: 'Publish\n\nDetails' })
  })

  it('reports a failed commit without closing the dialog', async () => {
    mocks.readStatus.mockResolvedValue(ok({ entries: [statusEntry(DOCUMENT_PATH)] }))
    const { versionControl, projectPath } = createVersionControl()
    projectPath.value = PROJECT_ROOT
    await vi.waitFor(() => expect(versionControl.selectedChangeCount.value).toBe(1))
    versionControl.commitVersionDialogOpen.value = true
    mocks.stagePaths.mockResolvedValue(failure('nothing staged'))

    await versionControl.commitVersion({ summary: 'Publish', description: '' })

    expect(versionControl.commitVersionError.value).toBe('nothing staged')
    expect(versionControl.commitVersionDialogOpen.value).toBe(true)
    expect(versionControl.isCommittingVersion.value).toBe(false)
    expect(mocks.createCommit).not.toHaveBeenCalled()
  })

  it('initializes with the configured identity and creates the first commit by default', async () => {
    const { versionControl, projectPath } = createVersionControl({ committerName: '张三' })
    projectPath.value = PROJECT_ROOT

    await versionControl.initializeProjectRepository()

    // 邮箱留空：按名称走 key 用的同一套归一化算法。
    expect(mocks.initializeRepository).toHaveBeenCalledWith(PROJECT_ROOT, {
      name: '张三',
      email: 'zhang-san@noreply.example',
    })
    expect(mocks.stageAll).toHaveBeenCalledWith(PROJECT_ROOT)
    expect(mocks.createCommit).toHaveBeenCalledWith(PROJECT_ROOT, { message: 'sidebar.initialCommitMessage' })
    expect(versionControl.isInitializingRepository.value).toBe(false)
  })

  it('skips the first commit when the setting is off and keeps an explicit email', async () => {
    const { versionControl, projectPath } = createVersionControl({
      committerName: 'Author',
      committerEmail: 'author@example.com',
      createInitialCommit: false,
    })
    projectPath.value = PROJECT_ROOT

    await versionControl.initializeProjectRepository()

    expect(mocks.initializeRepository).toHaveBeenCalledWith(PROJECT_ROOT, {
      name: 'Author',
      email: 'author@example.com',
    })
    expect(mocks.stageAll).not.toHaveBeenCalled()
    expect(mocks.createCommit).not.toHaveBeenCalled()
  })

  it('falls back to the author identity when no committer name is configured', async () => {
    const { versionControl, projectPath } = createVersionControl()
    projectPath.value = PROJECT_ROOT

    await versionControl.initializeProjectRepository()

    const publisherKey = createDefaultAppSettings().identity.publisherKey
    expect(mocks.initializeRepository).toHaveBeenCalledWith(PROJECT_ROOT, {
      name: publisherKey,
      email: defaultCommitterEmail(publisherKey),
    })
  })

  it('opens the committer setting when git rejects the identity', async () => {
    const navigator = vi.fn()
    const noticeCount = titleBarNotices.value.length
    const { versionControl, projectPath } = createVersionControl({ committerName: 'Author' }, navigator)
    projectPath.value = PROJECT_ROOT
    mocks.initializeRepository.mockResolvedValueOnce(failure('bad identity', 'invalid-input'))

    await versionControl.initializeProjectRepository()

    expect(navigator).toHaveBeenCalledWith('versionControl.committerName')
    expect(noticesAfter(noticeCount)).toEqual(['bad identity'])
    expect(mocks.stageAll).not.toHaveBeenCalled()
  })

  it('reports an initialization failure without leaving the busy state on', async () => {
    const noticeCount = titleBarNotices.value.length
    const { versionControl, projectPath } = createVersionControl({ committerName: 'Author' })
    projectPath.value = PROJECT_ROOT
    mocks.initializeRepository.mockRejectedValueOnce(new Error('initialization exploded'))

    await versionControl.initializeProjectRepository()

    expect(versionControl.isInitializingRepository.value).toBe(false)
    expect(noticesAfter(noticeCount)).toEqual(['initialization exploded'])
    expect(mocks.stageAll).not.toHaveBeenCalled()
  })

  it('falls back to the generic message when initialization throws a non-error', async () => {
    const noticeCount = titleBarNotices.value.length
    const { versionControl, projectPath } = createVersionControl({ committerName: 'Author' })
    projectPath.value = PROJECT_ROOT
    mocks.initializeRepository.mockRejectedValueOnce('initialization exploded')

    await versionControl.initializeProjectRepository()

    expect(noticesAfter(noticeCount)).toEqual(['sidebar.initializeFailed'])
  })

  it('reports a failed first commit as such once the repository exists', async () => {
    const noticeCount = titleBarNotices.value.length
    const { versionControl, projectPath } = createVersionControl({ committerName: 'Author' })
    projectPath.value = PROJECT_ROOT
    mocks.stageAll.mockRejectedValueOnce('initial commit exploded')

    await versionControl.initializeProjectRepository()

    expect(mocks.initializeRepository).toHaveBeenCalled()
    expect(versionControl.isInitializingRepository.value).toBe(false)
    expect(noticesAfter(noticeCount)).toEqual(['sidebar.initialCommitFailed'])
  })

  it('refreshes repository status for a file change only while a project is open', async () => {
    const { versionControl, projectPath, fileChangeRevision } = createVersionControl()

    await versionControl.refreshTimelineStatus()
    expect(mocks.readStatus).not.toHaveBeenCalled()

    projectPath.value = PROJECT_ROOT
    await vi.waitFor(() => expect(versionControl.repositoryReady.value).toBe(true))
    mocks.readStatus.mockClear()

    fileChangeRevision.value += 1
    await vi.waitFor(() => expect(mocks.readStatus).toHaveBeenCalledWith(PROJECT_ROOT))
  })
})
