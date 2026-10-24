// @vitest-environment node
import { nextTick, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isNodeTailAction, normalizeNodeTail } from '../../shared/ui/node/node.types'

const mocks = vi.hoisted(() => ({
  inspectRepository: vi.fn(),
  readFileHistory: vi.fn(),
  readHistory: vi.fn(),
  readStatus: vi.fn(),
}))
vi.mock('./gitService', () => mocks)

import { useProjectTimeline } from './useProjectTimeline'

const ok = <T>(value: T) => ({
  ok: true, value, error: null, retryable: false, authenticationRequired: false,
  conflicted: false, continuable: false, abortable: false,
})
const repository = {
  initialized: true, projectRoot: 'D:/Cards/demo', head: 'abc', currentBranch: 'main',
  state: 'clean', hasConflicts: false, hasChanges: false,
}
const commit = (
  id: string,
  summary: string,
  changedFiles: Array<{ path: string, status: 'added' | 'modified' | 'deleted' }> = [],
) => ({
  id, shortId: id.slice(0, 7), summary, message: summary, authorName: 'Author',
  authorEmail: 'author@example.com', authoredAtSeconds: 0, parentIds: [], changedFiles,
})
const statusEntry = (path: string, overrides: Partial<{
  indexNew: boolean, indexModified: boolean, indexDeleted: boolean
  worktreeNew: boolean, worktreeModified: boolean, worktreeDeleted: boolean
  conflicted: boolean, ignored: boolean
}> = {}) => ({
  path, indexNew: false, indexModified: false, indexDeleted: false,
  worktreeNew: false, worktreeModified: false, worktreeDeleted: false,
  conflicted: false, ignored: false, ...overrides,
})
const useTimeline = (project: Ref<string | null | undefined>, file = ref<string | null>('cards/main.ocdocument')) => (
  useProjectTimeline(project, file, ref('en-US'), ref('Compare with disk'))
)

