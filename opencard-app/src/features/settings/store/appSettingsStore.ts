/** Global application settings truth with serialized persistence writes. */
import { readonly, ref, type DeepReadonly, type Ref } from 'vue'
import type { OcEditableThemeColorKey, OcThemeId } from '../../../shared/ui/foundation'
import { OC_THEME_REGISTRY } from '../../../shared/ui/foundation'
import { describeError } from '../../../shared/model/error'
import {
  createDefaultAppSettings,
  getThemePreset,
  normalizeAppSettings,
  isSameThemeDefinition,
  resolveThemePresetId,
  type AppThemeDefinition,
  type AppSettingKey,
  type AppSettings,
  type AppUserThemePreset,
} from '../model/appSettings'
import { createJsonPersistence, type JsonPersistence } from '../../../shared/storage/jsonPersistence'
import { APP_SETTINGS_FILE_NAME, resolveAppStoragePath } from '../../../shared/storage/appStoragePaths'

type SettingsSection = keyof Pick<AppSettings, 'appearance' | 'shell' | 'exporting' | 'workspace' | 'rendering'>

export interface AppSettingsStore {
  settings: Readonly<Ref<DeepReadonly<AppSettings>>>
  isReady: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  /** 有未落盘的改动（设置页编辑只暂存，等 save 写入）。 */
  dirty: Readonly<Ref<boolean>>
  initialize(): Promise<void>
  previewSetting(key: AppSettingKey, value: unknown): void
  updateSetting(key: AppSettingKey, value: unknown): void
  previewThemeColor(themeId: OcThemeId, token: OcEditableThemeColorKey, value: string | null): void
  updateThemeColor(themeId: OcThemeId, token: OcEditableThemeColorKey, value: string | null): void
  previewThemeAngle(themeId: OcThemeId, value: number): void
  updateThemeAngle(themeId: OcThemeId, value: number): void
  updateThemeFont(themeId: OcThemeId, value: string): void
  applyThemePreset(themeId: OcThemeId, presetId: string): void
  /** 导入一套主题预设；已经有一模一样的预设时不再新增，返回 false。 */
  importThemePreset(themeId: OcThemeId, name: string, definition: AppThemeDefinition): boolean
  saveThemePreset(themeId: OcThemeId, name: string): void
  deleteThemePreset(themeId: OcThemeId, presetId: string): void
  resetSection(section: SettingsSection): void
  resetAll(): void
  flush(): Promise<void>
  /** 把当前内存里的设置写入磁盘并清除 dirty。 */
  save(): Promise<void>
}

