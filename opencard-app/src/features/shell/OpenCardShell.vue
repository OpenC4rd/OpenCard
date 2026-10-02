<!--
  使用说明：
  - 作为 OpenCard 壳层页面挂载项目树 编辑器区 问题面板与导出入口
  - 依赖 workspace store 与 editor session store 提供真相状态

  职责边界：
  - 负责页面布局 编排与交互意图转发
  - 不沉淀文件系统规则与会话生命周期规则

  主要输出事件：
  - 无 页面组件通过内部编排调用 store/composable
-->
<template>
  <main class="shell-root open-card-shell">
    <ShellTitleBar
      :collapsed="effectiveSidebarCollapsed"
      :brand-label="titleBarBrandLabel"
      brand-logo-src="/opencard-logo.png"
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
      @menu-action="handleTitleBarMenuAction"
      @app-action="handleTitleBarAppAction"
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
        :active-space="activeSpace"
        :spaces="shellSpaces"
        :label="t('app.shell.space.navigation')"
        :translate="t"
        @select="handleSpaceSelect"
      />
      <ShellSidebar
        :collapsed="effectiveSidebarCollapsed"
        :width="sidebarWidth"
        :body-groups="sidebarBodyGroups"
        :min-resize-width="SHELL_SIDEBAR_COLLAPSE_THRESHOLD"
        :max-resize-width="MAX_SIDEBAR_WIDTH"
        :compact-group-width="MIN_SIDEBAR_WIDTH"
        :persisted-layout="sidebarPersistedLayout"
        :resize-toggle-animating="sidebarResizeToggleAnimating"
        @head-button-clicked="runShellCommand"
        @list-button-clicked="handleSidebarListAction"
        @body-group-changed="handleSidebarBodyGroupChanged"
        @resize-start="handleSidebarResizeStart"
        @resize="handleSidebarResize"
        @resize-end="handleSidebarResizeEnd"
        @layout-change="handleSidebarLayoutChange"
      />

      <ShellWorkspaceFrame
        :title="workspaceTitle"
        :icon="workspaceIcon"
        :icon-tone="workspaceIconTone"
        :subtitle="workspaceSubtitle"
        :actions="workspaceActions"
        lock-body-scroll
        flush-body
        @action="handleWorkspaceFrameAction"
      >
        <div
          ref="workspaceStackRef"
          class="open-card-shell__workspace-stack"
          :class="{ 'is-bottom-panel-expanded': isBottomPanelExpanded }"
        >
          <div class="open-card-shell__workbench">
            <ShellWorkspaceContent
            :mode="shellLocation.base.space === 'settings' && !shellLocation.flow ? 'settings'
                : isCreateProjectMode ? 'create-project'
                  : isExportTemplateMode ? 'export-template'
                    : isAboutMode ? 'about'
                      : isWelcomeMode ? 'welcome'
                        : isMarketMode ? 'market'
                          : isTestMode ? 'test' : 'workbench'"
              :is-activating-project="isActivatingProject"
              :selected-template-key="selectedTemplateKey"
              :attached-resource-packages="attachedResourcePackages"
              :project-path="projectPath"
              :active-settings-category="activeSettingsCategory"
              :settings-focus-key="settingsFocusKey"
              :current-release-notes="currentReleaseNotes"
              :available-update="Boolean(availableUpdate)"
              :update-version="updateVersion"
              :welcome-covers="welcomeCoverWallCovers"
              :selected-recent-project-keys="selectedRecentProjectKeys"
              :background-visible="settingsStore.settings.value.workspace.showWelcomeBackground"
              :active-session="activeSession"
              :current-editor-component="currentEditorComponent"
              :current-editor-key="currentEditorKey"
              :current-editor-props="currentEditorProps"
              :set-create-project-ref="setCreateProjectWorkspaceRef"
              :set-export-template-ref="setExportTemplateWorkspaceRef"
              :set-current-editor-ref="setCurrentEditorRef"
              @created="handleProjectCreated"
              @update:create-busy="isCreateProjectOperationBusy = $event"
              @update:selected-template-key="selectedTemplateKey = $event"
              @export-selection-change="exportTemplateSelection = $event"
              @exported="path => notifySuccess(`${t('templateExport.status.exported')}: ${path}`)"
              @update:export-busy="isExportTemplateBusy = $event"
              @settings-intent="handleSettingsIntent"
              @about-back="returnFromFlow"
              @show-available-release="releaseNotesDialogMode = 'available'"
              @send-feedback="openFeedbackCenter('submit')"
              @view-feedback="openFeedbackCenter('history')"
              @new-project="openCreateProject"
              @open-project="openProject"
              @update:background-visible="settingsStore.updateSetting('workspace.showWelcomeBackground', $event)"
              @editor-modified="handleEditorModified"
              @editor-save="handleEditorSave"
              @editor-open-file="handleOpenFile"
              @editor-trash-file="handleEditorTrashFile"
              @viewport-transform="handleViewportTransformUpdate"
              @pixelated="handleImagePreviewPixelatedUpdate"
              @card-designer-mode="handleCardDesignerModeUpdate"
              @card-designer-layout="handleCardDesignerLayoutUpdate"
              @card-designer-view="handleCardDesignerViewUpdate"
              @diff-ui-state="handleDiffUiStateUpdate"
              @issue-snapshot="handleEditorIssueSnapshot"
            />
          </div>
          <div
            v-if="isBottomPanelExpanded"
            class="open-card-shell__bottom-panel-resizer"
            @pointerdown.prevent="handleBottomPanelResizeStart"
          />
          <div
            v-if="isBottomPanelResizing"
            class="open-card-shell__bottom-panel-resize-preview"
            :style="{ bottom: `${bottomPanelPreviewHeight}px` }"
          >
            <span>{{ bottomPanelPreviewPercentage }}%</span>
          </div>
          <WorkspaceBottomPanel
            :style="{ '--workspace-bottom-panel-height': `${bottomPanelHeight}px` }"
            :resizing="isBottomPanelResizing"
            :expanded="isBottomPanelExpanded"
            :active-tab="activeBottomTab"
            :issue-count="visibleIssueCount"
            :issue-severity="visibleIssueSeverity"
            :issue-tree-data="visibleIssueTreeData"
            :issue-navigation-targets="issueNavigationTargets"
            :issue-details="visibleIssueDetails"
            :expanded-issue-keys="expandedIssueKeys"
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
            @issue-expansion-change="setIssueNodeExpanded"
            @issue-navigate="handleWorkspaceIssueNavigate"
            @output-clear="clearAppOutputEntries"
          />
        </div>
      </ShellWorkspaceFrame>
    </div>

    <ShellOverlayHost
      :show-export-renderer="showExportRenderer"
      :export-card-face="exportCardFace"
      :export-resource-context="exportResourceContext"
      :set-export-renderer-ref="setExportRendererRef"
      :project-export-dialog-open="projectExportDialogOpen"
      :project-export-dialog-task="projectExportDialogTask"
      :project-export-document-candidates="projectExportDocumentCandidates"
      :is-export-preparing="isExportPreparing"
      :is-project-export-running="isProjectExportRunning"
      :export-preparation-issues="exportPreparationIssues"
      :resource-package-builder-open="resourcePackageBuilderOpen"
      :project-path="projectPath"
      :project-name="projectName"
      :resource-package-builder-entries="resourcePackageBuilderEntries"
      :commit-version-dialog-open="commitVersionDialogOpen"
      :is-committing-version="isCommittingVersion"
      :commit-version-error="commitVersionError"
      :is-external-file-drag-active="isExternalFileDragActive"
      :is-external-file-drag-over-zone="isExternalFileDragOverZone"
      :is-unsaved-editors-dialog-open="isUnsavedEditorsDialogOpen"
      :pending-close-intent="pendingCloseIntent"
      :unsaved-editor-decisions="unsavedEditorDecisions"
      :is-unsaved-close-busy="isUnsavedCloseBusy"
      :unsaved-close-error="unsavedCloseError"
      :unsaved-selected-count="unsavedSelectedCount"
      :unsaved-pending-count="unsavedPendingCount"
      :unsaved-save-count="unsavedSaveCount"
      :unsaved-discard-count="unsavedDiscardCount"
      :all-unsaved-pending-selected="allUnsavedPendingSelected"
      :some-unsaved-pending-selected="someUnsavedPendingSelected"
      :can-confirm-unsaved-close="canConfirmUnsavedClose"
      :release-notes-dialog-mode="releaseNotesDialogMode"
      :displayed-release-notes="displayedReleaseNotes"
      :is-downloading-update="isDownloadingUpdate"
      :is-installing-update="isInstallingUpdate"
      :is-update-downloaded="isUpdateDownloaded"
      :feedback-center-page="feedbackCenterPage"
      :feedback-dialog-kind="feedbackDialogKind"
      :latest-feedback-diagnostics="latestFeedbackDiagnostics"
      :developer-mode="developerMode"
      :confirmation-request="confirmationRequest"
      @update:project-export-dialog-task="projectExportDialogTask = $event"
      @close-project-export="closeProjectExportDialog"
      @submit-project-export="startProjectExport"
      @close-resource-package-builder="resourcePackageBuilderOpen = false"
      @close-commit-version="closeCommitVersionDialog"
      @submit-commit-version="commitVersion"
      @select-all-unsaved="setAllUnsavedPendingSelected"
      @select-unsaved-row="setUnsavedRowSelected"
      @mark-unsaved-discard="markSelectedUnsavedDiscard"
      @mark-unsaved-save="markSelectedUnsavedSave"
      @reset-unsaved-decision="resetUnsavedDecision"
      @cancel-unsaved-close="cancelUnsavedCloseRequest"
      @confirm-unsaved-close="confirmUnsavedClose"
      @discard-single-unsaved="discardSingleUnsavedEditor"
      @save-single-unsaved="saveSingleUnsavedEditor"
      @close-release-notes="closeReleaseNotesDialog"
      @release-action="handleAvailableReleaseAction"
      @feedback-page-change="feedbackCenterPage = $event"
      @close-feedback="feedbackCenterPage = null"
      @resolve-confirmation="resolveConfirmation"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifyAppError, notifyError, notifySuccess, notifyWarning, setTitleBarNoticeHistoryLimit } from '../notifications/titlebarNotices'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useProjectStore } from '../workspace/store/projectStore'
