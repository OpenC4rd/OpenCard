<!-- Fixed application frame. Pages supply view models and own their page content. -->
<template>
  <main class="shell-root open-card-shell">
    <ShellTitleBar
      :collapsed="effectiveSidebarCollapsed"
      :brand-label="titleBarBrandLabel"
      :menu-groups="titleBarMenus"
      :app-actions="titleBarAppActions"
      :tasks="titleBarTasks"
      :window-controls="windowControls"
      :native-macos-controls="usesNativeMacosWindowControls"
      :collapse-tooltip="t('app.shell.collapseSidebar')"
      :expand-tooltip="t('app.shell.expandSidebar')"
      :cancel-task-label="t('app.shell.cancelTask')"
      :drag-region="!isWindowFullscreen"
      @toggle-sidebar="toggleSidebarCollapsed"
      @app-action="app.services.handleTitleBarAppAction"
      @window-control="handleWindowControl"
      @cancel-task="cancelShellProgressTask"
    />

    <div
      class="shell-main"
      :class="{
        'shell-main-collapsed': effectiveSidebarCollapsed,
        'shell-main-resizing': sidebarResizeActive && !sidebarResizeToggleAnimating,
      }"
      :style="shellMainStyle"
      @transitionend="handleSidebarTransitionEnd"
    >
      <ShellSpaceRail
        data-oc-tutorial="shell.navigation"
        :active-space="activeSpace"
        :spaces="shellSpaces"
        :label="t('app.shell.space.navigation')"
        :translate="t"
        @select="handleSpaceSelect"
      />
      <ShellSidebar
        data-oc-tutorial="shell.sidebar"
        :collapsed="effectiveSidebarCollapsed"
        :width="sidebarWidth"
        :body-group="currentPage.sidebar.value[0]"
        :min-resize-width="SHELL_SIDEBAR_COLLAPSE_THRESHOLD"
        :max-resize-width="MAX_SIDEBAR_WIDTH"
        :compact-group-width="MIN_SIDEBAR_WIDTH"
        :persisted-layout="sidebarPersistedLayout"
        :resize-toggle-animating="sidebarResizeToggleAnimating"
        :resize-label="t('app.shell.resizeSidebar')"
        :list-resize-label="t('app.shell.resizeSidebarLists')"
        @resize-start="handleSidebarResizeStart"
        @resize="handleSidebarResize"
        @resize-end="handleSidebarResizeEnd"
        @layout-change="handleSidebarLayoutChange"
      />

      <ShellPageFrame
        :header="currentPage.header.value"
        lock-body-scroll
        flush-body
      >
        <div
          ref="pageStackRef"
          class="open-card-shell__page-stack"
          :class="{ 'is-bottom-panel-expanded': isBottomPanelVisible }"
        >
          <div class="open-card-shell__page-content" data-oc-tutorial="shell.content">
            <component :is="currentPage.content" :key="currentPage.contentKey ?? currentPage.key" v-bind="currentPage.contentProps.value" />
          </div>
          <div
            v-if="isBottomPanelResizing"
            class="open-card-shell__bottom-panel-resize-preview"
            :style="{ bottom: `${bottomPanelPreviewHeight}px` }"
          >
            <span>{{ bottomPanelPreviewPercentage }}%</span>
          </div>
          <ShellBottomPanel
            data-oc-tutorial="shell.bottom-panel"
            :style="{ '--shell-bottom-panel-height': `${bottomPanelHeight}px` }"
            :resizing="isBottomPanelResizing"
            :expanded="isBottomPanelVisible"
            :active-tab="activeBottomTab"
            :issue-count="problems.count"
            :issue-severity="problems.severity"
            :issue-tree-data="problems.treeData"
            :expanded-issue-keys="problems.expandedKeys"
            :output-entries="appOutputEntries"
            :issues-label="t('app.problems.tab')"
            :output-label="t('app.problems.outputTab')"
            :issue-empty-label="t('app.problems.empty')"
            :issue-filter-label="t('app.problems.filter')"
            :output-empty-label="t('app.problems.outputEmpty')"
            :output-filter-empty-label="t('app.problems.outputFilterEmpty')"
            :output-clear-label="t('app.problems.clearOutput')"
            :output-copy-label="t('app.problems.copyOutput')"
            :output-locale="locale"
            :output-severity-filter-label="t('app.problems.severityFilter')"
            :output-severity-labels="{
              info: t('app.problems.severities.info'),
              success: t('app.problems.severities.success'),
              warning: t('app.problems.severities.warning'),
              error: t('app.problems.severities.error'),
            }"
            :expand-label="t('app.shell.expandBottomPanel')"
            :collapse-label="t('app.shell.collapseBottomPanel')"
            :pin-label="t('app.shell.pinBottomPanel')"
            :unpin-label="t('app.shell.unpinBottomPanel')"
            @expanded-change="isBottomPanelExpanded = $event"
            @tab-change="activeBottomTab = $event"
            @issue-expansion-change="problems.setExpanded"
            @issue-navigate="problems.activate"
            @issue-copy="problems.copy"
            @output-clear="clearAppOutputEntries"
          >
            <template #leading>
              <OcResizeTrack v-if="isBottomPanelVisible" class="open-card-shell__bottom-panel-resizer" edge="top" placement="inside"
                direction="reverse" :value="bottomPanelHeight" :minimum="bottomPanelMinimum" :maximum="bottomPanelMaximum"
                :label="t('app.shell.resizeBottomPanel')" @focusin="measureBottomPanel"
                @resize-start="handleBottomPanelResizeStart" @update:value="resizeBottomPanel"
                @resize-end="finishBottomPanelResize(true)" @resize-cancel="finishBottomPanelResize(false)" />
            </template>
          </ShellBottomPanel>
        </div>
      </ShellPageFrame>
    </div>

    <component v-for="page in overlayPages" :key="page.key" :is="page.overlays" v-bind="page.overlayProps?.value" />
    <ShellOverlayHost v-bind="app.globalOverlayProps.value" :is-external-file-drag-active="isExternalFileDragActive"
      :is-external-file-drag-over-zone="isExternalFileDragOverZone" />
    <OcTutorial :session="tutorial.session.value" @exit="tutorial.exit"
      @complete="tutorial.completeStep($event.tutorialId, $event.stepId, $event.run)" />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import OcResizeTrack from '../../components/standard/OcResizeTrack.vue'
