import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../workspace/store/projectStore'
import { useProjectTemplateStore } from '../../project-templates/store/projectTemplateStore'
import { useAppStateStore } from '../../app-state/store/appStateStore'
import { getPathDirectory } from '../../../shared/model/filePath'
import { notifyAppError, notifyWarning, notifySuccess } from '../../notifications/titlebarNotices'
import { classifyExternalOpenPath } from '../services/externalOpenService'
import { initializeAppProjectActions } from '../services/appProjectActions'
import { openFlow } from '../shellLocation'
import { useShellNavigation } from './useShellNavigation'
import { useAppProjectLifecycle } from './useAppProjectLifecycle'
import type { createWorkbenchPage } from './createWorkbenchPage'
import type { createCreateProjectPage } from './createCreateProjectPage'
import type { createExportTemplatePage } from './createExportTemplatePage'
import type { useApplicationServices } from './useApplicationServices'

/** Shared application operations keep project transitions on the guarded workbench path. */
export function useApplicationActions(options: {
  workbench: () => ReturnType<typeof createWorkbenchPage>
  createProject: () => ReturnType<typeof createCreateProjectPage>
  exportTemplate: () => ReturnType<typeof createExportTemplatePage>
  services: ReturnType<typeof useApplicationServices>
}) {
  const { t, locale } = useI18n()
  const project = useProjectStore()
  const history = useAppStateStore()
  const templates = useProjectTemplateStore()
  const navigation = useShellNavigation()
  const lifecycle = useAppProjectLifecycle({
    project,
    sessions: { closeWorkspaceSessions: () => options.workbench().closeWorkspaceSessions(), open: path => options.workbench().open(path) },
    closeCurrentProject: () => options.workbench().requestProjectClose('current'),
    history, templates, shellLocation: navigation.location, translate: t,
  })
  const busy = computed(() => options.createProject().busy.value || options.exportTemplate().busy.value)
  async function newProject(): Promise<void> {
    if (options.createProject().busy.value) return
    if (project.projectPath.value) { await options.workbench().requestProjectClose('create-project'); return }
    options.createProject().reset()
    lifecycle.enterCreateProject()
  }
  initializeAppProjectActions({
    openProject: lifecycle.openProject, openRecentProject: lifecycle.openRecentProject, relocateRecentProject: lifecycle.relocateRecentProject,
    newProject, openFile: () => options.workbench().openFile(), exportTemplate: () => options.exportTemplate().open(),
    closeProject: destination => options.workbench().requestProjectClose(destination),
    closeApplication: action => options.workbench().requestApplicationClose(action), cancelDeferredOpen: lifecycle.dropDeferredActivation,
  })
  async function completeProjectClose(destination: Parameters<typeof lifecycle.completeProjectClose>[0]): Promise<void> {
    if (destination === 'create-project') options.createProject().reset()
    await lifecycle.completeProjectClose(destination)
    await lifecycle.resumeDeferredActivation()
  }
  async function handleExternalOpenPaths(paths: readonly string[]): Promise<void> {
    for (const source of paths) {
      const path = source.replace(/\\/g, '/')
      const kind = classifyExternalOpenPath(path)
      if (!kind) continue
      try {
        if (kind === 'resource-package') {
          if (project.projectPath.value) await options.workbench().addResourcePackageToProject(path)
          else await options.createProject().importDroppedResourcePackage(path)
        } else if (kind === 'project-resource') {
          const directory = getPathDirectory(getPathDirectory(path))
          if (directory) await lifecycle.activateProject(directory, path)
        } else if (kind === 'card') {
          await options.workbench().open(path)
          navigation.showPrimarySpace('workbench')
        } else if (kind === 'template') {
          const imported = await templates.importUserTemplate(path)
          options.createProject().selectTemplate(imported.key)
          navigation.location.value = openFlow(navigation.location.value, 'create-project')
        }
      } catch (error) { notifyAppError('OC-E2002', { path, error }, locale.value) }
    }
  }
  async function runCommand(key: string): Promise<boolean> {
    if (busy.value) return true
    const services = options.services
    switch (key) {
      case 'open-settings': navigation.showSettings('general'); return true
      case 'about-opencard': navigation.location.value = openFlow(navigation.location.value, 'about'); return true
      case 'return-primary-page': navigation.returnFromFlow(); return true
      case 'show-welcome': case 'show-workbench': navigation.showPrimarySpace(key === 'show-welcome' ? 'welcome' : 'workbench'); return true
      case 'send-feedback': case 'view-feedback': services.openFeedbackCenter(key === 'send-feedback' ? 'submit' : 'history'); return true
      case 'toggle-developer-mode': if (import.meta.env.DEV) { services.developerMode.value = !services.developerMode.value; services.stopDeveloperUpdatePreview() }; return true
      case 'check-for-updates': {
        const state = await services.checkForUpdate()
        if (state === 'failed') notifyWarning(t('app.updater.checkFailed'))
        else if (state === 'up-to-date') notifySuccess(t('app.updater.upToDate'), 'action.check')
        else if (state === 'available') notifySuccess(t('app.updater.updateFound', { version: services.updateVersion.value }), 'action.download')
        return true
      }
      case 'new-project': await newProject(); return true
      case 'new-open-card': options.workbench().newDocument(); return true
      case 'open-project': await lifecycle.openProject(); return true
      case 'open-file': await options.workbench().openFile(); return true
      case 'close-project-and-welcome': if (project.projectPath.value) await options.workbench().requestProjectClose('welcome'); return true
      case 'export-project-template': await options.exportTemplate().open(); return true
      default: return false
    }
  }
  return { lifecycle, completeProjectClose, handleExternalOpenPaths, runCommand, busy }
}