import { projectFontSources } from '../workspace/model/projectFontRegistry'
import {
  createDefaultOpenCardContent,
  useEditorSessionStore,
  type EditorSession,
} from '../workspace/store/editorSessionStore'
import { getPathDirectory } from '../../shared/model/filePath'
import type {
  OcNodeCollection,
} from '../../shared/ui/node/node.types'
import {
  registerUnhandledExternalDrop,
  useExternalFileDrop,
} from '../../shared/ui/drop/externalFileDrop'
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../settings/model/appSettings'
import CreateProjectWorkspace from '../project-templates/components/CreateProjectWorkspace.vue'
import ExportTemplateWorkspace from '../project-templates/components/ExportTemplateWorkspace.vue'
import WorkspaceBottomPanel, {
  type WorkspaceBottomTab,
} from './components/WorkspaceBottomPanel.vue'
import ShellOverlayHost from './components/ShellOverlayHost.vue'
import ShellWorkspaceContent from './components/ShellWorkspaceContent.vue'
import { editorHistoryManager } from '../editor-runtime/history/editorHistoryManager'
import { appOutputEntries, clearAppOutputEntries } from '../logging/appOutput'
import type { CreatedProject } from '../project-templates/model/projectTemplate'
import { useProjectTemplateStore } from '../project-templates/store/projectTemplateStore'
import { useStoredResourcePackageStore } from '../workspace/store/storedResourcePackageStore'
import { useAppSettingsStore } from '../settings/store/appSettingsStore'
import {
  type AppSettingKey,
  type SettingsCategoryKey,
} from '../settings/model/appSettings'
import CardFaceRenderer from '../card-rendering/components/CardFaceRenderer.vue'
import type {
  EditorIssueSnapshot,
  SessionIssueNavigationRequest,
} from '../editor-runtime/model/editorIssue'
import { resolveFileType } from '../workspace/model/fileTypes'
import { resolveSessionLabel } from '../workspace/model/sessionLabel'
import { PROJECT_ICON_REGISTRY_FILE_NAME } from '../workspace/model/projectStructure'
import { RESOURCE_PACKAGE_SUFFIX } from '../workspace/model/resourcePackage'
import { formatPackageCoordinate } from '../workspace/model/packageCoordinate'
import { useProjectExport } from './composables/useProjectExport'
import { useShellAboutFeature } from './composables/useShellAboutFeature'
import { useShellProgressTasks } from './composables/useShellProgressTasks'
import { useShellCloseCoordinator } from './composables/useShellCloseCoordinator'
import type { ApplicationCloseAction } from './composables/useUnsavedSessionGuard'
import { useShellEditorHost } from './composables/useShellEditorHost'
import { useShellProjectLifecycle } from './composables/useShellProjectLifecycle'
import { useShellSidebarLayout } from './composables/useShellSidebarLayout'
import { useShellBottomPanelLayout } from './composables/useShellBottomPanelLayout'
import { useShellCreateProjectFeature } from './composables/useShellCreateProjectFeature'
import { useShellWelcomeFeature } from './composables/useShellWelcomeFeature'
import { useShellSettingsFeature } from './composables/useShellSettingsFeature'
import { useShellWorkbenchActions } from './composables/useShellWorkbenchActions'
import { useShellWorkbenchVersionActions } from './composables/useShellWorkbenchVersionActions'
import { useShellKeyboardShortcuts } from './composables/useShellKeyboardShortcuts'
import { useShellExportTemplateFeature } from './composables/useShellExportTemplateFeature'
import { useShellProjectExportFeature } from './composables/useShellProjectExportFeature'
import { useShellWindow } from './composables/useShellWindow'
import { useShellVersionControl } from './composables/useShellVersionControl'
import { useWorkspaceIssues } from './composables/useWorkspaceIssues'
import { navigateWorkspaceIssue } from './services/workspaceIssueNavigation'
import {
  useShellFileTree,
} from './composables/useShellFileTree'
import ShellSidebar from './components/ShellSidebar.vue'
import ShellTitleBar from './components/ShellTitleBar.vue'
import ShellSpaceRail from './components/ShellSpaceRail.vue'
import ShellWorkspaceFrame from './components/ShellWorkspaceFrame.vue'
import {
  classifyExternalOpenPath,
} from './services/externalOpenService'
import { fileSystemService } from '../workspace/services/fileSystemService'
import type {
  ShellListGroup,
  ShellWorkspaceAction,
  ShellTitleBarWindowControl,
} from './shell.types'
import {
  openFlow,
  type ProjectCloseDestination,
} from './shellLocation'
import { shellSpaceDefinitions, shellSpaceKeys } from './shellSection'
import { captureBeginRename, resolveShellSection } from './shellSections'
import { decodeShellCommand, decodeShellWorkspaceIntent } from './shellIntent'
import { useShellNavigation } from './composables/useShellNavigation'
import { createWorkbenchSection } from './sections/workbenchSection'
import { createShellTitleBarMenus } from './composables/useShellTitleBarMenus'
import { createShellWorkspaceActions } from './shellWorkspaceActions'
import {
} from './shellCatalogProjections'
import {
  PROJECT_FILES_LIST_KEY,
  PROJECT_NEW_FOLDER_ACTION_KEY,
  PROJECT_NEW_OPENCARD_ACTION_KEY,
  PROJECT_REVEAL_ACTION_KEY,
  SHELL_SIDEBAR_COLLAPSE_THRESHOLD,
  TIMELINE_LIST_KEY,
  TIMELINE_REFRESH_ACTION_KEY,
} from './shellSidebarConfig'

