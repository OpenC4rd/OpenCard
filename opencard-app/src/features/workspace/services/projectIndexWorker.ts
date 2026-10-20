import { markRaw } from 'vue'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import type { IconIndexRow, RegistryIndexRow, IndexJobKind } from './projectIndexWorkerRuntime'
import type { ProjectIcon, ProjectIconSeries } from '../model/projectIcons'
import { taskScheduler } from '../../../utils/taskScheduler'

let worker: Worker | undefined
let sequence = 0
const jobs = new Map<number, {
  entries: unknown[]; previous?: readonly unknown[]; signal?: AbortSignal; cleanup: () => void
  kind: IndexJobKind
  resolve: (entries: readonly unknown[]) => void; reject: (error: unknown) => void
}>()

async function indexRows<T, Output = T>(kind: IndexJobKind, entries: Iterable<T>, signal?: AbortSignal, previous?: readonly T[]): Promise<Output[]> {
  signal?.throwIfAborted()
  if (!worker) {
    worker = new Worker(new URL('./projectIndexWorkerRuntime.ts', import.meta.url), { type: 'module' })
    worker.onmessage = async ({ data }: MessageEvent<{ id: number; entries: unknown[]; done: boolean; unchanged?: boolean; error?: string }>) => {
      const job = jobs.get(data.id)
      if (!job) return
      if (data.error) { jobs.delete(data.id); job.cleanup(); job.reject(new Error(data.error)); return }
      try {
        await taskScheduler.forEach(data.entries, entry => job.entries.push(entry), job.signal)
        if (data.done) { jobs.delete(data.id); job.cleanup(); job.resolve(data.unchanged && job.previous ? job.previous : markRaw(job.entries)) }
        else worker?.postMessage({ type: 'next', kind: job.kind, id: data.id })
      } catch (error) { jobs.delete(data.id); job.cleanup(); job.reject(error) }
    }
    worker.onerror = event => disposeProjectIndexWorker(new Error(event.message))
  }
  const id = ++sequence
  const result = new Promise<readonly unknown[]>((resolve, reject) => {
    const cancel = () => {
      worker?.postMessage({ type: 'cancel', kind, id }); jobs.delete(id)
      reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError'))
    }
    signal?.addEventListener('abort', cancel, { once: true })
    jobs.set(id, { kind, entries: [], previous, signal, resolve, reject, cleanup: () => signal?.removeEventListener('abort', cancel) })
  })
  void result.catch(() => {})
  try {
    for (const [type, input] of [['previous', previous ?? []], ['page', entries]] as const) {
      let batch: T[] = []
      for (const entry of input) {
        if (!jobs.has(id)) return result as Promise<Output[]>
        signal?.throwIfAborted()
        batch.push(entry)
        if (batch.length === (kind === 'registry' ? 1 : 256)) {
          worker?.postMessage({ type, kind, id, entries: batch }); batch = []
          await taskScheduler.yieldToUi(signal)
        }
      }
      if (batch.length) worker?.postMessage({ type, kind, id, entries: batch })
    }
    signal?.throwIfAborted()
    worker?.postMessage({ type: 'finish', kind, id })
  } catch (error) {
    const job = jobs.get(id); jobs.delete(id); job?.cleanup(); job?.reject(error)
  }
  return result as Promise<Output[]>
}

export function disposeProjectIndexWorker(error: unknown = new DOMException('Cancelled', 'AbortError')): void {
  worker?.terminate(); worker = undefined
  for (const job of jobs.values()) { job.cleanup(); job.reject(error) }
  jobs.clear()
}

export function sortProjectDirectory(entries: readonly DirEntry[], signal?: AbortSignal, previous?: readonly DirEntry[]): Promise<DirEntry[]> {
  return indexRows('directory', entries, signal, previous)
}

export function prepareProjectIconEntries(entries: Iterable<IconIndexRow>, signal?: AbortSignal): Promise<IconIndexRow[]> {
  return indexRows('icons', entries, signal)
}

export async function parseProjectIconRegistryInWorker(text: string): Promise<import('../model/projectIconRegistry').ProjectIconRegistryDocument> {
  function* chunks() { for (let offset = 0; offset < text.length; offset += 65536) yield text.slice(offset, offset + 65536) }
  const rows = await indexRows<string, RegistryIndexRow>('registry', chunks())
  const series: Array<ProjectIconSeries & { icons: ProjectIcon[] }> = []
  const byKey = new Map<string, (typeof series)[number]>()
  await taskScheduler.forEach(rows, row => {
    if (row.type === 'series') { const item = { key: row.key, name: row.name, icons: [] }; series.push(item); byKey.set(row.key, item) }
    else byKey.get(row.seriesKey)?.icons.push(row.icon)
  })
  return series.length ? { iconSeries: series } : {}
}
