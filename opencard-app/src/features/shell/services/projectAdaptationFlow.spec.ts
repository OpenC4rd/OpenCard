import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fileExists: vi.fn(), readRecorded: vi.fn(), run: vi.fn(),
  inspect: vi.fn(), init: vi.fn(), stageAll: vi.fn(), commit: vi.fn(), reset: vi.fn(),
}))
vi.mock('../../workspace/services/fileSystemService', () => ({ fileSystemService: { fileExists: mocks.fileExists } }))
vi.mock('../../workspace/services/projectAdaptation', async importOriginal => ({
  ...await importOriginal<typeof import('../../workspace/services/projectAdaptation')>(),
  readRecordedProjectVersion: mocks.readRecorded,
  runProjectAdaptation: mocks.run,
}))
vi.mock('../../version-control/gitService', () => ({
  inspectRepository: mocks.inspect, initializeRepository: mocks.init, stageAll: mocks.stageAll,
  createCommit: mocks.commit, resetRepository: mocks.reset,
}))
vi.mock('../../../shared/appVersion', () => ({ APP_VERSION: '0.5.0-beta.2' }))

import { adaptProjectBeforeOpen } from './projectAdaptationFlow'

const ok = <T>(value: T) => ({ ok: true, value, error: null })
function options(confirm = true) {
  return {
    identity: { name: 'me', email: 'me@example.com' },
    translate: (key: string) => key,
    confirm: vi.fn(async () => confirm),
    notifySuccess: vi.fn(), notifyWarning: vi.fn(), notifyError: vi.fn(),
  }
}

describe('adaptProjectBeforeOpen', () => {
  let head = 0
  beforeEach(() => {
    vi.clearAllMocks()
    head = 0
    mocks.fileExists.mockResolvedValue(true)
    mocks.readRecorded.mockResolvedValue('0.5.0-beta.1')
    mocks.run.mockResolvedValue([])
    mocks.inspect.mockImplementation(async () => ok({ initialized: head > 0, head: head > 0 ? `c${head}` : null }))
    mocks.init.mockImplementation(async () => { head = 0; return ok({ initialized: true }) })
    mocks.stageAll.mockResolvedValue(ok({}))
    mocks.commit.mockImplementation(async () => { head += 1; return ok({}) })
    mocks.reset.mockResolvedValue(ok({}))
  })

  it('leaves a plain folder and a current project alone without asking', async () => {
    mocks.fileExists.mockResolvedValue(false)
    const plain = options()
    expect(await adaptProjectBeforeOpen('/p', plain)).toBe('not-a-project')
    mocks.fileExists.mockResolvedValue(true)
    mocks.readRecorded.mockResolvedValue('0.5.0-beta.2')
    expect(await adaptProjectBeforeOpen('/p', plain)).toBe('current')
    expect(plain.confirm).not.toHaveBeenCalled()
  })

  it('does nothing to the files when the user declines', async () => {
    const declined = options(false)
    expect(await adaptProjectBeforeOpen('/p', declined)).toBe('declined')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('snapshots in a new repository, adapts, commits the result and reports what could not be carried over', async () => {
    mocks.run.mockResolvedValue(['Icon file could not be carried over: x'])
    const accepted = options()
    expect(await adaptProjectBeforeOpen('/p', accepted)).toBe('adapted')
    expect(mocks.init).toHaveBeenCalledOnce()
    expect(mocks.commit.mock.calls.map(call => call[1].message)).toEqual(['projectAdaptation.snapshotCommit', 'projectAdaptation.adaptedCommit'])
    expect(mocks.run.mock.calls[0]![2].map((script: { version: string }) => script.version)).toEqual(['0.5.0-beta.2'])
    expect(accepted.notifySuccess).toHaveBeenCalledWith('projectAdaptation.done')
    expect(accepted.notifyWarning).toHaveBeenCalledWith('Icon file could not be carried over: x')
  })

  it('offers every script for a project that records no version', async () => {
    mocks.readRecorded.mockResolvedValue(undefined)
    const accepted = options()
    await adaptProjectBeforeOpen('/p', accepted)
    expect(accepted.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'projectAdaptation.forceConfirm' }))
    expect(mocks.run.mock.calls[0]![2]).toHaveLength(2)
  })

  it('puts the project back on the snapshot when a script fails', async () => {
    head = 3
    mocks.run.mockRejectedValue(new Error('broken'))
    const accepted = options()
    expect(await adaptProjectBeforeOpen('/p', accepted)).toBe('failed')
    expect(mocks.reset).toHaveBeenCalledWith('/p', { revision: 'c4', mode: 'hard' })
    expect(accepted.notifyError).toHaveBeenCalledWith('projectAdaptation.failed')
  })
})