import { useI18n } from 'vue-i18n'
import { appLocaleLanguageTag } from '../../i18n/appLocale'
import { notifyError, setTitleBarNoticeHistoryLimit } from '../notifications/titlebarNotices'
import { useAppSettingsStore } from '../settings/store/appSettingsStore'
import { useProjectStore } from '../workspace/store/projectStore'
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from '../app-state/model/appState'
import { useAppStateStore } from '../app-state/store/appStateStore'
import { registerUnhandledExternalDrop, useExternalFileDrop } from '../../shared/ui/drop/externalFileDrop'
import { appOutputEntries, clearAppOutputEntries } from '../logging/appOutput'
import ShellBottomPanel, { type ShellBottomPanelTab } from './components/ShellBottomPanel.vue'
import ShellOverlayHost from './components/ShellOverlayHost.vue'
import ShellSidebar from './components/ShellSidebar.vue'
import ShellTitleBar from './components/ShellTitleBar.vue'
import ShellSpaceRail from './components/ShellSpaceRail.vue'
import ShellPageFrame from './components/ShellPageFrame.vue'
import { useShellWindow } from './composables/useShellWindow'
import { useShellNavigation } from './composables/useShellNavigation'
import { useShellSidebarLayout } from './composables/useShellSidebarLayout'
import { useShellBottomPanelLayout } from './composables/useShellBottomPanelLayout'
import { useShellProgressTasks } from './composables/useShellProgressTasks'
import { initializeAppPages } from './composables/useAppPages'
import OcTutorial from '../../components/standard/OcTutorial.vue'
import { useTutorialStore } from '../tutorials/tutorialStore'
import { useAppProjectActions } from './services/appProjectActions'
import { createShellTitleBarMenus } from './composables/useShellTitleBarMenus'
import { EMPTY_PAGE_PROBLEMS } from './spacePage'
import type { ShellTitleBarWindowControl } from './shell.types'
import { SHELL_SIDEBAR_COLLAPSE_THRESHOLD } from './shellSidebarConfig'
const { t, locale } = useI18n()
const settingsStore = useAppSettingsStore()
const { projectPath } = useProjectStore()
const { activeSpace, selectSpace: handleSpaceSelect } = useShellNavigation()
const usesNativeMacosWindowControls = /Macintosh|Mac OS X/.test(navigator.userAgent)
const {
  viewportWidth, isFullscreen: isWindowFullscreen, isMaximized: isWindowMaximized,
  toggleFullscreen: toggleWindowFullscreen, minimize: minimizeWindow, toggleMaximize: toggleWindowMaximize,
  requestClose: requestWindowClose, destroy: destroyWindow, start: startShellWindow, dispose: disposeShellWindow,
} = useShellWindow({
  requestApplicationClose: async () => { await useAppProjectActions().closeApplication() },
  handleExternalOpenPaths: paths => app.application.handleExternalOpenPaths(paths),
  notifyWindowControlError: () => notifyError(t('app.notifications.windowControlFailed')),
})
const app = initializeAppPages(destroyWindow)
const tutorial = useTutorialStore()
const tutorialTargets = computed(() => tutorial.session.value?.step.targets.map(target => target.key) ?? [])
onUnmounted(tutorial.exit)
const { currentPage, spaces: shellSpaces } = app
const overlayPages = Object.values(app.pages).filter(page => page.overlays)
const problems = computed(() => currentPage.value.bottomPanel?.value ?? EMPTY_PAGE_PROBLEMS)
const { tasks: titleBarTasks, cancelTask: cancelShellProgressTask } = useShellProgressTasks()
const titleBarAppActions = app.services.titleBarAppActions
const titleBarBrandLabel = computed(() => {
  if (!titleBarTasks.value.length) return 'OPENCARD'
  const active = titleBarTasks.value.filter(task => task.active !== false)
  const tasks = active.length ? active : titleBarTasks.value
  return tasks.length === 1 ? tasks[0]!.title : t('app.shell.activeTasks', { count: tasks.length })
})
watch(() => settingsStore.settings.value.shell.titleBarNoticeHistoryLimit, setTitleBarNoticeHistoryLimit, { immediate: true })
watch(locale, value => { document.documentElement.lang = appLocaleLanguageTag(value) }, { immediate: true })
const pageStackRef = ref<HTMLElement | null>(null)
const { isExpanded: isBottomPanelExpanded, height: bottomPanelHeight, previewHeight: bottomPanelPreviewHeight,
  isResizing: isBottomPanelResizing, previewPercentage: bottomPanelPreviewPercentage, startResize: handleBottomPanelResizeStart,
  minimum: bottomPanelMinimum, maximum: bottomPanelMaximum, measure: measureBottomPanel,
  resize: resizeBottomPanel, finishResize: finishBottomPanelResize,
} = useShellBottomPanelLayout(pageStackRef)
const isBottomPanelVisible = computed(() => isBottomPanelExpanded.value
  || tutorialTargets.value.includes('shell.bottom-panel'))
