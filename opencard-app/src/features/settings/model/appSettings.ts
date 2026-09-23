/** Versioned application settings contract and normalization boundary. */
import { normalizeKeySlug, toKeySlug } from '../../../shared/model/keySlug'
import {
  OC_EDITABLE_THEME_COLOR_KEYS,
  OC_THEME_REGISTRY,
  type OcEditableThemeColorKey,
  type OcThemeColorOverrides,
  type OcThemeId,
} from '../../../shared/ui/foundation'

export const APP_SETTINGS_VERSION = 1 as const
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 420
export const MAX_RECENT_PROJECTS = 8
export const DEFAULT_ACCENT_NEIGHBOR_ANGLE = -50
export const MIN_BASE_FONT_SIZE = 10
export const MAX_BASE_FONT_SIZE = 16
export const MIN_PHASE_IMAGE_SPEED = 25
export const MAX_PHASE_IMAGE_SPEED = 400
export const MIN_TITLE_BAR_NOTICE_HISTORY_LIMIT = 1
export const MAX_TITLE_BAR_NOTICE_HISTORY_LIMIT = 512
export const MIN_AUTO_SAVE_INTERVAL_SECONDS = 5
export const MAX_AUTO_SAVE_INTERVAL_SECONDS = 300

export type AppLocale = 'system' | 'zh-CN' | 'en-US'
export type AppThemePreference = OcThemeId | 'system'
export type StructureTreeSelectionBehavior = 'none' | 'expand' | 'expand-exclusive'
export type SettingsCategoryKey = 'general' | 'appearance' | 'workspace' | 'versionControl'
/** 设置页分类的唯一清单：侧栏树、分类投影与跳转都从这里取，避免各处各抄一份。 */
export const SETTINGS_CATEGORY_KEYS: readonly SettingsCategoryKey[] = [
  'general',
  'appearance',
  'workspace',
  'versionControl',
]
export function isSettingsCategoryKey(value: unknown): value is SettingsCategoryKey {
  return typeof value === 'string' && (SETTINGS_CATEGORY_KEYS as readonly string[]).includes(value)
}
/** 提交者邮箱留空时使用的域名：`<归一化后的提交者名称>@noreply.example`。 */
export const COMMITTER_EMAIL_DOMAIN = 'noreply.example'
export const MAX_COMMITTER_FIELD_LENGTH = 128
export type AppThemePresetId =
  | 'default'
  | 'graphite'
  | 'grass-block'
  | 'deep-sea'
  | 'ember'
  | 'ink-bamboo'
  | 'morning-mist'
  | 'sakura-paper'
  | 'dune'
  | 'mint'
export type AppThemeDefinition = {
  colors: Required<OcThemeColorOverrides>
  accentNeighborAngle: number
  fontFamily: string
}
export type ProjectWorkspaceSidebarState = {
  collapsedLists: string[]
  listWeights: Record<string, number>
}

/** Last package-builder input for one project; absent means "no build was made yet". */
export type ProjectPackageBuilderState = {
  name: string
  /** 给人看的名字；缺省是包名。 */
  title: string
  author: string
  version: string
  fontFamilyKeys: string[]
  fontCompositionKeys: string[]
  iconSeriesKeys: string[]
  imagePaths: string[]
}

export type ProjectWorkspaceState = {
  expandedDirectories: string[]
  sidebar?: ProjectWorkspaceSidebarState
  projectProfile?: {
    collapsedSections: string[]
  }
  packageBuilder?: ProjectPackageBuilderState
}
export type AppUserThemePreset = {
  name: string
  definition: AppThemeDefinition
}

export const APP_THEME_PRESETS: Readonly<Record<OcThemeId, readonly AppThemePresetId[]>> = {
  dark: ['default', 'graphite', 'grass-block', 'deep-sea', 'ember', 'ink-bamboo'],
  light: ['default', 'graphite', 'morning-mist', 'sakura-paper', 'dune', 'mint'],
}

/**
 * OpenCard 默认主题的预设定义。十六进制统一为大写，与存储中的覆盖色保持一致；
 * 传入主题色即得到"石墨"这类只换主题色的派生预设。
 */
function openCardThemeDefinition(
  themeId: OcThemeId,
  accentColor = OC_THEME_REGISTRY[themeId]['--oc-accent'],
): AppThemeDefinition {
  return resolveThemeDefinition(themeId, { '--oc-accent': accentColor }, DEFAULT_ACCENT_NEIGHBOR_ANGLE, 'system')
}

