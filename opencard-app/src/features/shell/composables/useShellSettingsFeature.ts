import { ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { appLocaleOptions, reloadUserLocales } from '../../../i18n'
import { notifyError, notifySuccess, notifyWarning } from '../../notifications/titlebarNotices'
import { clearAppCache, EMPTY_APP_CACHE_USAGE, measureAppCacheDirectories, type AppCacheUsage } from '../../../shared/storage/appCache'
import { APP_LOCALE_DIRECTORY_NAME, resolveAppStoragePath } from '../../../shared/storage/appStoragePaths'
import { networkResourceCacheService } from '../../network-resources/services/networkResourceCacheService'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { describeError } from '../../../shared/model/error'
import { createPublisherKey, isSettingsCategoryKey, parseAppTheme, serializeAppTheme, type SettingsCategoryKey, type SettingsIntent } from '../../settings/model/appSettings'
import { createSettingsSection } from '../sections/settingsSection'
import { useSettingsWorkspace } from '../../settings/composables/useSettingsWorkspace'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'

export function useShellSettingsFeature(options: {
  settingsStore: ReturnType<typeof useAppSettingsStore>
  categoryKey: Readonly<Ref<SettingsCategoryKey>>
  projectOpen: Readonly<Ref<boolean>>
  isSettingsMode: Readonly<Ref<boolean>>
  resetWorkspace: () => Promise<void>
  selectCategory: (key: SettingsCategoryKey) => void
}) {
  const { t } = useI18n()
  const systemFontFamilies = ref<readonly string[]>([])
  const appCacheUsage = ref<AppCacheUsage>(EMPTY_APP_CACHE_USAGE)
  async function refreshAppCacheUsage(): Promise<void> {
    const [directories, network] = await Promise.all([measureAppCacheDirectories(), networkResourceCacheService.usage()])
    appCacheUsage.value = { ...directories, network }
  }
  watch(options.isSettingsMode, active => { if (active) void refreshAppCacheUsage() })
  const { categoryTreeData, activeCategory, settingsAnchorFor } = useSettingsWorkspace({
    settings: options.settingsStore.settings,
    categoryKey: options.categoryKey,
    projectOpen: options.projectOpen,
    systemFontFamilies,
    appLocales: appLocaleOptions,
    cacheUsage: appCacheUsage,
    translate: t,
  })
  async function copyTheme(themeId: 'dark' | 'light'): Promise<void> {
    const appearance = options.settingsStore.settings.value.appearance
    const text = serializeAppTheme(themeId, appearance.themeOverrides[themeId], appearance.accentNeighborAngles[themeId], appearance.fontFamilies[themeId])
    try { await navigator.clipboard.writeText(text); notifySuccess(t('settings.themeExchange.copied'), 'action.copy') }
    catch { notifyError(t('settings.themeExchange.copyFailed')) }
  }
  async function readTheme(themeId: 'dark' | 'light'): Promise<void> {
    const text = await navigator.clipboard.readText().catch(() => '')
    if (!text.trim()) { notifyError(t('settings.themeExchange.emptyClipboard')); return }
    const definition = parseAppTheme(text)
    if (!definition) { notifyError(t('settings.errors.invalidThemeJson')); return }
    const imported = options.settingsStore.importThemePreset(themeId, t('settings.values.importedTheme'), definition)
    if (imported) notifySuccess(t('settings.themeExchange.imported'), 'action.import')
    else notifyWarning(t('settings.themeExchange.duplicate'))
  }
  /** 重读语言目录并重新应用语言：新放进去的文件立刻能选，被删掉的那个立刻退回默认语言。 */
  async function reloadLocales(): Promise<void> {
    try {
      await reloadUserLocales(options.settingsStore.settings.value.appearance.locale)
    } catch (error) {
      notifyError(describeError(error))
    }
  }

  /**
   * 「打开语言文件夹」要进到这个文件夹里，所以走系统默认打开方式而不是 reveal ——
   * reveal 的语义是「在文件管理器中显示」，对目录就是在上级里选中它。
   */
  async function openLocaleFolder(): Promise<void> {
    try {
      await fileSystemService.openWithDefaultApp(await resolveAppStoragePath(APP_LOCALE_DIRECTORY_NAME))
    } catch (error) {
      notifyError(describeError(error))
    }
  }

  async function handleIntent(intent: SettingsIntent): Promise<void> {
    const store = options.settingsStore
    switch (intent.type) {
      case 'setting.preview': store.previewSetting(intent.key, intent.value); return
      case 'setting.change': store.updateSetting(intent.key, intent.value); return
      case 'theme-color.preview': case 'theme-color.cancel': store.previewThemeColor(intent.themeId, intent.token, intent.value); return
      case 'theme-color.change': store.updateThemeColor(intent.themeId, intent.token, intent.value); return
      case 'theme-angle.preview': store.previewThemeAngle(intent.themeId, intent.value); return
      case 'theme-angle.change': store.updateThemeAngle(intent.themeId, intent.value); return
      case 'theme-font.change': store.updateThemeFont(intent.themeId, intent.value); return
      case 'theme-preset.change': store.applyThemePreset(intent.themeId, intent.presetId); return
      case 'theme-preset.delete': store.deleteThemePreset(intent.themeId, intent.presetId); return
      case 'theme-name.change': store.saveThemePreset(intent.themeId, intent.name); return
      case 'theme.copy': return copyTheme(intent.themeId)
      case 'theme.read': return readTheme(intent.themeId)
      case 'identity.regenerate': return store.updateSetting('identity.publisherKey', createPublisherKey())
      case 'locale.refresh': return reloadLocales()
      case 'locale-folder.open': return openLocaleFolder()
      case 'cache.clear':
        try { await clearAppCache(fileSystemService); networkResourceCacheService.forget(); await refreshAppCacheUsage() }
        catch (error) { notifyError(describeError(error)) }
        return
      default: return options.resetWorkspace()
    }
  }
  const section = createSettingsSection({
    translate: t,
    categoryKey: options.categoryKey,
    categoryTreeData,
    onSelectionChange: event => {
      const key = event.selectedKeys[0]
      if (isSettingsCategoryKey(key)) options.selectCategory(key)
    },
  })
  return { section, activeCategory, settingsAnchorFor, systemFontFamilies, appCacheUsage, refreshAppCacheUsage, handleIntent }
}