const { t, locale } = useI18n()
const BUILD_RESOURCE_PACKAGE_ACTION_KEY = 'file.build-package'
const EMPTY_TREE_DATA: OcNodeCollection = {
  rootKeys: [],
  items: new Map(),
  children: new Map(),
}
const projectStore = useProjectStore()
const {
  projectPath,
  projectProfile,
  resolvedProject,
  projectFontFamilies,
  fontRegistryReady,
  renderEnvironment: projectRenderEnvironment,
  indexedEntries,
  fileChangeRevision,
  chooseProjectDirectory,
  ensureProjectManagementStructure,
  setProjectPath,
  isDirectoryExpanded,
  readDirectoryEntries,
  readFile: readProjectFile,
  resolveProjectPath,
  setDirectoryExpanded,
  resetProjectWorkspaceState,
  createEntryWithAvailableName,
  trashFile,
  revealEntryInFileManager,
  getRelativeProjectPath,
  moveEntryByDrop,
  copyExternalEntriesIntoProject,
  renameEntry,
} = projectStore

const settingsStore = useAppSettingsStore()
watch(
  () => settingsStore.settings.value.shell.titleBarNoticeHistoryLimit,
  limit => setTitleBarNoticeHistoryLimit(limit),
  { immediate: true },
)
watch(
  () => settingsStore.settings.value.workspace.historyEntryLimit,
  limit => editorHistoryManager.setEntryLimit(limit),
  { immediate: true },
)
const templateStore = useProjectTemplateStore()
const {
  location: shellLocation,
  activeSpace,
  isSettings: isSettingsMode,
  isCreateProject: isCreateProjectMode,
  isExportTemplate: isExportTemplateMode,
  isAbout: isAboutMode,
  isWelcome: isWelcomeMode,
  isWorkbench: isWorkbenchMode,
  isMarket: isMarketMode,
  isTest: isTestMode,
  showPrimarySpace: showPrimarySpacePage,
  showSettings: showSettingsPage,
  selectSpace: handleSpaceSelect,
  returnFromFlow,
} = useShellNavigation()
const isDiffMode = computed(() => activeSession.value?.mode === 'diff')
const shellSpaces = shellSpaceKeys.map(space => shellSpaceDefinitions[space])
const confirmationRequest = ref<{
  title: string
  message: string
  confirmLabel: string
  resolve: (accepted: boolean) => void
} | null>(null)

/**
 * 应用内确认对话框：调用方 await 结果，取消/关闭都算拒绝。
 * 破坏性操作走它而不是系统对话框，样式与其余弹窗一致；confirmLabel 由调用方给出动词。
 */
function requestConfirmation(options: { title: string; message: string; confirmLabel: string }): Promise<boolean> {
  return new Promise((resolve) => {
    confirmationRequest.value = { ...options, resolve }
  })
}

function resolveConfirmation(accepted: boolean): void {
  const request = confirmationRequest.value
  confirmationRequest.value = null
  request?.resolve(accepted)
}
const createProjectWorkspaceRef = ref<InstanceType<typeof CreateProjectWorkspace> | null>(null)
const exportTemplateWorkspaceRef = ref<InstanceType<typeof ExportTemplateWorkspace> | null>(null)
const isExportTemplateBusy = ref(false)
const resourcePackageBuilderOpen = ref(false)
const workspaceStackRef = ref<HTMLElement | null>(null)
const {
  isExpanded: isBottomPanelExpanded,
  height: bottomPanelHeight,
  previewHeight: bottomPanelPreviewHeight,
  isResizing: isBottomPanelResizing,
  previewPercentage: bottomPanelPreviewPercentage,
  startResize: handleBottomPanelResizeStart,
} = useShellBottomPanelLayout(workspaceStackRef)
const resourcePackageBuilderEntries = computed(() => indexedEntries.value
  .filter(entry => entry.isFile)
  .map(entry => entry.name.replace(/\\/g, '/')))
const debugHideCdeOverlays = ref(false)
const debugTransparentCdeViewport = ref(false)
const debugPassiveCdeViewport = ref(false)
const usesNativeMacosWindowControls = typeof navigator !== 'undefined'
  && /Macintosh|Mac OS X/.test(navigator.userAgent)
const SHELL_SHORTCUT_KEYS = {
  fullscreen: 'F11',
  newProject: 'n',
  newOpenCard: 'n',
  save: 's',
  undo: 'z',
  redo: 'y',
} as const
const primaryShortcutParts = (key: string, shift = false): readonly string[] => (
  usesNativeMacosWindowControls
    ? [...(shift ? ['⇧'] : []), '⌘', key.toUpperCase()]
    : ['Ctrl', ...(shift ? ['Shift'] : []), key.toUpperCase()]
)
const shellShortcutParts = {
  fullscreen: [SHELL_SHORTCUT_KEYS.fullscreen],
  newProject: primaryShortcutParts(SHELL_SHORTCUT_KEYS.newProject),
  save: primaryShortcutParts(SHELL_SHORTCUT_KEYS.save),
  undo: primaryShortcutParts(SHELL_SHORTCUT_KEYS.undo),
  redo: usesNativeMacosWindowControls
    ? primaryShortcutParts(SHELL_SHORTCUT_KEYS.undo, true)
    : primaryShortcutParts(SHELL_SHORTCUT_KEYS.redo),
} as const
const {
  viewportWidth,
  isFullscreen: isWindowFullscreen,
  isMaximized: isWindowMaximized,
  toggleFullscreen: toggleWindowFullscreen,
  minimize: minimizeWindow,
  toggleMaximize: toggleWindowMaximize,
  requestClose: requestWindowClose,
  destroy: destroyWindow,
  start: startShellWindow,
  dispose: disposeShellWindow,
} = useShellWindow({
  requestApplicationClose: async () => { await requestApplicationClose() },
  handleExternalOpenPaths,
  notifyWindowControlError: () => notifyError(t('app.notifications.windowControlFailed')),
})
const {
  isOpenableDragActive: isExternalFileDragActive,
  isOverZone: isExternalFileDragOverZone,
} = useExternalFileDrop()
let disposeUnhandledExternalDrop: (() => void) | null = null
const activeBottomTab = ref<WorkspaceBottomTab>('issues')
const settingsCategoryKey = computed<SettingsCategoryKey>(() =>
  shellLocation.value.base.space === 'settings' && !shellLocation.value.flow
    ? shellLocation.value.base.categoryKey
    : 'general'
)
const settingsFocusKey = computed(() => (
  shellLocation.value.base.space === 'settings' && !shellLocation.value.flow
    ? shellLocation.value.base.focusKey
    : undefined
))
const projectOpen = computed(() => Boolean(projectPath.value))
const {
  section: settingsSection,
  activeCategory: activeSettingsCategory,
  settingsAnchorFor,
  systemFontFamilies,
  handleIntent: handleSettingsIntent,
} = useShellSettingsFeature({
  settingsStore,
  categoryKey: settingsCategoryKey,
  projectOpen,
  isSettingsMode,
  resetWorkspace: resetProjectWorkspaceState,
  selectCategory: showSettingsPage,
})

/**
 * 跳转到某个设置项：切到它所在的分类并把该行带到前台。
 */
function openSettingsAt(key: AppSettingKey): void {
  const anchor = settingsAnchorFor(key)
  showSettingsPage(anchor?.category ?? settingsCategoryKey.value, key)
}

const {
  sidebarCollapsed,
  sidebarWidth,
  effectiveSidebarCollapsed,
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
  settings: settingsStore,
  projectPath,
  viewportWidth,
  isCreateProjectMode,
})
const exportRendererRef = ref<InstanceType<typeof CardFaceRenderer>>()
const setExportRendererRef = (renderer: Element | ComponentPublicInstance | null): void => {
  exportRendererRef.value = renderer && 'getCanvasElement' in renderer
    ? renderer as InstanceType<typeof CardFaceRenderer>
    : undefined
}
const projectTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)
const projectManagementTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)