const BUILTIN_THEME_DEFINITIONS: Readonly<
  Record<OcThemeId, Partial<Record<AppThemePresetId, AppThemeDefinition>>>
> = {
  dark: {
    default: openCardThemeDefinition('dark'),
    graphite: openCardThemeDefinition('dark', '#FFFFFF'),
    'grass-block': {
      colors: { '--oc-accent': '#75FF53', '--oc-bg-base': '#34251A', '--oc-fg-default': '#CCCCCC' },
      accentNeighborAngle: -50,
      fontFamily: 'system',
    },
    'deep-sea': {
      colors: { '--oc-accent': '#4CC9F0', '--oc-bg-base': '#071A2B', '--oc-fg-default': '#D9EDF7' },
      accentNeighborAngle: -40,
      fontFamily: 'system',
    },
    ember: {
      colors: { '--oc-accent': '#FF7A45', '--oc-bg-base': '#241713', '--oc-fg-default': '#E8D8D0' },
      accentNeighborAngle: 35,
      fontFamily: 'system',
    },
    'ink-bamboo': {
      colors: { '--oc-accent': '#78C091', '--oc-bg-base': '#101A16', '--oc-fg-default': '#D5E2DA' },
      accentNeighborAngle: -110,
      fontFamily: 'system',
    },
  },
  light: {
    default: openCardThemeDefinition('light'),
    graphite: openCardThemeDefinition('light', '#000000'),
    'morning-mist': {
      colors: { '--oc-accent': '#5879FA', '--oc-bg-base': '#F2F5FB', '--oc-fg-default': '#283044' },
      accentNeighborAngle: -35,
      fontFamily: 'system',
    },
    'sakura-paper': {
      colors: { '--oc-accent': '#DE4285', '--oc-bg-base': '#FFF6FA', '--oc-fg-default': '#3D2933' },
      accentNeighborAngle: 40,
      fontFamily: 'system',
    },
    dune: {
      colors: { '--oc-accent': '#B27328', '--oc-bg-base': '#FFF8E9', '--oc-fg-default': '#3B3022' },
      accentNeighborAngle: -45,
      fontFamily: 'system',
    },
    mint: {
      colors: { '--oc-accent': '#1B916F', '--oc-bg-base': '#F1FBF7', '--oc-fg-default': '#203A33' },
      accentNeighborAngle: 45,
      fontFamily: 'system',
    },
  },
}
export type AppSettingKey =
  | 'identity.publisherKey'
  | 'versionControl.committerName'
  | 'versionControl.committerEmail'
  | 'versionControl.createInitialCommit'
  | 'appearance.theme'
  | 'appearance.locale'
  | 'appearance.glassIntensity'
  | 'appearance.baseFontSize'
  | 'appearance.phaseImageSpeed'
  | 'appearance.micaBackground'
  | 'shell.titleBarNoticeHistoryLimit'
  | 'updates.showReleaseNotesAfterUpdate'
  | 'exporting.openCdeWorkbookAfterExport'
  | 'workspace.structureTreeSelectionBehavior'
  | 'workspace.structureTreeScrollToSelection'
  | 'workspace.hideDotFiles'
  | 'workspace.showWelcomeBackground'
  | 'workspace.showSelectionPositionOnMove'
  | 'workspace.showSelectionSizeOnResize'
  | 'workspace.alignmentSnappingEnabledByDefault'
  | 'workspace.historyEntryLimit'
  | 'workspace.autoSave'
  | 'workspace.autoSaveIntervalSeconds'

export interface AppSettings {
  version: typeof APP_SETTINGS_VERSION
  identity: {
    publisherKey: string
  }
  /** Git 提交者身份与初始化行为：初始化仓库时直接取用，不再逐次询问。 */
  versionControl: {
    committerName: string
    /** 留空即按 committerName 归一化后拼成 `@noreply.example`。 */
    committerEmail: string
    createInitialCommit: boolean
  }
  appearance: {
    theme: AppThemePreference
    locale: AppLocale
    glassIntensity: number
    baseFontSize: number
    phaseImageSpeed: number
    /** 窗口底层的系统云母材质（仅 Windows 11 可用）。 */
    micaBackground: boolean
    themeOverrides: Record<OcThemeId, OcThemeColorOverrides>
    accentNeighborAngles: Record<OcThemeId, number>
    fontFamilies: Record<OcThemeId, string>
    /** 当前选中的预设 id（'' 表示这套配色已被改过、不属于任何预设）；颜色相同的预设靠它区分。 */
    themePresetIds: Record<OcThemeId, string>
    userThemePresets: Record<OcThemeId, AppUserThemePreset[]>
  }
  shell: {
    sidebarWidth: number
    sidebarCollapsed: boolean
    titleBarNoticeHistoryLimit: number
  }
  updates: {
    /** 更新后是否自动弹出版本说明。 */
    showReleaseNotesAfterUpdate: boolean
  }
  exporting: {
    openCdeWorkbookAfterExport: boolean
  }
  workspace: {
    autoSave: boolean
    autoSaveIntervalSeconds: number
    structureTreeSelectionBehavior: StructureTreeSelectionBehavior
    structureTreeScrollToSelection: boolean
    hideDotFiles: boolean
    /** 欢迎页的背景效果（桌游封面墙 + 引力背景）。 */
    showWelcomeBackground: boolean
    showSelectionPositionOnMove: boolean
    showSelectionSizeOnResize: boolean
    alignmentSnappingEnabledByDefault: boolean
    historyEntryLimit: number
  }
  projectCreation: {
    lastParentPath: string
    recentProjects: string[]
    workspaceStates: Record<string, ProjectWorkspaceState>
  }
}

