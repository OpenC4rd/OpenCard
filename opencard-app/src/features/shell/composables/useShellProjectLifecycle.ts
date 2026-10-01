import { readonly, ref, type Ref } from 'vue'
import { normalizePath } from '../../../shared/model/filePath'
import type { CreatedProject } from '../../project-templates/model/projectTemplate'
import { reportAppError } from '../../logging/appErrorCatalog'
import { notifyError } from '../../notifications/titlebarNotices'
import {
  openFlow,
  resolveLocationAfterProjectClose,
  type ProjectCloseDestination,
  type ShellLocation,
} from '../shellLocation'

type ProjectLifecycleOptions = {
  project: {
    projectPath: Readonly<Ref<string>>
    chooseProjectDirectory: (title: string) => Promise<string | null>
    setProjectPath: (path: string) => Promise<void>
    readDirectoryEntries: (path?: string, depth?: number) => Promise<void>
  }
  sessions: {
    closeWorkspaceSessions: () => void
    open: (path: string) => Promise<unknown>
  }
  /** 按“关闭项目”流程收尾当前项目（含未保存确认）；返回是否已经完成。 */
  closeCurrentProject: () => Promise<'completed' | 'prompted'>
  settings: {
    rememberRecentProject: (path: string) => void
    forgetRecentProject: (path: string) => void
  }
  templates: {
    load: () => Promise<void>
  }
  shellLocation: Ref<ShellLocation>
  translate: (key: string) => string
}

export function useShellProjectLifecycle(options: ProjectLifecycleOptions) {
  const isActivating = ref(false)
  /** 用户正在回答未保存确认时暂存的打开请求；取消时直接丢弃。 */
  let deferredActivation: { path: string, entryPath?: string } | null = null

  /**
   * 项目树按需加载：这里只登记到标准前瞻深度，更深的目录在展开时再读。
   * 以前用 Infinity 深度的全量递归，等于每次激活项目都把整个项目（含被安全软件盯着的目录）走一遍。
   */
  async function ensureProjectTreeLoaded(): Promise<void> {
    if (!options.project.projectPath.value) return
    await options.project.readDirectoryEntries('')
  }

  async function activateNow(path: string, entryPath?: string): Promise<boolean> {
    if (isActivating.value) return false

    isActivating.value = true

    try {
      await options.project.setProjectPath(path)
      options.settings.rememberRecentProject(options.project.projectPath.value)
      if (entryPath) {
        await options.sessions.open(entryPath)
      }
      options.shellLocation.value = { base: { space: 'workbench' } }
      return true
    } catch (error) {
      notifyError(options.translate('projectTemplates.errors.activationFailed'))
      reportAppError('OC-E3001', error)
      return false
    } finally {
      isActivating.value = false
    }
  }

  /** 打开另一个项目前先走一遍关闭当前项目的流程，确认之后才切换。 */
  async function activatePreparedProject(path: string, entryPath?: string): Promise<boolean> {
    const previousProjectPath = options.project.projectPath.value
    if (previousProjectPath && normalizePath(previousProjectPath) !== normalizePath(path)) {
      const outcome = await options.closeCurrentProject()
      if (outcome === 'prompted') {
        deferredActivation = { path, ...(entryPath ? { entryPath } : {}) }
        return false
      }
    }
    return await activateNow(path, entryPath)
  }

  async function activateProject(path: string, entryPath?: string): Promise<boolean> {
    return await activatePreparedProject(path, entryPath)
  }

  /** 未保存确认结束后继续打开被暂存的项目。 */
  async function resumeDeferredActivation(): Promise<boolean> {
    const pending = deferredActivation
    deferredActivation = null
    return pending ? await activateNow(pending.path, pending.entryPath) : false
  }

  function dropDeferredActivation(): void {
    deferredActivation = null
  }

  async function openProject(): Promise<boolean> {
    const path = await options.project.chooseProjectDirectory(options.translate('app.dialogs.chooseProjectFolder'))
    return path ? await activateProject(path) : false
  }

  async function openRecentProject(path: string): Promise<boolean> {
    return await activateProject(path)
  }

  async function relocateRecentProject(missingPath: string): Promise<string | null> {
    const selectedPath = await options.project.chooseProjectDirectory(options.translate('app.dialogs.chooseProjectFolder'))
    if (!selectedPath) return null

    options.settings.forgetRecentProject(missingPath)
    options.settings.rememberRecentProject(selectedPath)
    return selectedPath
  }

  async function activateCreatedProject(project: CreatedProject): Promise<boolean> {
    return await activateProject(project.path, project.entry)
  }

  function enterCreateProject(): void {
    options.shellLocation.value = openFlow(options.shellLocation.value, 'create-project')
    void options.templates.load().catch(() => undefined)
  }

  async function completeProjectClose(destination: ProjectCloseDestination = 'current'): Promise<void> {
    options.sessions.closeWorkspaceSessions()
    await options.project.setProjectPath('')
    options.shellLocation.value = resolveLocationAfterProjectClose(options.shellLocation.value, destination)

    if (destination === 'create-project') {
      void options.templates.load().catch(() => undefined)
    }
  }

  return {
    isActivating: readonly(isActivating),
    openProject,
    openRecentProject,
    relocateRecentProject,
    activateCreatedProject,
    resumeDeferredActivation,
    dropDeferredActivation,
    enterCreateProject,
    completeProjectClose,
    ensureProjectTreeLoaded,
  }
}