const activeBottomTab = ref<ShellBottomPanelTab>('issues')
const {
  sidebarCollapsed,
  sidebarWidth,
  effectiveSidebarCollapsed: layoutSidebarCollapsed,
  sidebarResizeActive,
  sidebarResizeToggleAnimating,
  sidebarPersistedLayout,
  toggleSidebarCollapsed,
  handleSidebarResizeStart,
  handleSidebarResizeEnd,
  handleSidebarTransitionEnd,
  handleSidebarResize,
  handleSidebarLayoutChange,
} = useShellSidebarLayout({
  state: useAppStateStore(),
  persistenceKey: computed(() => currentPage.value.sidebarLayout?.persistenceKey.value ?? ''),
  viewportWidth,
  expandOnNarrowViewport: computed(() => currentPage.value.sidebarLayout?.expandOnNarrowViewport ?? false),
})
// 介绍时临时展示侧栏，结束后恢复原有布局，不改写用户的折叠记录。
const effectiveSidebarCollapsed = computed(() => tutorialTargets.value.includes('shell.sidebar') ? false : layoutSidebarCollapsed.value)
const shellMainStyle = computed(() => ({
  '--shell-sidebar-width': effectiveSidebarCollapsed.value ? '0px' : `${sidebarWidth.value}px`,
}))