export type SettingsIntent =
  | {
      type: 'setting.preview'
      key: AppSettingKey
      value: unknown
    }
  | {
      type: 'setting.change'
      key: AppSettingKey
      value: unknown
    }
  | {
      type: 'theme-color.preview' | 'theme-color.change' | 'theme-color.cancel'
      themeId: OcThemeId
      token: OcEditableThemeColorKey
      value: string | null
    }
  | {
      type: 'theme-angle.preview' | 'theme-angle.change'
      themeId: OcThemeId
      value: number
    }
  | {
      type: 'theme-preset.change'
      themeId: OcThemeId
      presetId: string
    }
  | { type: 'theme-preset.delete'; themeId: OcThemeId; presetId: string }
  | { type: 'theme-font.change'; themeId: OcThemeId; value: string }
  | { type: 'theme.copy' | 'theme.read'; themeId: OcThemeId }
  | { type: 'theme-name.change'; themeId: OcThemeId; name: string }
  | { type: 'identity.regenerate' }
  | {
      type: 'project-workspace.reset'
    }

const DEFAULT_PUBLISHER_KEY = createPublisherKey()
export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  version: APP_SETTINGS_VERSION,
  identity: Object.freeze({ publisherKey: DEFAULT_PUBLISHER_KEY }),
  versionControl: Object.freeze({
    committerName: '',
    committerEmail: '',
    createInitialCommit: true,
  }),
  appearance: Object.freeze({
    theme: 'system',
    locale: 'system',
    glassIntensity: 60,
    baseFontSize: 12,
    phaseImageSpeed: 100,
    micaBackground: false,
    themeOverrides: Object.freeze({ dark: Object.freeze({}), light: Object.freeze({}) }),
    accentNeighborAngles: Object.freeze({
      dark: DEFAULT_ACCENT_NEIGHBOR_ANGLE,
      light: DEFAULT_ACCENT_NEIGHBOR_ANGLE,
    }),
    fontFamilies: Object.freeze({ dark: 'system', light: 'system' }),
    themePresetIds: Object.freeze({ dark: 'default', light: 'default' }),
    userThemePresets: { dark: [], light: [] },
  }),
  shell: Object.freeze({
    sidebarWidth: 292,
    sidebarCollapsed: false,
    titleBarNoticeHistoryLimit: 128,
  }),
  updates: Object.freeze({
    showReleaseNotesAfterUpdate: true,
  }),
  exporting: Object.freeze({
    openCdeWorkbookAfterExport: true,
  }),
  workspace: Object.freeze({
    autoSave: true,
    autoSaveIntervalSeconds: 30,
    structureTreeSelectionBehavior: 'expand-exclusive',
    structureTreeScrollToSelection: true,
    hideDotFiles: true,
    showWelcomeBackground: true,
    showSelectionPositionOnMove: true,
    showSelectionSizeOnResize: true,
    alignmentSnappingEnabledByDefault: true,
    historyEntryLimit: 100,
  }),
  projectCreation: Object.freeze({
    lastParentPath: '',
    recentProjects: [],
    workspaceStates: {},
  }),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampSidebarWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_APP_SETTINGS.shell.sidebarWidth
  }
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)))
}

function clampPercentage(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, Math.round(value)))
}

function clampHistoryEntryLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_APP_SETTINGS.workspace.historyEntryLimit
  return Math.min(1000, Math.max(10, Math.round(value / 10) * 10))
}

function clampTitleBarNoticeHistoryLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_APP_SETTINGS.shell.titleBarNoticeHistoryLimit
  }
  return Math.min(
    MAX_TITLE_BAR_NOTICE_HISTORY_LIMIT,
    Math.max(MIN_TITLE_BAR_NOTICE_HISTORY_LIMIT, Math.round(value)),
  )
}

function clampAutoSaveIntervalSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_APP_SETTINGS.workspace.autoSaveIntervalSeconds
  return Math.min(MAX_AUTO_SAVE_INTERVAL_SECONDS, Math.max(MIN_AUTO_SAVE_INTERVAL_SECONDS, Math.round(value)))
}

/**
 * 提交者名称/邮箱的归一化：去掉控制字符与 git 签名里非法的 `<>`，
 * 折叠空白并限制长度；空串表示"没填"，交给 resolveCommitterIdentity 兜底。
 */
function normalizeCommitterField(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COMMITTER_FIELD_LENGTH)
}

/** 邮箱留空时的默认值：提交者名称按 key 生成用的同一套归一化算法转写成 slug。 */
export function defaultCommitterEmail(name: string): string {
  return `${toKeySlug(name)}@${COMMITTER_EMAIL_DOMAIN}`
}

/**
 * 设置里真正用于提交的身份：名称留空就退回作者身份 ID，邮箱留空再按名称推导。
 * 两者都能兜底，所以初始化仓库不需要再问用户任何东西。
 */
export function resolveCommitterIdentity(settings: {
  identity: { publisherKey: string }
  versionControl: { committerName: string; committerEmail: string }
}): { name: string; email: string } {
  const name = settings.versionControl.committerName.trim() || settings.identity.publisherKey
  return {
    name,
    email: settings.versionControl.committerEmail.trim() || defaultCommitterEmail(name),
  }
}

function normalizeRecentProjects(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const path = item.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    const identity = path.toLocaleLowerCase()
    if (!path || seen.has(identity)) continue
    seen.add(identity)
    result.push(path)
    if (result.length >= MAX_RECENT_PROJECTS) break
  }
  return result
}

function clampBaseFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_APP_SETTINGS.appearance.baseFontSize
  }
  return Math.min(MAX_BASE_FONT_SIZE, Math.max(MIN_BASE_FONT_SIZE, Math.round(value)))
}

function clampPhaseImageSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_APP_SETTINGS.appearance.phaseImageSpeed
  }
  return Math.min(MAX_PHASE_IMAGE_SPEED, Math.max(MIN_PHASE_IMAGE_SPEED, Math.round(value)))
}