const {
  availableUpdate,
  updateVersion,
  currentReleaseNotes,
  isCheckingForUpdate,
  isDownloadingUpdate,
  isUpdateDownloaded,
  isInstallingUpdate,
  checkForUpdate,
  installDownloadedUpdate,
  stopDeveloperUpdatePreview,
  isDeveloperPreviewDownloaded,
  developerMode,
  releaseNotesDialogMode,
  feedbackDialogKind,
  feedbackCenterPage,
  latestFeedbackDiagnostics,
  unreadFeedbackReplyCount,
  openFeedbackCenter,
  displayedReleaseNotes,
  closeReleaseNotesDialog,
  handleAvailableReleaseAction,
  handleTitleBarAppAction,
  titleBarAppActions,
} = useShellAboutFeature({
  isAboutMode,
  requestInstall: async () => { await requestApplicationClose('install-update') },
})

const {
  tasks: titleBarTasks,
  setTask: setShellProgressTask,
  removeTask: removeShellProgressTask,
  cancelTask: cancelShellProgressTask,
} = useShellProgressTasks()
const EXPORT_TEMPLATE_PROGRESS_TASK_KEY = 'export-template'
watch(isExportTemplateBusy, busy => {
  if (busy) {
    setShellProgressTask({
      key: EXPORT_TEMPLATE_PROGRESS_TASK_KEY,
      title: t('templateExport.status.exporting'),
      progress: 0,
      weight: 1,
    })
  } else {
    removeShellProgressTask(EXPORT_TEMPLATE_PROGRESS_TASK_KEY)
  }
})

const titleBarBrandLabel = computed(() => {
  if (titleBarTasks.value.length === 0) return 'OPENCARD'
  const activeTasks = titleBarTasks.value.filter(task => task.active !== false)
  const labelTasks = activeTasks.length > 0 ? activeTasks : titleBarTasks.value
  if (labelTasks.length === 1) return labelTasks[0]!.title
  return t('app.shell.activeTasks', { count: labelTasks.length })
})

const {
  sessions,
  activeSession,
  open: openEditorSession,
  activateSession,
  createDraftSession,
  updateDraftContent,
  setSessionDirtyState,
  setSessionPresentation,
  updateSessionUiState,
  updateSessionDiffUiState,
  setSessionMode,
  closeSession,
  closeWorkspaceSessions,
  closeSessionsByPath,
  saveSession,
  saveSessionAs,
  saveDirtySessions,
  remapSessionPaths,
} = useEditorSessionStore()

