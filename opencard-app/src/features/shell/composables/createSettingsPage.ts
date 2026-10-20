import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useProjectStore } from '../../workspace/store/projectStore'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { APP_SETTINGS_FILE_NAME, resolveAppStoragePath } from '../../../shared/storage/appStoragePaths'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import type { AppSettingKey, SettingsCategoryKey } from '../../settings/model/appSettings'
import SettingsPageContent from '../../settings/components/SettingsPageContent.vue'
import type { PageHeaderAction } from '../shell.types'
import type { SpacePage } from '../spacePage'
import { useShellNavigation } from './useShellNavigation'
import { useSettingsPageState } from './useSettingsPageState'

export function createSettingsPage(cancelExportsAndWait: () => Promise<void>) {
  const { t } = useI18n()
  const navigation = useShellNavigation()
  const project = useProjectStore()
  const settingsStore = useAppSettingsStore()
  const category = computed<SettingsCategoryKey>(() => navigation.location.value.base.space === 'settings'
    ? navigation.location.value.base.categoryKey : 'general')
  const feature = useSettingsPageState({
    settingsStore, categoryKey: category,
    projectOpen: computed(() => Boolean(project.projectPath.value)), isSettingsMode: navigation.isSettings,
    resetWorkspace: project.resetProjectWorkspaceState, selectCategory: navigation.showSettings, cancelExportsAndWait,
  })
  onMounted(async () => {
    if (!isTauri()) return
    try { feature.systemFontFamilies.value = await invoke<string[]>('list_system_font_families') }
    catch (error) { console.warn('[OpenCard/Settings] Unable to enumerate system fonts.', error) }
  })

  /** 用系统默认程序打开设置文件本身；浏览器构建没有这个能力。 */
  async function openSettingsFile(): Promise<void> {
    if (!isTauri()) return
    await fileSystemService.openWithDefaultApp(await resolveAppStoragePath(APP_SETTINGS_FILE_NAME))
  }

  async function runHeaderAction(key: string): Promise<void> {
    if (key === 'settings.save') {
      await settingsStore.save()
      return
    }
    if (key === 'settings.open-file') await openSettingsFile()
  }

  const headerActions = computed<readonly PageHeaderAction[]>(() => [
    {
      key: 'settings.save',
      icon: 'action.save',
      title: t('settings.actions.save', 'Save'),
      disabled: !settingsStore.dirty.value,
    },
    ...(isTauri()
      ? [{ key: 'settings.open-file', icon: 'format.code-braces', title: t('settings.actions.openFile', 'Open settings file') } satisfies PageHeaderAction]
      : []),
  ])

  const page: SpacePage = {
    key: 'settings',
    navigation: { key: 'settings', labelKey: 'app.shell.space.settings', icon: 'nav.settings', railGroup: 'secondary' },
    content: SettingsPageContent,
    contentProps: computed(() => ({
      viewModel: feature.activeCategory.value,
      focusKey: navigation.location.value.base.space === 'settings' ? navigation.location.value.base.focusKey : undefined,
      onIntent: feature.handleIntent,
    })),
    sidebar: feature.section,
    header: computed(() => ({
      title: feature.activeCategory.value.title,
      titleLoading: false,
      actions: headerActions.value,
      onAction: runHeaderAction,
    })),
  }
  function openSetting(key: AppSettingKey): void {
    navigation.showSettings(feature.settingsAnchorFor(key)?.category ?? category.value, key)
  }
  return { page, openSetting }
}
