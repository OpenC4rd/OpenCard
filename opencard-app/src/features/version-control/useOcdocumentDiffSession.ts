import { computed, ref, shallowRef, watch, markRaw, type Ref } from 'vue'
import { fileSystemService } from '../workspace/services/fileSystemService'
import { createResourceEnvironment, type ResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import { materializeRevision, readFileAtRevision, releaseRevisionSnapshot } from './gitService'
import type { DiffRevisionOption, DiffSession, DiffSnapshot } from './diff.types'
import { compareOcdocuments, type OcdocumentDiffModel } from './ocdocumentDiff'

export interface OcdocumentDiffSessionOptions {
  translate: (key: string) => string
  projectRoot: Readonly<Ref<string | null | undefined>>
  environment: Readonly<Ref<ResourceEnvironment | null>>
  filePath: Readonly<Ref<string | null | undefined>>
  fileName: Readonly<Ref<string | null | undefined>>
  revisions: Readonly<Ref<readonly DiffRevisionOption[]>>
}
const DIFF_RESOURCE_SNAPSHOT_EXTENSIONS = new Set(['woff', 'woff2', 'ttf', 'otf', 'ttc', 'otc', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
export function isResourceSnapshotDiffPath(path: string): boolean {
  const extension = path.split('.').pop()?.toLocaleLowerCase()
  return Boolean(extension && DIFF_RESOURCE_SNAPSHOT_EXTENSIONS.has(extension))
}


export function useOcdocumentDiffSession(options: OcdocumentDiffSessionOptions) {
  const t = options.translate
  const before = shallowRef<DiffSnapshot | null>(null)
  const after = shallowRef<DiffSnapshot | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let revision = 0
  let closed = false
  let owned: { environment: ResourceEnvironment, root: string }[] = []
  const requests = new Set<Promise<void>>()
  const diffSession = computed<DiffSession | null>(() => before.value && after.value && options.filePath.value ? {
    id: `diff:${options.filePath.value}`, fileTypeId: 'ocdocument', path: options.filePath.value,
    name: options.fileName.value ?? '', before: before.value, after: after.value,
  } : null)
  const diffModel = computed<OcdocumentDiffModel | null>(() => before.value && after.value ? compareOcdocuments(before.value.content, after.value.content) : null)
  async function release(entries: typeof owned) {
    const results = await Promise.allSettled(entries.map(async entry => { try { await entry.environment.dispose() } finally { await releaseRevisionSnapshot(entry.root) } }))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
  async function load(root: string, path: string, commitId: string | null, label: string, acquired: typeof owned): Promise<DiffSnapshot> {
    let content = ''
    let resourceRootPath = root
    let environment = options.environment.value
    if (commitId === null) {
      if (!isResourceSnapshotDiffPath(path)) content = await fileSystemService.readFile(`${root}/${path}`)
    } else {
      const result = await readFileAtRevision(root, { revision: commitId, path })
      if (!result.ok || !result.value) throw new Error(result.error?.message ?? t('sidebar.diffViewer.readRevisionFailed'))
      if (result.value.binary && !isResourceSnapshotDiffPath(path)) throw new Error(t('sidebar.diffViewer.notTextFile'))
      content = result.value.content
      const snapshot = await materializeRevision(root, { revision: commitId })
      if (!snapshot.ok || !snapshot.value) throw new Error(snapshot.error?.message ?? t('sidebar.diffViewer.prepareResourcesFailed'))
      resourceRootPath = snapshot.value.rootPath
      try { environment = await createResourceEnvironment(resourceRootPath, { watch: false, cacheIdentity: root }) }
      catch (error) { await releaseRevisionSnapshot(resourceRootPath); throw error }
      acquired.push({ environment, root: resourceRootPath })
    }
    return { commitId, label, content, resourceRootPath, sourceFilePath: `${resourceRootPath}/${path}`, resourceEnvironment: environment }
  }
  function selectComparison(beforeId: string | null, afterId: string | null): Promise<void> {
    if (closed) return Promise.resolve()
    if (beforeId === afterId) { error.value = t('sidebar.diffViewer.sameVersion'); return Promise.resolve() }
    const root = options.projectRoot.value
    const path = options.filePath.value
    if (!root || !path) { error.value = t('sidebar.diffViewer.projectUnavailable'); return Promise.resolve() }
    const request = ++revision
    loading.value = true; error.value = null
    const acquired: typeof owned = []
    const labels = new Map(options.revisions.value.map(item => [item.commitId, item.label]))
    const work = (async () => {
      const sides = await Promise.allSettled([
        load(root, path, beforeId, labels.get(beforeId) ?? t('sidebar.diffViewer.versionA'), acquired),
        load(root, path, afterId, labels.get(afterId) ?? t('sidebar.diffViewer.versionB'), acquired),
      ])
      const failed = sides.find(side => side.status === 'rejected')
      if (closed || request !== revision || failed) {
        await release(acquired)
        if (!closed && request === revision && failed?.status === 'rejected') error.value = String(failed.reason)
        return
      }
      const previous = owned
      owned = acquired
      before.value = (sides[0] as PromiseFulfilledResult<DiffSnapshot>).value
      after.value = (sides[1] as PromiseFulfilledResult<DiffSnapshot>).value
      await release(previous)
    })().finally(() => { requests.delete(work); if (!closed && request === revision) loading.value = false })
    requests.add(work)
    return work
  }
  const stop = watch([options.projectRoot, options.filePath], () => {
    revision++; before.value = null; after.value = null
    const previous = owned; owned = []
    const work = release(previous).catch(cause => { if (!closed) error.value = String(cause) }).finally(() => requests.delete(work))
    requests.add(work)
  }, { flush: 'sync' })
  let disposal: Promise<void> | undefined
  return markRaw({ before, after, diffSession, diffModel, loading, error, selectComparison,
    beforeSnapshotRoot: computed(() => before.value?.resourceRootPath ?? null),
    afterSnapshotRoot: computed(() => after.value?.resourceRootPath ?? null),
    refresh: () => selectComparison(options.revisions.value.find(item => item.commitId !== null)?.commitId ?? null, null),
    dispose() { return disposal ??= (async () => { closed = true; revision++; stop(); await Promise.allSettled([...requests]); const previous = owned; owned = []; await release(previous); before.value = null; after.value = null })() },
  })
}
export type OcdocumentDiffRuntime = ReturnType<typeof useOcdocumentDiffSession>
