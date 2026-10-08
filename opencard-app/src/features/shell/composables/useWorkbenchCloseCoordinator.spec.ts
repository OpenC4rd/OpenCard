import { createTestSession } from '../../editor-runtime/editorTestSession'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type {
  EditorSession,
  EditorSessionState,
  SessionSaveResult,
} from '../../editor-runtime/session/editorSession'
import { useWorkbenchCloseCoordinator } from './useWorkbenchCloseCoordinator'

function createSession(id: string, patch: Partial<EditorSessionState> = {}): EditorSession {
  return createTestSession({
    id,
    resourceKind: 'workspace',
    path: `D:/project/${id}.ocdocument`,
    fileTypeId: 'opencard',
    name: `${id}.ocdocument`,
    editorId: 'card-designer',
    savedContent: '{}',
    draftContent: '{}',
    isDirty: false,
    isPreview: false,
    ...patch,
  })
}

function createCoordinator(initialSessions: EditorSession[]) {
  const sessions = ref(initialSessions)
  const flushAffectedSessions = vi.fn(async () => undefined)
  const saveSession = vi.fn<(
    sessionId: string,
    targetPath?: string,
  ) => Promise<SessionSaveResult>>(async () => 'saved')
  const completions = {
    sessions: vi.fn(async () => undefined),
    project: vi.fn(async () => undefined),
    trash: vi.fn(async () => undefined),
    application: vi.fn(async () => undefined),
  }
  for (const session of initialSessions) {
    vi.spyOn(session, 'save').mockImplementation(path => saveSession(session.state.id, path))
    vi.spyOn(session, 'flush').mockImplementation(() => flushAffectedSessions())
  }
  const coordinator = useWorkbenchCloseCoordinator({
    sessions,
    pickDraftDirectory: vi.fn(async () => 'D:/drafts'),
    fileExists: vi.fn(async () => false),
    completions,
  })
  return { coordinator, sessions, flushAffectedSessions, saveSession, completions }
}

