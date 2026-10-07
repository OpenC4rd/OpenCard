import { computed, ref, shallowRef } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import packageMetadata from '../../../../package.json'
import bundledReleaseNotes from '../../../../RELEASE_NOTES.md?raw'
import { notifyAppError } from '../../notifications/titlebarNotices'
import { reportAppError } from '../../logging/appErrorCatalog'
import {
  createUpdateStatePersistence,
  type CurrentReleaseNotes,
  type ReleaseNotesSnapshot,
  type UpdateStateDocument,
  type UpdateStatePersistence,
} from './updateStatePersistence'

const PROGRESS_UPDATE_INTERVAL = 120
const DEVELOPER_PREVIEW_INTERVAL = 140

type AppUpdaterOptions = {
  persistence?: UpdateStatePersistence
  currentRelease?: ReleaseNotesSnapshot
  now?: () => string
}

export type AppUpdateCheckResult = 'available' | 'up-to-date' | 'failed' | 'skipped'

export function useAppUpdater(options: AppUpdaterOptions = {}) {
  const persistence = options.persistence ?? createUpdateStatePersistence()
  const bundledCurrentRelease = options.currentRelease ?? {
    version: packageMetadata.version,
    body: bundledReleaseNotes.trim(),
    publishedAt: null,
  }
  const now = options.now ?? (() => new Date().toISOString())
  const availableUpdate = shallowRef<Update | null>(null)
  const currentReleaseNotes = shallowRef<CurrentReleaseNotes | null>(null)
  const updateState = shallowRef<UpdateStateDocument>({ current: null, pending: null })
  const isChecking = ref(false)
  const isDownloading = ref(false)
  const isDownloaded = ref(false)
  const isInstalling = ref(false)
  const downloadProgress = ref<number | null>(null)
  const developerPreviewProgress = ref<number | null>(null)
  let progressTimer: ReturnType<typeof setTimeout> | null = null
  let developerPreviewTimer: ReturnType<typeof setInterval> | null = null
  let pendingProgress: number | null = null
  let lastProgressUpdate = 0
  let initializePromise: Promise<void> | null = null
  let disposed = false

  const updateVersion = computed(() => availableUpdate.value?.version ?? '')
  const availableReleaseNotes = computed<ReleaseNotesSnapshot | null>(() => {
    const update = availableUpdate.value
    if (!update) return null
    return {
      version: update.version,
      body: update.body?.trim() ?? '',
      publishedAt: update.date ?? null,
    }
  })
  const hasUnseenCurrentReleaseNotes = computed(() => (
    Boolean(currentReleaseNotes.value?.body) && currentReleaseNotes.value?.seenAt === null
  ))
  const isDeveloperPreviewDownloading = computed(() => (
    developerPreviewProgress.value !== null && developerPreviewProgress.value < 1
  ))
  const isDeveloperPreviewDownloaded = computed(() => developerPreviewProgress.value === 1)

  function parseReleaseNotes(value: unknown): ReleaseNotesSnapshot | null {
    if (!value || typeof value !== 'object') return null
    const record = value as Partial<ReleaseNotesSnapshot>
    if (typeof record.version !== 'string' || typeof record.body !== 'string') return null
    return {
      version: record.version,
      body: record.body,
      publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : null,
    }
  }

  function parseCurrentReleaseNotes(value: unknown): CurrentReleaseNotes | null {
    const release = parseReleaseNotes(value)
    if (!release || !value || typeof value !== 'object') return null
    const seenAt = (value as Partial<CurrentReleaseNotes>).seenAt
    return {
      ...release,
      seenAt: typeof seenAt === 'string' ? seenAt : null,
    }
  }

  function parseUpdateState(value: unknown): UpdateStateDocument {
    if (!value || typeof value !== 'object') return { current: null, pending: null }
    const state = value as Partial<UpdateStateDocument>
    return {
      current: parseCurrentReleaseNotes(state.current),
      pending: parseReleaseNotes(state.pending),
    }
  }

  async function initialize(): Promise<void> {
    initializePromise ??= (async () => {
      let stored = { current: null, pending: null } as UpdateStateDocument
      try {
        stored = parseUpdateState(await persistence.load())
      } catch (error) {
        console.warn('读取更新说明状态失败:', error)
      }

      const promotedPending = stored.pending?.version === bundledCurrentRelease.version
        ? stored.pending
        : null
      const matchingCurrent = stored.current?.version === bundledCurrentRelease.version
        ? stored.current
        : null
      const source = promotedPending ?? matchingCurrent ?? bundledCurrentRelease
      const current: CurrentReleaseNotes = {
        ...source,
        body: source.body || bundledCurrentRelease.body,
        seenAt: promotedPending ? null : matchingCurrent?.seenAt ?? null,
      }
      const pending = promotedPending ? null : stored.pending
      updateState.value = { current, pending }
      currentReleaseNotes.value = current
      try {
        await persistence.save(updateState.value)
      } catch (error) {
        console.warn('保存更新说明状态失败:', error)
      }
    })()
    await initializePromise
  }

  async function savePendingReleaseNotes(release: ReleaseNotesSnapshot | null): Promise<void> {
    if (!release) return
    updateState.value = { ...updateState.value, pending: release }
    try {
      await persistence.save(updateState.value)
    } catch (error) {
      console.warn('缓存待安装版本更新说明失败:', error)
    }
  }

  async function markCurrentReleaseNotesSeen(): Promise<void> {
    const current = currentReleaseNotes.value
    if (!current || current.seenAt !== null) return
    const seen = { ...current, seenAt: now() }
    currentReleaseNotes.value = seen
    updateState.value = { ...updateState.value, current: seen }
    try {
      await persistence.save(updateState.value)
    } catch (error) {
      console.warn('保存更新说明已读状态失败:', error)
    }
  }

  function clearProgressTimer(): void {
    if (progressTimer !== null) clearTimeout(progressTimer)
    progressTimer = null
    pendingProgress = null
  }

  function updateProgress(value: number, immediate = false): void {
    pendingProgress = value
    const elapsed = Date.now() - lastProgressUpdate
    if (immediate || elapsed >= PROGRESS_UPDATE_INTERVAL) {
      clearProgressTimer()
      downloadProgress.value = value
      lastProgressUpdate = Date.now()
      return
    }
    if (progressTimer !== null) return
    progressTimer = setTimeout(() => {
      progressTimer = null
      if (pendingProgress !== null) downloadProgress.value = pendingProgress
      pendingProgress = null
      lastProgressUpdate = Date.now()
    }, PROGRESS_UPDATE_INTERVAL - elapsed)
  }

  async function checkForUpdate(): Promise<AppUpdateCheckResult> {
    if (disposed || !isTauri() || isChecking.value || isDownloading.value || isDownloaded.value || isInstalling.value) {
      return 'skipped'
    }

    isChecking.value = true
    try {
      await initialize()
      if (disposed) return 'skipped'
      const update = await check()
      if (disposed) { await update?.close(); return 'skipped' }
      availableUpdate.value = update
      await savePendingReleaseNotes(availableReleaseNotes.value)
      return availableUpdate.value ? 'available' : 'up-to-date'
    } catch (error) {
      reportAppError('OC-E6001', error)
      return 'failed'
    } finally {
      isChecking.value = false
    }
  }

  async function downloadAvailableUpdate(): Promise<void> {
    const update = availableUpdate.value
    if (!update || isDownloading.value || isDownloaded.value || isInstalling.value) return

    isDownloading.value = true
    updateProgress(0, true)
    let contentLength = 0
    let downloadedBytes = 0
    try {
      await update.download((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0
          downloadedBytes = 0
          updateProgress(0, true)
          return
        }
        if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          if (contentLength > 0) {
            updateProgress(Math.min(downloadedBytes / contentLength, 0.99))
          }
          return
        }
        updateProgress(1, true)
      })
      updateProgress(1, true)
      isDownloaded.value = true
    } catch (error) {
      notifyAppError('OC-E6001', error)
      clearProgressTimer()
      downloadProgress.value = null
    } finally {
      isDownloading.value = false
    }
  }

  async function installDownloadedUpdate(): Promise<void> {
    const update = availableUpdate.value
    if (!update || !isDownloaded.value || isDownloading.value || isInstalling.value) return

    isInstalling.value = true
    try {
      await update.install()
      await relaunch()
    } catch (error) {
      notifyAppError('OC-E6001', error)
      isInstalling.value = false
      throw error
    }
  }

  function stopDeveloperPreview(): void {
    if (developerPreviewTimer !== null) clearInterval(developerPreviewTimer)
    developerPreviewTimer = null
    developerPreviewProgress.value = null
  }

  function startDeveloperPreview(): void {
    if (isDeveloperPreviewDownloading.value || isDeveloperPreviewDownloaded.value) return
    stopDeveloperPreview()
    developerPreviewProgress.value = 0
    developerPreviewTimer = setInterval(() => {
      const nextProgress = Math.min(1, (developerPreviewProgress.value ?? 0) + 0.04)
      developerPreviewProgress.value = nextProgress
      if (nextProgress >= 1 && developerPreviewTimer !== null) {
        clearInterval(developerPreviewTimer)
        developerPreviewTimer = null
      }
    }, DEVELOPER_PREVIEW_INTERVAL)
  }

  function dispose(): void {
    disposed = true
    clearProgressTimer()
    stopDeveloperPreview()
    if (!isDownloading.value && !isInstalling.value) {
      void availableUpdate.value?.close()
    }
  }

  return {
    availableUpdate,
    updateVersion,
    availableReleaseNotes,
    currentReleaseNotes,
    hasUnseenCurrentReleaseNotes,
    isChecking,
    isDownloading,
    isDownloaded,
    isInstalling,
    downloadProgress,
    developerPreviewProgress,
    isDeveloperPreviewDownloading,
    isDeveloperPreviewDownloaded,
    initialize,
    checkForUpdate,
    markCurrentReleaseNotesSeen,
    downloadAvailableUpdate,
    installDownloadedUpdate,
    startDeveloperPreview,
    stopDeveloperPreview,
    dispose,
  }
}
