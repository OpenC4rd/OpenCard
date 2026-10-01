import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifyAppError } from '../../notifications/titlebarNotices'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import type { OcNodeActionEvent, OcNodeActivateEvent, OcNodeCollection, OcNodeSelectionEvent } from '../../../shared/ui/node/node.types'
import type { WelcomeCoverWallCover } from '../components/WelcomeCoverWall.vue'
import { createRecentProjectTreeData } from '../shellCatalogProjections'
import {
  RECENT_PROJECT_OPEN_ACTION_KEY,
  RECENT_PROJECT_RELOCATE_ACTION_KEY,
  RECENT_PROJECT_REMOVE_ACTION_KEY,
  RECENT_PROJECT_REVEAL_ACTION_KEY,
} from '../shellCatalogProjections'
import { recentProjectKey, useRecentProjectSnapshots } from './useRecentProjectSnapshots'
import { createWelcomeSection } from '../sections/welcomeSection'

export function useShellWelcomeFeature(options: {
  projectPath: Readonly<Ref<string>>
  isWelcomeMode: Readonly<Ref<boolean>>
  openRecentProject: (path: string) => Promise<unknown>
  relocateRecentProject: (path: string) => Promise<unknown>
}) {
  const { t, locale } = useI18n()
  const settingsStore = useAppSettingsStore()
  const recentProjectSnapshots = useRecentProjectSnapshots({
    recentProjects: computed(() => settingsStore.settings.value.projectCreation.recentProjects),
  })
  const recentProjectAvailability = computed<ReadonlyMap<string, boolean>>(() => new Map(
    [...recentProjectSnapshots.snapshots.value].map(([key, snapshot]) => [key, snapshot.available]),
  ))
  const welcomeCoverWallCovers = computed<readonly WelcomeCoverWallCover[]>(() => (
    settingsStore.settings.value.projectCreation.recentProjects.flatMap(path => {
      const snapshot = recentProjectSnapshots.snapshots.value.get(recentProjectKey(path))
      if (!snapshot?.available || !snapshot.cover) return []
      return [{ projectKey: recentProjectKey(path), src: snapshot.cover.src }]
    })
  ))
  const recentProjectTreeData = computed<OcNodeCollection>(() => createRecentProjectTreeData(
    settingsStore.settings.value.projectCreation.recentProjects,
    recentProjectAvailability.value,
    recentProjectKey,
    t,
  ))
  const selectedRecentProjectKeys = ref<string[]>([])
  function pathByNodeKey(key: string): string | undefined {
    return settingsStore.settings.value.projectCreation.recentProjects.find(item => recentProjectKey(item) === key)
  }
  function handleSelectionChange(event: OcNodeSelectionEvent): void {
    selectedRecentProjectKeys.value = event.selectedKeys
  }
  function handleNodeActivate(event: OcNodeActivateEvent): void {
    const path = pathByNodeKey(event.key)
    if (path && recentProjectAvailability.value.get(event.key) !== false) void options.openRecentProject(path)
  }
  function handleAction(event: OcNodeActionEvent): void {
    const path = pathByNodeKey(event.key)
    if (!path) return
    if (event.actionKey === RECENT_PROJECT_REMOVE_ACTION_KEY) {
      settingsStore.forgetRecentProject(path)
      selectedRecentProjectKeys.value = selectedRecentProjectKeys.value.filter(key => key !== event.key)
    } else if (event.actionKey === RECENT_PROJECT_RELOCATE_ACTION_KEY) {
      void options.relocateRecentProject(path)
    } else if (event.actionKey === RECENT_PROJECT_REVEAL_ACTION_KEY) {
      void fileSystemService.revealInFileManager(path).catch(error => notifyAppError(
        'OC-E2004', { actionKey: RECENT_PROJECT_REVEAL_ACTION_KEY, path, error }, locale.value,
      ))
    } else if (event.actionKey === RECENT_PROJECT_OPEN_ACTION_KEY && recentProjectAvailability.value.get(event.key) !== false) {
      void options.openRecentProject(path)
    }
  }
  watch(options.projectPath, () => { selectedRecentProjectKeys.value = [] }, { flush: 'sync' })
  watch(options.isWelcomeMode, welcome => { if (welcome) void recentProjectSnapshots.refresh() })
  return {
    section: createWelcomeSection({
      translate: t,
      recentProjectTreeData,
      selectedRecentProjectKeys,
      onSelectionChange: handleSelectionChange,
      onNodeActivate: handleNodeActivate,
      onAction: handleAction,
    }),
    recentProjectTreeData,
    recentProjectAvailability,
    welcomeCoverWallCovers,
    selectedRecentProjectKeys,
    handleSelectionChange,
    handleNodeActivate,
    handleAction,
  }
}