function parseUiFontFamilies(value: unknown): string[] | null {
  if (value === 'system') return []
  if (typeof value !== 'string' || /[\u0000-\u001F\u007F]/.test(value)) return null
  const families = value.split(';').map(item => item.trim()).filter(Boolean)
  if (families.length === 0 || families.length > 8 || families.some(item => item.length > 128)) return null
  const seen = new Set<string>()
  return families.filter((family) => {
    const identity = family.toLocaleLowerCase()
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function normalizeUiFontFamily(value: unknown): string {
  const families = parseUiFontFamilies(value)
  return families?.length ? families.join('; ') : 'system'
}

function clampAngle(value: unknown, fallback = DEFAULT_ACCENT_NEIGHBOR_ANGLE): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(180, Math.max(-180, Math.round(value)))
}

function normalizeThemeColorOverrides(value: unknown): OcThemeColorOverrides {
  if (!isRecord(value)) return {}
  const result: OcThemeColorOverrides = {}
  for (const token of OC_EDITABLE_THEME_COLOR_KEYS) {
    const color = value[token]
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      result[token] = color.toUpperCase()
    }
  }
  return result
}

export function getThemePreset(
  themeId: OcThemeId,
  presetId: string,
  userPresets: readonly AppUserThemePreset[] = [],
): AppThemeDefinition | null {
  if (presetId.startsWith('user:')) {
    return userPresets.find(preset => `user:${preset.name}` === presetId)?.definition ?? null
  }
  if (!APP_THEME_PRESETS[themeId].includes(presetId as AppThemePresetId)) return null
  return BUILTIN_THEME_DEFINITIONS[themeId][presetId as AppThemePresetId] ?? null
}

/** 主题色比较只看颜色本身：存储与预设各自的十六进制大小写不重要。 */
function sameThemeColor(left: string, right: string): boolean {
  return left.toUpperCase() === right.toUpperCase()
}

function matchesThemeColors(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides,
  colors: Required<OcThemeColorOverrides>,
): boolean {
  return OC_EDITABLE_THEME_COLOR_KEYS.every(token => sameThemeColor(
    overrides[token] ?? OC_THEME_REGISTRY[themeId][token],
    colors[token],
  ))
}

export function resolveThemePresetId(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides,
  accentNeighborAngle: number,
  fontFamily: string,
  userPresets: readonly AppUserThemePreset[] = [],
): string {
  for (const presetId of APP_THEME_PRESETS[themeId]) {
    const preset = getThemePreset(themeId, presetId)!
    if (matchesThemeColors(themeId, overrides, preset.colors)
      && accentNeighborAngle === preset.accentNeighborAngle
      && fontFamily === preset.fontFamily) return presetId
  }
  for (const preset of userPresets) {
    if (matchesThemeColors(themeId, overrides, preset.definition.colors)
      && accentNeighborAngle === preset.definition.accentNeighborAngle
      && fontFamily === preset.definition.fontFamily) return `user:${preset.name}`
  }
  return ''
}

/**
 * 预设 id 只认当前存在的预设：认不出来或是空串就当作"改过的自定义配色"。
 * 老数据没有这个字段，那时才按颜色推导一次，保持升级前的选中项。
 */
function normalizeThemePresetIds(
  value: unknown,
  themeOverrides: Record<OcThemeId, OcThemeColorOverrides>,
  accentNeighborAngles: Record<OcThemeId, number>,
  fontFamilies: Record<OcThemeId, string>,
  userThemePresets: Record<OcThemeId, AppUserThemePreset[]>,
): Record<OcThemeId, string> {
  const source = isRecord(value) ? value : {}
  const resolve = (themeId: OcThemeId): string => {
    const id = source[themeId]
    if (typeof id !== 'string') {
      return resolveThemePresetId(
        themeId,
        themeOverrides[themeId],
        accentNeighborAngles[themeId],
        fontFamilies[themeId],
        userThemePresets[themeId],
      )
    }
    const trimmed = id.trim()
    if (!trimmed) return ''
    if (APP_THEME_PRESETS[themeId].includes(trimmed as AppThemePresetId)) return trimmed
    return userThemePresets[themeId].some(preset => `user:${preset.name}` === trimmed) ? trimmed : ''
  }
  return { dark: resolve('dark'), light: resolve('light') }
}

/**
 * 当前这套主题的完整定义：没被覆盖的颜色取主题注册表里的值，十六进制统一为大写。
 * 内置预设、导出到剪贴板、把当前配色命名成自定义预设都从这里取同一个形状。
 */
export function resolveThemeDefinition(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides,
  accentNeighborAngle: number,
  fontFamily: string,
): AppThemeDefinition {
  return {
    colors: {
      '--oc-accent': (overrides['--oc-accent'] ?? OC_THEME_REGISTRY[themeId]['--oc-accent']).toUpperCase(),
      '--oc-bg-base': (overrides['--oc-bg-base'] ?? OC_THEME_REGISTRY[themeId]['--oc-bg-base']).toUpperCase(),
      '--oc-fg-default': (overrides['--oc-fg-default'] ?? OC_THEME_REGISTRY[themeId]['--oc-fg-default']).toUpperCase(),
    },
    accentNeighborAngle,
    fontFamily,
  }
}

export function serializeAppTheme(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides,
  accentNeighborAngle: number,
  fontFamily: string,
): string {
  const definition = resolveThemeDefinition(themeId, overrides, accentNeighborAngle, fontFamily)
  return `${JSON.stringify({
    format: 'opencard-theme',
    version: 1,
    colors: {
      accent: definition.colors['--oc-accent'],
      background: definition.colors['--oc-bg-base'],
      foreground: definition.colors['--oc-fg-default'],
    },
    accentNeighborAngle: definition.accentNeighborAngle,
    fontFamily: definition.fontFamily,
  }, null, 2)}\n`
}

export function parseAppTheme(content: string): AppThemeDefinition | null {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return null
  }
  if (!isRecord(value) || value.format !== 'opencard-theme' || value.version !== 1) return null
  if (!isRecord(value.colors)) return null
  const colors = {
    '--oc-accent': value.colors.accent,
    '--oc-bg-base': value.colors.background,
    '--oc-fg-default': value.colors.foreground,
  }
  if (Object.values(colors).some(color => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) {
    return null
  }
  if (typeof value.accentNeighborAngle !== 'number'
    || !Number.isFinite(value.accentNeighborAngle)
    || value.accentNeighborAngle < -180
    || value.accentNeighborAngle > 180) return null
  const fontFamilies = parseUiFontFamilies(value.fontFamily)
  if (!fontFamilies) return null
  return {
    colors: Object.fromEntries(Object.entries(colors).map(([token, color]) => (
      [token, (color as string).toUpperCase()]
    ))) as Required<OcThemeColorOverrides>,
    accentNeighborAngle: Math.round(value.accentNeighborAngle),
    fontFamily: fontFamilies.length ? fontFamilies.join('; ') : 'system',
  }
}

function normalizeUserThemePresets(value: unknown): AppUserThemePreset[] {
  if (!Array.isArray(value)) return []
  const result: AppUserThemePreset[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || !isRecord(item.definition)) continue
    const name = item.name.trim()
    if (!name || name.length > 80 || /[\u0000-\u001F\u007F]/.test(name)) continue
    const colors = normalizeThemeColorOverrides(item.definition.colors)
    if (OC_EDITABLE_THEME_COLOR_KEYS.some(token => !colors[token])) continue
    if (typeof item.definition.accentNeighborAngle !== 'number'
      || !Number.isFinite(item.definition.accentNeighborAngle)
      || item.definition.accentNeighborAngle < -180
      || item.definition.accentNeighborAngle > 180) continue
    const fontFamilies = parseUiFontFamilies(item.definition.fontFamily)
    if (!fontFamilies) continue
    const preset: AppUserThemePreset = {
      name,
      definition: {
        colors: colors as Required<OcThemeColorOverrides>,
        accentNeighborAngle: Math.round(item.definition.accentNeighborAngle),
        fontFamily: fontFamilies.length ? fontFamilies.join('; ') : 'system',
      },
    }
    const existingIndex = result.findIndex(candidate => (
      candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ))
    if (existingIndex >= 0) result[existingIndex] = preset
    else if (result.length < 32) result.push(preset)
  }
  return result
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!text || /[\u0000-\u001F\u007F]/.test(text) || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' && !/[\u0000-\u001F\u007F]/.test(value) ? value : ''
}

