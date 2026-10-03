import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AppLocaleOption } from '../../../i18n/appLocale'
import type { EditorItem, EditorItemEditorPart } from '../../../shared/ui/property-editor/propertyEditor.types'
import { createDefaultAppSettings, type SettingsCategoryKey } from '../model/appSettings'
import { useSettingsWorkspace, type SettingsCategoryViewModel } from './useSettingsWorkspace'

function editor(item: EditorItem, key = 'value'): EditorItemEditorPart {
  return item.content?.find((part): part is EditorItemEditorPart => (
    typeof part !== 'string' && part.type === 'editor' && part.key === key
  ))!
}

function cardOf(category: SettingsCategoryViewModel, key: string) {
  return category.cards.find(card => card.key === key)!
}

function rowOf(category: SettingsCategoryViewModel, key: string): EditorItem {
  return category.cards.flatMap(card => card.items).find(item => item.key === key)!
}

/** 缓存面板读的现量占用；这些用例只关心它怎么投影成行。 */
const cacheUsage = ref({ snapshots: 1.5 * 1024 ** 3, network: 2048, staged: 0 })

/** 语言行读的可选语言：内置两种，外加一份用户语言文件（id 就是文件名）。 */
const availableLocales = ref<readonly AppLocaleOption[]>([
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en-US', label: 'English' },
  { id: 'ja.json', label: 'ja' },
])

