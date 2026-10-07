import { computed } from 'vue'
import { useProjectStore } from '../../workspace/store/projectStore'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import WelcomePageContent from '../components/WelcomePageContent.vue'
import type { SpacePage } from '../spacePage'
import { useAppProjectActions } from '../services/appProjectActions'
import { useShellNavigation } from './useShellNavigation'
import { useWelcomePageState } from './useWelcomePageState'

export function createWelcomePage(): SpacePage {
  const settings = useAppSettingsStore()
  const app = useAppProjectActions()
  const { projectPath } = useProjectStore()
  const { isWelcome } = useShellNavigation()
  const feature = useWelcomePageState({
    projectPath, isWelcomeMode: isWelcome,
    openRecentProject: app.openRecentProject, relocateRecentProject: app.relocateRecentProject,
  })
  return {
    key: 'welcome',
    navigation: { key: 'welcome', icon: 'nav.welcome', labelKey: 'app.shell.space.welcome' },
    content: WelcomePageContent,
    contentProps: computed(() => ({
      covers: feature.welcomeCoverWallCovers.value,
      highlightKeys: feature.selectedRecentProjectKeys.value,
      backgroundVisible: settings.settings.value.workspace.showWelcomeBackground,
      onNewProject: app.newProject, onOpenProject: app.openProject,
      'onUpdate:backgroundVisible': (value: boolean) => settings.updateSetting('workspace.showWelcomeBackground', value),
    })),
    sidebar: computed(() => feature.section.value.map(group => ({ ...group, onAction: async key => {
      if (key === 'new-project') await app.newProject()
      else if (key === 'open-project') await app.openProject()
    } }))),
    header: computed(() => null),
  }
}
