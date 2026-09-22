import { describe, expect, it, vi } from 'vitest'
import { createDefaultAppSettings, getThemePreset } from '../model/appSettings'
import { MemorySettingsPersistence } from '../services/settingsPersistence'
import { createAppSettingsStore } from './appSettingsStore'

describe('appSettingsStore', () => {
  it('loads normalized settings and becomes ready', async () => {
    const persistence = new MemorySettingsPersistence({
      version: 1,
      appearance: { theme: 'light', locale: 'en-US' },
      shell: { sidebarWidth: 320, sidebarCollapsed: true },
    })
    const store = createAppSettingsStore(persistence)

    await store.initialize()

    expect(store.isReady.value).toBe(true)
    expect(store.settings.value.appearance.theme).toBe('light')
    expect(store.settings.value.shell.sidebarWidth).toBe(320)
  })

  it('validates semantic updates and persists the final document', async () => {
    const persistence = new MemorySettingsPersistence()
    const store = createAppSettingsStore(persistence)
    await store.initialize()

    store.updateSetting('appearance.theme', 'light')
    store.updateSetting('appearance.locale', 'zh-CN')
    store.updateSetting('appearance.glassIntensity', 75)
    store.updateSetting('appearance.baseFontSize', 14)
    store.updateSetting('appearance.phaseImageSpeed', 250)
    store.updateThemeAngle('light', -72)
    store.updateThemeFont('light', 'serif')
    store.updateSetting('updates.showReleaseNotesAfterUpdate', false)
    store.updateSetting('exporting.openCdeWorkbookAfterExport', false)
    store.updateShell({ sidebarWidth: 9999, sidebarCollapsed: true })
    store.updateSetting('workspace.structureTreeSelectionBehavior', 'expand')
    store.updateSetting('workspace.structureTreeScrollToSelection', false)
    store.updateSetting('workspace.hideDotFiles', false)
    store.updateSetting('workspace.showSelectionPositionOnMove', false)
    store.updateSetting('workspace.showSelectionSizeOnResize', false)
    store.updateSetting('workspace.alignmentSnappingEnabledByDefault', false)
    store.updateProjectCreation({ lastParentPath: 'D:\\Cards' })
    await store.flush()

    const saved = await persistence.load()
    expect(saved).toMatchObject({
      appearance: {
        theme: 'light',
        locale: 'zh-CN',
        glassIntensity: 75,
        baseFontSize: 14,
        phaseImageSpeed: 250,
        accentNeighborAngles: { dark: -50, light: -72 },
        fontFamilies: { dark: 'system', light: 'serif' },
      },
      shell: { sidebarWidth: 420, sidebarCollapsed: true },
      updates: { showReleaseNotesAfterUpdate: false },
      exporting: { openCdeWorkbookAfterExport: false },
      workspace: {
        structureTreeSelectionBehavior: 'expand',
        structureTreeScrollToSelection: false,
        hideDotFiles: false,
        showSelectionPositionOnMove: false,
        showSelectionSizeOnResize: false,
        alignmentSnappingEnabledByDefault: false,
      },
      projectCreation: { lastParentPath: 'D:\\Cards' },
    })
  })

  it('persists the committer identity and the initial-commit option', async () => {
    const persistence = new MemorySettingsPersistence()
    const store = createAppSettingsStore(persistence)
    await store.initialize()

    store.updateSetting('versionControl.committerName', '  张三  ')
    store.updateSetting('versionControl.committerEmail', '')
    store.updateSetting('versionControl.createInitialCommit', false)
    await store.flush()

    // 写入即归一化：前后空白不进存储。
    expect(store.settings.value.versionControl).toEqual({
      committerName: '张三',
      committerEmail: '',
      createInitialCommit: false,
    })
    const persisted = await persistence.load() as { versionControl?: unknown } | null
    expect(persisted?.versionControl).toMatchObject({
      committerName: '张三',
      createInitialCommit: false,
    })
  })

  it('persists the title bar notice history limit', async () => {
    const persistence = new MemorySettingsPersistence()
    const store = createAppSettingsStore(persistence)
    await store.initialize()

    store.updateSetting('shell.titleBarNoticeHistoryLimit', 64)
    await store.flush()

    expect(store.settings.value.shell.titleBarNoticeHistoryLimit).toBe(64)
    expect(await persistence.load()).toMatchObject({ shell: { titleBarNoticeHistoryLimit: 64 } })
  })

  it('applies continuous previews without persisting until commit', async () => {
    const persistence = new MemorySettingsPersistence()
    const save = vi.spyOn(persistence, 'save')
    const store = createAppSettingsStore(persistence)
    await store.initialize()
    save.mockClear()

    for (let value = 61; value <= 80; value += 1) {
      store.previewSetting('appearance.glassIntensity', value)
    }

    expect(store.settings.value.appearance.glassIntensity).toBe(80)
    expect(save).not.toHaveBeenCalled()

    store.updateSetting('appearance.glassIntensity', 80)
    await store.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(await persistence.load()).toMatchObject({ appearance: { glassIntensity: 80 } })
  })

  it('previews, persists, applies presets, and resets per-theme appearance', async () => {
    const persistence = new MemorySettingsPersistence()
    const save = vi.spyOn(persistence, 'save')
    const store = createAppSettingsStore(persistence)
    await store.initialize()
    save.mockClear()

    store.previewThemeColor('dark', '--oc-accent', '#112233')
    expect(store.settings.value.appearance.themeOverrides.dark['--oc-accent']).toBe('#112233')
    expect(save).not.toHaveBeenCalled()

    store.updateThemeColor('dark', '--oc-accent', '#112233')
    store.updateThemeAngle('dark', -72)
    await store.flush()
    expect(store.settings.value.appearance.accentNeighborAngles.dark).toBe(-72)

    store.applyThemePreset('dark', 'grass-block')
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('grass-block')
    expect(store.settings.value.appearance.themeOverrides.dark).toEqual({
      '--oc-accent': '#75FF53',
      '--oc-bg-base': '#34251A',
      '--oc-fg-default': '#CCCCCC',
    })

    store.applyThemePreset('dark', 'default')
    await store.flush()
    expect(store.settings.value.appearance.themeOverrides.dark).toEqual({})
    expect(store.settings.value.appearance.accentNeighborAngles.dark).toBe(-50)
    expect(store.settings.value.appearance.fontFamilies.dark).toBe('system')

    store.importThemePreset('dark', 'Forest', {
      colors: {
        '--oc-accent': '#228833',
        '--oc-bg-base': '#102010',
        '--oc-fg-default': '#DDEEDD',
      },
      accentNeighborAngle: -25,
      fontFamily: 'Inter; SimSun',
    })
    expect(store.settings.value.appearance.userThemePresets.dark).toHaveLength(1)
    expect(store.settings.value.appearance.themeOverrides.dark['--oc-accent']).toBe('#228833')

    store.updateThemeColor('dark', '--oc-accent', '#FFFFFF')
    // 手改颜色之后不再等于任何预设，选中项回落到"自定义"。
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('')
    store.applyThemePreset('dark', 'user:Forest')
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('user:Forest')
    expect(store.settings.value.appearance.themeOverrides.dark['--oc-accent']).toBe('#228833')
    expect(store.settings.value.appearance.fontFamilies.dark).toBe('Inter; SimSun')

    store.deleteThemePreset('dark', 'user:Forest')
    expect(store.settings.value.appearance.userThemePresets.dark).toEqual([])
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('')
    expect(store.settings.value.appearance.themeOverrides.dark['--oc-accent']).toBe('#228833')
  })

  it('names the current theme as a custom preset and renames it afterwards', async () => {
    const persistence = new MemorySettingsPersistence()
    const store = createAppSettingsStore(persistence)
    await store.initialize()

    store.updateThemeColor('dark', '--oc-accent', '#123456')
    store.saveThemePreset('dark', '  我的深色  ')
    const presets = store.settings.value.appearance.userThemePresets.dark
    expect(presets.map(preset => preset.name)).toEqual(['我的深色'])
    expect(presets[0]!.definition.colors).toEqual({
      '--oc-accent': '#123456',
      // 没被覆盖的颜色取主题注册表里的值，而不是留在预设里当空值。
      '--oc-bg-base': '#1E1E1E',
      '--oc-fg-default': '#CCCCCC',
    })
    expect(presets[0]!.definition.accentNeighborAngle).toBe(-50)
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('user:我的深色')

    store.saveThemePreset('dark', '我的深色 2')
    expect(store.settings.value.appearance.userThemePresets.dark.map(preset => preset.name))
      .toEqual(['我的深色 2'])
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('user:我的深色 2')

    // 空名字与同名提交都不写盘。
    store.saveThemePreset('dark', '   ')
    store.saveThemePreset('dark', '我的深色 2')
    await store.flush()
    expect(store.settings.value.appearance.userThemePresets.dark.map(preset => preset.name))
      .toEqual(['我的深色 2'])
  })

  it('skips importing a theme that already exists and numbers the repeated base name', async () => {
    const persistence = new MemorySettingsPersistence()
    const store = createAppSettingsStore(persistence)
    await store.initialize()

    const forest = {
      colors: { '--oc-accent': '#228833', '--oc-bg-base': '#102010', '--oc-fg-default': '#DDEEDD' },
      accentNeighborAngle: -25,
      fontFamily: 'Inter; SimSun',
    }
    expect(store.importThemePreset('dark', '已导入', forest)).toBe(true)
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('user:已导入')

    // 完全相同：不新增，只把已有那条选上。
    expect(store.importThemePreset('dark', '已导入', forest)).toBe(false)
    expect(store.settings.value.appearance.userThemePresets.dark.map(preset => preset.name))
      .toEqual(['已导入'])

    // 内置预设也一样认：导入一份和石墨完全相同的配色不会多出一条。
    const graphite = getThemePreset('dark', 'graphite')!
    expect(store.importThemePreset('dark', '已导入', graphite)).toBe(false)
    expect(store.settings.value.appearance.userThemePresets.dark.map(preset => preset.name))
      .toEqual(['已导入'])
    expect(store.settings.value.appearance.themePresetIds.dark).toBe('graphite')

    // 名字撞车但配色不同：加序号，不顶掉前一条。
    expect(store.importThemePreset('dark', '已导入', {
      ...forest,
      colors: { ...forest.colors, '--oc-accent': '#445566' },
    })).toBe(true)
    expect(store.settings.value.appearance.userThemePresets.dark.map(preset => preset.name))
      .toEqual(['已导入', '已导入 2'])
  })

  it('keeps recently opened projects in most-recent-first order', async () => {
    const persistence = new MemorySettingsPersistence()
    const store = createAppSettingsStore(persistence)
    await store.initialize()

    store.rememberRecentProject('D:\\Projects\\One\\')
    store.rememberRecentProject('D:/Projects/Two')
    store.rememberRecentProject('d:/projects/one')
    await store.flush()

    expect(store.settings.value.projectCreation.recentProjects).toEqual([
      'd:/projects/one',
      'D:/Projects/Two',
    ])
    expect(await persistence.load()).toMatchObject({
      projectCreation: {
        recentProjects: ['d:/projects/one', 'D:/Projects/Two'],
      },
    })
  })

  it('forgets a recent project without touching its files', async () => {
    const persistence = new MemorySettingsPersistence()
    const store = createAppSettingsStore(persistence)
    await store.initialize()
    store.rememberRecentProject('D:/Projects/One')
    store.rememberRecentProject('D:/Projects/Two')
    store.updateProjectCreation({ workspaceStates: { 'D:/Projects/One': { expandedDirectories: ['assets'] } } })

    store.forgetRecentProject('d:\\projects\\one\\')
    await store.flush()

    expect(store.settings.value.projectCreation.recentProjects).toEqual(['D:/Projects/Two'])
    expect(store.settings.value.projectCreation.workspaceStates).not.toHaveProperty('D:/Projects/One')
  })

  it('resets individual sections without replacing other settings', async () => {
    const store = createAppSettingsStore(new MemorySettingsPersistence())
    await store.initialize()
    store.updateSetting('appearance.theme', 'light')
    store.updateShell({ sidebarWidth: 320 })

    store.resetSection('appearance')

    expect(store.settings.value.appearance).toEqual(createDefaultAppSettings().appearance)
    expect(store.settings.value.shell.sidebarWidth).toBe(320)
  })
})
