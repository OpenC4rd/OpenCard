import { ref, onScopeDispose, type Ref } from 'vue'
import { taskScheduler } from '../../../utils/taskScheduler'
import type { ProjectExportTask } from '../../workspace/model/projectMetadata'
import type { ExportDocumentCandidate } from '../../../components/editors/ProjectExportTaskEditor.vue'
import type { ExportPlan, ExportPreparationResult, ExportTaskValidationIssue } from '../../exporting/exportTask'
import { createDefaultProjectExportTask } from '../../exporting/exportTask'

export function useWorkbenchProjectExport(options: {
  projectProfile: Readonly<Ref<{ exportTask?: ProjectExportTask } | null>>
  listDocuments: (signal: AbortSignal) => Promise<readonly string[]>
  running: Readonly<Ref<boolean>>
  loadDocumentSnapshot: (path: string) => Promise<{ document: { width?: unknown; height?: unknown } }>
  prepare: (task: ProjectExportTask) => Promise<ExportPreparationResult>
  run: (plan: ExportPlan) => Promise<unknown> | void
}) {
  const open = ref(false)
  const task = ref<ProjectExportTask>(createDefaultProjectExportTask())
  const candidates = ref<readonly ExportDocumentCandidate[]>([])
  const preparing = ref(false)
  const issues = ref<readonly ExportTaskValidationIssue[]>([])
  let request: AbortController | undefined
  onScopeDispose(() => request?.abort())
  function copyTask(value: ProjectExportTask): ProjectExportTask { return { ...value, documentPaths: [...value.documentPaths] } }
  async function show(): Promise<void> {
    issues.value = []
    task.value = copyTask(options.projectProfile.value?.exportTask ?? createDefaultProjectExportTask())
    request?.abort()
    const owner = new AbortController()
    request = owner
    open.value = true
    candidates.value = []
    try {
    const paths = await options.listDocuments(owner.signal)
    if (owner.signal.aborted) return
    const next: ExportDocumentCandidate[] = []
    for (const path of paths) {
      owner.signal.throwIfAborted()
      try {
        const document = (await options.loadDocumentSnapshot(path)).document
        const width = Number(document.width), height = Number(document.height)
        next.push({ path, ...(Number.isFinite(width) && Number.isFinite(height) ? { width, height } : {}) })
      } catch { next.push({ path }) }
      if (next.length % 16 === 0) await taskScheduler.yieldToUi(owner.signal)
    }
    if (!owner.signal.aborted) candidates.value = next
    } catch (error) { if (!owner.signal.aborted) throw error }
  }
  function close(): void { if (!preparing.value && !options.running.value) { request?.abort(); candidates.value = []; open.value = false } }
  async function submit(): Promise<boolean> {
    if (preparing.value || options.running.value) return false
    preparing.value = true; issues.value = []
    let result: ExportPreparationResult
    try { result = await options.prepare(task.value) } finally { preparing.value = false }
    if (!result.ok) { issues.value = result.issues; preparing.value = false; return false }
    open.value = false; preparing.value = false; void options.run(result.plan); return true
  }
  return { open, task, candidates, preparing, issues, running: options.running, show, close, submit }
}