const windowControls = computed<ShellTitleBarWindowControl[]>(() => [
  {
    key: 'toggle-fullscreen',
    icon: isWindowFullscreen.value ? 'window.fullscreen-exit' : 'window.fullscreen',
    group: 'app',
    hoverTip: isWindowFullscreen.value
      ? t('app.shell.exitFullscreen')
      : t('app.shell.enterFullscreen'),
  },
  ...(!usesNativeMacosWindowControls ? [
    { key: 'minimize', icon: 'window.minimize', group: 'window', hoverTip: t('app.shell.minimize') },
    {
      key: 'toggle-maximize',
      icon: isWindowMaximized.value ? 'window.restore' : 'window.maximize',
      group: 'window',
      hoverTip: isWindowMaximized.value ? t('app.shell.restore') : t('app.shell.maximize'),
    },
    { key: 'close', icon: 'action.close', group: 'window', hoverTip: t('app.shell.close'), danger: true },
  ] satisfies ShellTitleBarWindowControl[] : []),
])

const primaryShortcutParts = (key: string, shift = false): readonly string[] => usesNativeMacosWindowControls
  ? [...(shift ? ['⇧'] : []), '⌘', key.toUpperCase()] : ['Ctrl', ...(shift ? ['Shift'] : []), key.toUpperCase()]
const titleBarMenus = computed(() => createShellTitleBarMenus({
  onAction: runShellCommand, translate: t, projectPath: projectPath.value, contributions: app.menuContribution.value,
  sidebarCollapsed: sidebarCollapsed.value, bottomPanelExpanded: isBottomPanelExpanded.value, windowFullscreen: isWindowFullscreen.value,
  unreadFeedbackReplyCount: app.services.unreadFeedbackReplyCount.value, checkingForUpdate: app.services.isCheckingForUpdate.value,
  downloadingUpdate: app.services.isDownloadingUpdate.value, updateDownloaded: app.services.isUpdateDownloaded.value,
  installingUpdate: app.services.isInstallingUpdate.value, developerMode: app.services.developerMode.value,
  shortcuts: { newProject: primaryShortcutParts('n'), fullscreen: ['F11'] },
}))
async function runShellCommand(key: string): Promise<void> {
  if (await app.application.runCommand(key)) return
  switch (key) {
    case 'toggle-sidebar': toggleSidebarCollapsed(); return
    case 'toggle-bottom-panel': isBottomPanelExpanded.value = !isBottomPanelExpanded.value; return
    case 'toggle-fullscreen': await toggleWindowFullscreen(); return
  }
}
async function handleGlobalKeydown(event: KeyboardEvent): Promise<void> {
  if (event.defaultPrevented || event.isComposing) return
  if (event.key === 'F11') {
    event.preventDefault()
    if (!event.repeat) await toggleWindowFullscreen()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    await runShellCommand(event.shiftKey ? 'new-open-card' : 'new-project')
    return
  }
  if (!app.application.busy.value) await currentPage.value.handleKeydown?.(event)
}
const onGlobalKeydown = (event: KeyboardEvent) => { void handleGlobalKeydown(event).catch(error => notifyError(String(error))) }
async function handleWindowControl(actionKey: string) {
  try {
    if (actionKey === 'close') {
      await requestWindowClose()
      return
    }

    if (actionKey === 'minimize') {
      await minimizeWindow()
      return
    }

    if (actionKey === 'toggle-fullscreen') {
      await toggleWindowFullscreen()
      return
    }

    if (actionKey === 'toggle-maximize') {
      await toggleWindowMaximize()
      return
    }

  } catch {
    notifyError(t('app.notifications.windowControlFailed'))
  }
}

const { isOpenableDragActive: isExternalFileDragActive, isOverZone: isExternalFileDragOverZone } = useExternalFileDrop()
let disposeUnhandledExternalDrop: (() => void) | null = null
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  disposeUnhandledExternalDrop = registerUnhandledExternalDrop(paths => { void app.application.handleExternalOpenPaths(paths) })
  void startShellWindow()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  disposeUnhandledExternalDrop?.()
  disposeShellWindow()
})
</script>