export function createAppSettingsStore(
  persistence: JsonPersistence = createJsonPersistence(() => resolveAppStoragePath(APP_SETTINGS_FILE_NAME), 'app-settings'),
): AppSettingsStore {
  const settings = ref<AppSettings>(createDefaultAppSettings())
  const isReady = ref(false)
  const error = ref<string | null>(null)
  const dirty = ref(false)
  let initializePromise: Promise<void> | null = null
  let writeQueue = Promise.resolve()

  function queueSave(): void {
    const snapshot = normalizeAppSettings(settings.value)
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await persistence.save(snapshot)
          error.value = null
        } catch (cause) {
          error.value = describeError(cause)
          throw cause
        }
      })
    void writeQueue.catch(() => undefined)
  }

  async function initialize(): Promise<void> {
    if (initializePromise) return await initializePromise

    initializePromise = (async () => {
      try {
        const storedValue = await persistence.load()
        const normalized = normalizeAppSettings(storedValue)
        settings.value = normalized
        error.value = null

        if (JSON.stringify(storedValue) !== JSON.stringify(normalized)) {
          queueSave()
          await writeQueue
        }
      } catch (cause) {
        settings.value = createDefaultAppSettings()
        error.value = describeError(cause)
      } finally {
        isReady.value = true
      }
    })()

    await initializePromise
  }

  function commit(candidate: AppSettings): void {
    settings.value = normalizeAppSettings(candidate)
    queueSave()
  }

  function applySetting(candidate: AppSettings, key: AppSettingKey, value: unknown): void {
    if (key === 'tutorials.seen') candidate.tutorials.seen = value as string[]
    else if (key === 'identity.publisherKey') candidate.identity.publisherKey = value as string
    else if (key === 'versionControl.committerName') candidate.versionControl.committerName = value as string
    else if (key === 'versionControl.committerEmail') candidate.versionControl.committerEmail = value as string
    else if (key === 'versionControl.createInitialCommit') {
      candidate.versionControl.createInitialCommit = value === true
    } else if (key === 'appearance.theme') candidate.appearance.theme = value as AppSettings['appearance']['theme']
    else if (key === 'appearance.locale') candidate.appearance.locale = value as AppSettings['appearance']['locale']
    else if (key === 'appearance.glassIntensity') candidate.appearance.glassIntensity = value as number
    else if (key === 'appearance.baseFontSize') candidate.appearance.baseFontSize = value as number
    else if (key === 'appearance.phaseImageSpeed') candidate.appearance.phaseImageSpeed = value as number
    else if (key === 'appearance.micaBackground') candidate.appearance.micaBackground = value === true
    else if (key === 'shell.titleBarNoticeHistoryLimit') candidate.shell.titleBarNoticeHistoryLimit = value as number
    else if (key === 'updates.showReleaseNotesAfterUpdate') {
      candidate.updates.showReleaseNotesAfterUpdate = value === true
    } else if (key === 'exporting.openCdeWorkbookAfterExport') {
      candidate.exporting.openCdeWorkbookAfterExport = value as boolean
    } else if (key === 'cache.packageLimitGb') {
      candidate.cache.packageLimitGb = value as number
    } else if (key === 'cache.networkLimitGb') {
      candidate.cache.networkLimitGb = value as number
    } else if (key === 'rendering.customBlockMaxDepth') {
      candidate.rendering.customBlockMaxDepth = value as number
    } else if (key === 'rendering.customBlockMaxNodes') {
      candidate.rendering.customBlockMaxNodes = value as number
    } else if (key === 'workspace.structureTreeSelectionBehavior') {
      candidate.workspace.structureTreeSelectionBehavior = value as AppSettings['workspace']['structureTreeSelectionBehavior']
    } else if (key === 'workspace.structureTreeScrollToSelection') {
      candidate.workspace.structureTreeScrollToSelection = value as boolean
    } else if (key === 'workspace.hideDotFiles') {
      candidate.workspace.hideDotFiles = value as boolean
    } else if (key === 'workspace.showWelcomeBackground') {
      candidate.workspace.showWelcomeBackground = value as boolean
    } else if (key === 'workspace.showSelectionPositionOnMove') {
      candidate.workspace.showSelectionPositionOnMove = value as boolean
    } else if (key === 'workspace.showSelectionSizeOnResize') {
      candidate.workspace.showSelectionSizeOnResize = value as boolean
    } else if (key === 'workspace.alignmentSnappingEnabledByDefault') {
      candidate.workspace.alignmentSnappingEnabledByDefault = value as boolean
    } else if (key === 'workspace.historyEntryLimit') {
      candidate.workspace.historyEntryLimit = value as number
    } else if (key === 'workspace.autoSave') {
      candidate.workspace.autoSave = value as boolean
    } else if (key === 'workspace.autoSaveIntervalSeconds') {
      candidate.workspace.autoSaveIntervalSeconds = value as number
    }
  }

  function previewSetting(key: AppSettingKey, value: unknown): void {
    dirty.value = true
    const candidate = normalizeAppSettings(settings.value)
    applySetting(candidate, key, value)
    settings.value = normalizeAppSettings(candidate)
  }

  function updateSetting(key: AppSettingKey, value: unknown): void {
    const candidate = normalizeAppSettings(settings.value)
    applySetting(candidate, key, value)
    commit(candidate)
  }

  function applyThemeColor(
    candidate: AppSettings,
    themeId: OcThemeId,
    token: OcEditableThemeColorKey,
    value: string | null,
  ): void {
    candidate.appearance.themes[themeId].colors[token] = value ?? OC_THEME_REGISTRY[themeId][token]
  }

  function previewThemeColor(
    themeId: OcThemeId,
    token: OcEditableThemeColorKey,
    value: string | null,
  ): void {
    const candidate = normalizeAppSettings(settings.value)
    applyThemeColor(candidate, themeId, token, value)
    settings.value = normalizeAppSettings(candidate)
  }

  function updateThemeColor(
    themeId: OcThemeId,
    token: OcEditableThemeColorKey,
    value: string | null,
  ): void {
    const candidate = normalizeAppSettings(settings.value)
    applyThemeColor(candidate, themeId, token, value)
    forgetThemePresetIdIfChanged(candidate, themeId)
    commit(candidate)
  }

  function applyThemeAngle(candidate: AppSettings, themeId: OcThemeId, value: number): void {
    candidate.appearance.themes[themeId].accentNeighborAngle = value
  }

  function previewThemeAngle(themeId: OcThemeId, value: number): void {
    const candidate = normalizeAppSettings(settings.value)
    applyThemeAngle(candidate, themeId, value)
    settings.value = normalizeAppSettings(candidate)
  }

  function updateThemeAngle(themeId: OcThemeId, value: number): void {
    const candidate = normalizeAppSettings(settings.value)
    applyThemeAngle(candidate, themeId, value)
    forgetThemePresetIdIfChanged(candidate, themeId)
    commit(candidate)
  }

  function updateThemeFont(themeId: OcThemeId, value: string): void {
    const candidate = normalizeAppSettings(settings.value)
    candidate.appearance.themes[themeId].fontFamily = value
    forgetThemePresetIdIfChanged(candidate, themeId)
    commit(candidate)
  }

  /** 写入一条自定义预设：同名覆盖，必要时顶掉被改名的那条，并保持数量上限。 */
  function writeUserThemePreset(
    candidate: AppSettings,
    themeId: OcThemeId,
    name: string,
    definition: AppThemeDefinition,
    replacedName = '',
  ): void {
    const kept = candidate.appearance.themes[themeId].presets.filter(preset => (
      preset.name !== replacedName
      && preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase()
    ))
    candidate.appearance.themes[themeId].presets = [...kept.slice(-31), { name, definition }]
  }

  /** 把一套预设的配色、角度与字体应用到候选设置上，同时记住选中的是哪一条。 */
  function applyThemePresetTo(candidate: AppSettings, themeId: OcThemeId, presetId: string): boolean {
    const preset = getThemePreset(themeId, presetId, candidate.appearance.themes[themeId].presets)
    if (!preset) return false
    candidate.appearance.themes[themeId] = {
      ...candidate.appearance.themes[themeId],
      ...preset,
      colors: { ...preset.colors },
      presetId,
    }
    return true
  }

  function applyThemePreset(themeId: OcThemeId, presetId: string): void {
    const candidate = normalizeAppSettings(settings.value)
    if (applyThemePresetTo(candidate, themeId, presetId)) commit(candidate)
  }

  /** 手改过配色、角度或字体之后，这套主题不再等于它原来的预设，选中项回落到"自定义"。 */
  function forgetThemePresetIdIfChanged(candidate: AppSettings, themeId: OcThemeId): void {
    const theme = candidate.appearance.themes[themeId]
    const preset = getThemePreset(themeId, theme.presetId, theme.presets)
    if (preset && !isSameThemeDefinition(preset, theme)) theme.presetId = ''
  }

  /** 导入时给重名的预设让路：基名被占用就依次加序号，免得后一次导入顶掉前一次。 */
  function uniqueThemePresetName(baseName: string, presets: readonly AppUserThemePreset[]): string {
    const taken = new Set(presets.map(preset => preset.name.toLocaleLowerCase()))
    if (!taken.has(baseName.toLocaleLowerCase())) return baseName
    for (let index = 2; ; index += 1) {
      const candidate = `${baseName} ${index}`
      if (!taken.has(candidate.toLocaleLowerCase())) return candidate
    }
  }

  function importThemePreset(themeId: OcThemeId, name: string, definition: AppThemeDefinition): boolean {
    const candidate = normalizeAppSettings(settings.value)
    const identicalId = resolveThemePresetId(themeId, definition, candidate.appearance.themes[themeId].presets)
    if (identicalId) {
      if (applyThemePresetTo(candidate, themeId, identicalId)) commit(candidate)
      return false
    }
    const presetName = uniqueThemePresetName(name.trim(), candidate.appearance.themes[themeId].presets)
    writeUserThemePreset(candidate, themeId, presetName, definition)
    applyThemePresetTo(candidate, themeId, `user:${presetName}`)
    commit(candidate)
    return true
  }

  /**
   * 给当前这套主题命名：把现在的配色、角度与字体存成一条同名自定义预设；
   * 当前选中的已经是自定义预设时，改名的同时顶掉旧名字。
   */
  function saveThemePreset(themeId: OcThemeId, name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    const candidate = normalizeAppSettings(settings.value)
    const theme = candidate.appearance.themes[themeId]
    const replacedName = theme.presetId.startsWith('user:') ? theme.presetId.slice('user:'.length) : ''
    if (replacedName === trimmed) return
    writeUserThemePreset(candidate, themeId, trimmed, {
      colors: { ...theme.colors },
      accentNeighborAngle: theme.accentNeighborAngle,
      fontFamily: theme.fontFamily,
    }, replacedName)
    theme.presetId = `user:${trimmed}`
    commit(candidate)
  }

  function deleteThemePreset(themeId: OcThemeId, presetId: string): void {
    if (!presetId.startsWith('user:')) return
    const name = presetId.slice('user:'.length)
    const candidate = normalizeAppSettings(settings.value)
    candidate.appearance.themes[themeId].presets = candidate.appearance.themes[themeId].presets
      .filter(preset => preset.name !== name)
    if (candidate.appearance.themes[themeId].presetId === presetId) {
      candidate.appearance.themes[themeId].presetId = ''
    }
    commit(candidate)
  }

  function resetSection(section: SettingsSection): void {
    const defaults = createDefaultAppSettings()
    commit({
      ...normalizeAppSettings(settings.value),
      [section]: defaults[section],
    })
  }

  function resetAll(): void {
    commit(createDefaultAppSettings())
  }

  async function flush(): Promise<void> {
    await writeQueue
    await persistence.flush()
  }

  async function save(): Promise<void> {
    commit(settings.value)
    try {
      await flush()
    } catch {
      return
    }
    dirty.value = false
  }

  return {
    settings: readonly(settings),
    isReady: readonly(isReady),
    error: readonly(error),
    dirty: readonly(dirty),
    initialize,
    previewSetting,
    updateSetting,
    previewThemeColor,
    updateThemeColor,
    previewThemeAngle,
    updateThemeAngle,
    updateThemeFont,
    applyThemePreset,
    importThemePreset,
    saveThemePreset,
    deleteThemePreset,
    resetSection,
    resetAll,
    flush,
    save,
  }
}

const appSettingsStore = createAppSettingsStore()

export function useAppSettingsStore(): AppSettingsStore {
  return appSettingsStore
}
