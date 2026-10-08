import { computed, onMounted } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useProjectStore } from '../../workspace/store/projectStore'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import type { AppSettingKey, SettingsCategoryKey } from '../../settings/model/appSettings'
import SettingsPageContent from '../../settings/components/SettingsPageContent.vue'
import type { SpacePage } from '../spacePage'
import { useShellNavigation } from './useShellNavigation'
import { useSettingsPageState } from './useSettingsPageState'

export function createSettingsPage(cancelExportsAndWait: () => Promise<void>) {
  const navigation = useShellNavigation()
  const project = useProjectStore()
  const category = computed<SettingsCategoryKey>(() => navigation.location.value.base.space === 'settings'
    ? navigation.location.value.base.categoryKey : 'general')
  const feature = useSettingsPageState({
    settingsStore: useAppSettingsStore(), categoryKey: category,
    projectOpen: computed(() => Boolean(project.projectPath.value)), isSettingsMode: navigation.isSettings,
    resetWorkspace: project.resetProjectWorkspaceState, selectCategory: navigation.showSettings, cancelExportsAndWait,
  })
  onMounted(async () => {
    if (!isTauri()) return
    try { feature.systemFontFamilies.value = await invoke<string[]>('list_system_font_families') }
    catch (error) { console.warn('[OpenCard/Settings] Unable to enumerate system fonts.', error) }
  })
  const page: SpacePage = {
    key: 'settings',
    navigation: { key: 'settings', labelKey: 'app.shell.space.settings', icon: 'tool.settings', railGroup: 'secondary' },
    content: SettingsPageContent,
    contentProps: computed(() => ({
      viewModel: feature.activeCategory.value,
      focusKey: navigation.location.value.base.space === 'settings' ? navigation.location.value.base.focusKey : undefined,
      onIntent: feature.handleIntent,
    })),
    sidebar: feature.section,
    header: computed(() => ({ title: feature.activeCategory.value.title, titleLoading: false, actions: [] })),
  }
  function openSetting(key: AppSettingKey): void {
    navigation.showSettings(feature.settingsAnchorFor(key)?.category ?? category.value, key)
  }
  return { page, openSetting }
}