describe('useProjectTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.inspectRepository.mockResolvedValue(ok(repository))
    mocks.readHistory.mockResolvedValue(ok([]))
    mocks.readFileHistory.mockResolvedValue(ok([]))
    mocks.readStatus.mockResolvedValue(ok({ entries: [] }))
  })

  it('keeps untracked directory paths whole while displaying their names', async () => {
    mocks.readStatus.mockResolvedValueOnce(ok({ entries: [
      statusEntry('.opencard/', { worktreeNew: true }),
      statusEntry('assets/', { worktreeNew: true }),
    ] }))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(state.changesTreeData.value.rootKeys).toEqual(['.opencard/', 'assets/']))

    const tree = state.changesTreeData.value
    expect(tree.items.get('.opencard/')?.label).toBe('.opencard')
    expect(tree.items.get('assets/')?.label).toBe('assets')
    expect(tree.children.size).toBe(0)
  })

  it('stays empty without a current project', async () => {
    const state = useTimeline(ref<string | null>(null))
    await nextTick()

    expect(state.treeData.value.rootKeys).toEqual([])
    expect(state.projectTreeData.value.rootKeys).toEqual([])
    expect(mocks.inspectRepository).not.toHaveBeenCalled()
  })

  it('shows project history without loading a file timeline when no document is selected', async () => {
    mocks.readHistory.mockResolvedValueOnce(ok([commit('project1', 'Project commit')]))
    const state = useTimeline(ref('D:/Cards/demo'), ref(null))
    await vi.waitFor(() => expect(state.projectTreeData.value.rootKeys).toEqual(['project-timeline:project1']))

    expect(state.treeData.value.rootKeys).toEqual([])
    expect(mocks.readFileHistory).not.toHaveBeenCalled()
  })

  it('expands project commits into their changed files without adding file children to the document timeline', async () => {
    mocks.readHistory.mockResolvedValueOnce(ok([commit('project1', 'Project commit', [
      { path: 'cards/main.ocdocument', status: 'added' },
      { path: 'assets/cover.png', status: 'modified' },
      { path: 'notes/old.md', status: 'deleted' },
    ])]))
    mocks.readFileHistory.mockResolvedValueOnce(ok([commit('project1', 'Project commit')]))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(
      state.projectTreeData.value.children.get('project-timeline:project1'),
    ).toHaveLength(3))

    const childKeys = state.projectTreeData.value.children.get('project-timeline:project1')!
    // 标题只显示文件名，完整路径只留在节点 key 里。
    expect(childKeys.map(key => state.projectTreeData.value.items.get(key)?.label))
      .toEqual(['main.ocdocument', 'cover.png', 'old.md'])
    expect(state.treeData.value.children.size).toBe(0)
  })

  it('shows only uncommitted changes in the tree while keeping every status entry', async () => {
    mocks.readStatus.mockResolvedValueOnce(ok({ entries: [
      statusEntry('cards/worktree.ocdocument', { worktreeModified: true }),
      statusEntry('cards/index.ocdocument', { indexNew: true }),
      statusEntry('cards/conflict.ocdocument', { conflicted: true }),
      statusEntry('cards/clean.ocdocument'),
    ] }))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(state.changesTreeData.value.rootKeys).toEqual([
      'cards/worktree.ocdocument',
      'cards/index.ocdocument',
      'cards/conflict.ocdocument',
    ]))

    expect(state.statusEntries.value).toHaveLength(4)
    expect(state.statusEntries.value.find(entry => entry.path === 'cards/index.ocdocument')?.indexNew).toBe(true)
  })

  it('refreshes status without reloading history', async () => {
    mocks.readStatus.mockResolvedValueOnce(ok({ entries: [
      statusEntry('cards/initial.ocdocument', { worktreeModified: true }),
    ] }))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(state.statusEntries.value).toHaveLength(1))
    const historyCalls = mocks.readHistory.mock.calls.length
    mocks.readStatus.mockResolvedValueOnce(ok({
      entries: [statusEntry('cards/new.ocdocument', { worktreeNew: true })],
    }))

    await state.refreshStatus()

    expect(state.changesTreeData.value.rootKeys).toEqual(['cards/new.ocdocument'])
    expect(mocks.readHistory).toHaveBeenCalledTimes(historyCalls)
    expect(state.statusStale.value).toBe(false)
  })

  it('keeps the last status and marks it stale when a refresh fails', async () => {
    const initialEntry = statusEntry('cards/initial.ocdocument', { worktreeModified: true })
    mocks.readStatus.mockResolvedValueOnce(ok({ entries: [initialEntry] }))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(state.statusEntries.value).toEqual([initialEntry]))
    const updatedAt = state.statusUpdatedAt.value
    mocks.readStatus.mockRejectedValueOnce(new Error('status unavailable'))

    await state.refreshStatus()

    expect(state.statusEntries.value).toEqual([initialEntry])
    expect(state.statusUpdatedAt.value).toBe(updatedAt)
    expect(state.statusStale.value).toBe(true)
  })

  it('coalesces rapid status refresh requests', async () => {
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(mocks.readStatus).toHaveBeenCalledOnce())
    mocks.readStatus.mockResolvedValue(ok({ entries: [statusEntry('cards/rapid.ocdocument', { worktreeNew: true })] }))

    const first = state.refreshStatus()
    const second = state.refreshStatus()
    await Promise.all([first, second])

    expect(mocks.readStatus).toHaveBeenCalledTimes(2)
    expect(state.changesTreeData.value.rootKeys).toEqual(['cards/rapid.ocdocument'])
  })

  it('shows only commits that edited the selected document in its own timeline', async () => {
    mocks.readHistory.mockResolvedValueOnce(ok([commit('project1', 'Project commit')]))
    mocks.readFileHistory.mockResolvedValueOnce(ok([commit('file0001', 'Edit selected file')]))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(state.treeData.value.rootKeys).toEqual(['timeline:file0001']))

    expect(state.projectTreeData.value.rootKeys).toEqual(['project-timeline:project1'])
    expect(mocks.readFileHistory).toHaveBeenCalledWith('D:/Cards/demo', { path: 'cards/main.ocdocument', limit: 50 })
    // "和磁盘比较"只对文档历史的提交有意义。
    expect(normalizeNodeTail(state.treeData.value.items.get('timeline:file0001')?.tail)
      .filter(isNodeTailAction).map(action => action.key)).toEqual(['timeline.compare-with-disk'])
    expect(normalizeNodeTail(state.projectTreeData.value.items.get('project-timeline:project1')?.tail)
      .filter(isNodeTailAction)).toEqual([])
  })

  it('reloads file history when switching documents', async () => {
    mocks.readFileHistory
      .mockResolvedValueOnce(ok([commit('file0001', 'Edit first file')]))
      .mockResolvedValueOnce(ok([commit('file0002', 'Edit second file')]))
    const file = ref<string | null>('cards/first.ocdocument')
    const state = useTimeline(ref('D:/Cards/demo'), file)
    await vi.waitFor(() => expect(state.treeData.value.rootKeys).toEqual(['timeline:file0001']))

    file.value = 'cards/second.ocdocument'

    await vi.waitFor(() => expect(state.treeData.value.rootKeys).toEqual(['timeline:file0002']))
    expect(mocks.readFileHistory).toHaveBeenNthCalledWith(
      2, 'D:/Cards/demo', { path: 'cards/second.ocdocument', limit: 50 },
    )
  })

  it('clears the file timeline after closing the selected document', async () => {
    mocks.readFileHistory.mockResolvedValueOnce(ok([commit('file0001', 'Edit selected file')]))
    const file = ref<string | null>('cards/main.ocdocument')
    const state = useTimeline(ref('D:/Cards/demo'), file)
    await vi.waitFor(() => expect(state.treeData.value.rootKeys).toEqual(['timeline:file0001']))

    file.value = null

    await vi.waitFor(() => expect(state.treeData.value.rootKeys).toEqual([]))
    expect(mocks.readFileHistory).toHaveBeenCalledOnce()
  })

  it('shows an uninitialized project without requesting history', async () => {
    mocks.inspectRepository.mockResolvedValueOnce(ok({ ...repository, initialized: false }))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(state.initialized.value).toBe(false))

    expect(mocks.readHistory).not.toHaveBeenCalled()
    expect(mocks.readFileHistory).not.toHaveBeenCalled()
  })

  it('turns an IPC rejection into an error state instead of loading forever', async () => {
    mocks.inspectRepository.mockRejectedValueOnce(new Error('channel unavailable'))
    const state = useTimeline(ref('D:/Cards/demo'))
    await vi.waitFor(() => expect(state.errorKind.value).toBe('io'))

    expect(state.initialized.value).toBe(false)
    expect(state.loading.value).toBe(false)
  })
})
