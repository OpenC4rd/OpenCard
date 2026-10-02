/** Global application settings truth with serialized persistence writes. */
import { readonly, ref, type DeepReadonly, type Ref } from 'vue'
import type { OcEditableThemeColorKey, OcThemeId } from '../../../shared/ui/foundation'
import { OC_EDITABLE_THEME_COLOR_KEYS } from '../../../shared/ui/foundation'
import { describeError } from '../../../shared/model/error'
import {
  APP_THEME_PRESETS,
  createDefaultAppSettings,
  getThemePreset,
  normalizeAppSettings,
  resolveThemeDefinition,
  type AppThemeDefinition,
  type AppSettingKey,
  type AppSettings,
  type AppUserThemePreset,
} from '../model/appSettings'
import {
  createSettingsPersistence,
  type SettingsPersistence,
} from '../services/settingsPersistence'

type SettingsSection = keyof Pick<AppSettings, 'appearance' | 'shell' | 'exporting' | 'workspace' | 'rendering'>

export interface AppSettingsStore {
  settings: Readonly<Ref<DeepReadonly<AppSettings>>>
  isReady: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
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
  updateShell(patch: Partial<AppSettings['shell']>): void
  updateProjectCreation(patch: Partial<AppSettings['projectCreation']>): void
  rememberRecentProject(path: string): void
  forgetRecentProject(path: string): void
  resetSection(section: SettingsSection): void
  resetAll(): void
  flush(): Promise<void>
}

