/** 每个处于对比模式的编辑器会话持有一份差异运行时；会话退出对比或项目关闭时释放它占的版本快照。 */
import { shallowReactive } from 'vue'
import { reportAppError } from '../logging/appErrorCatalog'
import { useProjectStore } from '../workspace/store/projectStore'
import type { FileDiffRuntime } from './useFileDiffSession'

export const fileDiffRuntimes = shallowReactive(new Map<string, FileDiffRuntime>())
const disposals = new Set<Promise<void>>()
let boundToProject = false

export function acquireFileDiff(id: string, create: () => FileDiffRuntime): FileDiffRuntime {
  if (!boundToProject) {
    boundToProject = true
    useProjectStore().onDispose(async () => {
      const released = await Promise.allSettled([...disposals, ...[...fileDiffRuntimes.keys()].map(releaseFileDiff)])
      const failure = released.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    })
  }
  let runtime = fileDiffRuntimes.get(id)
  if (!runtime) fileDiffRuntimes.set(id, runtime = create())
  return runtime
}

export function releaseFileDiff(id: string): Promise<void> {
  const runtime = fileDiffRuntimes.get(id)
  fileDiffRuntimes.delete(id)
  const work = runtime?.dispose() ?? Promise.resolve()
  disposals.add(work)
  void work.finally(() => disposals.delete(work))
    .catch(error => reportAppError('OC-E3016', { path: useProjectStore().projectPath.value, error }))
  return work
}
