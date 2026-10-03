import { describe, expect, it } from 'vitest'
import {
  APP_THEME_PRESETS,
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

  it('normalizes fields and clamps sidebar width', () => {
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { theme: 'light', locale: 'zh-CN', glassIntensity: 130, phaseImageSpeed: 999 },
      shell: { sidebarWidth: 9999, sidebarCollapsed: true },
    })).toEqual({
      version: APP_SETTINGS_VERSION,
      identity: createDefaultAppSettings().identity,
      appearance: {
        theme: 'light',
        locale: 'zh-CN',
        glassIntensity: 100,
        baseFontSize: 13,
        phaseImageSpeed: 400,
        micaBackground: false,
        themeOverrides: { dark: {}, light: {} },
        accentNeighborAngles: { dark: -50, light: -50 },
        fontFamilies: { dark: 'system', light: 'system' },
        themePresetIds: { dark: 'default', light: 'default' },
        userThemePresets: { dark: [], light: [] },
      },
      shell: { sidebarWidth: 420, sidebarCollapsed: true, titleBarNoticeHistoryLimit: 128 },
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
      projectCreation: { lastParentPath: '', recentProjects: [], workspaceStates: {} },
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

  it('keeps only editable valid theme colors for each theme', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: {
        themeOverrides: {
          dark: {
            '--oc-accent': '#aabbcc',
            '--oc-bg-base': 'red',
            '--oc-bg-surface': '#223344',
            '--oc-danger': '#112233',
          },
          light: { '--oc-fg-default': '#123456' },
        },
      },
    })

    expect(settings.appearance.themeOverrides).toEqual({
      dark: { '--oc-accent': '#AABBCC' },
      light: { '--oc-fg-default': '#123456' },
    })
  })

  it('normalizes project-profile collapse state in project workspace cache', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      projectCreation: {
        workspaceStates: {
          'D:\\Cards\\Demo\\': {
            expandedDirectories: ['assets'],
            projectProfile: {
              collapsedSections: ['fonts', 'fonts', '', 42],
            },
          },
        },
      },
    })

    expect(settings.projectCreation.workspaceStates['D:/Cards/Demo']).toEqual({
      expandedDirectories: ['assets'],
      projectProfile: { collapsedSections: ['fonts'] },
    })
  })

  it('normalizes the remembered package-builder selection per project', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      projectCreation: {
        workspaceStates: {
          'D:/Cards/Demo': {
            packageBuilder: {
              name: 'Theme',
              version: '2.1.0',
              fontFamilyKeys: ['latin', 'latin', 42],
              fontCompositionKeys: ['body'],
              iconSeriesKeys: [],
              imagePaths: ['images\\card.png'],
            },
          },
        },
      },
    })

    expect(settings.projectCreation.workspaceStates['D:/Cards/Demo']).toEqual({
      expandedDirectories: [],
      packageBuilder: {
        name: 'Theme',
        author: '',
        version: '2.1.0',
        title: '',
        fontFamilyKeys: ['latin'],
        fontCompositionKeys: ['body'],
        iconSeriesKeys: [],
        imagePaths: ['images/card.png'],
        customBlockKeys: [],
        otherPaths: [],
      },
    })
  })

  it('ignores a malformed remembered package-builder selection', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      projectCreation: {
        workspaceStates: { 'D:/Cards/Demo': { expandedDirectories: ['assets'], packageBuilder: 'broken' } },
      },
    })

    expect(settings.projectCreation.workspaceStates['D:/Cards/Demo']).toEqual({
      expandedDirectories: ['assets'],
    })
  })

  it('fills workspace behavior defaults for older current-version settings', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { theme: 'light', locale: 'zh-CN' },
      shell: { sidebarWidth: 320, sidebarCollapsed: false },
    })

    expect(settings.workspace).toEqual(createDefaultAppSettings().workspace)
    expect(settings.updates).toEqual(createDefaultAppSettings().updates)
    expect(settings.exporting).toEqual(createDefaultAppSettings().exporting)
    expect(settings.projectCreation).toEqual(createDefaultAppSettings().projectCreation)
    expect(settings.appearance.glassIntensity).toBe(60)
    expect(settings.appearance.phaseImageSpeed).toBe(100)
    expect(settings.appearance.accentNeighborAngles).toEqual({ dark: -50, light: -50 })
  })

  it('migrates the legacy shared phase angle and clamps per-theme values', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: {
        accentNeighborAngle: -72,
        accentNeighborAngles: { dark: -240, light: 240 },
      },
    })

    expect(settings.appearance.accentNeighborAngles).toEqual({ dark: -180, light: 180 })
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { accentNeighborAngle: -72 },
    }).appearance.accentNeighborAngles).toEqual({ dark: -72, light: -72 })
  })

  it('defines the grass block preset and round-trips exported themes', () => {
    const preset = getThemePreset('dark', 'grass-block')
    expect(preset).toEqual({
      colors: {
        '--oc-accent': '#75FF53',
        '--oc-bg-base': '#34251A',
        '--oc-fg-default': '#CCCCCC',
      },
      accentNeighborAngle: -50,
      fontFamily: 'system',
    })
    expect(resolveThemePresetId('dark', preset!.colors, -50, 'system')).toBe('grass-block')
    expect(getThemePreset('light', 'grass-block')).toBeNull()

    const content = serializeAppTheme('dark', preset!.colors, -50, 'system')
    expect(parseAppTheme(content)).toEqual(preset)
    expect(parseAppTheme('{"format":"opencard-theme","version":1}')).toBeNull()
  })

  it('derives the graphite preset from the OpenCard theme with a pure theme color', () => {
    expect(getThemePreset('dark', 'graphite')).toEqual({
      colors: {
        '--oc-accent': '#FFFFFF',
        '--oc-bg-base': '#1E1E1E',
        '--oc-fg-default': '#CCCCCC',
      },
      accentNeighborAngle: -50,
      fontFamily: 'system',
    })
    expect(getThemePreset('light', 'graphite')).toEqual({
      colors: {
        '--oc-accent': '#000000',
        '--oc-bg-base': '#F5F6FB',
        '--oc-fg-default': '#1F2430',
      },
      accentNeighborAngle: -50,
      fontFamily: 'system',
    })

    const graphite = getThemePreset('dark', 'graphite')!
    expect(resolveThemePresetId('dark', graphite.colors, -50, 'system')).toBe('graphite')
    expect(resolveThemePresetId('light', graphite.colors, -50, 'system')).not.toBe('graphite')
  })

  it('keeps resolving the OpenCard default preset from untouched color overrides', () => {
    expect(resolveThemePresetId('dark', {}, -50, 'system')).toBe('default')
    expect(resolveThemePresetId('light', {}, -50, 'system')).toBe('default')
  })

  it('provides six built-in presets for each color scheme', () => {
    expect(APP_THEME_PRESETS.dark).toHaveLength(6)
    expect(APP_THEME_PRESETS.light).toHaveLength(6)
    expect(APP_THEME_PRESETS.dark.every(id => getThemePreset('dark', id))).toBe(true)
    expect(APP_THEME_PRESETS.light.every(id => getThemePreset('light', id))).toBe(true)
  })

  it('normalizes imported theme presets and resolves them from current data', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: {
        userThemePresets: {
          dark: [{
            name: 'Forest',
            definition: {
              colors: {
                '--oc-accent': '#75ff53',
                '--oc-bg-base': '#34251a',
                '--oc-fg-default': '#cccccc',
              },
              accentNeighborAngle: -35,
              fontFamily: 'Inter; SimSun',
            },
          }],
        },
      },
    })

    expect(settings.appearance.userThemePresets.dark[0]?.definition.colors['--oc-accent']).toBe('#75FF53')
    expect(resolveThemePresetId(
      'dark',
      settings.appearance.userThemePresets.dark[0]!.definition.colors,
      -35,
      'Inter; SimSun',
      settings.appearance.userThemePresets.dark,
    )).toBe('user:Forest')
  })

  it('keeps the selected preset id and derives it only when the data has none', () => {
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: {},
    }).appearance.themePresetIds).toEqual({ dark: 'default', light: 'default' })

    // 显式记下的 id 不按颜色重新推导：颜色一样、名字不同的预设靠它区分。
    const explicit = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: {
        themePresetIds: { dark: 'graphite', light: 'user:Forest' },
        userThemePresets: {
          light: [{
            name: 'Forest',
            definition: {
              colors: { '--oc-accent': '#75FF53', '--oc-bg-base': '#34251A', '--oc-fg-default': '#CCCCCC' },
              accentNeighborAngle: -50,
              fontFamily: 'system',
            },
          }],
        },
      },
    })
    expect(explicit.appearance.themePresetIds).toEqual({ dark: 'graphite', light: 'user:Forest' })

    // 认不出来的 id（预设已被删除或来自更早的数据）退化成"自定义"。
    expect(normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: { themePresetIds: { dark: 'user:Gone', light: 'nope' } },
    }).appearance.themePresetIds).toEqual({ dark: '', light: '' })
  })

  it('clamps the base font size and normalizes per-theme font choices', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      appearance: {
        baseFontSize: 99,
        fontFamilies: { dark: 'Inter; Microsoft YaHei UI; inter', light: 'bad\nfont' },
      },
    })

    expect(settings.appearance.baseFontSize).toBe(19)
    expect(settings.appearance.fontFamilies).toEqual({
      dark: 'Inter; Microsoft YaHei UI',
      light: 'system',
    })
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

  it('normalizes, deduplicates, and limits recent projects', () => {
    const settings = normalizeAppSettings({
      version: APP_SETTINGS_VERSION,
      projectCreation: {
        recentProjects: [
          'D:\\Cards\\',
          'd:/cards',
          ' D:\\Projects\\One ',
          'D:/Projects/Two',
          'D:/Projects/Three',
          'D:/Projects/Four',
          'D:/Projects/Five',
          'D:/Projects/Six',
          'D:/Projects/Seven',
          'D:/Projects/Eight',
          'D:/Projects/Nine',
          42,
        ],
      },
    })

    expect(settings.projectCreation.recentProjects).toEqual([
      'D:/Cards',
      'D:/Projects/One',
      'D:/Projects/Two',
      'D:/Projects/Three',
      'D:/Projects/Four',
      'D:/Projects/Five',
      'D:/Projects/Six',
      'D:/Projects/Seven',
    ])
  })
})
