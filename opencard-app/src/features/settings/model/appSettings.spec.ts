import { describe, expect, it } from 'vitest'
import {
  APP_SETTINGS_VERSION,
  createDefaultAppSettings,
  getThemePreset,
  normalizeAppSettings,
  parseAppTheme,
  resolveCommitterIdentity,
  resolveThemePresetId,
  serializeAppTheme,
} from './appSettings'

describe('appSettings', () => {
  it('returns independent defaults for missing or unsupported data', () => {
    const first = normalizeAppSettings(null)
    const second = normalizeAppSettings({ version: 99 })

    expect(first).toEqual(createDefaultAppSettings())
    expect(second).toEqual(createDefaultAppSettings())
    expect(first).not.toBe(second)
  })

  it('normalizes preferences and ignores unrelated state fields', () => {
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { theme: 'light', locale: 'zh-CN', glassIntensity: 130, phaseImageSpeed: 999 },
      shell: { sidebarWidth: 9999, sidebarCollapsed: true },
    })).toEqual({
      version: APP_SETTINGS_VERSION,
      tutorials: { seen: [] },
      identity: createDefaultAppSettings().identity,
      appearance: {
        theme: 'light',
        locale: 'zh-CN',
        glassIntensity: 100,
        baseFontSize: 13,
        phaseImageSpeed: 400,
        micaBackground: false,
        themes: createDefaultAppSettings().appearance.themes,
      },
      shell: { titleBarNoticeHistoryLimit: 128 },
      updates: { showReleaseNotesAfterUpdate: true },
      exporting: { openCdeWorkbookAfterExport: true },
      cache: { packageLimitGb: 2, networkLimitGb: 1 },
      rendering: { customBlockMaxDepth: 32, customBlockMaxNodes: 10000 },
      versionControl: { committerName: '', committerEmail: '', createInitialCommit: true },
      workspace: {
        autoSave: true,
        autoSaveIntervalSeconds: 30,
        historyEntryLimit: 100,
        structureTreeSelectionBehavior: 'expand-exclusive',
        structureTreeScrollToSelection: true,
        hideDotFiles: true,
        showWelcomeBackground: true,
        showSelectionPositionOnMove: true,
        showSelectionSizeOnResize: true,
        alignmentSnappingEnabledByDefault: true,
      },
    })
  })

  it('normalizes the committer identity and drops illegal signature characters', () => {
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      versionControl: { committerName: '  张三  ', committerEmail: '', createInitialCommit: false },
    }).versionControl).toEqual({ committerName: '张三', committerEmail: '', createInitialCommit: false })

    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      versionControl: { committerName: 'A<b>\nc', committerEmail: 'x@y.example' },
    }).versionControl).toEqual({ committerName: 'A b c', committerEmail: 'x@y.example', createInitialCommit: true })

    expect(normalizeAppSettings({ version: APP_SETTINGS_VERSION }).versionControl)
      .toEqual({ committerName: '', committerEmail: '', createInitialCommit: true })
  })

  it('derives the committer email from the name with the key slug algorithm', () => {
    const settings = createDefaultAppSettings()
    settings.versionControl.committerName = '张三'
    expect(resolveCommitterIdentity(settings)).toEqual({
      name: '张三',
      email: 'zhang-san@noreply.example',
    })

    settings.versionControl.committerEmail = 'author@example.com'
    expect(resolveCommitterIdentity(settings)).toEqual({
      name: '张三',
      email: 'author@example.com',
    })

    // 名称留空就退回作者身份 ID，邮箱再按它推导——初始化仓库因此不需要再问任何东西。
    settings.versionControl.committerName = ''
    settings.versionControl.committerEmail = ''
    expect(resolveCommitterIdentity(settings)).toEqual({
      name: settings.identity.publisherKey,
      email: `${settings.identity.publisherKey}@noreply.example`,
    })
  })

  it('normalizes the welcome background flag', () => {
    expect(normalizeAppSettings({ version: APP_SETTINGS_VERSION }).workspace.showWelcomeBackground).toBe(true)
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      workspace: { showWelcomeBackground: false },
    }).workspace.showWelcomeBackground).toBe(false)
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      workspace: { showWelcomeBackground: 'yes' },
    }).workspace.showWelcomeBackground).toBe(true)
  })

  it('normalizes each theme independently and fills missing or invalid fields', () => {
    const settings = normalizeAppSettings({
      appearance: {
        baseFontSize: 99,
        themes: {
          dark: {
            colors: { '--oc-accent': '#aabbcc', '--oc-bg-base': 'red', '--oc-danger': '#112233' },
            accentNeighborAngle: -240,
            fontFamily: 'Inter; Microsoft YaHei UI; inter',
            unknown: true,
          },
          light: { accentNeighborAngle: 240, fontFamily: 'bad\nfont' },
        },
      },
    })
    expect(settings.appearance.baseFontSize).toBe(19)
    expect(settings.appearance.themes.dark).toEqual({
      colors: { ...getThemePreset('dark', 'default')!.colors, '--oc-accent': '#AABBCC' },
      accentNeighborAngle: -180,
      fontFamily: 'Inter; Microsoft YaHei UI',
      presetId: '',
      presets: [],
    })
    expect(settings.appearance.themes.light).toEqual({
      ...createDefaultAppSettings().appearance.themes.light,
      accentNeighborAngle: 180,
      presetId: '',
    })
    expect(normalizeAppSettings(settings)).toEqual(settings)
  })

  it('round-trips full theme definitions without including settings or saved presets', () => {
    const theme = createDefaultAppSettings().appearance.themes.dark
    theme.colors['--oc-accent'] = '#123456'
    theme.fontFamily = 'Inter; SimSun'
    theme.presets.push({ name: 'Forest', definition: getThemePreset('dark', 'grass-block')! })
    const content = serializeAppTheme(theme)
    expect(parseAppTheme(content)).toEqual({
      colors: theme.colors,
      accentNeighborAngle: theme.accentNeighborAngle,
      fontFamily: theme.fontFamily,
    })
    expect(content).not.toContain('Forest')
    expect(parseAppTheme('{"format":"opencard-theme","version":1}')).toBeNull()
  })

  it('preserves the selected identity when saved presets have the same definition', () => {
    const theme = createDefaultAppSettings().appearance.themes.dark
    const definition = getThemePreset('dark', 'default')!
    theme.presets = [{ name: 'Same colors', definition }]
    theme.presetId = 'user:Same colors'
    const settings = normalizeAppSettings({ appearance: { themes: { dark: theme } } })
    expect(settings.appearance.themes.dark.presetId).toBe('user:Same colors')
    expect(settings.appearance.themes.dark.presets[0]!.definition).toEqual(definition)
    expect(resolveThemePresetId('dark', definition, theme.presets)).toBe('default')

    theme.presetId = 'user:Gone'
    expect(normalizeAppSettings({ appearance: { themes: { dark: theme } } })
      .appearance.themes.dark.presetId).toBe('')
    theme.presetId = ''
    expect(normalizeAppSettings({ appearance: { themes: { dark: theme } } })
      .appearance.themes.dark.presetId).toBe('')
  })

  it('creates independent theme definitions and preset lists for every default settings instance', () => {
    const first = createDefaultAppSettings()
    first.appearance.themes.dark.colors['--oc-accent'] = '#123456'
    first.appearance.themes.dark.presets.push({ name: 'Mine', definition: getThemePreset('dark', 'default')! })
    const second = createDefaultAppSettings()
    expect(second.appearance.themes.dark.colors).toEqual(getThemePreset('dark', 'default')!.colors)
    expect(second.appearance.themes.dark.presets).toEqual([])
    expect(first.appearance.themes.light).toEqual(second.appearance.themes.light)
  })

  it('keeps a user language file id and falls back for anything else', () => {
    const localeOf = (locale: unknown) => normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { locale },
    }).appearance.locale

    expect(localeOf('fr-FR.json')).toBe('fr-FR.json')
    expect(localeOf('zh-CN')).toBe('zh-CN')
    expect(localeOf('system')).toBe('system')
    expect(localeOf('fr-FR')).toBe('system')
    expect(localeOf('fr/FR.json')).toBe('system')
    expect(localeOf(12)).toBe('system')
  })

  it('falls back field-by-field for malformed current-version data', () => {
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { theme: 'unknown', locale: 12 },
      shell: { sidebarWidth: 'wide', sidebarCollapsed: 'yes' },
    })).toEqual(createDefaultAppSettings())
  })


})
