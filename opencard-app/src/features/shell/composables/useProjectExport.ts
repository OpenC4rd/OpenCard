/**
 * 模块说明：
 * - 将项目导出领域模块接入 Shell 的 session、隐藏 DOM renderer、文件系统与任务进度。
 * 职责边界：
 * - 只提供端口适配和运行生命周期，不定义队列、命名、冲突或失败策略。
 */
import { readonly, ref, type Ref } from 'vue'
import { parseCardDocument } from '../../../entities/card/storage'
import { isSameOrDescendantPath, normalizePath } from '../../../shared/model/filePath'
import { prepareExportTask } from '../../exporting/exportPlanner'
import { runExportPlan } from '../../exporting/exportRunner'
import type {
  ExportDocumentSnapshot,
  ExportFaceRenderer,
  ExportPlan,
  ExportPreparationResult,
  ExportProgressEvent,
  ExportRunResult,
} from '../../exporting/exportTask'
import type { CardRenderEnvironment } from '../../card-rendering/renderPipeline'
import type { PreparedCardRender } from '../../card-rendering/renderPipeline'
import type { CardFaceKey } from '../../../entities/card/model'
import type { ProjectExportTask } from '../../workspace/model/projectMetadata'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { renderFaceToPng } from '../../card-rendering/export/renderFaceToPng'
import { createCanvasAssetStore } from '../../card-rendering/painter/canvasAssetStore'
import { reportAppError } from '../../logging/appErrorCatalog'
import { notifyAppError, notifyError, notifySuccess, notifyWarning } from '../../notifications/titlebarNotices'
import { useShellProgressTasks } from './useShellProgressTasks'

const PROJECT_EXPORT_PROGRESS_KEY = 'project-export'

type UseProjectExportOptions = {
  sessions: Readonly<Ref<readonly EditorSession[]>>
  renderEnvironment: Readonly<Ref<Readonly<CardRenderEnvironment>>>
  readProjectFile: (relativePath: string) => Promise<string>
  resolveProjectPath: (relativePath: string) => string
  getRelativeProjectPath: (path: string) => string
  translate: (key: string, params?: Record<string, unknown>) => string
}