export function createAppSettingsStore(
  persistence: SettingsPersistence = createSettingsPersistence(),
): AppSettingsStore {
  const settings = ref<AppSettings>(createDefaultAppSettings())
  const isReady = ref(false)
  const error = ref<string | null>(null)
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
    if (key === 'identity.publisherKey') candidate.identity.publisherKey = value as string
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
    const candidate = normalizeAppSettings(settings.value)
    applySetting(candidate, key, value)
    settings.value = normalizeAppSettings(candidate)
  }

  function updateSetting(key: AppSettingKey, value: unknown): void {
    const candidate = normalizeAppSettings(settings.value)
    applySetting(candidate, key, value)
    commit(candidate)
  }

  function updateShell(patch: Partial<AppSettings['shell']>): void {
    commit({
      ...normalizeAppSettings(settings.value),
      shell: {
        ...settings.value.shell,
        ...patch,
      },
    })
  }

  function updateProjectCreation(patch: Partial<AppSettings['projectCreation']>): void {
    commit({
      ...normalizeAppSettings(settings.value),
      projectCreation: {
        ...settings.value.projectCreation,
        ...patch,
      },
    })
  }

  function rememberRecentProject(path: string): void {
    const normalizedPath = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (!normalizedPath) return
    const identity = normalizedPath.toLocaleLowerCase()
    updateProjectCreation({
      recentProjects: [
        normalizedPath,
        ...settings.value.projectCreation.recentProjects.filter((item) => (
          item.toLocaleLowerCase() !== identity
        )),
      ],
    })
  }

  function forgetRecentProject(path: string): void {
    const normalizedPath = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (!normalizedPath) return
    const identity = normalizedPath.toLocaleLowerCase()
    const recentProjects = settings.value.projectCreation.recentProjects.filter((item) => (
      item.toLocaleLowerCase() !== identity
    ))
    const workspaceStates = { ...settings.value.projectCreation.workspaceStates }
    const workspaceKey = Object.keys(workspaceStates).find((item) => item.toLocaleLowerCase() === identity)
    if (workspaceKey) delete workspaceStates[workspaceKey]
    if (recentProjects.length === settings.value.projectCreation.recentProjects.length && !workspaceKey) return
    updateProjectCreation({ recentProjects, workspaceStates })
  }

  function applyThemeColor(
    candidate: AppSettings,
    themeId: OcThemeId,
    token: OcEditableThemeColorKey,
    value: string | null,
  ): void {
    const overrides = { ...candidate.appearance.themeOverrides[themeId] }
    if (value === null) delete overrides[token]
    else overrides[token] = value
    candidate.appearance.themeOverrides[themeId] = overrides
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
    candidate.appearance.accentNeighborAngles[themeId] = value
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
    candidate.appearance.fontFamilies[themeId] = value
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
    const kept = candidate.appearance.userThemePresets[themeId].filter(preset => (
      preset.name !== replacedName
      && preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase()
    ))
    candidate.appearance.userThemePresets[themeId] = [...kept.slice(-31), { name, definition }]
  }

  /** 把一套预设的配色、角度与字体应用到候选设置上，同时记住选中的是哪一条。 */
  function applyThemePresetTo(candidate: AppSettings, themeId: OcThemeId, presetId: string): boolean {
    const preset = getThemePreset(themeId, presetId, candidate.appearance.userThemePresets[themeId])
    if (!preset) return false
    candidate.appearance.themeOverrides[themeId] = presetId === 'default' ? {} : { ...preset.colors }
    candidate.appearance.accentNeighborAngles[themeId] = preset.accentNeighborAngle
    candidate.appearance.fontFamilies[themeId] = preset.fontFamily
    candidate.appearance.themePresetIds[themeId] = presetId
    return true
  }

  function applyThemePreset(themeId: OcThemeId, presetId: string): void {
    const candidate = normalizeAppSettings(settings.value)
    if (applyThemePresetTo(candidate, themeId, presetId)) commit(candidate)
  }

  /** 手改过配色、角度或字体之后，这套主题不再等于它原来的预设，选中项回落到"自定义"。 */
  function forgetThemePresetIdIfChanged(candidate: AppSettings, themeId: OcThemeId): void {
    const presetId = candidate.appearance.themePresetIds[themeId]
    if (!presetId) return
    const preset = getThemePreset(themeId, presetId, candidate.appearance.userThemePresets[themeId])
    if (!preset || !isSameThemeDefinition(preset, resolveThemeDefinition(
      themeId,
      candidate.appearance.themeOverrides[themeId],
      candidate.appearance.accentNeighborAngles[themeId],
      candidate.appearance.fontFamilies[themeId],
    ))) {
      candidate.appearance.themePresetIds[themeId] = ''
    }
  }

  function isSameThemeDefinition(left: AppThemeDefinition, right: AppThemeDefinition): boolean {
    return OC_EDITABLE_THEME_COLOR_KEYS.every(token => (
      left.colors[token].toUpperCase() === right.colors[token].toUpperCase()
    ))
      && left.accentNeighborAngle === right.accentNeighborAngle
      && left.fontFamily === right.fontFamily
  }

  /** 已有完全同款的预设时找出它：导入这种主题不该再新增一条重复的。 */
  function findIdenticalThemePresetId(
    candidate: AppSettings,
    themeId: OcThemeId,
    definition: AppThemeDefinition,
  ): string {
    for (const presetId of APP_THEME_PRESETS[themeId]) {
      const preset = getThemePreset(themeId, presetId)
      if (preset && isSameThemeDefinition(preset, definition)) return presetId
    }
    const userPreset = candidate.appearance.userThemePresets[themeId]
      .find(preset => isSameThemeDefinition(preset.definition, definition))
    return userPreset ? `user:${userPreset.name}` : ''
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
    const identicalId = findIdenticalThemePresetId(candidate, themeId, definition)
    if (identicalId) {
      if (applyThemePresetTo(candidate, themeId, identicalId)) commit(candidate)
      return false
    }
    const presetName = uniqueThemePresetName(name.trim(), candidate.appearance.userThemePresets[themeId])
    writeUserThemePreset(candidate, themeId, presetName, definition)
    candidate.appearance.themeOverrides[themeId] = { ...definition.colors }
    candidate.appearance.accentNeighborAngles[themeId] = definition.accentNeighborAngle
    candidate.appearance.fontFamilies[themeId] = definition.fontFamily
    candidate.appearance.themePresetIds[themeId] = `user:${presetName}`
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
    const appearance = candidate.appearance
    const presetId = appearance.themePresetIds[themeId]
    const replacedName = presetId.startsWith('user:') ? presetId.slice('user:'.length) : ''
    if (replacedName === trimmed) return
    writeUserThemePreset(candidate, themeId, trimmed, resolveThemeDefinition(
      themeId,
      appearance.themeOverrides[themeId],
      appearance.accentNeighborAngles[themeId],
      appearance.fontFamilies[themeId],
    ), replacedName)
    appearance.themePresetIds[themeId] = `user:${trimmed}`
    commit(candidate)
  }

  function deleteThemePreset(themeId: OcThemeId, presetId: string): void {
    if (!presetId.startsWith('user:')) return
    const name = presetId.slice('user:'.length)
    const candidate = normalizeAppSettings(settings.value)
    candidate.appearance.userThemePresets[themeId] = candidate.appearance.userThemePresets[themeId]
      .filter(preset => preset.name !== name)
    if (candidate.appearance.themePresetIds[themeId] === presetId) {
      candidate.appearance.themePresetIds[themeId] = ''
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

  return {
    settings: readonly(settings),
    isReady: readonly(isReady),
    error: readonly(error),
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
    updateShell,
    updateProjectCreation,
    rememberRecentProject,
    forgetRecentProject,
    resetSection,
    resetAll,
    flush,
  }
}

const appSettingsStore = createAppSettingsStore()

export function useAppSettingsStore(): AppSettingsStore {
  return appSettingsStore
}
