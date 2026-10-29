/** Versioned application settings contract and normalization boundary. */
import { isValidAppLocaleId, type AppLocale } from '../../../i18n/appLocale'
import { normalizeKeySlug, toKeySlug } from '../../../shared/model/keySlug'
import { isRecord } from '../../../shared/model/record'
import {
  clampBaseFontSize,
  DEFAULT_BASE_FONT_SIZE,
  OC_EDITABLE_THEME_COLOR_KEYS,
  OC_THEME_REGISTRY,
  type OcEditableThemeColorKey,
  type OcThemeColorOverrides,
  type OcThemeId,
  type OcTransitionSpeed,
} from '../../../shared/ui/foundation'

export const APP_SETTINGS_VERSION = 1 as const
export const DEFAULT_ACCENT_NEIGHBOR_ANGLE = -50
export const MIN_PHASE_IMAGE_SPEED = 25
export const MAX_PHASE_IMAGE_SPEED = 400
export const MIN_TITLE_BAR_NOTICE_HISTORY_LIMIT = 1
export const MAX_TITLE_BAR_NOTICE_HISTORY_LIMIT = 512
export const MIN_TIPS_INTERVAL_MINUTES = 1
export const MAX_TIPS_INTERVAL_MINUTES = 120
export const MIN_AUTO_SAVE_INTERVAL_SECONDS = 5
export const MAX_AUTO_SAVE_INTERVAL_SECONDS = 300
/** 缓存上限按 GiB 记：低于 1 装不下一个包，高于 32 还不如自己删缓存。 */
export const MIN_CACHE_LIMIT_GB = 1
export const MAX_CACHE_LIMIT_GB = 32
export const MIN_CUSTOM_BLOCK_DEPTH = 1
export const MAX_CUSTOM_BLOCK_DEPTH = 128
export const MIN_CUSTOM_BLOCK_NODES = 1000
export const MAX_CUSTOM_BLOCK_NODES = 100_000

/** `system`、内置语言 id，或用户语言文件名（`<名字>.json`）；规则见 `i18n/appLocale.ts`。 */
export type { AppLocale }
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
export type AppUserThemePreset = {
  name: string
  definition: AppThemeDefinition
}
export type AppThemeSettings = AppThemeDefinition & {
  /** 空串表示自定义；同色预设通过 id 区分。 */
  presetId: string
  presets: AppUserThemePreset[]
}

export const APP_THEME_PRESETS: Readonly<Record<OcThemeId, readonly AppThemePresetId[]>> = {
  dark: ['default', 'graphite', 'grass-block', 'deep-sea', 'ember', 'ink-bamboo'],
  light: ['default', 'graphite', 'morning-mist', 'sakura-paper', 'dune', 'mint'],
}

/**
 * OpenCard 默认主题的预设定义。十六进制统一为大写，与存储中的颜色保持一致；
 * 传入主题色即得到"石墨"这类只换主题色的派生预设。
 */