describe('useSettingsWorkspace', () => {
  it('projects general settings as cards of single-value rows', () => {
    const categoryKey = ref<SettingsCategoryKey>('general')
    const projectOpen = ref(false)
    const { categoryTreeData, activeCategory } = useSettingsWorkspace({
      settings: ref(createDefaultAppSettings()), categoryKey, projectOpen,
      cacheUsage,
      appLocales: availableLocales,
      translate: (_key, fallback) => fallback,
    })

    expect(categoryTreeData.value.rootKeys).toEqual(['general', 'appearance', 'workspace', 'versionControl'])
    // Every category row shows its own icon: the tree paints a row's leading visual from `visual`,
    // and a node that carries none falls back to the expand chevron.
    expect(categoryTreeData.value.rootKeys.map(key => categoryTreeData.value.items.get(key)?.visual)).toEqual([
      { type: 'icon', icon: 'tool.settings' },
      { type: 'icon', icon: 'data.symbol-color' },
      { type: 'icon', icon: 'tool.workspace' },
      { type: 'icon', icon: 'nav.collaboration' },
    ])
    expect(activeCategory.value.cards.map(card => card.key)).toEqual(['interface', 'updates', 'exporting', 'rendering', 'cache'])
    expect(cardOf(activeCategory.value, 'interface').items.map(item => item.key)).toEqual([
      'appearance.locale',
      'shell.titleBarNoticeHistoryLimit',
    ])
    expect(cardOf(activeCategory.value, 'updates').items.map(item => item.key)).toEqual([
      'updates.showReleaseNotesAfterUpdate',
    ])
    expect(cardOf(activeCategory.value, 'exporting').items.map(item => item.key)).toEqual([
      'exporting.openCdeWorkbookAfterExport',
    ])
    expect(cardOf(activeCategory.value, 'rendering').items.map(item => item.key)).toEqual([
      'rendering.customBlockMaxDepth', 'rendering.customBlockMaxNodes',
    ])
    const cache = cardOf(activeCategory.value, 'cache')
    expect(cache.items.map(item => item.key)).toEqual([
      'cache.snapshots', 'cache.network', 'cache.staged', 'cache.packageLimitGb', 'cache.networkLimitGb',
    ])
    // 三行占用是只读展示，体积写成「已用 / 上限」；后面两个上限是可调的滑块。
    const usageRows = cache.items.slice(0, 3)
    expect(usageRows.map(item => editor(item).value)).toEqual(['1.5GB / 2GB', '2KB / 1GB', '0B'])
    expect(usageRows.every(item => editor(item).definition.isReadonly)).toBe(true)
    expect(editor(cache.items[3]!)).toMatchObject({
      value: 2,
      definition: { presentation: 'slider', min: 1, max: 32, step: 1, suffix: 'GB' },
    })
    expect(editor(cache.items[4]!)).toMatchObject({ value: 1 })
    expect(cache.actions).toMatchObject([{ key: 'cache.clear', disabled: false }])
    projectOpen.value = true
    expect(cardOf(activeCategory.value, 'cache').actions).toMatchObject([{ key: 'cache.clear', disabled: true }])
    const language = editor(rowOf(activeCategory.value, 'appearance.locale'))
    expect(language).toMatchObject({
      value: 'system',
      definition: { fieldType: 'string', presentation: 'select' },
    })
    // 用户语言文件按文件名进候选；内置语言的标签是语言自称，不是翻译。
    expect(language.definition).toMatchObject({
      options: ['system', 'zh-CN', 'en-US', 'ja.json'],
      optionLabels: { system: 'System', 'zh-CN': '简体中文', 'en-US': 'English', 'ja.json': 'ja' },
    })
    expect(editor(rowOf(activeCategory.value, 'shell.titleBarNoticeHistoryLimit'))).toMatchObject({
      value: 128,
      definition: {
        fieldType: 'number', presentation: 'slider', min: 1, max: 512,
        ticks: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
      },
    })
  })

  it('keeps the selected language visible after its file is gone', () => {
    const settings = createDefaultAppSettings()
    settings.appearance.locale = 'ja.json'
    const categoryKey = ref<SettingsCategoryKey>('general')
    const { activeCategory } = useSettingsWorkspace({
      settings: ref(settings), categoryKey, projectOpen: ref(false),
      appLocales: ref<readonly AppLocaleOption[]>([
        { id: 'zh-CN', label: '简体中文' },
        { id: 'en-US', label: 'English' },
      ]),
      cacheUsage,
      translate: (_key, fallback) => fallback,
    })

    // 设置里的值不改写，行里也仍然看得见它，只是标出文件已经不在。
    const language = editor(rowOf(activeCategory.value, 'appearance.locale'))
    expect(language.value).toBe('ja.json')
    expect(language.definition).toMatchObject({
      options: ['system', 'zh-CN', 'en-US', 'ja.json'],
      optionLabels: { 'ja.json': 'ja.json (file missing)' },
    })
  })

  it('projects appearance preview, sliders, and one card per theme', async () => {
    const settings = createDefaultAppSettings()
    settings.appearance.userThemePresets.dark = [{
      name: 'Forest',
      definition: {
        colors: { '--oc-accent': '#112233', '--oc-bg-base': '#223344', '--oc-fg-default': '#DDEEFF' },
        accentNeighborAngle: -70,
        fontFamily: 'Inter',
      },
    }]
    settings.appearance.themeOverrides.dark = { ...settings.appearance.userThemePresets.dark[0]!.definition.colors }
    settings.appearance.accentNeighborAngles.dark = -70
    settings.appearance.fontFamilies.dark = 'Inter'
    settings.appearance.themePresetIds.dark = 'user:Forest'
    const categoryKey = ref<SettingsCategoryKey>('appearance')
    const { activeCategory } = useSettingsWorkspace({
      settings: ref(settings), categoryKey, projectOpen: ref(false),
      systemFontFamilies: ref(['Inter', 'Microsoft YaHei UI']),
      cacheUsage,
      appLocales: availableLocales,
      translate: (_key, fallback) => fallback,
    })

    expect(activeCategory.value.preview).toEqual({ glassIntensity: 60 })
    expect(activeCategory.value.cards.map(card => card.key)).toEqual(['theme:dark', 'theme:light', 'interface'])
    expect(editor(rowOf(activeCategory.value, 'appearance.baseFontSize')))
      .toMatchObject({
        definition: {
          presentation: 'slider',
          min: 13,
          max: 19,
          ticks: [13, 14, 15, 16, 17, 18, 19],
        },
      })

    const darkTheme = cardOf(activeCategory.value, 'theme:dark')
    const lightTheme = cardOf(activeCategory.value, 'theme:light')
    expect(darkTheme.items.map(item => item.key)).toEqual([
      'preset', 'name', 'color:--oc-accent', 'color:--oc-bg-base', 'color:--oc-fg-default', 'font', 'angle',
    ])
    expect(lightTheme.items).toHaveLength(7)
    // 主题不再有嵌套分组：card 自己就是那层分组。
    expect(darkTheme.items.every(item => !item.children)).toBe(true)
    expect(darkTheme.actions.map(action => action.key)).toEqual([
      'theme.copy', 'theme.read', 'theme-preset.delete',
    ])
    expect(darkTheme.actions.find(action => action.key === 'theme-preset.delete'))
      .toMatchObject({ disabled: false })

    const preset = darkTheme.items[0]!
    expect(editor(preset).value).toBe('user:Forest')
    // 预设行只剩选择器本身：删除、复制、读取都是 card 级操作。
    expect(preset.content).toHaveLength(1)
    const name = darkTheme.items.find(item => item.key === 'name')!
    expect(editor(name).value).toBe('Forest')
    const font = darkTheme.items.find(item => item.key === 'font')!
    expect((await editor(font).definition.completion?.provider?.({ value: 'Mic', cursor: 3 }))?.items[0]?.label)
      .toBe('Microsoft YaHei UI')
  })

  it('projects workspace cards and updates reset availability reactively', () => {
    const categoryKey = ref<SettingsCategoryKey>('workspace')
    const projectOpen = ref(false)
    const { activeCategory } = useSettingsWorkspace({
      settings: ref(createDefaultAppSettings()), categoryKey, projectOpen,
      cacheUsage,
      appLocales: availableLocales,
      translate: (_key, fallback) => fallback,
    })

    expect(activeCategory.value.cards.map(card => card.key)).toEqual(['save-and-history', 'file-tree', 'canvas-assist'])
    expect(cardOf(activeCategory.value, 'save-and-history').items.map(item => item.key)).toContain('workspace.autoSave')
    expect(cardOf(activeCategory.value, 'file-tree').actions).toMatchObject([
      { key: 'project-workspace.reset', disabled: true },
    ])
    projectOpen.value = true
    expect(cardOf(activeCategory.value, 'file-tree').actions).toMatchObject([
      { key: 'project-workspace.reset', disabled: false },
    ])
  })

  it('projects useful ticks for workspace numeric settings', () => {
    const categoryKey = ref<SettingsCategoryKey>('workspace')
    const { activeCategory } = useSettingsWorkspace({
      settings: ref(createDefaultAppSettings()), categoryKey, projectOpen: ref(false),
      cacheUsage,
      appLocales: availableLocales,
      translate: (_key, fallback) => fallback,
    })

    const definitionFor = (key: string) => editor(rowOf(activeCategory.value, key)).definition
    expect(definitionFor('workspace.autoSaveIntervalSeconds')).toMatchObject({
      ticks: [5, 15, 30, 60, 120, 300],
    })
    expect(definitionFor('workspace.historyEntryLimit')).toMatchObject({
      ticks: [10, 50, 100, 250, 500, 1000],
    })
    // 结构树选中行为用下拉枚举编辑器，而不是滑动选项组。
    expect(definitionFor('workspace.structureTreeSelectionBehavior')).toMatchObject({
      presentation: 'select',
      options: ['expand-exclusive', 'expand', 'none'],
    })
  })

  it('projects the commit identity category with the author identity alongside it', () => {
    const settings = createDefaultAppSettings()
    settings.identity.publisherKey = 'publisher-a1b2c3'
    const settingsRef = ref(settings)
    const categoryKey = ref<SettingsCategoryKey>('versionControl')
    const { activeCategory } = useSettingsWorkspace({
      settings: settingsRef, categoryKey, projectOpen: ref(false),
      cacheUsage,
      appLocales: availableLocales,
      translate: (_key, fallback) => fallback,
    })

    expect(activeCategory.value.cards.map(card => card.key)).toEqual(['identity', 'committer'])
    // 作者身份搬到了这里：一行一个值，重新生成是这张 card 的操作。
    const publisherKey = rowOf(activeCategory.value, 'identity.publisherKey')
    expect(editor(publisherKey)).toMatchObject({
      value: 'publisher-a1b2c3',
      definition: { fieldType: 'string', commitMode: 'blur' },
    })
    expect(publisherKey.content).toHaveLength(1)
    expect(cardOf(activeCategory.value, 'identity').actions).toMatchObject([
      { key: 'identity.regenerate', icon: 'action.refresh', disabled: false },
    ])

    expect(cardOf(activeCategory.value, 'committer').items.map(item => item.key)).toEqual([
      'versionControl.committerName',
      'versionControl.committerEmail',
      'versionControl.createInitialCommit',
    ])
    // 名称为空就是这位作者 ID，邮箱再按名称归一化推导。
    expect(editor(rowOf(activeCategory.value, 'versionControl.committerName')).definition)
      .toMatchObject({ placeholder: 'publisher-a1b2c3' })
    expect(editor(rowOf(activeCategory.value, 'versionControl.committerEmail')).definition)
      .toMatchObject({ placeholder: 'publisher-a1b2c3@noreply.example' })
    expect(editor(rowOf(activeCategory.value, 'versionControl.createInitialCommit')).value).toBe(true)

    settingsRef.value.versionControl.committerName = '张三'
    expect(editor(rowOf(activeCategory.value, 'versionControl.committerEmail')).definition)
      .toMatchObject({ placeholder: 'zhang-san@noreply.example' })
  })

  it('resolves the anchor of any setting key without switching to its category first', () => {
    const categoryKey = ref<SettingsCategoryKey>('general')
    const { settingsAnchorFor } = useSettingsWorkspace({
      settings: ref(createDefaultAppSettings()), categoryKey, projectOpen: ref(false),
      cacheUsage,
      appLocales: availableLocales,
      translate: (_key, fallback) => fallback,
    })

    expect(settingsAnchorFor('versionControl.committerName')).toEqual({
      category: 'versionControl',
      cardKey: 'committer',
      itemKey: 'versionControl.committerName',
    })
    expect(settingsAnchorFor('workspace.autoSave')).toEqual({
      category: 'workspace',
      cardKey: 'save-and-history',
      itemKey: 'workspace.autoSave',
    })
    expect(settingsAnchorFor('identity.publisherKey')).toEqual({
      category: 'versionControl',
      cardKey: 'identity',
      itemKey: 'identity.publisherKey',
    })
  })
})
