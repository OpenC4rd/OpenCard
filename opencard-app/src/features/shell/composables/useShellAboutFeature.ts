import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FeedbackKind, FeedbackPage } from '../../feedback/model/feedback'
import { useFeedbackDiagnostics } from '../../feedback/composables/useFeedbackDiagnostics'
import { useFeedbackInbox } from '../../feedback/composables/useFeedbackInbox'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import { notifyWarning } from '../../notifications/titlebarNotices'
import type { ShellTitleBarAppAction } from '../shell.types'
import { useAppUpdater } from './useAppUpdater'
import { useShellProgressTasks } from './useShellProgressTasks'

export function useShellAboutFeature(options: {
  isAboutMode: Readonly<Ref<boolean>>
  requestInstall: () => Promise<void>
}) {
  const { t, locale } = useI18n()
  const settingsStore = useAppSettingsStore()
  const isAboutMode = options.isAboutMode
  const developerMode = ref(false)
  const { setTask: setShellProgressTask, removeTask: removeShellProgressTask } = useShellProgressTasks()
  const UPDATE_PROGRESS_TASK_KEY = 'app-update'
  const {
    availableUpdate,
    updateVersion,
    availableReleaseNotes,
    currentReleaseNotes,
    hasUnseenCurrentReleaseNotes,
    isChecking: isCheckingForUpdate,
    isDownloading: isDownloadingUpdate,
    isDownloaded: isUpdateDownloaded,
    isInstalling: isInstallingUpdate,
    downloadProgress: updateDownloadProgress,
    developerPreviewProgress: developerUpdateProgress,
    isDeveloperPreviewDownloading,
    isDeveloperPreviewDownloaded,
    initialize: initializeAppUpdater,
    checkForUpdate,
    markCurrentReleaseNotesSeen,
    downloadAvailableUpdate,
    installDownloadedUpdate,
    startDeveloperPreview: startDeveloperUpdatePreview,
    stopDeveloperPreview: stopDeveloperUpdatePreview,
    dispose: disposeAppUpdater,
  } = useAppUpdater()

  const releaseNotesDialogMode = ref<'current' | 'available' | null>(null)
  const feedbackDialogKind = ref<FeedbackKind>('suggestion')
  const feedbackCenterPage = ref<FeedbackPage | null>(null)
  const { latestDiagnostics: latestFeedbackDiagnostics } = useFeedbackDiagnostics()
  const {
    unreadReplyCount: unreadFeedbackReplyCount,
    start: startFeedbackInbox,
    dispose: disposeFeedbackInbox,
  } = useFeedbackInbox()

  function openFeedbackCenter(page: FeedbackPage, kind: FeedbackKind = 'suggestion'): void {
    feedbackDialogKind.value = kind
    feedbackCenterPage.value = page
  }
  const displayedReleaseNotes = computed(() => (
    releaseNotesDialogMode.value === 'available'
      ? availableReleaseNotes.value
      : currentReleaseNotes.value
  ))

  watch(
    [hasUnseenCurrentReleaseNotes, () => settingsStore.settings.value.updates.showReleaseNotesAfterUpdate],
    ([unseen, showReleaseNotes]) => {
      if (unseen && showReleaseNotes && releaseNotesDialogMode.value === null) {
        releaseNotesDialogMode.value = 'current'
      }
    },
  )

  watch([isAboutMode, currentReleaseNotes], ([aboutMode, release]) => {
    if (aboutMode && release?.seenAt === null) void markCurrentReleaseNotesSeen()
  })

  const updateOperationTask = computed<{
    phase: 'downloading' | 'waiting-install' | 'installing'
    progress: number
  } | null>(() => {
    const isPreview = import.meta.env.DEV && developerMode.value && !availableUpdate.value
    if (!availableUpdate.value && !isPreview) return null
    if (isInstallingUpdate.value) return { phase: 'installing', progress: 0 }
    if (availableUpdate.value) {
      if (isDownloadingUpdate.value) {
        return { phase: 'downloading', progress: updateDownloadProgress.value ?? 0 }
      }
      return isUpdateDownloaded.value ? { phase: 'waiting-install', progress: 0 } : null
    }
    if (isDeveloperPreviewDownloading.value) {
      return { phase: 'downloading', progress: developerUpdateProgress.value ?? 0 }
    }
    return isDeveloperPreviewDownloaded.value ? { phase: 'waiting-install', progress: 0 } : null
  })

  const updateOperationProgress = computed(() => updateOperationTask.value?.progress ?? null)

  watch([updateOperationTask, locale], ([task]) => {
    if (!task) {
      removeShellProgressTask(UPDATE_PROGRESS_TASK_KEY)
      return
    }
    setShellProgressTask({
      key: UPDATE_PROGRESS_TASK_KEY,
      title: t(`app.updater.${task.phase === 'waiting-install' ? 'waitingInstall' : task.phase}`),
      progress: task.progress,
      weight: 1,
      active: task.phase !== 'waiting-install',
    })
  }, { immediate: true })

  const titleBarAppActions = computed<ShellTitleBarAppAction[]>(() => {
    const isPreview = import.meta.env.DEV && developerMode.value && !availableUpdate.value
    if (!availableUpdate.value && !isPreview) return []

    const progress = updateOperationProgress.value
    const disabled = availableUpdate.value
      ? isDownloadingUpdate.value || isInstallingUpdate.value
      : isDeveloperPreviewDownloading.value
    const downloaded = availableUpdate.value
      ? isUpdateDownloaded.value
      : isDeveloperPreviewDownloaded.value

    return [{
      key: 'install-update',
      icon: downloaded ? 'action.restart' : 'action.download',
      disabled,
      hoverTip: downloaded
        ? isPreview
          ? t('app.updater.previewInstall')
          : t('app.updater.installVersion', { version: updateVersion.value })
        : progress !== null
          ? t('app.updater.downloadingProgress', { progress: Math.round(progress * 100) })
          : isPreview
            ? t('app.updater.previewAvailable')
            : t('app.updater.available', { version: updateVersion.value }),
    }]
  })

  async function closeReleaseNotesDialog(): Promise<void> {
    if (releaseNotesDialogMode.value === 'current') {
      await markCurrentReleaseNotesSeen()
    }
    releaseNotesDialogMode.value = null
  }

  async function handleAvailableReleaseAction(): Promise<void> {
    if (!availableUpdate.value) return
    releaseNotesDialogMode.value = null
    if (isUpdateDownloaded.value) {
      await options.requestInstall()
      return
    }
    await downloadAvailableUpdate()
  }

  async function handleTitleBarAppAction(actionKey: string): Promise<void> {
    if (actionKey !== 'install-update') return
    if (availableUpdate.value) {
      if (isUpdateDownloaded.value) {
        await options.requestInstall()
        return
      }
      await downloadAvailableUpdate()
      return
    }
    if (import.meta.env.DEV && developerMode.value) {
      if (isDeveloperPreviewDownloaded.value) {
        await options.requestInstall()
        return
      }
      startDeveloperUpdatePreview()
    }
  }

  async function startAppUpdater(): Promise<void> {
    await initializeAppUpdater()
    const result = await checkForUpdate()
    if (result === 'failed') notifyWarning(t('app.updater.checkFailed'))
  }

  onMounted(() => { void startAppUpdater(); void startFeedbackInbox() })
  onUnmounted(() => { removeShellProgressTask(UPDATE_PROGRESS_TASK_KEY); disposeAppUpdater(); disposeFeedbackInbox() })
  return { availableUpdate, updateVersion, currentReleaseNotes, isCheckingForUpdate, isDownloadingUpdate, isUpdateDownloaded, isInstallingUpdate, checkForUpdate, installDownloadedUpdate, stopDeveloperUpdatePreview, isDeveloperPreviewDownloaded, developerMode, releaseNotesDialogMode, feedbackDialogKind, feedbackCenterPage, latestFeedbackDiagnostics, unreadFeedbackReplyCount, openFeedbackCenter, displayedReleaseNotes, closeReleaseNotesDialog, handleAvailableReleaseAction, handleTitleBarAppAction, titleBarAppActions }
}