let autoSaveTimer: number | null = null
function restartAutoSaveTimer(): void {
  if (autoSaveTimer !== null) {
    window.clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
  const workspaceSettings = settingsStore.settings.value.workspace
  if (!workspaceSettings.autoSave) return
  autoSaveTimer = window.setInterval(() => {
    void saveDirtySessions()
      .then(names => names.forEach(name => notifySuccess(t('app.notifications.saved', { name }), 'action.save')))
      .catch(error => notifyError(error instanceof Error ? error.message : t('app.notifications.autoSaveFailed')))
  }, workspaceSettings.autoSaveIntervalSeconds * 1000)
}
watch(
  () => [
    settingsStore.settings.value.workspace.autoSave,
    settingsStore.settings.value.workspace.autoSaveIntervalSeconds,
  ] as const,
  restartAutoSaveTimer,
  { immediate: true },
)
onUnmounted(() => {
  if (autoSaveTimer !== null) window.clearInterval(autoSaveTimer)
})

const {
  commitVersionDialogOpen,
  isCommittingVersion,
  commitVersionError,
  isInitializingRepository,
  timelineFilePath,
  timelineFileName,
  timelineTreeData,
  timelineProjectTreeData,
  changesTreeData,
  selectedChangeCount,
  statusEntries,
  timelineLoading,
  timelineRevisionOptions,
  latestCommitIdForPath,
  refreshTimeline,
  refreshTimelineStatus,
  timelinePlaceholder,
  versionGraphExpandedKeys,
  changesExpandedKeys,
  repositoryReady,
  repositoryNeedsInitialization,
  handleVersionGraphExpansionChange,
  handleVersionGraphExpansionSync,
  handleChangesExpansionChange,
  handleChangesExpansionSync,
  handleChangesAction,
  closeCommitVersionDialog,
  initializeProjectRepository,
  commitVersion,
} = useShellVersionControl({
  projectPath,
  activeSession,
  locale,
  translate: t,
  fileChangeRevision,
  getRelativeProjectPath,
  moveProjectEntryToTrash: trashFile,
  openSetting: openSettingsAt,
  settings: settingsStore.settings,
  requestConfirmation,
})
const {
  diffSessionState,
  editorComparison,
  handleTimelineAction,
  handleChangesNodeActivate,
  selectWorkspaceDiff,
} = useShellWorkbenchVersionActions({
  projectRoot: projectPath,
  activeSession,
  timelineFilePath,
  timelineFileName,
  timelineRevisionOptions,
  changesExpandedKeys,
  statusEntries,
  latestCommitIdForPath,
  handleOpenFile: async path => handleOpenFile(path),
  resolveProjectPath,
  setSessionMode,
  onChangesExpansionChange: handleChangesExpansionChange,
})
const {
  editorRef: currentEditorRef,
  component: currentEditorComponent,
  key: currentEditorKey,
  props: currentEditorProps,
  isCardDesigner: isActiveCardDesignerEditor,
  isDictionaryEditor: isActiveDictionaryEditor,
  canUndo: canUndoActiveEditor,
  canRedo: canRedoActiveEditor,
  cardDesignerMode: activeCardDesignerMode,
  dataTableWorkbookBusy: isDataTableWorkbookBusy,
  canExportDataTableWorkbook,
  canRenderCardImage,
  importDataTableWorkbook,
  exportDataTableWorkbook,
  getCardImageRenderSource,
  handleViewportTransform: handleViewportTransformUpdate,
  handleImagePreviewPixelated: handleImagePreviewPixelatedUpdate,
  handleCardDesignerMode: handleCardDesignerModeUpdate,
  handleCardDesignerLayout: handleCardDesignerLayoutUpdate,
  handleCardDesignerView: handleCardDesignerViewUpdate,
  handleDiffUiState: handleDiffUiStateUpdate,
  handleModified: handleEditorModified,
  handleSaveEvent: handleEditorSave,
  save: triggerCurrentEditorSave,
  undo: triggerCurrentEditorUndo,
  redo: triggerCurrentEditorRedo,
  flushAffectedSessions: flushActiveEditorForClose,
  dispose: disposeEditorHost,
} = useShellEditorHost({
  activeSession,
  projectPath,
  projectProfile,
  settings: settingsStore.settings,
  comparison: editorComparison,
  debugHideCdeOverlays,
  debugTransparentCdeViewport,
  debugPassiveCdeViewport,
  translate: t,
  sessionActions: {
    updateDraftContent,
    setSessionDirtyState,
    setSessionPresentation,
    updateSessionUiState,
    updateSessionDiffUiState,
    saveSession,
  },
})

function setCreateProjectWorkspaceRef(value: unknown): void {
  createProjectWorkspaceRef.value = value as InstanceType<typeof CreateProjectWorkspace> | null
}

function setExportTemplateWorkspaceRef(value: unknown): void {
  exportTemplateWorkspaceRef.value = value as InstanceType<typeof ExportTemplateWorkspace> | null
}

function setCurrentEditorRef(value: unknown): void {
  currentEditorRef.value = value as typeof currentEditorRef.value
}

const {
  isActivating: isActivatingProject,
  openProject,
  openRecentProject,
  relocateRecentProject: relocateRecentProjectPath,
  activateCreatedProject,
  resumeDeferredActivation,
  dropDeferredActivation,
  enterCreateProject,
  completeProjectClose,
  ensureProjectTreeLoaded,
} = useShellProjectLifecycle({
  project: {
    projectPath,
    chooseProjectDirectory,
    setProjectPath,
    readDirectoryEntries,
  },
  sessions: {
    closeWorkspaceSessions,
    open: openEditorSession,
  },
  // 打开另一个项目前先按“关闭项目”流程收尾，未保存的改动会先询问。
  closeCurrentProject: () => requestProjectClose('current'),
  settings: {
    rememberRecentProject: settingsStore.rememberRecentProject,
    forgetRecentProject: settingsStore.forgetRecentProject,
  },
  templates: {
    load: templateStore.load,
  },
  shellLocation,
  translate: t,
})

const {
  section: createProjectSection,
  selectedTemplateKey,
  attachedResourcePackages,
  isCreateProjectOperationBusy,
  isProjectTemplateBusy,
  handleListAction: handleCreateProjectListAction,
  importDroppedResourcePackage,
  installAttachedResourcePackages,
} = useShellCreateProjectFeature({
  projectStore,
  isCreateProjectMode,
  isActivatingProject,
  requestConfirmation,
  enterCreateProject,
  onTemplateImport: () => createProjectWorkspaceRef.value?.beginImport(),
})
const resourcePackageStore = useStoredResourcePackageStore()
const {
  section: welcomeSection,
  welcomeCoverWallCovers,
  selectedRecentProjectKeys,
} = useShellWelcomeFeature({
  projectPath,
  isWelcomeMode,
  openRecentProject,
  relocateRecentProject: relocateRecentProjectPath,
})

async function handleProjectCreated(project: CreatedProject): Promise<void> {
  const activated = await activateCreatedProject(project)
  if (activated) await installAttachedResourcePackages()
}

const {
  pendingIntent: pendingCloseIntent,
  decisions: unsavedEditorDecisions,
  isOpen: isUnsavedEditorsDialogOpen,
  isBusy: isUnsavedCloseBusy,
  globalError: unsavedCloseError,
  selectedCount: unsavedSelectedCount,
  pendingCount: unsavedPendingCount,
  saveCount: unsavedSaveCount,
  discardCount: unsavedDiscardCount,
  allPendingSelected: allUnsavedPendingSelected,
  somePendingSelected: someUnsavedPendingSelected,
  canConfirm: canConfirmUnsavedClose,
  setRowSelected: setUnsavedRowSelected,
  setAllPendingSelected: setAllUnsavedPendingSelected,
  markSelectedDiscard: markSelectedUnsavedDiscard,
  markSelectedSave: markSelectedUnsavedSave,
  resetDecision: resetUnsavedDecision,
  confirm: confirmUnsavedClose,
  cancel: cancelUnsavedClose,
  requestSessionClose,
  requestProjectClose,
  requestPathTrash,
  requestApplicationClose,
  discardSingle: discardSingleUnsavedEditor,
  saveSingle: saveSingleUnsavedEditor,
} = useShellCloseCoordinator({
  sessions,
  flushAffectedSessions: flushActiveEditorForClose,
  pickDraftDirectory: () => fileSystemService.pickDirectory(t('app.unsavedEditors.pickDraftDirectory')),
  fileExists: path => fileSystemService.fileExists(path),
  saveSession,
  completions: {
    sessions: performSessionClose,
    project: async (destination) => {
      await completeProjectClose(destination)
      // 关闭当前项目如果是为打开新项目服务的，确认之后继续打开。
      await resumeDeferredActivation()
    },
    trash: performPathTrash,
    application: performApplicationClose,
  },
})

/** 用户取消关闭时，一并放弃“关完再打开新项目”的暂存请求。 */
function cancelUnsavedCloseRequest(): void {
  dropDeferredActivation()
  cancelUnsavedClose()
}

/**
 * 会话在壳层里的显示名，列表与页面顶端共用这一份；三态规则本身在 `workspace/model/sessionLabel`。
 * 还没有编辑器声明过的会话显示为空，而不是先显示身份名再被替换。
 */
const sessionScopeTexts = {
  external: (name: string) => t('sidebar.editorTitles.external', { name }),
  draft: (name: string) => t('sidebar.editorTitles.draft', { name }),
}

function formatSessionTitle(session: EditorSession): string {
  return resolveSessionLabel(session, sessionScopeTexts)
}

const {
  issueTreeData,
  issueNavigationTargets,
  issueDetails,
  issueCount,
  highestIssueSeverity,
  expandedIssueKeys,
  reportSessionIssueSnapshot,
  clearAllSessionIssues,
  setIssueNodeExpanded,
} = useWorkspaceIssues({ sessions, copyIssueLabel: t('app.problems.copyIssue') })
const visibleIssueTreeData = computed(() => isWorkbenchMode.value ? issueTreeData.value : EMPTY_TREE_DATA)
const visibleIssueDetails = computed(() => isWorkbenchMode.value ? issueDetails.value : new Map())
const visibleIssueCount = computed(() => isWorkbenchMode.value ? issueCount.value : 0)
const visibleIssueSeverity = computed(() => isWorkbenchMode.value ? highestIssueSeverity.value : null)

watch(locale, clearAllSessionIssues, { flush: 'sync' })
watch(locale, value => {
  document.documentElement.lang = value
}, { immediate: true })
watch(projectPath, (nextPath, previousPath) => {
  if (nextPath !== previousPath) clearAllSessionIssues()
})

const {
  showExportRenderer,
  exportCardFace,
  exportResourceContext,
  isRunning: isProjectExportRunning,
  loadDocumentSnapshot,
  prepare: prepareProjectExport,
  run: runProjectExport,
  renderCardImages,
} = useProjectExport({
  sessions,
  exportRendererRef,
  renderEnvironment: projectRenderEnvironment,
  readProjectFile,
  resolveProjectPath,
  getRelativeProjectPath,
  translate: t,
})
const {
  open: projectExportDialogOpen,
  task: projectExportDialogTask,
  candidates: projectExportDocumentCandidates,
  preparing: isExportPreparing,
  issues: exportPreparationIssues,
  show: openProjectExportDialog,
  close: closeProjectExportDialog,
  submit: startProjectExport,
} = useShellProjectExportFeature({
  projectProfile,
  indexedEntries,
  running: isProjectExportRunning,
  loadDocumentSnapshot,
  prepare: prepareProjectExport,
  run: runProjectExport,
})

const {
  projectTreeData,
  projectManagementTreeData,
  projectManagementExpandedKeys,
  projectExpandedKeys,
  openedEditorTreeData,
  selectedProjectEntryKeys,
  selectedManagementKeys,
  openedEditorSelectedKeys,
  handleOpenedEditorsSelect,
  handleFileTreeSelect,
  handleProjectManagementSelect,
  setProjectManagementEntryExpanded,
  findProjectEntryByKey,
  setProjectEntryExpanded,
} = useShellFileTree({
  projectPath,
  indexedEntries,
  hideDotFiles: computed(() => settingsStore.settings.value.workspace.hideDotFiles),
  packageCoordinates: computed(() => new Map(
    [...projectStore.projectResourcePackages.value.values()]
      .map(pkg => [pkg.archivePath.replace(/\\/g, '/'), formatPackageCoordinate(pkg.coordinate)] as const),
  )),
  sessions,
  formatSessionTitle,
  activeSession,
  isDirectoryExpanded,
  activateSession,
  openPreviewFile: (path: string) => openEditorSession(path, { preview: true }),
  ensureProjectManagementStructure,
  translate: t,
  registeredFontSources: computed(() => fontRegistryReady.value
    ? projectFontFamilies.value.flatMap(projectFontSources)
    : null),
})
const {
  section: exportTemplateSection,
  selection: exportTemplateSelection,
  reset: resetExportTemplateSelection,
} = useShellExportTemplateFeature({
  projectPath,
  projectFolderName: computed(() => projectPath.value.split(/[/\\]/).filter(Boolean).pop() ?? ''),
  busy: isExportTemplateBusy,
  projectTreeData,
  selectedProjectEntryKeys,
  translate: t,
  workspaceRef: exportTemplateWorkspaceRef,
  captureProjectTree: instance => { projectTreeRef.value = captureBeginRename(instance) },
})

const {
  handleOpenedEditorSelectionChange,
  handleOpenedEditorAction,
  handleOpenedEditorAuxClick,
  handleProjectManagementSelectionChange,
  handleProjectManagementExpansionChange,
  handleProjectManagementAction,
  handleProjectSelectionChange,
  handleProjectExpansionChange,
  handleProjectRenameCommit,
  handleProjectMove,
  handleProjectExternalDrop,
  handleProjectAction,
  handleProjectNodeActivate,
} = useShellWorkbenchActions({
  projectPath,
  openedEditorTreeData,
  tree: {
    handleOpenedEditorsSelect,
    handleProjectManagementSelect,
    handleFileTreeSelect,
    setProjectManagementEntryExpanded,
    findProjectEntryByKey,
    setProjectEntryExpanded,
  },
  project: {
    setDirectoryExpanded,
    readDirectoryEntries,
    renameEntry,
    moveEntryByDrop,
    copyExternalEntriesIntoProject,
    revealEntryInFileManager,
    getRelativeProjectPath,
  },
  close: { requestSessionClose, requestPathTrash },
  editor: {
    openFile: async path => { await handleOpenFile(path) },
    remapSessionPaths,
    resolveFileType: path => resolveFileType(path, projectPath.value),
  },
  projectManagement: { pickAndAddPackage: () => pickAndAddResourcePackage() },
  beginRename: projectTreeRef,
  managementTree: projectManagementTreeRef,
})

const projectName = computed(() => {
  if (!projectPath.value) return ''
  return resolvedProject.value?.name || projectPath.value.split(/[/\\]/).pop() || ''
})

const projectFolderName = computed(() => {
  if (!projectPath.value) return ''
  return projectPath.value.split(/[/\\]/).filter(Boolean).pop() || ''
})

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

const workbenchSection = createWorkbenchSection({
  translate: t,
  project: {
    open: projectOpen,
    path: projectPath,
    folderName: projectFolderName,
    openedEditors: {
      data: openedEditorTreeData,
      selectedKeys: openedEditorSelectedKeys,
      onSelectionChange: handleOpenedEditorSelectionChange,
      onAction: handleOpenedEditorAction,
      onAuxclick: handleOpenedEditorAuxClick,
    },
    management: {
      data: projectManagementTreeData,
      selectedKeys: selectedManagementKeys,
      expandedKeys: projectManagementExpandedKeys,
      onSelectionChange: handleProjectManagementSelectionChange,
      onExpansionChange: handleProjectManagementExpansionChange,
      onAction: handleProjectManagementAction,
      onRenameCommit: handleProjectRenameCommit,
      onMove: handleProjectMove,
      onExternalDrop: handleProjectExternalDrop,
      captureInstance: instance => { projectManagementTreeRef.value = captureBeginRename(instance) },
    },
    files: {
      data: projectTreeData,
      selectedKeys: selectedProjectEntryKeys,
      expandedKeys: projectExpandedKeys,
      onSelectionChange: handleProjectSelectionChange,
      onExpansionChange: handleProjectExpansionChange,
      onAction: handleProjectAction,
      onNodeActivate: handleProjectNodeActivate,
      onRenameCommit: handleProjectRenameCommit,
      onMove: handleProjectMove,
      onExternalDrop: handleProjectExternalDrop,
      captureInstance: instance => { projectTreeRef.value = captureBeginRename(instance) },
    },
  },
  version: {
    ready: repositoryReady,
    needsInitialization: repositoryNeedsInitialization,
    initializing: isInitializingRepository,
    committing: isCommittingVersion,
    selectedChangeCount,
    timeline: {
      placeholder: timelinePlaceholder,
      filePath: timelineFilePath,
      loading: timelineLoading,
      data: timelineTreeData,
      onAction: handleTimelineAction,
    },
    changes: {
      data: changesTreeData,
      expandedKeys: changesExpandedKeys,
      onExpansionChange: handleChangesExpansionChange,
      onExpansionSync: handleChangesExpansionSync,
      onNodeActivate: handleChangesNodeActivate,
      onAction: handleChangesAction,
    },
    graph: {
      data: timelineProjectTreeData,
      expandedKeys: versionGraphExpandedKeys,
      onExpansionChange: handleVersionGraphExpansionChange,
      onExpansionSync: handleVersionGraphExpansionSync,
    },
  },
})
const aboutSection = computed<ShellListGroup[]>(() => [{
  key: 'primary',
  transitionKey: 'flow:about',
  title: '',
  headButtons: [{
    key: 'return-primary-page',
    icon: 'nav.arrow-left',
    title: t('app.shell.back'),
    disabled: isProjectTemplateBusy.value || isExportTemplateBusy.value,
  }],
  lists: [],
}])
const emptySpaceSection = computed<ShellListGroup[]>(() => [])
const sidebarBodyGroups = computed(() => resolveShellSection(shellLocation.value, {
  welcome: welcomeSection,
  workbench: workbenchSection,
  market: emptySpaceSection,
  test: emptySpaceSection,
  settings: settingsSection,
}, {
  'create-project': createProjectSection,
  'export-template': exportTemplateSection,
  about: aboutSection,
}))

const titleBarMenus = computed(() => createShellTitleBarMenus({
  translate: t,
  projectPath: projectPath.value,
  buildResourcePackageActionKey: BUILD_RESOURCE_PACKAGE_ACTION_KEY,
  autoSave: settingsStore.settings.value.workspace.autoSave,
  activeSession: Boolean(activeSession.value),
  isDiffMode: isDiffMode.value,
  sidebarCollapsed: sidebarCollapsed.value,
  bottomPanelExpanded: isBottomPanelExpanded.value,
  windowFullscreen: isWindowFullscreen.value,
  canUndo: canUndoActiveEditor.value,
  canRedo: canRedoActiveEditor.value,
  unreadFeedbackReplyCount: unreadFeedbackReplyCount.value,
  checkingForUpdate: isCheckingForUpdate.value,
  downloadingUpdate: isDownloadingUpdate.value,
  updateDownloaded: isUpdateDownloaded.value,
  installingUpdate: isInstallingUpdate.value,
  developerMode: developerMode.value,
  debugHideCdeOverlays: debugHideCdeOverlays.value,
  debugTransparentCdeViewport: debugTransparentCdeViewport.value,
  debugPassiveCdeViewport: debugPassiveCdeViewport.value,
  shortcuts: shellShortcutParts,
}))

/**
 * 页面顶端的标题、副标题与图标都读会话自己持有的呈现，和列表用的是同一份 —— 编辑器只负责声明，
 * 由 host 写回会话（见 useShellEditorHost）。头部动作仍是编辑器直接声明的，因为它随选区与忙碌态变化。
 */
const workspaceTitle = computed(() => {
  if (isCreateProjectMode.value) return t('projectTemplates.title')
  if (isExportTemplateMode.value) return t('templateExport.title')
  if (isMarketMode.value) return t('app.shell.space.market')
  if (isTestMode.value) return t('app.shell.space.test')
  if (isSettingsMode.value) return activeSettingsCategory.value.title
  if (isAboutMode.value) return t('app.about.title')
  if (isWelcomeMode.value) return 'OpenCard'
  return activeSession.value
    ? formatSessionTitle(activeSession.value)
    : projectName.value || t('app.menu.workbench')
})

const workspaceIcon = computed(() => {
  if (isMarketMode.value) return 'nav.market'
  if (isTestMode.value) return 'nav.test'
  return activeSession.value?.presentation?.icon ?? undefined
})

const workspaceIconTone = computed(() => activeSession.value?.presentation?.iconTone ?? undefined)

const workspaceSubtitle = computed(() => activeSession.value?.presentation?.description ?? undefined)

/** The active editor owns its own header actions and exposes them through the editor ref. */
const editorHeaderActions = computed<readonly ShellWorkspaceAction[]>(() => (
  currentEditorRef.value?.workspaceActions ?? []
))

const workspaceActions = computed<ShellWorkspaceAction[]>(() => createShellWorkspaceActions({
  translate: t,
  isWorkbench: isWorkbenchMode.value,
  isDiff: isDiffMode.value,
  beforeRevisionId: activeSession.value?.diff?.beforeRevisionId
    ?? diffSessionState.before.value?.commitId
    ?? null,
  afterRevisionId: activeSession.value?.diff?.afterRevisionId
    ?? diffSessionState.after.value?.commitId
    ?? null,
  timelineRevisionOptions: timelineRevisionOptions.value,
  editorHeaderActions: editorHeaderActions.value,
  isDictionaryEditor: isActiveDictionaryEditor.value,
  isCardDesignerEditor: isActiveCardDesignerEditor.value,
  activeCardDesignerMode: activeCardDesignerMode.value,
  isDataTableWorkbookBusy: isDataTableWorkbookBusy.value,
  canExportDataTableWorkbook: canExportDataTableWorkbook.value,
  isProjectExportRunning: isProjectExportRunning.value,
  canRenderCardImage: canRenderCardImage.value,
}))

function handleEditorIssueSnapshot(sessionId: string, snapshot: EditorIssueSnapshot): void {
  reportSessionIssueSnapshot(sessionId, snapshot)
}

async function handleWorkspaceIssueNavigate(request: SessionIssueNavigationRequest): Promise<void> {
  await navigateWorkspaceIssue(request, {
    hasSession: (sessionId) => sessions.value.some((session) => session.id === sessionId),
    activateSession,
    waitForEditorMount: nextTick,
    getActiveSessionId: () => activeSession.value?.id ?? null,
    getEditorNavigator: () => currentEditorRef.value,
  })
}

function handleSidebarBodyGroupChanged(groupKey: string): void {
  if (groupKey === 'version-control' && repositoryReady.value) void refreshTimelineStatus()
}

function handleWindowFocus(): void {
  if (isWorkbenchMode.value && projectPath.value && repositoryReady.value) void refreshTimelineStatus()
}

async function createProjectEntry(kind: 'folder' | 'opencard'): Promise<void> {
  if (!projectPath.value) return
  const selectedKey = selectedProjectEntryKeys.value[0]
  const selectedEntry = selectedKey ? findProjectEntryByKey(selectedKey) : null
  const parentPath = selectedEntry?.isDirectory ? selectedEntry.key
    : selectedEntry ? getPathDirectory(selectedEntry.key) || projectPath.value : projectPath.value
  if (findProjectEntryByKey(parentPath)?.isDirectory) setDirectoryExpanded(parentPath, true)
  const baseName = kind === 'folder' ? t('sidebar.fileActions.newFolderName') : t('sidebar.fileActions.newOpenCardName')
  const path = await createEntryWithAvailableName(parentPath, baseName, kind === 'folder' ? 'folder' : 'file', kind === 'opencard' ? createDefaultOpenCardContent(baseName) : '')
  selectedProjectEntryKeys.value = [path]
  await nextTick()
  await projectTreeRef.value?.beginRename(path)
}

async function handleSidebarListAction(listKey: string, actionKey: string): Promise<void> {
  if (listKey === TIMELINE_LIST_KEY && actionKey === TIMELINE_REFRESH_ACTION_KEY) return refreshTimeline()
  if (isWorkbenchMode.value && listKey === PROJECT_FILES_LIST_KEY) {
    if (actionKey === PROJECT_REVEAL_ACTION_KEY) {
      try { await revealEntryInFileManager('') }
      catch (error) { notifyAppError('OC-E2004', { actionKey, path: projectPath.value, error }, locale.value) }
      return
    }
    if (actionKey === PROJECT_NEW_OPENCARD_ACTION_KEY) return createProjectEntry('opencard')
    if (actionKey === PROJECT_NEW_FOLDER_ACTION_KEY) return createProjectEntry('folder')
  }
  await handleCreateProjectListAction(listKey, actionKey)
}

async function addResourcePackageToProject(sourcePath: string): Promise<void> {
  try {
    await projectStore.installResourcePackageFile(sourcePath)
    notifySuccess(t('packageManager.added', { name: sourcePath.split('/').pop() ?? sourcePath }))
  } catch (error) { notifyAppError('OC-E3016', { path: sourcePath, error }, locale.value) }
}

async function pickAndAddResourcePackage(): Promise<void> {
  const sourcePath = await resourcePackageStore.pickSourceFile(t('packageManager.add'))
  if (sourcePath) await addResourcePackageToProject(sourcePath)
}

function performSessionClose(sessionIds: readonly string[]): void {
  for (const sessionId of sessionIds) closeSession(sessionId)
}

async function performPathTrash(path: string): Promise<void> {
  await trashFile(path)
  closeSessionsByPath(path)
  selectedProjectEntryKeys.value = selectedProjectEntryKeys.value.filter(key => key !== path)
  if (path.toLocaleLowerCase().endsWith(RESOURCE_PACKAGE_SUFFIX)) await projectStore.reloadProjectResourceEnvironment()
}

async function performApplicationClose(action: ApplicationCloseAction): Promise<void> {
  if (action === 'install-update') {
    if (availableUpdate.value) await installDownloadedUpdate()
    else if (import.meta.env.DEV && isDeveloperPreviewDownloaded.value) stopDeveloperUpdatePreview()
    return
  }
  await destroyWindow()
}

async function closeProjectFolder(destination: ProjectCloseDestination = 'current'): Promise<void> {
  if (!projectPath.value) return
  await requestProjectClose(destination)
}

async function handleExternalOpenPaths(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    const normalizedPath = path.replace(/\\/g, '/')
    const kind = classifyExternalOpenPath(normalizedPath)
    if (!kind) continue

    try {
      if (kind === 'resource-package') {
        if (!projectPath.value) {
          // 没有打开项目时，包先进软件存储，之后新建项目就能按需取用。
          await importDroppedResourcePackage(normalizedPath)
          continue
        }
        // 项目开着就直接装进去：装一个包就是把归档复制进 .opencard/packages。
        await addResourcePackageToProject(normalizedPath)
        continue
      }
      if (kind === 'project-resource') {
        const projectDirectory = getPathDirectory(getPathDirectory(normalizedPath))
        if (!projectDirectory) continue
        await openRecentProject(projectDirectory)
        await openEditorSession(normalizedPath)
        continue
      }
      if (kind === 'card') {
        await openEditorSession(normalizedPath)
        showPrimarySpacePage('workbench')
        continue
      }
      if (kind === 'template') {
        const imported = await templateStore.importUserTemplate(normalizedPath)
        selectedTemplateKey.value = imported.key
        shellLocation.value = openFlow(shellLocation.value, 'create-project')
        continue
      }
      if (kind === 'icon-pack') {
        // 图标集只属于项目，因此打开的图标包交给当前项目的图标页导入。
        if (!projectPath.value) {
          notifyWarning(t('projectConfig.icons.openProjectFirst'))
          continue
        }
        await handleProjectManagementSelect([resolveProjectPath(PROJECT_ICON_REGISTRY_FILE_NAME)])
        showPrimarySpacePage('workbench')
      }
    } catch (error) {
      notifyAppError('OC-E2002', { path: normalizedPath, error }, locale.value)
    }
  }
}

