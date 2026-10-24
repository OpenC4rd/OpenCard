// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createDefaultAppSettings, getThemePreset } from '../model/appSettings'
import { MemoryJsonPersistence } from '../../../shared/storage/jsonPersistence'
import { createAppSettingsStore } from './appSettingsStore'

async function createStore(document?: unknown) {
  const persistence = new MemoryJsonPersistence(document)
  const store = createAppSettingsStore(persistence)
  await store.initialize()
  return { persistence, store }
}

const forestDefinition = {
  colors: { '--oc-accent': '#228833', '--oc-bg-base': '#102010', '--oc-fg-default': '#DDEEDD' },
  accentNeighborAngle: -25,
  fontFamily: 'Inter; SimSun',
}

describe('appSettingsStore', () => {
  it('persists viewed guides and saves tag removal only on explicit save', async () => {
    const { persistence, store } = await createStore({
      tutorials: { seen: [' overview ', 'overview', 3, '', 'welcome'], extra: true },
    })
    expect(store.settings.value.tutorials.seen).toEqual(['overview', 'welcome'])

    store.previewSetting('tutorials.seen', ['overview'])
    await store.flush()
    expect(await persistence.load()).toMatchObject({ tutorials: { seen: ['overview', 'welcome'] } })

    await store.save()
    const reloaded = createAppSettingsStore(persistence)
    await reloaded.initialize()
    expect(reloaded.settings.value.tutorials.seen).toEqual(['overview'])

    reloaded.resetAll()
    await reloaded.flush()
    expect(await persistence.load()).toMatchObject({ tutorials: { seen: [] } })
  })

  it('applies continuous previews without persisting until commit', async () => {
    const { persistence, store } = await createStore()
    const save = vi.spyOn(persistence, 'save')
    save.mockClear()

    store.previewSetting('appearance.glassIntensity', 61)
    store.previewSetting('appearance.glassIntensity', 80)
    expect(store.settings.value.appearance.glassIntensity).toBe(80)
    expect(save).not.toHaveBeenCalled()

    store.updateSetting('appearance.glassIntensity', 80)
    await store.flush()

    expect(await persistence.load()).toMatchObject({ appearance: { glassIntensity: 80 } })
  })

  it('applies a built-in preset and restores its defaults when the color override is cleared', async () => {
    const { store } = await createStore()

    store.previewThemeColor('dark', '--oc-accent', '#112233')
    expect(store.settings.value.appearance.themes.dark.colors['--oc-accent']).toBe('#112233')

    store.applyThemePreset('dark', 'grass-block')
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('grass-block')
    expect(store.settings.value.appearance.themes.dark.colors).toEqual({
      '--oc-accent': '#75FF53',
      '--oc-bg-base': '#34251A',
      '--oc-fg-default': '#CCCCCC',
    })

    store.applyThemePreset('dark', 'default')
    expect(store.settings.value.appearance.themes.dark.colors).toEqual(getThemePreset('dark', 'default')!.colors)
    expect(store.settings.value.appearance.themes.dark.accentNeighborAngle).toBe(-50)
    expect(store.settings.value.appearance.themes.dark.fontFamily).toBe('system')

    store.updateThemeColor('dark', '--oc-accent', '#123456')
    store.updateThemeColor('dark', '--oc-accent', null)
    expect(store.settings.value.appearance.themes.dark.colors).toEqual(getThemePreset('dark', 'default')!.colors)
  })

  it('drops a saved-preset identity when a color is edited and keeps the colors when the preset is deleted', async () => {
    const { persistence, store } = await createStore()

    store.importThemePreset('dark', 'Forest', forestDefinition)
    expect(store.settings.value.appearance.themes.dark.presets).toHaveLength(1)
    expect(store.settings.value.appearance.themes.dark.colors['--oc-accent']).toBe('#228833')

    store.updateThemeColor('dark', '--oc-accent', '#FFFFFF')
    // 手改颜色之后不再等于任何预设，选中项回落到"自定义"。
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('')

    store.applyThemePreset('dark', 'user:Forest')
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('user:Forest')
    expect(store.settings.value.appearance.themes.dark.colors['--oc-accent']).toBe('#228833')
    expect(store.settings.value.appearance.themes.dark.fontFamily).toBe('Inter; SimSun')

    await store.flush()
    const reloaded = createAppSettingsStore(persistence)
    await reloaded.initialize()
    expect(reloaded.settings.value.appearance.themes).toEqual(store.settings.value.appearance.themes)
    expect(reloaded.settings.value.appearance.themes.light).toEqual(createDefaultAppSettings().appearance.themes.light)

    store.deleteThemePreset('dark', 'user:Forest')
    expect(store.settings.value.appearance.themes.dark.presets).toEqual([])
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('')
    expect(store.settings.value.appearance.themes.dark.colors['--oc-accent']).toBe('#228833')
  })

  it('names the current theme as a custom preset and renames it afterwards', async () => {
    const { store } = await createStore()

    store.updateThemeColor('dark', '--oc-accent', '#123456')
    store.saveThemePreset('dark', '  我的深色  ')
    const presets = store.settings.value.appearance.themes.dark.presets
    expect(presets.map(preset => preset.name)).toEqual(['我的深色'])
    expect(presets[0]!.definition.colors).toEqual({
      '--oc-accent': '#123456',
      // 保存预设时保留整套主题的颜色。
      '--oc-bg-base': '#1E1E1E',
      '--oc-fg-default': '#CCCCCC',
    })
    expect(presets[0]!.definition.accentNeighborAngle).toBe(-50)
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('user:我的深色')

    store.saveThemePreset('dark', '我的深色 2')
    expect(store.settings.value.appearance.themes.dark.presets.map(preset => preset.name)).toEqual(['我的深色 2'])
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('user:我的深色 2')

    // 空名字直接忽略，同名提交也不写盘。
    store.saveThemePreset('dark', '   ')
    store.saveThemePreset('dark', '我的深色 2')
    expect(store.settings.value.appearance.themes.dark.presets.map(preset => preset.name)).toEqual(['我的深色 2'])
  })

  it('skips importing a theme that already exists and numbers the repeated base name', async () => {
    const { store } = await createStore()

    expect(store.importThemePreset('dark', '已导入', forestDefinition)).toBe(true)
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('user:已导入')

    // 完全相同：不新增，只把已有那条选上。
    expect(store.importThemePreset('dark', '已导入', forestDefinition)).toBe(false)
    expect(store.settings.value.appearance.themes.dark.presets.map(preset => preset.name)).toEqual(['已导入'])

    // 内置预设也一样认：导入一份和石墨完全相同的配色不会多出一条。
    const graphite = getThemePreset('dark', 'graphite')!
    expect(store.importThemePreset('dark', '已导入', graphite)).toBe(false)
    expect(store.settings.value.appearance.themes.dark.presets.map(preset => preset.name)).toEqual(['已导入'])
    expect(store.settings.value.appearance.themes.dark.presetId).toBe('graphite')

    // 名字撞车但配色不同：加序号，不顶掉前一条。
    expect(store.importThemePreset('dark', '已导入', {
      ...forestDefinition,
      colors: { ...forestDefinition.colors, '--oc-accent': '#445566' },
    })).toBe(true)
    expect(store.settings.value.appearance.themes.dark.presets.map(preset => preset.name))
      .toEqual(['已导入', '已导入 2'])
  })

  it('resets individual sections without replacing other settings', async () => {
    const { store } = await createStore()
    store.updateSetting('appearance.theme', 'light')
    store.updateSetting('exporting.openCdeWorkbookAfterExport', false)

    store.resetSection('appearance')

    expect(store.settings.value.appearance).toEqual(createDefaultAppSettings().appearance)
    expect(store.settings.value.exporting.openCdeWorkbookAfterExport).toBe(false)
  })
})
