/** Real session fixtures shared by editor and workbench feature tests. */
import { afterEach } from 'vitest'
import { getPathBasename } from '../../shared/model/filePath'
import { resolveFileType } from '../workspace/model/fileTypes'
import { createEditorSession, type EditorSessionState, type EditorSession } from './session/editorSession'

const sessions: EditorSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

export function getTestSession(wrapper: { props(): unknown }): EditorSession {
  return (wrapper.props() as { session: EditorSession }).session
}

export function createTestSession(patch: Partial<EditorSessionState> = {}): EditorSession {
  const type = resolveFileType(patch.path ?? 'card.ocdocument')
  const session = createEditorSession({
    id: crypto.randomUUID(), path: null, resourceKind: patch.path ? 'external' : 'draft', fileTypeId: type.id, editorId: type.editorId,
    name: patch.path ? getPathBasename(patch.path) : 'card.ocdocument',
    draftContent: '{}', savedContent: patch.draftContent ?? '{}',
    isDirty: false, isPreview: false, ...patch, mode: patch.mode ?? 'edit',
  }, () => ({ history: 'structured' }))
  for (const [key, state] of Object.entries(patch.viewState ?? {})) session.updateViewState(key, state as Record<string, unknown>)
  sessions.push(session)
  return session
}