async function openCreateProject(): Promise<void> {
  if (isProjectTemplateBusy.value) return
  if (projectPath.value) {
    await requestProjectClose('create-project')
    return
  }

  enterCreateProject()
}

function createUntitledOpenCard() {
  showPrimarySpacePage('workbench')
  createDraftSession({
    fileTypeId: 'opencard',
  })
}

async function runShellCommand(actionKey: string): Promise<void> {
  const decoded = decodeShellCommand(actionKey)
  if (!decoded.ok) return
  if ((isCreateProjectMode.value && isProjectTemplateBusy.value) || isExportTemplateBusy.value) return
  switch (decoded.intent.type) {
    case 'resource-package.build': return openResourcePackageBuilder()
    case 'settings.open': return showSettingsPage('general')
    case 'updates.check': {
      const state = await checkForUpdate()
      if (state === 'failed') notifyWarning(t('app.updater.checkFailed'))
      else if (state === 'up-to-date') notifySuccess(t('app.updater.upToDate'), 'action.check')
      else if (state === 'available') notifySuccess(t('app.updater.updateFound', { version: updateVersion.value }), 'action.download')
      return
    }
    case 'developer.toggle': if (import.meta.env.DEV) { developerMode.value = !developerMode.value; stopDeveloperUpdatePreview() }; return
    case 'debug.toggle-overlays': if (import.meta.env.DEV) debugHideCdeOverlays.value = !debugHideCdeOverlays.value; return
    case 'debug.toggle-transparent-viewport': if (import.meta.env.DEV) debugTransparentCdeViewport.value = !debugTransparentCdeViewport.value; return
    case 'debug.toggle-passive-viewport': if (import.meta.env.DEV) debugPassiveCdeViewport.value = !debugPassiveCdeViewport.value; return
    case 'about.open': shellLocation.value = openFlow(shellLocation.value, 'about'); return
    case 'feedback.open': openFeedbackCenter(decoded.intent.view); return
    case 'editor.save': return triggerCurrentEditorSave()
    case 'editor.save-as': if (activeSession.value) await saveSessionAs(activeSession.value.id); return
    case 'editor.save-all': await saveAllEditors(); return
    case 'editor.toggle-auto-save': settingsStore.updateSetting('workspace.autoSave', !settingsStore.settings.value.workspace.autoSave); return
    case 'editor.undo': if (!isDiffMode.value) return triggerCurrentEditorUndo(); return
    case 'editor.redo': if (!isDiffMode.value) return triggerCurrentEditorRedo(); return
    case 'sidebar.toggle': toggleSidebarCollapsed(); return
    case 'bottom-panel.toggle': isBottomPanelExpanded.value = !isBottomPanelExpanded.value; return
    case 'window.fullscreen': try { await toggleWindowFullscreen() } catch { notifyError(t('app.notifications.fullscreenFailed')) }; return
    case 'primary-page.show': showPrimarySpacePage(decoded.intent.page); return
    case 'flow.return': return returnFromFlow()
    case 'project.new': return openCreateProject()
    case 'project.new-opencard': createUntitledOpenCard(); return
    case 'project.open': await openProject(); return
    case 'file.open': await openFileFromPicker(); return
    case 'project.close-to-welcome': return closeProjectFolder('welcome')
    case 'version.publish': if (projectPath.value && changesTreeData.value.rootKeys.length > 0) { commitVersionError.value = ''; commitVersionDialogOpen.value = true }; return
    case 'repository.initialize': if (projectPath.value && repositoryNeedsInitialization.value) void initializeProjectRepository(); return
    case 'template.export': if (projectPath.value) { resetExportTemplateSelection(); await ensureProjectTreeLoaded(); shellLocation.value = openFlow(shellLocation.value, 'export-template') }; return
    case 'card-documents.export': if (projectPath.value) await openProjectExportDialog(); return
  }
}

