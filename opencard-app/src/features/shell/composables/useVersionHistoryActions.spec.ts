import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const git = vi.hoisted(() => ({
  cleanupOperationState: vi.fn(), createCommit: vi.fn(),
  resetRepository: vi.fn(), restorePathAtRevision: vi.fn(), revertCommit: vi.fn(),
}))
vi.mock('../../version-control/gitService', () => git)

import { VERSION_ACTION_KEYS } from '../../version-control/useProjectTimeline'
import { useVersionHistoryActions } from './useVersionHistoryActions'

const ok = <T>(value: T) => ({ ok: true, value, error: null })
const commit = { id: 'abc123', shortId: 'abc', summary: 'Add icons' }

function setup(options: { confirm?: boolean, dirty?: boolean, path?: string } = {}) {
  const timeline = {
    resolveNodeTarget: vi.fn(() => ({ commit: commit as never, ...(options.path ? { path: options.path } : {}) })),
    refresh: vi.fn(async () => {}),
  }
  const requestConfirmation = vi.fn(async () => options.confirm ?? true)
  const notify = { notifySuccess: vi.fn(), notifyWarning: vi.fn(), notifyError: vi.fn() }
  const actions = useVersionHistoryActions({
    projectPath: ref('/p'), hasUncommittedChanges: () => options.dirty ?? false, timeline,
    translate: key => key, requestConfirmation, ...notify,
  })
  const act = (actionKey: string) => actions.handleVersionAction({ key: 'project-timeline:abc123', actionKey } as never)
  return { act, timeline, requestConfirmation, notify }
}

describe('useVersionHistoryActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(git)) fn.mockResolvedValue(ok({ conflicts: [] }))
  })

  it('undoes a commit with a new commit and leaves the operation state clean', async () => {
    const { act, notify } = setup()
    await act(VERSION_ACTION_KEYS.revert)
    expect(git.revertCommit).toHaveBeenCalledWith('/p', { revision: 'abc123' })
    expect(git.createCommit).toHaveBeenCalledWith('/p', { message: 'versionControl.history.revert.commitMessage' })
    expect(git.cleanupOperationState).toHaveBeenCalled()
    expect(notify.notifySuccess).toHaveBeenCalledWith('versionControl.history.revert.done')
  })

  it('stops an undo that conflicts and leaves it for the changes list', async () => {
    git.revertCommit.mockResolvedValue(ok({ conflicts: ['a.ocdocument'] }))
    const { act, notify } = setup()
    await act(VERSION_ACTION_KEYS.revert)
    expect(git.createCommit).not.toHaveBeenCalled()
    expect(notify.notifyWarning).toHaveBeenCalledWith('versionControl.history.revert.conflicts')
  })

  it('resets only after a confirmation that warns about uncommitted work', async () => {
    const declined = setup({ confirm: false, dirty: true })
    await declined.act(VERSION_ACTION_KEYS.reset)
    expect(git.resetRepository).not.toHaveBeenCalled()
    expect(declined.requestConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      message: 'versionControl.history.reset.message versionControl.history.uncommittedWarning',
    }))
    const accepted = setup()
    await accepted.act(VERSION_ACTION_KEYS.reset)
    expect(git.resetRepository).toHaveBeenCalledWith('/p', { revision: 'abc123', mode: 'hard' })
  })

  it('restores one file and leaves everything else as it is', async () => {
    const { act } = setup({ path: 'cards/a.ocdocument' })
    await act(VERSION_ACTION_KEYS.restoreFile)
    expect(git.restorePathAtRevision).toHaveBeenCalledWith('/p', { revision: 'abc123', path: 'cards/a.ocdocument' })
  })

  it('reports a refused Git step instead of claiming success', async () => {
    git.resetRepository.mockResolvedValue({ ok: false, value: null, error: { message: 'locked' } })
    const { act, notify } = setup()
    await act(VERSION_ACTION_KEYS.reset)
    expect(notify.notifyError).toHaveBeenCalledWith('locked')
    expect(notify.notifySuccess).not.toHaveBeenCalled()
  })
})
