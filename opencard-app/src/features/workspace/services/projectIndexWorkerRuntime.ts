import type { DirEntry } from '@tauri-apps/plugin-fs'
import { parseProjectIconRegistryText } from '../model/projectIconRegistry'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
export function sortDirectoryEntries(entries: DirEntry[]): DirEntry[] {
  return entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || collator.compare(a.name, b.name))
}

import type { ProjectIcon } from '../model/projectIcons'
export type IconIndexRow = ProjectIcon & { seriesKey: string; identity?: string }
export type RegistryIndexRow = { type: 'series'; key: string; name: string } | { type: 'icon'; seriesKey: string; icon: ProjectIcon }
export type IndexJobKind = 'directory' | 'icons' | 'registry'
type Row = DirEntry | IconIndexRow | RegistryIndexRow | string
type Input = { type: 'page' | 'previous'; kind: IndexJobKind; id: number; entries: Row[] }
  | { type: 'finish' | 'next' | 'cancel'; kind: IndexJobKind; id: number }
if (typeof document === 'undefined' && typeof self !== 'undefined') {
  const jobs = new Map<number, { kind: IndexJobKind; entries: Row[]; previous: DirEntry[]; offset: number }>()
  self.onmessage = ({ data }: MessageEvent<Input>) => {
    if (data.type === 'cancel') { jobs.delete(data.id); return }
    let job = jobs.get(data.id)
    if (!job) {
      if (data.type === 'next') return
      job = { kind: data.kind, entries: [], previous: [], offset: 0 }; jobs.set(data.id, job)
    }
    if (data.type === 'previous') { job.previous.push(...data.entries as DirEntry[]); return }
    if (data.type === 'page') {
      if (job.kind !== 'icons') job.entries.push(...data.entries)
      else for (const row of data.entries as IconIndexRow[]) job.entries.push({ ...row, identity: `${row.seriesKey.toLowerCase()}\u0000${row.iconKey.toLowerCase()}` })
      return
    }
    if (data.type === 'finish' && job.kind === 'registry') {
      const document = parseProjectIconRegistryText(job.entries.join(''))
      if (!document) { self.postMessage({ id: data.id, error: 'Unreadable resource definition' }); jobs.delete(data.id); return }
      job.entries = []
      for (const series of document.iconSeries ?? []) {
        job.entries.push({ type: 'series', key: series.key, name: series.name })
        for (const icon of series.icons) job.entries.push({ type: 'icon', seriesKey: series.key, icon })
      }
    }
    if (data.type === 'finish' && job.kind === 'directory') {
      const entries = sortDirectoryEntries(job.entries as DirEntry[])
      if (entries.length === job.previous.length && entries.every((entry, index) => {
        const previous = job!.previous[index]!
        return entry.name === previous.name && entry.isDirectory === previous.isDirectory && entry.isFile === previous.isFile && entry.isSymlink === previous.isSymlink
      })) {
        self.postMessage({ id: data.id, entries: [], done: true, unchanged: true }); jobs.delete(data.id); return
      }
    }
    const entries = job.entries.slice(job.offset, job.offset + 256)
    job.offset += entries.length
    const done = job.offset >= job.entries.length
    self.postMessage({ id: data.id, entries, done })
    if (done) jobs.delete(data.id)
  }
}
