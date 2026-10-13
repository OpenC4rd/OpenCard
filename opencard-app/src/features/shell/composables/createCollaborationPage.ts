import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../workspace/store/projectStore'
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
}) {
  const { t } = useI18n()
  const navigation = useShellNavigation()
  const project = useProjectStore()
  const version = options.version
  const active = computed(() => navigation.page.value === 'collaboration')
  async function onAction(key: string): Promise<void> {
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
    navigation: { key: 'collaboration', icon: 'nav.collaboration', labelKey: 'app.shell.space.collaboration' },
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
