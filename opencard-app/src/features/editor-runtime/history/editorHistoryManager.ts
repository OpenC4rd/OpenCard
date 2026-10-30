/** Owns undo/redo runtime state for every open editor session. */
import { computed, reactive, ref, type ComputedRef } from 'vue'
import type * as Monaco from 'monaco-editor'
import {
  createContentHistory,
  type ContentHistoryOperationMeta,
  type ContentHistoryPort,
} from './contentHistory'
import type { HistoryOperationMeta } from './history.types'

export type EditorHistoryKind = 'structured' | 'monaco' | 'none'

type EditorHistoryState = {
  canUndo: boolean
  canRedo: boolean
}

type SessionHistory = {
  kind: EditorHistoryKind
  content?: ContentHistoryPort
  model?: Monaco.editor.ITextModel
  modelListener?: Monaco.IDisposable
  savedContent?: string
  updatingModel: boolean
  publish: (content: string, dirty: boolean) => void
  state: EditorHistoryState
}

const DEFAULT_OPERATION: HistoryOperationMeta = { mode: 'immediate' }
const GLOBAL_HISTORY_BYTE_LIMIT = 128 * 1024 * 1024

class EditorHistoryManager {
  private sessions = new Map<string, SessionHistory>()
  private entryLimit = 100
  private revision = ref(0)
  private trimmingGlobalBudget = false

  initialize(
    sessionId: string,
    kind: EditorHistoryKind,
    content: string,
    publish: (content: string, dirty: boolean) => void,
  ): void {
    this.release(sessionId)
    const state = reactive<EditorHistoryState>({ canUndo: false, canRedo: false })
    const session: SessionHistory = { kind, publish, state, savedContent: content, updatingModel: false }
    this.sessions.set(sessionId, session)
    if (kind === 'structured') {
      session.content = createContentHistory({
        content,
        entryLimit: this.entryLimit,
        onChange: publish,
        onStateChange: () => this.refreshState(sessionId),
        onResourceError: error => console.error('Failed to release an editor history resource.', error),
      })
    }
    this.refreshState(sessionId)
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  kind(sessionId: string): EditorHistoryKind {
    return this.sessions.get(sessionId)?.kind ?? 'none'
  }

  state(sessionId: string | null | undefined): EditorHistoryState {
    this.revision.value
    return sessionId ? this.sessions.get(sessionId)?.state ?? EMPTY_HISTORY_STATE : EMPTY_HISTORY_STATE
  }

  stateRef(sessionId: Readonly<{ value: string | null | undefined }>): ComputedRef<EditorHistoryState> {
    return computed(() => this.state(sessionId.value))
  }

  recordContent(sessionId: string, content: string, meta: ContentHistoryOperationMeta = DEFAULT_OPERATION): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.kind === 'none') return
    if (session.content) {
      session.content.record(content, meta)
      return
    }
    if (session.model && session.model.getValue() !== content) this.replaceMonacoValue(session, content)
    session.publish(content, content !== session.savedContent)
    this.refreshState(sessionId)
  }

  getMonacoModel(sessionId: string): Monaco.editor.ITextModel | null {
    return this.sessions.get(sessionId)?.model ?? null
  }

  attachMonacoModel(sessionId: string, model: Monaco.editor.ITextModel): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.kind !== 'monaco') return
    session.modelListener?.dispose()
    session.model = model
    session.savedContent ??= model.getValue()
    session.modelListener = model.onDidChangeContent(() => {
      if (session.updatingModel || !session.model) return
      session.publish(
        session.model.getValue(),
        session.model.getValue() !== session.savedContent,
      )
      this.refreshState(sessionId)
    })
    this.refreshState(sessionId)
  }

  syncExternalContent(sessionId: string, content: string, saved: boolean): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.content) {
      if (saved) session.content.reset(content)
      else session.content.record(content, DEFAULT_OPERATION)
    } else if (session.model && session.model.getValue() !== content) {
      this.replaceMonacoValue(session, content)
    }
    if (saved) session.savedContent = content
    this.refreshState(sessionId)
  }

  markSaved(sessionId: string, content: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.content?.markSaved(content)
    session.savedContent = content
    this.refreshState(sessionId)
  }

  async undo(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.content) await session.content.undo()
    else await session.model?.undo()
    this.refreshState(sessionId)
  }

  async redo(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.content) await session.content.redo()
    else await session.model?.redo()
    this.refreshState(sessionId)
  }

  async flush(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    session?.content?.flush()
    this.refreshState(sessionId)
  }

  async flushMany(sessionIds: readonly string[]): Promise<void> {
    await Promise.all(sessionIds.map(sessionId => this.flush(sessionId)))
  }

  setEntryLimit(limit: number): void {
    this.entryLimit = limit
    for (const [sessionId, session] of this.sessions) {
      session.content?.setEntryLimit(limit)
      this.refreshState(sessionId)
    }
  }

  release(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.content?.dispose()
    session.modelListener?.dispose()
    session.model?.dispose()
    this.sessions.delete(sessionId)
    this.revision.value += 1
  }

  releaseMany(sessionIds: readonly string[]): void {
    for (const sessionId of sessionIds) this.release(sessionId)
  }

  private replaceMonacoValue(session: SessionHistory, content: string): void {
    if (!session.model) return
    session.updatingModel = true
    try {
      session.model.setValue(content)
    } finally {
      session.updatingModel = false
    }
  }

  private refreshState(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.state.canUndo = session.content?.canUndo.value ?? session.model?.canUndo() ?? false
    session.state.canRedo = session.content?.canRedo.value ?? session.model?.canRedo() ?? false
    this.revision.value += 1
    this.enforceGlobalBudget()
  }

  private enforceGlobalBudget(): void {
    if (this.trimmingGlobalBudget) return
    this.trimmingGlobalBudget = true
    try {
      while (true) {
        const candidates = [...this.sessions.values()]
          .flatMap(session => session.content ? [session.content] : [])
          .sort((left, right) => right.getByteSize() - left.getByteSize())
        const total = candidates.reduce((sum, history) => sum + history.getByteSize(), 0)
        if (total <= GLOBAL_HISTORY_BYTE_LIMIT || !candidates[0]?.dropOldest()) break
      }
    } finally {
      this.trimmingGlobalBudget = false
    }
  }
}

const EMPTY_HISTORY_STATE: EditorHistoryState = Object.freeze({ canUndo: false, canRedo: false })

export const editorHistoryManager = new EditorHistoryManager()
