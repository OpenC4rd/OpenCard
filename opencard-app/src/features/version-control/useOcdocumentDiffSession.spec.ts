// @vitest-environment node
import { effectScope, shallowRef } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useOcdocumentDiffSession } from './useOcdocumentDiffSession'
import type { ResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
const io = vi.hoisted(() => ({ read: vi.fn(), materialize: vi.fn(), create: vi.fn(), release: vi.fn(async (_root: string) => {}) }))
vi.mock('./gitService', () => ({ readFileAtRevision: io.read, materializeRevision: io.materialize, releaseRevisionSnapshot: io.release }))
vi.mock('../workspace/services/projectResourceEnvironment', () => ({ createResourceEnvironment: io.create }))
vi.mock('../workspace/services/fileSystemService', () => ({ fileSystemService: { readFile: async () => '{}' } }))
afterEach(() => vi.resetAllMocks())
it('keeps the previous comparison after a failed replacement and releases late snapshots on close', async () => {
  const scope = effectScope()
  const borrowed = { dispose: vi.fn(async () => {}) } as unknown as ResourceEnvironment
  const owned = { dispose: vi.fn(async () => {}) } as unknown as ResourceEnvironment
  const runtime = scope.run(() => useOcdocumentDiffSession({ translate: key => key, projectRoot: shallowRef('/project'), environment: shallowRef(borrowed), filePath: shallowRef('card.ocdocument'), fileName: shallowRef('Card'), revisions: shallowRef([]) }))!
  io.read.mockResolvedValue({ ok: true, value: { content: '{}', binary: false } })
  io.materialize.mockResolvedValue({ ok: true, value: { rootPath: '/snapshot/first' } })
  io.create.mockResolvedValue(owned)
  await runtime.selectComparison('first', null)
  io.read.mockResolvedValueOnce({ ok: false, error: { message: 'unreadable' } })
  await runtime.selectComparison('broken', null)
  expect(runtime.before.value?.commitId).toBe('first')
  let finish!: (value: unknown) => void
  io.materialize.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = runtime.selectComparison('late', null)
  await Promise.resolve(); await Promise.resolve()
  const closing = runtime.dispose()
  finish({ ok: true, value: { rootPath: '/snapshot/late' } })
  await pending; await closing
  expect(io.release.mock.calls.map(call => call[0]).sort()).toEqual(['/snapshot/first', '/snapshot/late'])
  expect(borrowed.dispose).not.toHaveBeenCalled()
  expect(runtime.before.value).toBeNull()
  scope.stop()
})
