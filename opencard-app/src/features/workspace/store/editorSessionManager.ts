import { computed, shallowRef } from 'vue'
import { getPathBasename, isSameOrDescendantPath, normalizePath } from '../../../shared/model/filePath'
import { resolveFileType, resolveFileTypeById } from '../model/fileTypes'
import { fileSystemService } from '../services/fileSystemService'
import { useProjectStore } from './projectStore'
import { editorRegistry } from '../../editor-runtime/registry/editorRegistry'
import { createEditorSession, type EditorSession } from '../../editor-runtime/session/editorSession'

export type OpenSessionOptions = { preview?: boolean }

export function createDefaultOpenCardContent(displayName: string) {
  const dot = displayName.lastIndexOf('.')
  return JSON.stringify({
    type: 'card-document', id: `card-document-${crypto.randomUUID()}`,
    name: (dot > 0 ? displayName.slice(0, dot) : displayName) || 'UNTITLED',
    version: '1.0.0', width: '540', height: '850',
    faces: Object.fromEntries(['front', 'back'].map(face => [face, {
      type: 'card-face', id: `card-face-${crypto.randomUUID()}`, background: '#FFFFFF', children: [],
    }])), instances: [],
  }, null, 2)
}

/** Created once by the workbench; resource operations belong to the instances. */
export function createEditorSessionManager(onRelease: (id: string) => void = () => {}) {
  const sessions = shallowRef<readonly EditorSession[]>([])
  const activeSessionId = shallowRef('')
  const activeSession = computed(() => sessions.value.find(session => session.state.id === activeSessionId.value) ?? null)
  const project = useProjectStore()
  const opening = new Map<string, Promise<EditorSession>>()
  let selection = 0
  let disposed = false

  function activateSession(id: string): void {
    selection++
    if (sessions.value.some(session => session.state.id === id)) activeSessionId.value = id
  }
  function closeSession(id: string): void {
    const index = sessions.value.findIndex(session => session.state.id === id)
    if (index < 0) return
    onRelease(id)
    sessions.value[index]!.dispose()
    sessions.value = sessions.value.filter(session => session.state.id !== id)
    if (activeSessionId.value === id) {
      selection++
      activeSessionId.value = (sessions.value[index] ?? sessions.value[index - 1])?.state.id ?? ''
    }
  }
  async function open(path: string, options: OpenSessionOptions = {}): Promise<EditorSession> {
    const normalized = normalizePath(path)
    const request = ++selection
    const preview = options.preview ?? false
    let session = sessions.value.find(candidate => candidate.state.path === normalized)
    if (!session) {
      let pending = opening.get(normalized)
      if (!pending) {
        pending = (async () => {
          const root = project.projectPath.value
          const absolute = /^[a-z]:\//i.test(normalized) || normalized.startsWith('/')
          const resourceKind = root && (!absolute || isSameOrDescendantPath(normalized, root)) ? 'workspace' : 'external'
          const type = resolveFileType(normalized, resourceKind === 'workspace' ? root : undefined)
          const content = editorRegistry.getEditor(type.editorId)?.content === 'none' ? ''
            : resourceKind === 'workspace' ? await project.readFile(normalized) : await fileSystemService.readFile(normalized)
          const instance = createEditorSession({
            id: crypto.randomUUID(), resourceKind, path: normalized, fileTypeId: type.id,
            name: getPathBasename(normalized), editorId: type.editorId,
            savedContent: content, draftContent: content, isDirty: false, isPreview: false, mode: 'edit',
          }, id => editorRegistry.getEditor(id))
          if (disposed || (resourceKind === 'workspace' && project.projectPath.value !== root)) instance.dispose()
          else sessions.value = [...sessions.value, instance]
          return instance
        })()
        opening.set(normalized, pending)
      }
      try { session = await pending } finally { if (opening.get(normalized) === pending) opening.delete(normalized) }
    }
    if (!session.disposed && request === selection) {
      if (preview && !session.state.isDirty) {
        for (const previous of sessions.value) if (previous !== session && previous.state.isPreview) closeSession(previous.state.id)
        session.setPreview(true)
      } else if (!preview) session.setPreview(false)
      activeSessionId.value = session.state.id
    }
    return session
  }
  function createDraftSession(options: { fileTypeId?: string; name?: string; content?: string } = {}): EditorSession {
    const type = resolveFileTypeById(options.fileTypeId ?? 'opencard')
    const extension = type.extensions?.[0]
    const suffix = extension ? `.${extension}` : ''
    let name = options.name ?? `UNTITLED${suffix}`
    for (let index = 2; !options.name && sessions.value.some(session => session.state.name.toLowerCase() === name.toLowerCase()); index++) name = `UNTITLED-${index}${suffix}`
    const content = options.content ?? (type.id === 'opencard' ? createDefaultOpenCardContent(name) : '')
    const session = createEditorSession({
      id: crypto.randomUUID(), resourceKind: 'draft', path: null, fileTypeId: type.id, name,
      editorId: type.editorId, savedContent: content, draftContent: content, isDirty: false, isPreview: false, mode: 'edit',
    }, id => editorRegistry.getEditor(id))
    sessions.value = [...sessions.value, session]
    activateSession(session.state.id)
    return session
  }
  return {
    sessions: computed(() => sessions.value), activeSessionId: computed(() => activeSessionId.value), activeSession,
    open, createDraftSession, activateSession, closeSession,
    closeWorkspaceSessions(): void { for (const session of sessions.value) if (session.state.resourceKind === 'workspace') closeSession(session.state.id) },
    closeSessionsByPath(path: string): void { for (const session of sessions.value) if (session.state.path && isSameOrDescendantPath(session.state.path, normalizePath(path))) closeSession(session.state.id) },
    remapSessionPaths(oldPath: string, newPath: string): void {
      const from = normalizePath(oldPath)
      for (const session of sessions.value) if (session.state.resourceKind === 'workspace' && session.state.path && isSameOrDescendantPath(session.state.path, from)) session.remapPath(normalizePath(newPath) + session.state.path.slice(from.length))
    },
    dispose(): void { disposed = true; selection++; for (const session of sessions.value) { onRelease(session.state.id); session.dispose() }; sessions.value = []; activeSessionId.value = '' },
  }
}