describe('useWorkbenchCloseCoordinator', () => {
  it('guards a whole path batch before any disk operation, including cancellation and save failure', async () => {
    const result = createCoordinator([
      createSession('a', { isDirty: true }), createSession('b', { isDirty: true }), createSession('keep'),
    ])
    const perform = vi.fn(async () => undefined)
    const paths = ['D:/project/a.ocdocument', 'D:/project/b.ocdocument']
    await result.coordinator.requestPathChanges(paths, perform)
    expect(result.coordinator.decisions.value.map(row => row.sessionId)).toEqual(['a', 'b'])
    result.coordinator.cancel()
    expect(perform).not.toHaveBeenCalled()
    await result.coordinator.requestPathChanges(paths, perform)
    await result.coordinator.markSelectedSave()
    result.saveSession.mockResolvedValueOnce('cancelled')
    expect(await result.coordinator.confirm()).toBe(false)
    expect(perform).not.toHaveBeenCalled()
    result.saveSession.mockResolvedValue('saved')
    expect(await result.coordinator.confirm()).toBe(true)
    expect(perform).toHaveBeenCalledOnce()
    expect(result.completions.sessions).toHaveBeenCalledWith(['a', 'b'])
  })

  it('flushes before immediately completing a clean session close', async () => {
    const session = createSession('clean')
    const { coordinator, completions } = createCoordinator([session])

    await coordinator.requestSessionClose([session.state.id])

    expect(vi.mocked(session.flush).mock.invocationCallOrder[0])
      .toBeLessThan(completions.sessions.mock.invocationCallOrder[0]!)
    expect(completions.sessions).toHaveBeenCalledWith([session.state.id])
  })

  it('lets flush publish the latest dirty state before the guard reads sessions', async () => {
    const session = createSession('latest')
    const result = createCoordinator([session])
    result.flushAffectedSessions.mockImplementationOnce(async () => {
      session.updateContent('{"changed":true}')
    })

    await result.coordinator.requestSessionClose([session.state.id])

    expect(result.coordinator.isOpen.value).toBe(true)
    expect(result.completions.sessions).not.toHaveBeenCalled()
  })

  it('prompts for untouched drafts without running completion', async () => {
    const draft = createSession('draft', { resourceKind: 'draft', path: null })
    const { coordinator, completions } = createCoordinator([draft])

    await coordinator.requestSessionClose([draft.state.id])

    expect(coordinator.isOpen.value).toBe(true)
    expect(coordinator.decisions.value).toMatchObject([{ sessionId: draft.state.id, decision: 'pending' }])
    expect(completions.sessions).not.toHaveBeenCalled()
  })

  it('selects only workspace sessions for project close and preserves destination', async () => {
    const workspace = createSession('workspace')
    const external = createSession('external', { resourceKind: 'external', path: 'D:/outside.ocdocument' })
    const draft = createSession('draft', { resourceKind: 'draft', path: null })
    const { coordinator, completions } = createCoordinator([workspace, external, draft])

    await coordinator.requestProjectClose('welcome')

    expect(completions.project).toHaveBeenCalledWith('welcome')
  })

  it('selects all sessions for application close', async () => {
    const first = createSession('first')
    const second = createSession('second', { resourceKind: 'external' })
    const { coordinator, completions } = createCoordinator([first, second])

    await coordinator.requestApplicationClose()

    expect(completions.application).toHaveBeenCalledWith('close')
  })

  it('preserves update installation as the application close completion', async () => {
    const session = createSession('dirty', { isDirty: true })
    const { coordinator, completions } = createCoordinator([session])

    await coordinator.requestApplicationClose('install-update')

    expect(coordinator.pendingIntent.value?.applicationAction).toBe('install-update')
    expect(completions.application).not.toHaveBeenCalled()

    coordinator.markSelectedDiscard()
    await coordinator.confirm()

    expect(completions.application).toHaveBeenCalledWith('install-update')
  })

  it('selects only sessions at or below the trashed path', async () => {
    const direct = createSession('direct', { path: 'D:/project/cards/main.ocdocument' })
    const nested = createSession('nested', { path: 'D:/project/cards/set/other.ocdocument' })
    const sibling = createSession('sibling', { path: 'D:/project/cards-old/keep.ocdocument' })
    const { coordinator, completions } = createCoordinator([direct, nested, sibling])

    await coordinator.requestPathTrash('D:\\project\\cards\\')

    expect(completions.trash).toHaveBeenCalledWith('D:\\project\\cards\\')
  })

  it('does not replace an existing pending close transaction', async () => {
    const first = createSession('first', { isDirty: true })
    const second = createSession('second', { isDirty: true })
    const { coordinator } = createCoordinator([first, second])
    await coordinator.requestSessionClose([first.state.id])

    await coordinator.requestSessionClose([second.state.id])

    expect(coordinator.pendingIntent.value?.sessionIds).toEqual([first.state.id])
    expect(coordinator.decisions.value.map(row => row.sessionId)).toEqual([first.state.id])
  })

  it('keeps project completion blocked after cancel or save failure', async () => {
    const session = createSession('dirty', { isDirty: true })
    const { coordinator, saveSession, completions } = createCoordinator([session])
    await coordinator.requestProjectClose('welcome')
    coordinator.cancel()
    expect(completions.project).not.toHaveBeenCalled()

    await coordinator.requestProjectClose('welcome')
    saveSession.mockResolvedValueOnce('skipped')
    await coordinator.markSelectedSave()
    await expect(coordinator.confirm()).resolves.toBe(false)

    expect(completions.project).not.toHaveBeenCalled()
    expect(coordinator.isOpen.value).toBe(true)
  })

  it('uses the same guard flow for single discard and single save', async () => {
    const discard = createCoordinator([createSession('discard', { isDirty: true })])
    await discard.coordinator.requestSessionClose(['discard'])
    await discard.coordinator.discardSingle()
    expect(discard.completions.sessions).toHaveBeenCalledTimes(1)
    expect(discard.saveSession).not.toHaveBeenCalled()

    const save = createCoordinator([createSession('save', { isDirty: true })])
    await save.coordinator.requestSessionClose(['save'])
    await save.coordinator.saveSingle()
    expect(save.saveSession).toHaveBeenCalledWith('save', undefined)
    expect(save.completions.sessions).toHaveBeenCalledTimes(1)
  })
})
