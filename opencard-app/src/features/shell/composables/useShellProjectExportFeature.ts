import { ref, type Ref } from 'vue'
import type { ProjectExportTask } from '../../workspace/model/projectMetadata'
import type { ExportDocumentCandidate } from '../../../components/editors/ProjectExportTaskEditor.vue'
import type { ExportPlan, ExportPreparationResult, ExportTaskValidationIssue } from '../../exporting/exportTask'
import { createDefaultProjectExportTask } from '../../exporting/exportTask'

export function useShellProjectExportFeature(options: {
  projectProfile: Readonly<Ref<{ exportTask?: ProjectExportTask } | null>>
  indexedEntries: Readonly<Ref<readonly { isDirectory?: boolean | null; name: string }[]>>
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
  function copyTask(value: ProjectExportTask): ProjectExportTask { return { ...value, documentPaths: [...value.documentPaths] } }
  async function show(): Promise<void> {
    issues.value = []
    task.value = copyTask(options.projectProfile.value?.exportTask ?? createDefaultProjectExportTask())
    const paths = options.indexedEntries.value.filter(entry => !entry.isDirectory && entry.name.toLowerCase().endsWith('.ocdocument')).map(entry => entry.name.replace(/\\/g, '/'))
    candidates.value = paths.map(path => ({ path }))
    open.value = true
    candidates.value = await Promise.all(paths.map(async path => {
      try {
        const document = (await options.loadDocumentSnapshot(path)).document
        const width = Number(document.width), height = Number(document.height)
        return { path, ...(Number.isFinite(width) && Number.isFinite(height) ? { width, height } : {}) }
      } catch { return { path } }
    }))
  }
  function close(): void { if (!preparing.value && !options.running.value) open.value = false }
  async function submit(): Promise<boolean> {
    if (preparing.value || options.running.value) return false
    preparing.value = true; issues.value = []
    const result = await options.prepare(task.value)
    if (!result.ok) { issues.value = result.issues; preparing.value = false; return false }
    open.value = false; preparing.value = false; void options.run(result.plan); return true
  }
  return { open, task, candidates, preparing, issues, running: options.running, show, close, submit }
}
