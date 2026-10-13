import { computed, onBeforeUnmount, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SpacePage } from '../spacePage'
import type { ShellPage } from '../shellLocation'
import type { ShellSpaceDefinition } from '../shell.types'
import type { ApplicationCloseAction } from './useUnsavedSessionGuard'
import ComingSoonPageContent from '../components/ComingSoonPageContent.vue'
import { useShellNavigation } from './useShellNavigation'
import { useApplicationServices } from './useApplicationServices'
import { useApplicationActions } from './useApplicationActions'
import { createWelcomePage } from './createWelcomePage'
import { createSettingsPage } from './createSettingsPage'
import { createWorkbenchPage } from './createWorkbenchPage'
import { createCollaborationPage } from './createCollaborationPage'
import { createCreateProjectPage } from './createCreateProjectPage'
import { createExportTemplatePage } from './createExportTemplatePage'
import { createAboutPage } from './createAboutPage'
import { useAppProjectActions } from '../services/appProjectActions'
import { resolveConfirmation } from '../services/appConfirmation'

/** Initialize each page once in the application scope; selecting a page only selects its VM. */
function createAppPages(destroyWindow: () => Promise<void>) {
  const { t } = useI18n()
  onUnmounted(() => resolveConfirmation(false))
  const navigation = useShellNavigation()
  let workbench: ReturnType<typeof createWorkbenchPage>
  let creation: ReturnType<typeof createCreateProjectPage>
  let templateExport: ReturnType<typeof createExportTemplatePage>
  const services = useApplicationServices({
    requestInstall: async () => { await useAppProjectActions().closeApplication('install-update') },
  })
  const application = useApplicationActions({
    workbench: () => workbench, createProject: () => creation, exportTemplate: () => templateExport, services,
  })
  const settings = createSettingsPage(() => workbench.cancelExportsAndWait())
  async function completeApplicationClose(action: ApplicationCloseAction): Promise<void> {
    if (action === 'install-update') {
      if (services.availableUpdate.value) await services.installDownloadedUpdate()
      else if (import.meta.env.DEV && services.isDeveloperPreviewDownloaded.value) services.stopDeveloperUpdatePreview()
    } else await destroyWindow()
  }
  workbench = createWorkbenchPage({
    openSetting: settings.openSetting, completeProjectClose: application.completeProjectClose, completeApplicationClose,
  })
  creation = createCreateProjectPage(application.lifecycle)
  templateExport = createExportTemplatePage(workbench.templateTree)
  function placeholder(key: 'market' | 'test', icon: ShellSpaceDefinition['icon']): SpacePage {
    return {
      key, navigation: { key, icon, labelKey: `app.shell.space.${key}` }, content: ComingSoonPageContent,
      contentProps: computed(() => ({ title: t(`app.shell.space.${key}`), icon })), sidebar: computed(() => []),
      header: computed(() => ({ title: t(`app.shell.space.${key}`), titleLoading: false, icon, actions: [] })),
    }
  }
  const pages: Record<ShellPage, SpacePage> = {
    welcome: createWelcomePage(), workbench: workbench.page, settings: settings.page,
    collaboration: createCollaborationPage({
      workbench: { content: workbench.page.content, contentProps: workbench.page.contentProps,
        header: workbench.page.header, bottomPanel: workbench.page.bottomPanel, handleKeydown: workbench.page.handleKeydown },
      version: workbench.versionControl, activateChange: workbench.handleChangesNodeActivate,
      openProject: workbench.openProject,
    }),
    market: placeholder('market', 'nav.market'),
    test: placeholder('test', 'nav.test'),
    'create-project': creation.page, 'export-template': templateExport.page, about: createAboutPage(services),
  }
  const currentPage = computed(() => pages[navigation.page.value])
  const menuContribution = computed(() => ({ ...workbench.page.menuContribution?.value, ...currentPage.value.menuContribution?.value }))
  const spaces = Object.values(pages).flatMap(page => page.navigation ? [page.navigation] : [])
  const globalOverlayProps = computed(() => ({
    releaseNotesDialogMode: services.releaseNotesDialogMode.value, displayedReleaseNotes: services.displayedReleaseNotes.value,
    isDownloadingUpdate: services.isDownloadingUpdate.value, isInstallingUpdate: services.isInstallingUpdate.value, isUpdateDownloaded: services.isUpdateDownloaded.value,
    feedbackCenterPage: services.feedbackCenterPage.value, feedbackDialogKind: services.feedbackDialogKind.value,
    latestFeedbackDiagnostics: services.latestFeedbackDiagnostics.value, developerMode: services.developerMode.value,
    onCloseReleaseNotes: services.closeReleaseNotesDialog, onReleaseAction: services.handleAvailableReleaseAction,
    onFeedbackPageChange: (page: typeof services.feedbackCenterPage.value) => { services.feedbackCenterPage.value = page },
    onCloseFeedback: () => { services.feedbackCenterPage.value = null },
  }))
  return { pages, currentPage, spaces, application, services, globalOverlayProps, menuContribution }
}

let appPages: ReturnType<typeof createAppPages> | undefined

/** Called by the application root; repeated initialization reuses the same runtime. */
export function initializeAppPages(destroyWindow: () => Promise<void>) {
  if (appPages) return appPages
  const instance = createAppPages(destroyWindow)
  appPages = instance
  onBeforeUnmount(() => { if (appPages === instance) appPages = undefined })
  return instance
}

/** Gets the existing application runtime without creating pages or registering effects. */
export function useAppPages() {
  if (!appPages) throw new Error('Application pages have not been initialized')
  return appPages
}