async function handleTitleBarMenuAction(_menuKey: string, actionKey: string) {
  await runShellCommand(actionKey)
}

async function handleWorkspaceFrameAction(actionKey: string) {
  if (actionKey === BUILD_RESOURCE_PACKAGE_ACTION_KEY) return openResourcePackageBuilder()
  const decoded = decodeShellWorkspaceIntent(actionKey)
  if (decoded.ok) {
    switch (decoded.intent.type) {
      case 'diff.exit': if (activeSession.value) setSessionMode(activeSession.value.id, 'edit'); return
      case 'diff.select': return selectWorkspaceDiff(decoded.intent.side, decoded.intent.revisionId)
      case 'card.render-image': return handleRenderCardImageAction(decoded.intent.source, decoded.intent.scale)
      case 'card.toggle-mode': return handleCardDesignerModeUpdate(activeCardDesignerMode.value === 'design' ? 'data-table' : 'design')
      case 'data-table.import': return importDataTableWorkbook()
      case 'data-table.export': return exportDataTableWorkbook()
    }
  }
  if (await currentEditorRef.value?.runWorkspaceAction?.(actionKey)) return
  await runShellCommand(actionKey)
}

async function handleRenderCardImageAction(faceMode: 'current' | 'both', scale: 0.5 | 1 | 2): Promise<void> {
  const source = getCardImageRenderSource()
  if (!source) return

  const faceKeys = faceMode === 'current'
    ? [source.activeFaceKey]
    : ['front', 'back'] as const
  const stem = (activeSession.value?.name ?? 'card').replace(/\.ocdocument$/i, '')

  if (faceMode === 'current') {
    const faceKey = faceKeys[0]!
    const outputPath = await fileSystemService.pickSavePath({
      defaultPath: `${stem}_${faceKey}.png`,
      fileTypeName: t('cardDesigner.renderImage.pngFile'),
      extensions: ['png'],
      title: t('cardDesigner.renderImage.saveCurrent'),
    })
    if (!outputPath) return
    const images = await renderCardImages(source.render, faceKeys, scale)
    const bytes = images?.get(faceKey)
    if (bytes) await fileSystemService.writeBinaryFile(outputPath, bytes)
    return
  }

  const outputDirectory = await fileSystemService.pickDirectory(t('cardDesigner.renderImage.saveBoth'))
  if (!outputDirectory) return
  const images = await renderCardImages(source.render, faceKeys, scale)
  if (!images) return
  const separator = outputDirectory.includes('\\') ? '\\' : '/'
  for (const faceKey of faceKeys) {
    const bytes = images.get(faceKey)
    if (bytes) await fileSystemService.writeBinaryFile(
      `${outputDirectory.replace(/[\\/]+$/, '')}${separator}${stem}_${faceKey}.png`,
      bytes,
    )
  }
}

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

  } catch (error) {
    if (actionKey === 'close') {
      notifyError(t('app.notifications.windowControlFailed'))
      return
    }

    notifyError(t('app.notifications.windowControlFailed'))
  }
}

