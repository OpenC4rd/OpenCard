import { computed, ref, type ComputedRef } from 'vue'
import type { HistoryMergeIdentity, HistoryOperationMeta } from './history.types'

const MERGE_DELAY_MS = 300
const DEFAULT_BYTE_LIMIT = 32 * 1024 * 1024

type TextPatch = {
  start: number
  remove: string
  insert: string
}

type ContentHistoryEntry = {
  forward: TextPatch[]
  inverse: TextPatch[]
  beforeStateId: number
  afterStateId: number
  bytes: number
  resources: HistoryResourceLifecycle[]
}

type PendingEntry = ContentHistoryEntry & { merge: HistoryMergeIdentity }

type ContentHistoryOptions = {
  content: string
  entryLimit: number
  byteLimit?: number
  onChange: (content: string, dirty: boolean) => void
  onStateChange?: () => void
  onResourceError?: (error: unknown) => void
}

export type HistoryResourceLifecycle = {
  undo: () => Promise<void>
  redo: () => Promise<void>
  release: () => void | Promise<void>
}

export type ContentHistoryOperationMeta = HistoryOperationMeta & {
  resource?: HistoryResourceLifecycle
}

export type ContentHistoryPort = {
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  dirty: ComputedRef<boolean>
  getContent: () => string
  record: (content: string, meta: ContentHistoryOperationMeta) => boolean
  undo: () => Promise<void>
  redo: () => Promise<void>
  flush: () => void
  markSaved: (content?: string) => void
  reset: (content: string) => void
  setEntryLimit: (limit: number) => void
  dispose: () => void
  getByteSize: () => number
  dropOldest: () => boolean
}