export function useProjectExport(options: UseProjectExportOptions) {
  const isRunning = ref(false)
  let settle: (() => void) | undefined
  let settled: Promise<void> = Promise.resolve()
  function start() { controller.value = new AbortController(); settled = new Promise(resolve => { settle = resolve }) }
  const controller = ref<AbortController | null>(null)
  const { setTask, removeTask } = useShellProgressTasks()

  async function loadDocumentSnapshot(relativePath: string): Promise<ExportDocumentSnapshot> {
    const normalizedRelativePath = normalizePath(relativePath)
    const session = options.sessions.value.find(candidate => candidate.state.resourceKind === 'workspace'
      && candidate.state.path
      && options.getRelativeProjectPath(candidate.state.path).toLocaleLowerCase() === normalizedRelativePath.toLocaleLowerCase())
    const content = session?.state.draftContent ?? await options.readProjectFile(normalizedRelativePath)
    const document = parseCardDocument(JSON.parse(content) as unknown)
    return {
      sourcePath: normalizedRelativePath,
      resourceRootPath: normalizePath(options.resolveProjectPath('')),
      sourceFilePath: normalizePath(options.resolveProjectPath(normalizedRelativePath)),
      document,
    }
  }

  const destination = {
    exists: (path: string) => fileSystemService.fileExists(path),
    ensureDirectory: (path: string) => fileSystemService.createDirectory(path),
    /*
     * 产物落在项目里时要自己宣告失效：它可能正是某张卡引用的资源，而目录监听要等
     * 批量窗口（120ms）再加前端防抖（150ms），同一轮导出里排在前面的写入就会
     * 让后面的卡片读到旧图。写完立刻 refresh，导出才是「按顺序看得到前面写的东西」。
     */
    write: async (path: string, bytes: Uint8Array) => {
      await fileSystemService.writeBinaryFile(path, bytes)
      const environment = options.renderEnvironment.value.projectResourceEnvironment
      if (!environment?.refresh || !isSameOrDescendantPath(path, options.resolveProjectPath(''))) return
      await environment.refresh([normalizePath(path)]).catch(() => undefined)
    },
  }

  async function prepare(task: ProjectExportTask): Promise<ExportPreparationResult> {
    if (isRunning.value) throw new Error('Export renderer is busy')
    isRunning.value = true
    start()
    const environment = options.renderEnvironment.value
    const signal = controller.value!.signal
    try {
      const snapshots = new Map<string, ExportDocumentSnapshot>()
      for (const path of task.documentPaths) {
        if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
        snapshots.set(normalizePath(path).toLowerCase(), await loadDocumentSnapshot(path))
      }
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
      const request = { task, source: { load: async (path: string) => snapshots.get(normalizePath(path).toLowerCase())! }, destination, environment }
      await prepareExportTask(request)
      await environment.projectResourceEnvironment?.waitForResources?.()
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
      return await prepareExportTask(request)
    } finally { controller.value = null; isRunning.value = false; settle?.(); settle = undefined }
  }

  const exportAssetStore = createCanvasAssetStore()

  const renderer: ExportFaceRenderer = {
    async render(request, signal) {
      if (signal.aborted || request.render.resources.hostEnvironment.isDisposed?.()) throw new DOMException('Export cancelled', 'AbortError')
      await request.render.resources.hostEnvironment.waitForResources?.()
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
      const bytes = await renderFaceToPng(request.render.document.faces[request.faceKey], {
        scale: request.scale,
        dpi: request.dpi,
        resourceContext: request.render.resources,
        signal,
        assets: exportAssetStore,
      })
      if (!bytes || bytes.length === 0) {
        throw new Error(`Export render produced 0 bytes for face '${request.faceKey}'`)
      }
      return bytes
    },
    reset() {
      exportAssetStore.clear()
    },
  }

  function progressDetail(event: ExportProgressEvent): string | undefined {
    if (!event.current) return undefined
    return options.translate(`projectExport.progress.phase.${event.phase}`, {
      path: event.current.sourcePath,
    })
  }

  function reportProgress(event: ExportProgressEvent): void {
    setTask({
      key: PROJECT_EXPORT_PROGRESS_KEY,
      title: options.translate('projectExport.progress.title'),
      progress: event.totalUnits > 0 ? event.completedUnits / event.totalUnits : 0,
      weight: Math.max(1, event.totalUnits),
      detail: progressDetail(event),
      cancellable: event.phase !== 'completed' && event.phase !== 'cancelled' && event.phase !== 'failed',
    }, cancel)
  }

  function reportResult(result: ExportRunResult): void {
    const summary = options.translate('projectExport.progress.summary', {
      succeeded: result.succeeded,
      skipped: result.skipped,
      failed: result.failed,
      directory: result.outputDirectory,
    })
    if (result.status === 'failed') {
      reportAppError('OC-E5006', result)
      notifyError(summary)
    } else if (result.status === 'cancelled' || result.failed > 0 || result.skipped > 0) {
      notifyWarning(summary)
    } else {
      notifySuccess(summary)
    }
  }

  async function run(plan: ExportPlan): Promise<ExportRunResult | null> {
    if (isRunning.value) return null
    isRunning.value = true
    start()
    setTask({
      key: PROJECT_EXPORT_PROGRESS_KEY,
      title: options.translate('projectExport.progress.title'),
      progress: 0,
      weight: Math.max(1, plan.entries.length * 2),
      cancellable: true,
    }, cancel)
    try {
      const result = await runExportPlan({
        plan,
        renderer,
        destination,
        signal: controller.value!.signal,
        report: reportProgress,
      })
      reportResult(result)
      return result
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      notifyAppError('OC-E5006', error)
      return null
    } finally {
      removeTask(PROJECT_EXPORT_PROGRESS_KEY)
      renderer.reset()
      controller.value = null
      isRunning.value = false
      settle?.(); settle = undefined
    }
  }

  async function renderCardImages(
    render: PreparedCardRender,
    faceKeys: readonly CardFaceKey[],
    scale: number,
    outputs?: ReadonlyMap<CardFaceKey, string>,
  ): Promise<ReadonlyMap<CardFaceKey, Uint8Array> | null> {
    if (isRunning.value || render.resources.hostEnvironment.isDisposed?.()) return null
    isRunning.value = true
    start()
    const result = new Map<CardFaceKey, Uint8Array>()
    try {
      await options.renderEnvironment.value.projectResourceEnvironment?.waitForResources?.()
      await render.resources.hostEnvironment.waitForResources?.()
      for (const faceKey of faceKeys) {
        result.set(faceKey, await renderer.render({
          sourcePath: '',
          outputPath: '',
          faceKey,
          render,
          scale,
        }, controller.value!.signal))
      }
      for (const [face, path] of outputs ?? []) {
        if (controller.value!.signal.aborted) throw new DOMException('Export cancelled', 'AbortError')
        const bytes = result.get(face)
        if (!bytes || bytes.length === 0) {
          throw new Error(`Export render produced 0 bytes for face '${face}'`)
        }
        await destination.write(path, bytes)
      }
      return result
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      notifyAppError('OC-E5006', error)
      return null
    } finally {
      renderer.reset()
      controller.value = null
      isRunning.value = false
      settle?.(); settle = undefined
    }
  }

  function cancel(): void {
    controller.value?.abort()
  }

  return {
    isRunning: readonly(isRunning),
    loadDocumentSnapshot,
    prepare,
    run,
    renderCardImages,
    cancel,
    cancelAndWait: async () => { cancel(); await settled },
  }
}
