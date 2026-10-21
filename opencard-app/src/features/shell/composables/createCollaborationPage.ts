import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../workspace/store/projectStore'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import { useTutorialStore } from '../../tutorials/tutorialStore'
import CommitVersionDialog from '../../version-control/components/CommitVersionDialog.vue'
import type { SpacePage } from '../spacePage'
import { createCollaborationSection } from '../sections/collaborationSection'
import { useShellNavigation } from './useShellNavigation'
import type { useWorkbenchVersionControl } from './useWorkbenchVersionControl'
import type { OcNodeActivateEvent } from '../../../shared/ui/node/node.types'

/** Collaboration owns its sidebar and commit actions, using the existing workbench editor runtime. */
export function createCollaborationPage(options: {
  workbench: Pick<SpacePage, 'content' | 'contentProps' | 'header' | 'bottomPanel' | 'handleKeydown'>
  version: ReturnType<typeof useWorkbenchVersionControl>
  activateChange: (event: OcNodeActivateEvent) => Promise<void>
  openProject: () => Promise<unknown>
}) {
  const { t } = useI18n()
  const navigation = useShellNavigation()
  const project = useProjectStore()
  const version = options.version
  const active = computed(() => navigation.page.value === 'collaboration')
  const settings = useAppSettingsStore()
  const tutorial = useTutorialStore()
  watch([active, project.projectPath], ([visible, path], [, previousPath]) => {
    if (['initializeVersionControl', 'versionControl'].includes(tutorial.session.value?.tutorialId ?? '')
      && (!visible || path !== previousPath)) tutorial.exit()
  })
  watch(() => active.value && version.repositoryReady.value && !version.isInitializingRepository.value, ready => {
    if (ready) tutorial.completeStep('initializeVersionControl', 'initialize')
  })
  watch(() => {
    if (!active.value || !project.projectPath.value || !settings.isReady.value || tutorial.session.value) return null
    const id = version.repositoryNeedsInitialization.value ? 'initializeVersionControl'
      : version.repositoryReady.value && !version.isInitializingRepository.value ? 'versionControl' : null
    return id && !settings.settings.value.tutorials.seen.includes(id) ? id : null
  }, id => { if (id) tutorial.start(id) }, { immediate: true })
  async function onAction(key: string): Promise<void> {
    if (key === 'open-project') {
      await options.openProject()
      return
    }
    if (!project.projectPath.value) return
    if (key === 'initialize-repository' && version.repositoryNeedsInitialization.value) {
      await version.initializeProjectRepository()
    } else if (key === 'publish-version' && version.selectedChangeCount.value > 0 && !version.isCommittingVersion.value) {
      version.commitVersionError.value = ''
      version.commitVersionDialogOpen.value = true
    }
  }
  function refresh(): void {
    if ((active.value || navigation.isWorkbench.value) && version.repositoryReady.value) void version.refreshTimelineStatus()
  }
  watch(active, visible => { if (visible) refresh() })
  onMounted(() => window.addEventListener('focus', refresh))
  onUnmounted(() => window.removeEventListener('focus', refresh))
  const sidebar = createCollaborationSection({
    translate: t, projectOpen: computed(() => Boolean(project.projectPath.value)), onAction,
    version: {
      ready: version.repositoryReady, needsInitialization: version.repositoryNeedsInitialization,
      initializing: version.isInitializingRepository, committing: version.isCommittingVersion,
      selectedChangeCount: version.selectedChangeCount,
      changes: {
        data: version.changesTreeData, expandedKeys: version.changesExpandedKeys,
        onExpansionChange: version.handleChangesExpansionChange, onExpansionSync: version.handleChangesExpansionSync,
        onNodeActivate: options.activateChange, onAction: version.handleChangesAction,
      },
      graph: {
        data: version.timelineProjectTreeData, expandedKeys: version.versionGraphExpandedKeys,
        onExpansionChange: version.handleVersionGraphExpansionChange, onExpansionSync: version.handleVersionGraphExpansionSync,
      },
    },
  })
  const page: SpacePage = {
    key: 'collaboration',
    navigation: { key: 'collaboration', icon: 'mdiAccountGroup', labelKey: 'app.shell.space.collaboration' },
    ...options.workbench,
    contentKey: 'workbench', sidebar,
    sidebarLayout: { persistenceKey: computed(() => {
      const path = project.projectPath.value.replace(/\\/g, '/').replace(/\/+$/, '')
      return path ? `collaboration:${path}` : ''
    }) },
    overlays: CommitVersionDialog,
    overlayProps: computed(() => ({
      open: version.commitVersionDialogOpen.value, busy: version.isCommittingVersion.value,
      error: version.commitVersionError.value, onClose: version.closeCommitVersionDialog, onSubmit: version.commitVersion,
    })),
  }
  return page
}
