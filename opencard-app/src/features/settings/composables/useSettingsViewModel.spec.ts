import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AppLocaleOption } from '../../../i18n/appLocale'
import type {
  EditorItem,
  EditorItemEditorPart,
  EditorItemMeterPart,
} from '../../../shared/ui/property-editor/propertyEditor.types'
import { createDefaultAppSettings, type SettingsCategoryKey } from '../model/appSettings'
import { useSettingsViewModel, type SettingsCategoryViewModel } from './useSettingsViewModel'

const cacheUsage = ref({ snapshots: 1.5 * 1024 ** 3, network: 2048, staged: 0 })
const appLocales = ref<readonly AppLocaleOption[]>([
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en-US', label: 'English' },
])

function editor(item: EditorItem): EditorItemEditorPart {
  return item.content?.find((part): part is EditorItemEditorPart => (
    typeof part !== 'string' && part.type === 'editor' && part.key === 'value'
  ))!
}

function meter(item: EditorItem): EditorItemMeterPart {
  return item.content?.find((part): part is EditorItemMeterPart => (
    typeof part !== 'string' && part.type === 'meter'
  ))!
}

function rowOf(category: SettingsCategoryViewModel, key: string): EditorItem {
  return category.cards.flatMap(card => card.items).find(item => item.key === key)!
}

describe('useSettingsViewModel', () => {
  it('measures cache usage against the configured limit and leaves undo staging unbounded', () => {
    const settings = createDefaultAppSettings()
    settings.cache.packageLimitGb = 4
    const category = useSettingsViewModel({
      settings: ref(settings),
      categoryKey: ref('general'),
      projectOpen: ref(false),
      cacheUsage,
      appLocales,
      translate: (_key, fallback) => fallback,
    }).activeCategory.value

    expect(meter(rowOf(category, 'cache.snapshots'))).toMatchObject({
      value: 1.5 * 1024 ** 3,
      max: 4 * 1024 ** 3,
      text: '1.5GB / 4GB',
    })
    expect(meter(rowOf(category, 'cache.network'))).toMatchObject({ max: 1024 ** 3, text: '2KB / 1GB' })
    expect(meter(rowOf(category, 'cache.staged'))).toMatchObject({ max: null, text: '0B' })
  })

  it('keeps the selected language selectable after its file is gone', () => {
    const settings = createDefaultAppSettings()
    settings.appearance.locale = 'ja.json'
    const category = useSettingsViewModel({
      settings: ref(settings),
      categoryKey: ref('general'),
      projectOpen: ref(false),
      cacheUsage,
      appLocales,
      translate: (_key, fallback) => fallback,
    }).activeCategory.value

    const language = editor(rowOf(category, 'appearance.locale'))
    expect(language.value).toBe('ja.json')
    expect(language.definition).toMatchObject({ options: ['system', 'zh-CN', 'en-US', 'ja.json'] })
  })

  it('refuses cache clearing and the project reset while a project is open', () => {
    const projectOpen = ref(false)
    const actionOf = (categoryKey: SettingsCategoryKey, cardKey: string, actionKey: string) => {
      const category = useSettingsViewModel({
        settings: ref(createDefaultAppSettings()),
        categoryKey: ref(categoryKey),
        projectOpen,
        cacheUsage,
        appLocales,
        translate: (_key, fallback) => fallback,
      }).activeCategory.value
      return category.cards.find(card => card.key === cardKey)!
        .actions.find(action => action.key === actionKey)!
    }

    expect(actionOf('general', 'cache', 'cache.clear').disabled).toBe(false)
    expect(actionOf('workspace', 'file-tree', 'project-workspace.reset').disabled).toBe(true)

    projectOpen.value = true

    expect(actionOf('general', 'cache', 'cache.clear').disabled).toBe(true)
    expect(actionOf('workspace', 'file-tree', 'project-workspace.reset').disabled).toBe(false)
  })

  it('provides system font capabilities for appearance fontFamily editors', () => {
    const category = useSettingsViewModel({
      settings: ref(createDefaultAppSettings()),
      categoryKey: ref('appearance'),
      projectOpen: ref(false),
      systemFontFamilies: ref(['Inter', 'Noto Sans SC']),
      cacheUsage,
      appLocales,
      translate: (_key, fallback) => fallback,
    }).activeCategory.value

    const fontEditor = editor(rowOf(category, 'font'))
    expect(fontEditor.definition).toMatchObject({ fieldType: 'fontFamily' })
    expect(category.capabilities?.fonts).toEqual([{
      key: 'system',
      label: 'System',
      packageKey: null,
      entries: [
        { key: 'Inter', value: 'Inter', label: 'Inter', cssFamily: 'Inter' },
        { key: 'Noto Sans SC', value: 'Noto Sans SC', label: 'Noto Sans SC', cssFamily: 'Noto Sans SC' },
      ],
    }])
  })
})