function openCardThemeDefinition(
  themeId: OcThemeId,
  accentColor = OC_THEME_REGISTRY[themeId]['--oc-accent'],
): AppThemeDefinition {
  return normalizeThemeDefinition(themeId, { colors: { '--oc-accent': accentColor } })
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
  | 'tutorials.seen'
  | 'identity.publisherKey'
  | 'versionControl.committerName'
  | 'versionControl.committerEmail'
  | 'versionControl.createInitialCommit'
  | 'appearance.theme'
  | 'appearance.locale'
  | 'appearance.glassIntensity'
  | 'appearance.baseFontSize'
  | 'appearance.phaseImageSpeed'
  | 'appearance.transitionSpeed'
  | 'appearance.micaBackground'
  | 'shell.titleBarNoticeHistoryLimit'
  | 'shell.tipsEnabled'
  | 'shell.tipsIntervalMinutes'
  | 'updates.showReleaseNotesAfterUpdate'
  | 'exporting.openCdeWorkbookAfterExport'
  | 'cache.packageLimitGb'
  | 'cache.networkLimitGb'
  | 'rendering.customBlockMaxDepth'
  | 'rendering.customBlockMaxNodes'
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
  | 'workspace.cdeDotGridSpacingMm'

export interface AppSettings {
  version: typeof APP_SETTINGS_VERSION
  tutorials: { seen: string[] }
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
    transitionSpeed: OcTransitionSpeed
    /** 窗口底层的系统云母材质（仅 Windows 11 可用）。 */
    micaBackground: boolean
    themes: Record<OcThemeId, AppThemeSettings>
  }
  shell: {
    titleBarNoticeHistoryLimit: number
    /** 小贴士：开着时按间隔从注册表里伪随机发一条即时消息。 */
    tipsEnabled: boolean
    tipsIntervalMinutes: number
  }
  updates: {
    /** 更新后是否自动弹出版本说明。 */
    showReleaseNotesAfterUpdate: boolean
  }
  exporting: {
    openCdeWorkbookAfterExport: boolean
  }
  /** 两块缓存的字节预算，各自独立；超出上限的部分在下次启动时从最久没用到的开始清。 */
  cache: {
    /** 解开的包。 */
    packageLimitGb: number
    /** 从网上取过的图片资源。 */
    networkLimitGb: number
  }
  rendering: {
    customBlockMaxDepth: number
    customBlockMaxNodes: number
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
    cdeDotGridSpacingMm: number
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
  | { type: 'locale.refresh' }
  | { type: 'locale-folder.open' }
  | {
      type: 'project-workspace.reset'
    }
  | { type: 'cache.clear' }

const DEFAULT_PUBLISHER_KEY = createPublisherKey()
export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  version: APP_SETTINGS_VERSION,
  tutorials: { seen: [] },
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
    baseFontSize: DEFAULT_BASE_FONT_SIZE,
    phaseImageSpeed: 100,
    transitionSpeed: '1x',
    micaBackground: false,
    themes: {
      dark: { ...openCardThemeDefinition('dark'), presetId: 'default', presets: [] },
      light: { ...openCardThemeDefinition('light'), presetId: 'default', presets: [] },
    },
  }),
  shell: Object.freeze({
    titleBarNoticeHistoryLimit: 128,
    tipsEnabled: true,
    tipsIntervalMinutes: 5,
  }),
  updates: Object.freeze({
    showReleaseNotesAfterUpdate: true,
  }),
  exporting: Object.freeze({
    openCdeWorkbookAfterExport: true,
  }),
  cache: Object.freeze({
    packageLimitGb: 2,
    networkLimitGb: 1,
  }),
  rendering: Object.freeze({
    customBlockMaxDepth: 32,
    customBlockMaxNodes: 10_000,
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
    cdeDotGridSpacingMm: 5,
  }),
})

function clampCacheLimitGb(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(MAX_CACHE_LIMIT_GB, Math.max(MIN_CACHE_LIMIT_GB, Math.round(value)))
}

function clampCustomBlockDepth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_APP_SETTINGS.rendering.customBlockMaxDepth
  return Math.min(MAX_CUSTOM_BLOCK_DEPTH, Math.max(MIN_CUSTOM_BLOCK_DEPTH, Math.round(value)))
}

function clampCustomBlockNodes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_APP_SETTINGS.rendering.customBlockMaxNodes
  return Math.min(MAX_CUSTOM_BLOCK_NODES, Math.max(MIN_CUSTOM_BLOCK_NODES, Math.round(value)))
}

function clampPercentage(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, Math.round(value)))
}

function clampHistoryEntryLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_APP_SETTINGS.workspace.historyEntryLimit
  return Math.min(1000, Math.max(10, Math.round(value / 10) * 10))
}

function normalizeCdeDotGridSpacingMm(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && [0, 2.5, 5, 10].includes(value)) return value
  return DEFAULT_APP_SETTINGS.workspace.cdeDotGridSpacingMm
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

function clampTipsIntervalMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_APP_SETTINGS.shell.tipsIntervalMinutes
  }
  return Math.min(MAX_TIPS_INTERVAL_MINUTES, Math.max(MIN_TIPS_INTERVAL_MINUTES, Math.round(value)))
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

function normalizeThemeColors(value: unknown): OcThemeColorOverrides {
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

export function isSameThemeDefinition(left: AppThemeDefinition, right: AppThemeDefinition): boolean {
  return OC_EDITABLE_THEME_COLOR_KEYS.every(token => (
    left.colors[token].toUpperCase() === right.colors[token].toUpperCase()
  )) && left.accentNeighborAngle === right.accentNeighborAngle && left.fontFamily === right.fontFamily
}

export function resolveThemePresetId(
  themeId: OcThemeId,
  definition: AppThemeDefinition,
  userPresets: readonly AppUserThemePreset[] = [],
): string {
  for (const presetId of APP_THEME_PRESETS[themeId]) {
    if (isSameThemeDefinition(definition, getThemePreset(themeId, presetId)!)) return presetId
  }
  const preset = userPresets.find(preset => isSameThemeDefinition(definition, preset.definition))
  return preset ? `user:${preset.name}` : ''
}

function normalizeThemeSettings(themeId: OcThemeId, value: unknown): AppThemeSettings {
  const source = isRecord(value) ? value : {}
  const definition = normalizeThemeDefinition(themeId, source)
  const presets = normalizeUserThemePresets(themeId, source.presets)
  const presetId = typeof source.presetId === 'string'
    ? source.presetId.trim()
    : resolveThemePresetId(themeId, definition, presets)
  return {
    ...definition,
    presetId: getThemePreset(themeId, presetId, presets) ? presetId : '',
    presets,
  }
}

/** 主题与预设共用完整定义，缺失字段取对应深浅主题的默认值。 */
function normalizeThemeDefinition(themeId: OcThemeId, value: unknown): AppThemeDefinition {
  const source = isRecord(value) ? value : {}
  const colors = normalizeThemeColors(source.colors)
  return {
    colors: {
      '--oc-accent': colors['--oc-accent'] ?? OC_THEME_REGISTRY[themeId]['--oc-accent'].toUpperCase(),
      '--oc-bg-base': colors['--oc-bg-base'] ?? OC_THEME_REGISTRY[themeId]['--oc-bg-base'].toUpperCase(),
      '--oc-fg-default': colors['--oc-fg-default'] ?? OC_THEME_REGISTRY[themeId]['--oc-fg-default'].toUpperCase(),
    },
    accentNeighborAngle: clampAngle(source.accentNeighborAngle),
    fontFamily: normalizeUiFontFamily(source.fontFamily),
  }
}

export function serializeAppTheme(definition: AppThemeDefinition): string {
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

function normalizeUserThemePresets(themeId: OcThemeId, value: unknown): AppUserThemePreset[] {
  if (!Array.isArray(value)) return []
  const result: AppUserThemePreset[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || !isRecord(item.definition)) continue
    const name = item.name.trim()
    if (!name || name.length > 80 || /[\u0000-\u001F\u007F]/.test(name)) continue
    const preset: AppUserThemePreset = {
      name,
      definition: normalizeThemeDefinition(themeId, item.definition),
    }
    const existingIndex = result.findIndex(candidate => (
      candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ))
    if (existingIndex >= 0) result[existingIndex] = preset
    else if (result.length < 32) result.push(preset)
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
    tutorials: { seen: [] },
    identity: { ...DEFAULT_APP_SETTINGS.identity },
    versionControl: { ...DEFAULT_APP_SETTINGS.versionControl },
    appearance: {
      ...DEFAULT_APP_SETTINGS.appearance,
      themes: {
        dark: normalizeThemeSettings('dark', DEFAULT_APP_SETTINGS.appearance.themes.dark),
        light: normalizeThemeSettings('light', DEFAULT_APP_SETTINGS.appearance.themes.light),
      },
    },
    shell: { ...DEFAULT_APP_SETTINGS.shell },
    updates: { ...DEFAULT_APP_SETTINGS.updates },
    exporting: { ...DEFAULT_APP_SETTINGS.exporting },
    cache: { ...DEFAULT_APP_SETTINGS.cache },
    rendering: { ...DEFAULT_APP_SETTINGS.rendering },
    workspace: { ...DEFAULT_APP_SETTINGS.workspace },
  }
}

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isRecord(value)) {
    return createDefaultAppSettings()
  }

  const identity = isRecord(value.identity) ? value.identity : {}
  const tutorials = isRecord(value.tutorials) ? value.tutorials : {}
  const versionControl = isRecord(value.versionControl) ? value.versionControl : {}
  const appearance = isRecord(value.appearance) ? value.appearance : {}
  const shell = isRecord(value.shell) ? value.shell : {}
  const updates = isRecord(value.updates) ? value.updates : {}
  const exporting = isRecord(value.exporting) ? value.exporting : {}
  const cache = isRecord(value.cache) ? value.cache : {}
  const rendering = isRecord(value.rendering) ? value.rendering : {}
  const workspace = isRecord(value.workspace) ? value.workspace : {}

  const themes = isRecord(appearance.themes) ? appearance.themes : {}

  return {
    version: APP_SETTINGS_VERSION,
    tutorials: { seen: Array.isArray(tutorials.seen)
      ? [...new Set(tutorials.seen.filter((id): id is string => typeof id === 'string').map(id => id.trim()).filter(Boolean))]
      : [] },
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
      locale: appearance.locale === 'system' || isValidAppLocaleId(appearance.locale)
        ? appearance.locale
        : DEFAULT_APP_SETTINGS.appearance.locale,
      glassIntensity: clampPercentage(
        appearance.glassIntensity,
        DEFAULT_APP_SETTINGS.appearance.glassIntensity,
      ),
      baseFontSize: clampBaseFontSize(appearance.baseFontSize),
      phaseImageSpeed: clampPhaseImageSpeed(appearance.phaseImageSpeed),
      transitionSpeed: appearance.transitionSpeed === '0.5x' || appearance.transitionSpeed === '1x'
        || appearance.transitionSpeed === '2x' || appearance.transitionSpeed === 'off'
        ? appearance.transitionSpeed
        : DEFAULT_APP_SETTINGS.appearance.transitionSpeed,
      micaBackground: appearance.micaBackground === true,
      themes: {
        dark: normalizeThemeSettings('dark', themes.dark),
        light: normalizeThemeSettings('light', themes.light),
      },
    },
    shell: {
      titleBarNoticeHistoryLimit: clampTitleBarNoticeHistoryLimit(shell.titleBarNoticeHistoryLimit),
      tipsEnabled: typeof shell.tipsEnabled === 'boolean'
        ? shell.tipsEnabled
        : DEFAULT_APP_SETTINGS.shell.tipsEnabled,
      tipsIntervalMinutes: clampTipsIntervalMinutes(shell.tipsIntervalMinutes),
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
    cache: {
      packageLimitGb: clampCacheLimitGb(cache.packageLimitGb, DEFAULT_APP_SETTINGS.cache.packageLimitGb),
      networkLimitGb: clampCacheLimitGb(cache.networkLimitGb, DEFAULT_APP_SETTINGS.cache.networkLimitGb),
    },
    rendering: {
      customBlockMaxDepth: clampCustomBlockDepth(rendering.customBlockMaxDepth),
      customBlockMaxNodes: clampCustomBlockNodes(rendering.customBlockMaxNodes),
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
      cdeDotGridSpacingMm: normalizeCdeDotGridSpacingMm(workspace.cdeDotGridSpacingMm),
    },
  }
}