function normalizePackageBuilderState(value: unknown): ProjectPackageBuilderState | null {
  if (!isRecord(value)) return null
  return {
    name: normalizeText(value.name),
    title: normalizeText(value.title),
    author: normalizeText(value.author),
    version: normalizeText(value.version),
    fontFamilyKeys: normalizeTextList(value.fontFamilyKeys),
    fontCompositionKeys: normalizeTextList(value.fontCompositionKeys),
    iconSeriesKeys: normalizeTextList(value.iconSeriesKeys),
    imagePaths: normalizeTextList(value.imagePaths),
  }
}

function normalizeWorkspaceStates(value: unknown): Record<string, ProjectWorkspaceState> {
  if (!isRecord(value)) return {}
  const result: Record<string, ProjectWorkspaceState> = {}
  for (const [pathInput, state] of Object.entries(value)) {
    if (!isRecord(state)) continue
    const path = pathInput.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (!path) continue
    const collapsedSections = isRecord(state.projectProfile) && Array.isArray(state.projectProfile.collapsedSections)
      ? [...new Set(state.projectProfile.collapsedSections.filter((item): item is string => (
          typeof item === 'string' && item.trim() !== ''
        )).map(item => item.trim()))]
      : []
    const sidebar = isRecord(state.sidebar)
      ? {
          collapsedLists: Array.isArray(state.sidebar.collapsedLists)
            ? [...new Set(state.sidebar.collapsedLists.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()))]
            : [],
          listWeights: isRecord(state.sidebar.listWeights)
            ? Object.fromEntries(Object.entries(state.sidebar.listWeights).flatMap(([key, weight]) => (
                typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? [[key, weight]] : []
              ))) as Record<string, number>
            : {},
        }
      : null
    const packageBuilder = normalizePackageBuilderState(state.packageBuilder)
    result[path] = {
      expandedDirectories: Array.isArray(state.expandedDirectories)
        ? state.expandedDirectories
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
        : [],
      ...(sidebar && (sidebar.collapsedLists.length > 0 || Object.keys(sidebar.listWeights).length > 0) ? { sidebar } : {}),
      ...(collapsedSections.length > 0 ? { projectProfile: { collapsedSections } } : {}),
      ...(packageBuilder ? { packageBuilder } : {}),
    }
  }
  return result
}