export function createContentHistory(options: ContentHistoryOptions): ContentHistoryPort {
  let content = options.content
  let entries: ContentHistoryEntry[] = []
  const cursor = ref(0)
  const currentStateId = ref(0)
  const dirtyValue = ref(false)
  let savedBaseline = content
  let nextStateId = 1
  let entryLimit = normalizeEntryLimit(options.entryLimit)
  const byteLimit = options.byteLimit ?? DEFAULT_BYTE_LIMIT
  let bytes = 0
  let pending: PendingEntry | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let applying = false

  const canUndo = computed(() => cursor.value > 0 || pending !== null)
  const canRedo = computed(() => cursor.value < entries.length && pending === null)
  const dirty = computed(() => dirtyValue.value)

  function record(nextContent: string, meta: ContentHistoryOperationMeta): boolean {
    assertActive()
    if (nextContent === content) return false
    if (meta.mode === 'immediate') flush()
    else if (pending && !sameMerge(pending.merge, meta.merge)) flush()

    const forwardPatch = createTextPatch(content, nextContent)
    const inversePatch = invertPatch(forwardPatch)
    const beforeStateId = currentStateId.value
    const afterStateId = nextStateId++
    content = nextContent
    currentStateId.value = afterStateId
    dirtyValue.value = content !== savedBaseline
    const entry: ContentHistoryEntry = {
      forward: [forwardPatch],
      inverse: [inversePatch],
      beforeStateId,
      afterStateId,
      bytes: patchBytes(forwardPatch) + patchBytes(inversePatch),
      resources: meta.resource ? [meta.resource] : [],
    }

    if (meta.mode === 'debounced') {
      pending = pending
        ? {
            ...pending,
            forward: [...pending.forward, forwardPatch],
            inverse: [inversePatch, ...pending.inverse],
            afterStateId,
            bytes: pending.bytes + entry.bytes,
            resources: [...pending.resources, ...entry.resources],
          }
        : { ...entry, merge: meta.merge }
      scheduleFlush()
      options.onChange(content, dirty.value)
      options.onStateChange?.()
      return true
    }

    append(entry)
    options.onChange(content, dirty.value)
    options.onStateChange?.()
    return true
  }

  async function undo(): Promise<void> {
    assertActive()
    if (applying) return
    flush()
    const entry = entries[cursor.value - 1]
    if (!entry) return
    applying = true
    try {
      for (const resource of [...entry.resources].reverse()) await resource.undo()
      content = applyTextPatches(content, entry.inverse)
      cursor.value -= 1
      currentStateId.value = entry.beforeStateId
      dirtyValue.value = content !== savedBaseline
      options.onChange(content, dirty.value)
      options.onStateChange?.()
    } finally {
      applying = false
    }
  }

  async function redo(): Promise<void> {
    assertActive()
    if (applying) return
    flush()
    const entry = entries[cursor.value]
    if (!entry) return
    applying = true
    try {
      for (const resource of entry.resources) await resource.redo()
      content = applyTextPatches(content, entry.forward)
      cursor.value += 1
      currentStateId.value = entry.afterStateId
      dirtyValue.value = content !== savedBaseline
      options.onChange(content, dirty.value)
      options.onStateChange?.()
    } finally {
      applying = false
    }
  }

  function flush(): void {
    assertActive()
    clearTimer()
    if (!pending) return
    const entry = pending
    pending = null
    append(entry)
    options.onStateChange?.()
  }

  function markSaved(savedContent = content): void {
    assertActive()
    flush()
    savedBaseline = savedContent
    dirtyValue.value = content !== savedBaseline
    options.onStateChange?.()
  }

  function reset(nextContent: string): void {
    assertActive()
    clearTimer()
    if (pending) releaseEntries([pending])
    pending = null
    releaseEntries(entries)
    entries = []
    cursor.value = 0
    bytes = 0
    content = nextContent
    const stateId = nextStateId++
    currentStateId.value = stateId
    savedBaseline = nextContent
    dirtyValue.value = false
    options.onStateChange?.()
  }

  function setEntryLimit(limit: number): void {
    assertActive()
    flush()
    entryLimit = normalizeEntryLimit(limit)
    trim()
    options.onStateChange?.()
  }

  function append(entry: ContentHistoryEntry): void {
    if (cursor.value < entries.length) {
      const removed = entries.splice(cursor.value)
      bytes -= removed.reduce((total, item) => total + item.bytes, 0)
      releaseEntries(removed)
    }
    if (entry.bytes > byteLimit) {
      releaseEntries(entries)
      releaseEntries([entry])
      entries = []
      cursor.value = 0
      bytes = 0
      return
    }
    entries.push(entry)
    cursor.value = entries.length
    bytes += entry.bytes
    trim()
  }

  function trim(): void {
    while (entries.length > entryLimit || bytes > byteLimit) {
      const removed = entries.shift()
      if (!removed) break
      bytes -= removed.bytes
      cursor.value = Math.max(0, cursor.value - 1)
      releaseEntries([removed])
    }
  }

  function scheduleFlush(): void {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      flush()
    }, MERGE_DELAY_MS)
  }

  function clearTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function dispose(): void {
    if (disposed) return
    flush()
    disposed = true
    clearTimer()
    releaseEntries(entries)
    entries = []
  }

  function dropOldest(): boolean {
    assertActive()
    const removed = entries.shift()
    if (!removed) return false
    bytes -= removed.bytes
    cursor.value = Math.max(0, cursor.value - 1)
    releaseEntries([removed])
    options.onStateChange?.()
    return true
  }

  function assertActive(): void {
    if (disposed) throw new Error('Content history has been disposed.')
  }

  function releaseEntries(releasedEntries: readonly ContentHistoryEntry[]): void {
    for (const entry of releasedEntries) {
      for (const resource of entry.resources) {
        void Promise.resolve()
          .then(() => resource.release())
          .catch(error => options.onResourceError?.(error))
      }
    }
  }

  return {
    canUndo,
    canRedo,
    dirty,
    getContent: () => content,
    record,
    undo,
    redo,
    flush,
    markSaved,
    reset,
    setEntryLimit,
    dispose,
    getByteSize: () => bytes + (pending?.bytes ?? 0),
    dropOldest,
  }
}

function createTextPatch(before: string, after: string): TextPatch {
  let start = 0
  const sharedLength = Math.min(before.length, after.length)
  while (start < sharedLength && before.charCodeAt(start) === after.charCodeAt(start)) start += 1

  let beforeEnd = before.length
  let afterEnd = after.length
  while (
    beforeEnd > start
    && afterEnd > start
    && before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)
  ) {
    beforeEnd -= 1
    afterEnd -= 1
  }
  return { start, remove: before.slice(start, beforeEnd), insert: after.slice(start, afterEnd) }
}

function invertPatch(patch: TextPatch): TextPatch {
  return { start: patch.start, remove: patch.insert, insert: patch.remove }
}

function applyTextPatches(content: string, patches: readonly TextPatch[]): string {
  let current = content
  for (const patch of patches) {
    if (current.slice(patch.start, patch.start + patch.remove.length) !== patch.remove) {
      throw new Error('History text patch no longer matches the current content.')
    }
    current = current.slice(0, patch.start) + patch.insert + current.slice(patch.start + patch.remove.length)
  }
  return current
}

function patchBytes(patch: TextPatch): number {
  return (patch.remove.length + patch.insert.length) * 2 + 16
}

function sameMerge(left: HistoryMergeIdentity, right: HistoryMergeIdentity): boolean {
  return left.family === right.family && left.target === right.target
}

function normalizeEntryLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 100
}