async function handleOpenFile(path: string): Promise<EditorSession | null> {
  try {
    return await openEditorSession(path)
  } catch (error) {
    notifyAppError('OC-E2003', { path, error }, locale.value)
    return null
  }
}

async function openFileFromPicker(): Promise<void> {
  const path = await fileSystemService.pickFile({
    title: t('app.menu.openFile'),
    fileTypeName: t('app.menu.file'),
  })
  if (path) await handleOpenFile(path)
}

async function saveAllEditors(): Promise<void> {
  for (const session of sessions.value) {
    if (session.isDirty) await saveSession(session.id)
  }
}

/** 编辑器里的"移除包"：删项目里的文件只有一条路，这里和文件树里删一个文件走的是同一个入口。 */
async function handleEditorTrashFile(path: string): Promise<void> {
  try {
    await requestPathTrash(path)
  } catch (error) {
    notifyAppError('OC-E3016', { path, error }, locale.value)
  }
}

const { handle: handleGlobalKeydown } = useShellKeyboardShortcuts({
  fullscreenKey: SHELL_SHORTCUT_KEYS.fullscreen,
  newOpenCardKey: SHELL_SHORTCUT_KEYS.newOpenCard,
  newProjectKey: SHELL_SHORTCUT_KEYS.newProject,
  saveKey: SHELL_SHORTCUT_KEYS.save,
  undoKey: SHELL_SHORTCUT_KEYS.undo,
  redoKey: SHELL_SHORTCUT_KEYS.redo,
  isDiffMode,
  canUndo: canUndoActiveEditor,
  canRedo: canRedoActiveEditor,
  toggleFullscreen: toggleWindowFullscreen,
  newOpenCard: createUntitledOpenCard,
  newProject: openCreateProject,
  save: triggerCurrentEditorSave,
  undo: triggerCurrentEditorUndo,
  redo: triggerCurrentEditorRedo,
  translate: key => t(key),
  notifyError: message => notifyError(message),
})

async function loadSystemFontFamilies(): Promise<void> {
  try {
    systemFontFamilies.value = await invoke<string[]>('list_system_font_families')
  } catch (cause) {
    console.warn('[OpenCard/Settings] Unable to enumerate system fonts.', cause)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('focus', handleWindowFocus)
  disposeUnhandledExternalDrop = registerUnhandledExternalDrop((paths) => { void handleExternalOpenPaths(paths) })
  void startShellWindow()
  if (isTauri()) {
    void loadSystemFontFamilies()
  }
})


onUnmounted(() => {
  disposeEditorHost()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('focus', handleWindowFocus)
  disposeUnhandledExternalDrop?.()
  disposeUnhandledExternalDrop = null
  disposeShellWindow()
})
async function openResourcePackageBuilder(): Promise<void> {
  if (!projectPath.value) return
  await ensureProjectTreeLoaded()
  resourcePackageBuilderOpen.value = true
}</script>
