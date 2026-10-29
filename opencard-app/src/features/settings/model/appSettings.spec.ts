// @vitest-environment node
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
  it('defaults an unknown transition speed without discarding other preferences', () => {
    expect(normalizeAppSettings({ appearance: { transitionSpeed: '3x', glassIntensity: 25 } }).appearance)
      .toMatchObject({ transitionSpeed: '1x', glassIntensity: 25 })
  })

  it('returns independent defaults for missing or unsupported data', () => {
    const first = normalizeAppSettings(null)
    const second = normalizeAppSettings({ version: 99 })

    expect(first).toEqual(createDefaultAppSettings())
    expect(second).toEqual(createDefaultAppSettings())
    expect(first).not.toBe(second)

    first.appearance.themes.dark.colors['--oc-accent'] = '#123456'
    first.appearance.themes.dark.presets.push({ name: 'Mine', definition: getThemePreset('dark', 'default')! })
    const third = createDefaultAppSettings()
    expect(third.appearance.themes.dark.colors).toEqual(getThemePreset('dark', 'default')!.colors)
    expect(third.appearance.themes.dark.presets).toEqual([])
  })

  it('clamps numeric preferences and drops unknown fields', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { theme: 'light', locale: 'zh-CN', glassIntensity: 130, phaseImageSpeed: 999 },
      shell: { sidebarWidth: 9999, sidebarCollapsed: true },
    })

    expect(settings.appearance)
      .toMatchObject({ theme: 'light', locale: 'zh-CN', glassIntensity: 100, phaseImageSpeed: 400 })
    // 侧栏宽度不再是设置项：旧数据里的这几项读进来就丢掉。
    expect(settings.shell).toEqual({ titleBarNoticeHistoryLimit: 128, tipsEnabled: true, tipsIntervalMinutes: 5 })
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
    expect(resolveCommitterIdentity(settings)).toEqual({ name: '张三', email: 'zhang-san@noreply.example' })

    settings.versionControl.committerEmail = 'author@example.com'
    expect(resolveCommitterIdentity(settings)).toEqual({ name: '张三', email: 'author@example.com' })

    // 名称留空就退回作者身份 ID，邮箱再按它推导——初始化仓库因此不需要再问任何东西。
    settings.versionControl.committerName = ''
    settings.versionControl.committerEmail = ''
    expect(resolveCommitterIdentity(settings)).toEqual({
      name: settings.identity.publisherKey,
      email: `${settings.identity.publisherKey}@noreply.example`,
    })
  })

  it('normalizes the tip switch and clamps the tip interval', () => {
    const shellOf = (shell: unknown) => normalizeAppSettings({ version: APP_SETTINGS_VERSION, shell }).shell

    expect(shellOf({})).toEqual({ titleBarNoticeHistoryLimit: 128, tipsEnabled: true, tipsIntervalMinutes: 5 })
    expect(shellOf({ tipsEnabled: false, tipsIntervalMinutes: 30 }))
      .toEqual({ titleBarNoticeHistoryLimit: 128, tipsEnabled: false, tipsIntervalMinutes: 30 })
    // 间隔只在 1 分钟到 2 小时之间有意义；其余输入取默认值和边界。
    expect(shellOf({ tipsIntervalMinutes: 0 }).tipsIntervalMinutes).toBe(1)
    expect(shellOf({ tipsIntervalMinutes: 999 }).tipsIntervalMinutes).toBe(120)
    expect(shellOf({ tipsIntervalMinutes: 'often' }).tipsIntervalMinutes).toBe(5)
    expect(shellOf({ tipsEnabled: 'yes' }).tipsEnabled).toBe(true)
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
    const dark = settings.appearance.themes.dark
    expect(dark.colors['--oc-accent']).toBe('#AABBCC')
    expect(dark.colors['--oc-bg-base']).toBe(getThemePreset('dark', 'default')!.colors['--oc-bg-base'])
    // 不是 CSS 颜色的值整条丢掉，而不是留着让样式失效。
    expect(dark.colors).not.toHaveProperty('--oc-danger')
    expect(dark).toMatchObject({
      accentNeighborAngle: -180,
      fontFamily: 'Inter; Microsoft YaHei UI',
      presetId: '',
      presets: [],
    })
    expect(settings.appearance.themes.light).toMatchObject({ accentNeighborAngle: 180 })
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
    expect(normalizeAppSettings({ appearance: { themes: { dark: theme } } }).appearance.themes.dark.presetId).toBe('')
    theme.presetId = ''
    expect(normalizeAppSettings({ appearance: { themes: { dark: theme } } }).appearance.themes.dark.presetId).toBe('')
  })

  it('keeps a user language file id and falls back for anything else', () => {
    const localeOf = (locale: unknown) => normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { locale },
    }).appearance.locale

    expect(localeOf('fr-FR.json')).toBe('fr-FR.json')
    expect(localeOf('zh-CN')).toBe('zh-CN')
    expect(localeOf('system')).toBe('system')
    // 语言文件 id 只能是文件名：带路径或没有扩展名都不是可加载的语言。
    expect(localeOf('fr-FR')).toBe('system')
    expect(localeOf('fr/FR.json')).toBe('system')
    expect(localeOf(12)).toBe('system')
  })

  it('normalizes the CDE dot grid spacing to allowed increments', () => {
    expect(normalizeAppSettings({ workspace: { cdeDotGridSpacingMm: 2.5 } }).workspace.cdeDotGridSpacingMm).toBe(2.5)
    expect(normalizeAppSettings({ workspace: { cdeDotGridSpacingMm: 0 } }).workspace.cdeDotGridSpacingMm).toBe(0)
    expect(normalizeAppSettings({ workspace: { cdeDotGridSpacingMm: 10 } }).workspace.cdeDotGridSpacingMm).toBe(10)
    expect(normalizeAppSettings({ workspace: { cdeDotGridSpacingMm: 99 } }).workspace.cdeDotGridSpacingMm).toBe(5)
  })
})
