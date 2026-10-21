import { nextTick, ref, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createTestSession } from '../../editor-runtime/editorTestSession'
import { editorHistoryManager } from '../../editor-runtime/history/editorHistoryManager'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { useWorkbenchEditorHost } from './useWorkbenchEditorHost'

vi.mock('../../../components/editors/MonacoEditor.vue', () => ({ default: {} }))

function createHost(session = createTestSession()) {
  const activeSession = shallowRef<EditorSession | null>(session)
  const reportIssues = vi.fn()
  const host = useWorkbenchEditorHost({
    activeSession, comparison: ref(null), cardProps: ref({}), reportIssues,
    openFile: vi.fn(), trashFile: vi.fn(), translate: key => key,
  })
  return { host, activeSession, session, reportIssues }
}

describe('editor mount ownership', () => {
  it('keeps contributions with the mounted owner and rejects stale callbacks after selection or diff changes', async () => {
    const { host, activeSession, session, reportIssues } = createHost()
    const oldMount = host.mount.value!
    const onHeaderAction = vi.fn()
    oldMount.capture({ presentation: { title: 'Card', description: '', icon: 'mdiCardsOutline' },
      headerActions: [{ key: 'local', title: 'Local' }], onHeaderAction })
    await nextTick()
    expect(session.state.presentation?.title).toBe('Card')
    const contribution = host.contribution.value
    await contribution.onAction('local')
    expect(onHeaderAction).toHaveBeenCalledOnce()
    session.setMode('diff', { beforeRevisionId: 'a', afterRevisionId: null })
    await contribution.onAction('local')
    oldMount.props.onIssueSnapshot({ scopeKey: 'old', scopeOrder: [], issues: [] })
    expect(reportIssues).not.toHaveBeenCalled()
    activeSession.value = createTestSession({ name: 'Other' })
    oldMount.capture(null)
    await contribution.onAction('local')
    expect(onHeaderAction).toHaveBeenCalledOnce()
    expect(activeSession.value.state.presentation).toBeUndefined()
  })

  it('releases history after the corresponding mount detaches, without a fixed delay', async () => {
    const { host, session } = createHost()
    const mount = host.mount.value!
    mount.capture({})
    session.dispose()
    expect(editorHistoryManager.has(session.state.id)).toBe(true)
    mount.capture(null)
    await nextTick()
    expect(editorHistoryManager.has(session.state.id)).toBe(false)
  })

  it('flushes pending content and checks validity before any save write', async () => {
    const { host, session } = createHost()
    const pending = '{"pending":true}'
    const flush = vi.fn(() => session.updateContent(pending))
    host.mount.value!.capture({ flush, canSave: false })
    await expect(session.save('D:/never.ocdocument')).resolves.toBe('skipped')
    expect(session.state.draftContent).toBe(pending)
    expect(session.state.isDirty).toBe(true)
    host.mount.value!.capture(null)
    await nextTick()
    await expect(session.save('D:/never.ocdocument')).resolves.toBe('skipped')
  })
})