/** 生成新的发布者身份，用于默认值和"重新生成"操作。 */
export function createPublisherKey(): string {
  return `publisher-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`
}
export function createDefaultAppSettings(): AppSettings {
  return {
    version: APP_SETTINGS_VERSION,
    identity: { ...DEFAULT_APP_SETTINGS.identity },
    versionControl: { ...DEFAULT_APP_SETTINGS.versionControl },
    appearance: {
      ...DEFAULT_APP_SETTINGS.appearance,
      themeOverrides: { dark: {}, light: {} },
      accentNeighborAngles: { ...DEFAULT_APP_SETTINGS.appearance.accentNeighborAngles },
      fontFamilies: { ...DEFAULT_APP_SETTINGS.appearance.fontFamilies },
      themePresetIds: { ...DEFAULT_APP_SETTINGS.appearance.themePresetIds },
      userThemePresets: { dark: [], light: [] },
    },
    shell: { ...DEFAULT_APP_SETTINGS.shell },
    updates: { ...DEFAULT_APP_SETTINGS.updates },
    exporting: { ...DEFAULT_APP_SETTINGS.exporting },
    workspace: { ...DEFAULT_APP_SETTINGS.workspace },
    projectCreation: {
      ...DEFAULT_APP_SETTINGS.projectCreation,
      recentProjects: [...DEFAULT_APP_SETTINGS.projectCreation.recentProjects],
      workspaceStates: { ...DEFAULT_APP_SETTINGS.projectCreation.workspaceStates },
    },
  }
}

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isRecord(value) || value.version !== APP_SETTINGS_VERSION) {
    return createDefaultAppSettings()
  }

  const identity = isRecord(value.identity) ? value.identity : {}
  const versionControl = isRecord(value.versionControl) ? value.versionControl : {}
  const appearance = isRecord(value.appearance) ? value.appearance : {}
  const legacyAccentNeighborAngle = clampAngle(appearance.accentNeighborAngle)
  const shell = isRecord(value.shell) ? value.shell : {}
  const updates = isRecord(value.updates) ? value.updates : {}
  const exporting = isRecord(value.exporting) ? value.exporting : {}
  const workspace = isRecord(value.workspace) ? value.workspace : {}
  const projectCreation = isRecord(value.projectCreation) ? value.projectCreation : {}

  const themeOverrides: Record<OcThemeId, OcThemeColorOverrides> = {
    dark: normalizeThemeColorOverrides(isRecord(appearance.themeOverrides)
      ? appearance.themeOverrides.dark
      : undefined),
    light: normalizeThemeColorOverrides(isRecord(appearance.themeOverrides)
      ? appearance.themeOverrides.light
      : undefined),
  }
  const accentNeighborAngles: Record<OcThemeId, number> = {
    dark: clampAngle(
      isRecord(appearance.accentNeighborAngles) ? appearance.accentNeighborAngles.dark : undefined,
      legacyAccentNeighborAngle,
    ),
    light: clampAngle(
      isRecord(appearance.accentNeighborAngles) ? appearance.accentNeighborAngles.light : undefined,
      legacyAccentNeighborAngle,
    ),
  }
  const fontFamilies: Record<OcThemeId, string> = {
    dark: normalizeUiFontFamily(isRecord(appearance.fontFamilies) ? appearance.fontFamilies.dark : undefined),
    light: normalizeUiFontFamily(isRecord(appearance.fontFamilies) ? appearance.fontFamilies.light : undefined),
  }
  const userThemePresets: Record<OcThemeId, AppUserThemePreset[]> = {
    dark: normalizeUserThemePresets(isRecord(appearance.userThemePresets)
      ? appearance.userThemePresets.dark
      : undefined),
    light: normalizeUserThemePresets(isRecord(appearance.userThemePresets)
      ? appearance.userThemePresets.light
      : undefined),
  }

  return {
    version: APP_SETTINGS_VERSION,
    identity: {
      publisherKey: typeof identity.publisherKey === 'string'
        ? normalizeKeySlug(identity.publisherKey) ?? DEFAULT_APP_SETTINGS.identity.publisherKey
        : DEFAULT_APP_SETTINGS.identity.publisherKey,
    },
    versionControl: {
      committerName: normalizeCommitterField(versionControl.committerName),
      committerEmail: normalizeCommitterField(versionControl.committerEmail),
      createInitialCommit: typeof versionControl.createInitialCommit === 'boolean'
        ? versionControl.createInitialCommit
        : DEFAULT_APP_SETTINGS.versionControl.createInitialCommit,
    },
    appearance: {
      theme: appearance.theme === 'system' || appearance.theme === 'light' || appearance.theme === 'dark'
        ? appearance.theme
        : DEFAULT_APP_SETTINGS.appearance.theme,
      locale: appearance.locale === 'system'
        || appearance.locale === 'zh-CN'
        || appearance.locale === 'en-US'
        ? appearance.locale
        : DEFAULT_APP_SETTINGS.appearance.locale,
      glassIntensity: clampPercentage(
        appearance.glassIntensity,
        DEFAULT_APP_SETTINGS.appearance.glassIntensity,
      ),
      baseFontSize: clampBaseFontSize(appearance.baseFontSize),
      phaseImageSpeed: clampPhaseImageSpeed(appearance.phaseImageSpeed),
      micaBackground: appearance.micaBackground === true,
      themeOverrides,
      accentNeighborAngles,
      fontFamilies,
      themePresetIds: normalizeThemePresetIds(
        appearance.themePresetIds,
        themeOverrides,
        accentNeighborAngles,
        fontFamilies,
        userThemePresets,
      ),
      userThemePresets,
    },
    shell: {
      sidebarWidth: clampSidebarWidth(shell.sidebarWidth),
      sidebarCollapsed: typeof shell.sidebarCollapsed === 'boolean'
        ? shell.sidebarCollapsed
        : DEFAULT_APP_SETTINGS.shell.sidebarCollapsed,
      titleBarNoticeHistoryLimit: clampTitleBarNoticeHistoryLimit(shell.titleBarNoticeHistoryLimit),
    },
    updates: {
      showReleaseNotesAfterUpdate: typeof updates.showReleaseNotesAfterUpdate === 'boolean'
        ? updates.showReleaseNotesAfterUpdate
        : DEFAULT_APP_SETTINGS.updates.showReleaseNotesAfterUpdate,
    },
    exporting: {
      openCdeWorkbookAfterExport: typeof exporting.openCdeWorkbookAfterExport === 'boolean'
        ? exporting.openCdeWorkbookAfterExport
        : DEFAULT_APP_SETTINGS.exporting.openCdeWorkbookAfterExport,
    },
    workspace: {
      autoSave: typeof workspace.autoSave === 'boolean'
        ? workspace.autoSave
        : DEFAULT_APP_SETTINGS.workspace.autoSave,
      autoSaveIntervalSeconds: clampAutoSaveIntervalSeconds(workspace.autoSaveIntervalSeconds),
      structureTreeSelectionBehavior: workspace.structureTreeSelectionBehavior === 'none'
        || workspace.structureTreeSelectionBehavior === 'expand'
        || workspace.structureTreeSelectionBehavior === 'expand-exclusive'
        ? workspace.structureTreeSelectionBehavior
        : DEFAULT_APP_SETTINGS.workspace.structureTreeSelectionBehavior,
      structureTreeScrollToSelection: typeof workspace.structureTreeScrollToSelection === 'boolean'
        ? workspace.structureTreeScrollToSelection
        : DEFAULT_APP_SETTINGS.workspace.structureTreeScrollToSelection,
      hideDotFiles: typeof workspace.hideDotFiles === 'boolean'
        ? workspace.hideDotFiles
        : DEFAULT_APP_SETTINGS.workspace.hideDotFiles,
      showWelcomeBackground: typeof workspace.showWelcomeBackground === 'boolean'
        ? workspace.showWelcomeBackground
        : DEFAULT_APP_SETTINGS.workspace.showWelcomeBackground,
      showSelectionPositionOnMove: typeof workspace.showSelectionPositionOnMove === 'boolean'
        ? workspace.showSelectionPositionOnMove
        : DEFAULT_APP_SETTINGS.workspace.showSelectionPositionOnMove,
      showSelectionSizeOnResize: typeof workspace.showSelectionSizeOnResize === 'boolean'
        ? workspace.showSelectionSizeOnResize
        : DEFAULT_APP_SETTINGS.workspace.showSelectionSizeOnResize,
      alignmentSnappingEnabledByDefault: typeof workspace.alignmentSnappingEnabledByDefault === 'boolean'
        ? workspace.alignmentSnappingEnabledByDefault
        : DEFAULT_APP_SETTINGS.workspace.alignmentSnappingEnabledByDefault,
      historyEntryLimit: clampHistoryEntryLimit(workspace.historyEntryLimit),
    },
    projectCreation: {
      lastParentPath: typeof projectCreation.lastParentPath === 'string'
        ? projectCreation.lastParentPath
        : DEFAULT_APP_SETTINGS.projectCreation.lastParentPath,
      recentProjects: normalizeRecentProjects(projectCreation.recentProjects),
      workspaceStates: normalizeWorkspaceStates(projectCreation.workspaceStates),
    },
  }
}
