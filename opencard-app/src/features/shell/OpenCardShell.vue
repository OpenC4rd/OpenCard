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
      :primary-page-action="primaryPageToggleAction"
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
      <ShellSidebar
        :collapsed="effectiveSidebarCollapsed"
        :width="sidebarWidth"
        :body-groups="sidebarBodyGroups"
        :tail-buttons="sidebarTailButtons"
        :min-resize-width="SHELL_SIDEBAR_COLLAPSE_THRESHOLD"
        :max-resize-width="MAX_SIDEBAR_WIDTH"
        :compact-group-width="MIN_SIDEBAR_WIDTH"
        :persisted-layout="sidebarPersistedLayout"
        :resize-toggle-animating="sidebarResizeToggleAnimating"
        @head-button-clicked="runShellCommand"
        @list-button-clicked="handleSidebarListAction"
        @tail-button-clicked="runShellCommand"
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
        <div class="open-card-shell__workspace-stack">
          <div class="open-card-shell__workbench">
            <CreateProjectWorkspace
              v-if="isCreateProjectMode"
              ref="createProjectWorkspaceRef"
              :external-busy="isActivatingProject"
              :selected-key="selectedTemplateKey"
              :attached-resource-packages="attachedResourcePackages"
              @created="handleProjectCreated"
              @update:busy="isCreateProjectOperationBusy = $event"
              @update:selected-key="selectedTemplateKey = $event"
            />
            <ExportTemplateWorkspace
              v-else-if="isExportTemplateMode && projectPath"
              ref="exportTemplateWorkspaceRef"
              :project-path="projectPath"
              @selection-change="exportTemplateSelection = $event"
              @exported="path => notifySuccess(`${t('templateExport.status.exported')}: ${path}`)"
              @update:busy="isExportTemplateBusy = $event"
            />
            <SettingsWorkspace
              v-else-if="isSettingsMode"
              :view-model="activeSettingsCategory"
              :focus-key="settingsFocusKey"
              @intent="handleSettingsIntent"
            />
            <AboutWorkspace
              v-else-if="isAboutMode"
              :current-release-notes="currentReleaseNotes"
              :available-update-version="availableUpdate ? updateVersion : undefined"
              @back="showPrimaryShellPage(getCurrentPrimaryShellPage())"
              @show-available-release="releaseNotesDialogMode = 'available'"
              @send-feedback="openFeedbackCenter('submit')"
              @view-feedback="openFeedbackCenter('history')"
            />
            <WelcomeWorkspace
              v-else-if="isWelcomeMode"
              :covers="welcomeCoverWallCovers"
              :highlight-keys="selectedRecentProjectKeys"
              :background-visible="settingsStore.settings.value.workspace.showWelcomeBackground"
              @new-project="openCreateProject"
              @open-project="openProject"
              @update:background-visible="settingsStore.updateSetting('workspace.showWelcomeBackground', $event)"
            />
            <WorkbenchWorkspace v-else-if="isWorkbenchMode" :has-active-editor="Boolean(activeSession)">
              <Transition name="shell-editor-fade" mode="out-in">
                <component
                  v-if="activeSession"
                  :is="currentEditorComponent"
                  :key="currentEditorKey"
                  ref="currentEditorRef"
                  v-bind="currentEditorProps"
                  @modified="handleEditorModified"
                  @save="handleEditorSave"
                  @open-file="handleOpenFile"
                  @update-viewport-transform="handleViewportTransformUpdate"
                  @update:pixelated="handleImagePreviewPixelatedUpdate"
                  @update:card-designer-mode="handleCardDesignerModeUpdate"
                  @update-card-designer-layout="handleCardDesignerLayoutUpdate"
                  @update-card-designer-view="handleCardDesignerViewUpdate"
                  @update-diff-ui-state="handleDiffUiStateUpdate"
                  @issue-snapshot="handleEditorIssueSnapshot(activeSession.id, $event)"
                />
              </Transition>
            </WorkbenchWorkspace>
          </div>
          <WorkspaceBottomPanel
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

    <!-- 隐藏的导出渲染器 -->
    <div v-if="showExportRenderer" style="position: fixed; top: -9999px; left: -9999px;">
      <CardFaceRenderer
        v-if="exportCardFace && exportResourceContext"
        ref="exportRendererRef"
        :face="exportCardFace"
        :clip-to-face="true"
        :resource-context="exportResourceContext"
      />
    </div>

    <ProjectExportDialog :open="projectExportDialogOpen" :model-value="projectExportDialogTask"
      :documents="projectExportDocumentCandidates" :busy="isExportPreparing || isProjectExportRunning"
      :preparation-issues="exportPreparationIssues"
      @update:model-value="projectExportDialogTask = $event" @close="closeProjectExportDialog"
      @submit="startProjectExport" />
    <ResourcePackageBuilderDialog
      :open="resourcePackageBuilderOpen"
      :project-root-path="projectPath ?? ''"
      :project-name="projectName"
      :entries="resourcePackageBuilderEntries"
      @close="resourcePackageBuilderOpen = false"
    />
    <CommitVersionDialog
      :open="commitVersionDialogOpen"
      :busy="isCommittingVersion"
      :error="commitVersionError"
      @close="closeCommitVersionDialog"
      @submit="commitVersion"
    />

    <div
      v-if="isExternalFileDragActive && !isExternalFileDragOverZone"
      class="shell-file-drop-overlay"
      role="status"
      aria-live="polite"
    >
      <OcIcon name="file.generic" size="lg" tone="opencard" />
      <span>{{ t('app.shell.dropFilesToOpen') }}</span>
    </div>

    <UnsavedEditorsDialog
      :open="isUnsavedEditorsDialogOpen"
      :intent-type="pendingCloseIntent?.type"
      :rows="unsavedEditorDecisions"
      :busy="isUnsavedCloseBusy"
      :global-error="unsavedCloseError"
      :selected-count="unsavedSelectedCount"
      :pending-count="unsavedPendingCount"
      :save-count="unsavedSaveCount"
      :discard-count="unsavedDiscardCount"
      :all-pending-selected="allUnsavedPendingSelected"
      :some-pending-selected="someUnsavedPendingSelected"
      :can-confirm="canConfirmUnsavedClose"
      @select-all="setAllUnsavedPendingSelected"
      @select-row="setUnsavedRowSelected"
      @mark-discard="markSelectedUnsavedDiscard"
      @mark-save="markSelectedUnsavedSave"
      @change-decision="resetUnsavedDecision"
      @cancel="cancelUnsavedCloseRequest"
      @confirm="confirmUnsavedClose"
      @discard-single="discardSingleUnsavedEditor"
      @save-single="saveSingleUnsavedEditor"
    />

    <ReleaseNotesDialog
      :open="releaseNotesDialogMode !== null"
      :release="displayedReleaseNotes"
      :available="releaseNotesDialogMode === 'available'"
      :busy="isDownloadingUpdate || isInstallingUpdate"
      :downloaded="isUpdateDownloaded"
      @close="closeReleaseNotesDialog"
      @action="handleAvailableReleaseAction"
    />

    <FeedbackDialog
      :open="feedbackCenterPage === 'submit'"
      :initial-kind="feedbackDialogKind"
      active-page="submit"
      :diagnostics="latestFeedbackDiagnostics"
      @page-change="feedbackCenterPage = $event"
      @close="feedbackCenterPage = null"
    />

    <FeedbackHistoryDialog
      :open="feedbackCenterPage === 'history'"
      active-page="history"
      :developer-mode="developerMode"
      @page-change="feedbackCenterPage = $event"
      @close="feedbackCenterPage = null"
    />

    <OcDialog :open="Boolean(confirmationRequest)" :title="confirmationRequest?.title ?? ''"
      :description="confirmationRequest?.message ?? ''" size="sm" @close="resolveConfirmation(false)">
      <template #footer>
        <OcButton variant="ghost" @click="resolveConfirmation(false)">
          {{ t('projectTemplates.actions.cancel') }}
        </OcButton>
        <OcButton variant="solid" @click="resolveConfirmation(true)">
          {{ confirmationRequest?.confirmLabel ?? '' }}
        </OcButton>
      </template>
    </OcDialog>

    <FloatingMenuHost />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { confirm as showConfirm } from '@tauri-apps/plugin-dialog'
import { notifyAppError, notifyError, notifySuccess, notifyWarning, addTitleBarNotice, setTitleBarNoticeHistoryLimit } from '../notifications/titlebarNotices'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useProjectStore } from '../workspace/store/projectStore'
import { projectFontSources } from '../workspace/model/projectFontRegistry'
import {
  createDefaultOpenCardContent,
  useEditorSessionStore,
  type EditorSession,
} from '../workspace/store/editorSessionStore'
import FloatingMenuHost from '../../components/ui/FloatingMenuHost.vue'
import type { OcActionMenuEntry } from '../../components/standard/OcActionMenu.vue'
import OcIcon from '../../components/base/OcIcon.vue'
import OcButton from '../../components/base/OcButton.vue'
import OcDialog from '../../components/standard/OcDialog.vue'
import { normalizeNodeTail } from '../../shared/ui/node/node.types'
import { getPathDirectory } from '../../shared/model/filePath'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type {
  OcNode,
  OcNodeAction,
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeExternalDropEvent,
  OcNodeMoveEvent,
  OcNodeRenameCommitEvent,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'
import {
  registerUnhandledExternalDrop,
  useExternalFileDrop,
} from '../../shared/ui/drop/externalFileDrop'
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../settings/model/appSettings'
import SettingsWorkspace from '../settings/components/SettingsWorkspace.vue'
import CreateProjectWorkspace from '../project-templates/components/CreateProjectWorkspace.vue'
import ExportTemplateWorkspace from '../project-templates/components/ExportTemplateWorkspace.vue'
import WorkbenchWorkspace from './components/WorkbenchWorkspace.vue'
import WelcomeWorkspace from './components/WelcomeWorkspace.vue'
import type { WelcomeCoverWallCover } from './components/WelcomeCoverWall.vue'
import AboutWorkspace from './components/AboutWorkspace.vue'
import WorkspaceBottomPanel, {
  type WorkspaceBottomTab,
} from './components/WorkspaceBottomPanel.vue'
import UnsavedEditorsDialog from './components/UnsavedEditorsDialog.vue'
import ReleaseNotesDialog from './components/ReleaseNotesDialog.vue'
import FeedbackDialog from '../feedback/components/FeedbackDialog.vue'
import FeedbackHistoryDialog from '../feedback/components/FeedbackHistoryDialog.vue'
import { editorHistoryManager } from '../editor-runtime/history/editorHistoryManager'
import type { ProjectExportTask } from '../workspace/model/projectMetadata'
import type { FeedbackKind, FeedbackPage } from '../feedback/model/feedback'
import { useFeedbackDiagnostics } from '../feedback/composables/useFeedbackDiagnostics'
import { useFeedbackInbox } from '../feedback/composables/useFeedbackInbox'
import { appOutputEntries, clearAppOutputEntries, publishAppOutput } from '../logging/appOutput'
import { reportAppError } from '../logging/appErrorCatalog'
import { reportCatalogWarnings } from '../logging/catalogWarningReporter'
import type {
  CreatedProject,
  ProjectTemplate,
  ProjectTemplateKey,
  TemplateExportSelection,
} from '../project-templates/model/projectTemplate'
import { resolveProjectTemplateName } from '../project-templates/model/projectTemplate'
import { useProjectTemplateStore } from '../project-templates/store/projectTemplateStore'
import type { StoredResourcePackage } from '../workspace/model/storedResourcePackage'
import { useStoredResourcePackageStore } from '../workspace/store/storedResourcePackageStore'
import { loadBuiltinResourcePackages } from '../workspace/services/builtinResourcePackageCatalog'
import { useSettingsWorkspace } from '../settings/composables/useSettingsWorkspace'
import { useAppSettingsStore } from '../settings/store/appSettingsStore'
import { registerSettingsNavigator } from '../settings/settingsNavigation'
import {
  createPublisherKey,
  isSettingsCategoryKey,
  parseAppTheme,
  serializeAppTheme,
  type AppSettingKey,
  type SettingsCategoryKey,
  type SettingsIntent,
} from '../settings/model/appSettings'
import CardFaceRenderer from '../card-rendering/components/CardFaceRenderer.vue'
import type {
  EditorIssueSnapshot,
  SessionIssueNavigationRequest,
} from '../editor-runtime/model/editorIssue'
import { CARD_DOCUMENT_SUFFIX, resolveFileType } from '../workspace/model/fileTypes'
import { resolveInstalledResourcePackageRootPath } from '../workspace/model/resourcePackage'
import { PROJECT_ICON_REGISTRY_FILE_NAME } from '../workspace/model/projectStructure'
import { useProjectExport } from './composables/useProjectExport'
import ProjectExportDialog from '../exporting/components/ProjectExportDialog.vue'
import ResourcePackageBuilderDialog from '../workspace/components/ResourcePackageBuilderDialog.vue'
import CommitVersionDialog from '../version-control/components/CommitVersionDialog.vue'
import type { ExportDocumentCandidate } from '../../components/editors/ProjectExportTaskEditor.vue'
import {
  createDefaultProjectExportTask,
  type ExportTaskValidationIssue,
} from '../exporting/exportTask'
import { useAppUpdater } from './composables/useAppUpdater'
import { useShellProgressTasks } from './composables/useShellProgressTasks'
import { useShellCloseCoordinator } from './composables/useShellCloseCoordinator'
import type { ApplicationCloseAction } from './composables/useUnsavedSessionGuard'
import { useShellEditorHost } from './composables/useShellEditorHost'
import { useShellProjectLifecycle } from './composables/useShellProjectLifecycle'
import { recentProjectKey, useRecentProjectSnapshots } from './composables/useRecentProjectSnapshots'
import { useShellSidebarLayout } from './composables/useShellSidebarLayout'
import { useShellWindow } from './composables/useShellWindow'
import { useShellVersionControl } from './composables/useShellVersionControl'
import { useWorkspaceIssues } from './composables/useWorkspaceIssues'
import { navigateWorkspaceIssue } from './services/workspaceIssueNavigation'
import {
  OPENED_EDITOR_CLOSE_ACTION_KEY,
  PROJECT_ENTRY_CONFIRM_DELETE_ACTION_KEY,
  PROJECT_ENTRY_COPY_ABSOLUTE_PATH_ACTION_KEY,
  PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY,
  PROJECT_ENTRY_RENAME_ACTION_KEY,
  PROJECT_ENTRY_REVEAL_ACTION_KEY,
  PROJECT_PACKAGE_DELETE_ACTION_KEY,
  PROJECT_PACKAGE_VERIFY_ACTION_KEY,
  useShellFileTree,
} from './composables/useShellFileTree'
import ShellSidebar from './components/ShellSidebar.vue'
import ShellTitleBar from './components/ShellTitleBar.vue'
import ShellWorkspaceFrame from './components/ShellWorkspaceFrame.vue'
import {
  classifyExternalOpenPath,
} from './services/externalOpenService'
import { fileSystemService } from '../workspace/services/fileSystemService'
import type {
  ShellAction,
  ShellWorkspaceAction,
  ShellTitleBarAppAction,
  ShellTitleBarMenuGroup,
  ShellTitleBarWindowControl,
} from './shell.types'
import {
  getOtherPrimaryShellPage,
  getPrimaryShellPage,
  type ProjectCloseDestination,
  type PrimaryShellPage,
  type ShellPage,
} from './shellPage'
import { useShellSidebarLists } from './composables/useShellSidebarLists'
import {
  BUILTIN_RESOURCE_PACKAGES_GROUP_KEY,
  BUILTIN_TEMPLATES_GROUP_KEY,
  DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
  IMPORT_RESOURCE_PACKAGE_ACTION_KEY,
  PROJECT_FILES_LIST_KEY,
  PROJECT_NEW_FOLDER_ACTION_KEY,
  PROJECT_NEW_OPENCARD_ACTION_KEY,
  PROJECT_REVEAL_ACTION_KEY,
  RESOURCE_PACKAGES_LIST_KEY,
  SHELL_SIDEBAR_COLLAPSE_THRESHOLD,
  STORED_RESOURCE_PACKAGES_GROUP_KEY,
  TIMELINE_LIST_KEY,
  TIMELINE_REFRESH_ACTION_KEY,
  USER_TEMPLATES_GROUP_KEY,
  USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
} from './shellSidebarConfig'
import { TIMELINE_COMPARE_WITH_DISK_ACTION_KEY } from '../version-control/useProjectTimeline'
import { CHANGED_FOLDER_KEY_MARK } from '../version-control/changedPathTree'
import {
  CHANGE_DESELECT_ACTION_KEY,
  CHANGE_DISCARD_ACTION_KEY,
  CHANGE_IGNORE_EXTENSION_ACTION_KEY,
  CHANGE_IGNORE_FILE_ACTION_KEY,
  CHANGE_IGNORE_FOLDER_PREFIX,
  CHANGE_SELECT_ACTION_KEY,
  resolveDiscardTargets,
} from '../version-control/changedPathActions'
import { useOcdocumentDiffSession } from '../version-control/useOcdocumentDiffSession'

const { t, locale } = useI18n()
const DIFF_EXIT_ACTION_KEY = 'diff.exit'
const DIFF_BEFORE_ACTION_KEY = 'diff.before'
const DIFF_AFTER_ACTION_KEY = 'diff.after'
const IMPORT_TEMPLATE_ACTION_KEY = 'import-template'
const TEMPLATE_REMOVE_ACTION_KEY = 'template.remove'
const ATTACH_RESOURCE_PACKAGE_ACTION_KEY = 'resource-package.attach'
const ATTACHED_RESOURCE_PACKAGE_ACTION_KEY = 'resource-package.attached'
const REMOVE_RESOURCE_PACKAGE_ACTION_KEY = 'resource-package.remove'
const RECENT_PROJECT_OPEN_ACTION_KEY = 'recent-project.open'
const BUILD_RESOURCE_PACKAGE_ACTION_KEY = 'file.build-package'
const RECENT_PROJECT_REVEAL_ACTION_KEY = 'recent-project.reveal'
const RECENT_PROJECT_RELOCATE_ACTION_KEY = 'recent-project.relocate'
const RECENT_PROJECT_REMOVE_ACTION_KEY = 'recent-project.remove'
const TEMPLATE_EXCLUDE_ACTION_KEY = 'template.exclude'
const TEMPLATE_INCLUDE_ACTION_KEY = 'template.include'
const TEMPLATE_COVER_ADD_ACTION_KEY = 'template.cover.add'
const TEMPLATE_COVER_REMOVE_ACTION_KEY = 'template.cover.remove'
const TEMPLATE_ENTRY_ADD_ACTION_KEY = 'template.entry.add'
const TEMPLATE_ENTRY_REMOVE_ACTION_KEY = 'template.entry.remove'
const TEMPLATE_ENTRY_TREE_PREFIX = 'template-entry:'
const TEMPLATE_COVER_TREE_PREFIX = 'template-cover:'
const CARD_DESIGNER_MODE_ACTION_KEY = 'card-designer.toggle-mode'
const CARD_DATA_TABLE_IMPORT_ACTION_KEY = 'card-designer.data-table.import'
const CARD_DATA_TABLE_EXPORT_ACTION_KEY = 'card-designer.data-table.export'
const CARD_RENDER_IMAGE_ACTION_KEY = 'card-designer.render-image'
const CARD_RENDER_IMAGE_OPTION_PREFIX = `${CARD_RENDER_IMAGE_ACTION_KEY}.`
const DICTIONARY_IMPORT_ACTION_KEY = 'dictionary.workbook.import'
const DICTIONARY_EXPORT_ACTION_KEY = 'dictionary.workbook.export'
const EMPTY_TREE_DATA: OcNodeCollection = {
  rootKeys: [],
  items: new Map(),
  children: new Map(),
}
const projectStore = useProjectStore()
const {
  projectPath,
  projectProfile,
  projectInformation,
  projectFontFamilies,
  projectPackageManifests,
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
  removeResourcePackage,
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
const resourcePackageStore = useStoredResourcePackageStore()
const shellPage = ref<ShellPage>({ type: 'welcome' })
const isSettingsMode = computed(() => shellPage.value.type === 'settings')
const isCreateProjectMode = computed(() => shellPage.value.type === 'create-project')
const isExportTemplateMode = computed(() => shellPage.value.type === 'export-template')
const isAboutMode = computed(() => shellPage.value.type === 'about')
const isWelcomeMode = computed(() => shellPage.value.type === 'welcome')
const isDiffMode = computed(() => activeSession.value?.mode === 'diff')
const isWorkbenchMode = computed(() => shellPage.value.type === 'workbench')
const isAuxiliaryMode = computed(() => (
  isSettingsMode.value || isCreateProjectMode.value || isExportTemplateMode.value || isAboutMode.value
))

function getCurrentPrimaryShellPage(): PrimaryShellPage {
  return getPrimaryShellPage(shellPage.value)
}

function showPrimaryShellPage(page: PrimaryShellPage): void {
  shellPage.value = { type: page }
}

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
const selectedTemplateKey = ref<ProjectTemplateKey | null>(null)
/** 应用内确认：移除包、删除模板这类破坏性操作统一走这里，不再用系统对话框。 */
const confirmationRequest = ref<{
  title: string
  message: string
  confirmLabel: string
  resolve: (accepted: boolean) => void
} | null>(null)
const attachedResourcePackagePaths = ref<string[]>([])
/** 随应用发布的内置包：和软件存储里的包一起列在「预装的包」里，只是不能从存储移除。 */
const builtinResourcePackages = ref<readonly StoredResourcePackage[]>([])
const selectedResourcePackageKeys = ref<readonly string[]>([])
/** 两棵树的展开状态都是受控的：默认两组都展开，用户折叠后由这里记住。 */
const templateExpandedKeys = ref<string[]>([BUILTIN_TEMPLATES_GROUP_KEY, USER_TEMPLATES_GROUP_KEY])
const resourcePackageExpandedKeys = ref<string[]>([
  BUILTIN_RESOURCE_PACKAGES_GROUP_KEY,
  STORED_RESOURCE_PACKAGES_GROUP_KEY,
])
const allResourcePackages = computed(() => [...builtinResourcePackages.value, ...resourcePackageStore.packs.value])
/** 选中项里真正是包的 Key（分组节点与空态节点也在同一棵树里被选中，但不是包）。 */
const selectedResourcePackagePaths = computed(() => {
  const paths = new Set(allResourcePackages.value.map((pack) => pack.path))
  return selectedResourcePackageKeys.value.filter((key) => paths.has(key))
})
const canUseSelectedResourcePackages = computed(() => selectedResourcePackagePaths.value
  .some((path) => !attachedResourcePackagePaths.value.includes(path)))
const canDisableSelectedResourcePackages = computed(() => selectedResourcePackagePaths.value
  .some((path) => attachedResourcePackagePaths.value.includes(path)))
const attachedResourcePackages = computed(() => attachedResourcePackagePaths.value
  .map((path) => allResourcePackages.value.find((pack) => pack.path === path))
  .filter((pack): pack is StoredResourcePackage => Boolean(pack)))
const createProjectWorkspaceRef = ref<InstanceType<typeof CreateProjectWorkspace> | null>(null)
const exportTemplateWorkspaceRef = ref<InstanceType<typeof ExportTemplateWorkspace> | null>(null)
const exportTemplateSelection = ref<TemplateExportSelection>({
  excludedPaths: [],
  entries: [],
  entryNames: {},
  covers: [],
})
const isCreateProjectOperationBusy = ref(false)
const isImportingResourcePackage = ref(false)
const isExportTemplateBusy = ref(false)
const isBottomPanelExpanded = ref(false)
const isExportPreparing = ref(false)
const exportPreparationIssues = ref<readonly ExportTaskValidationIssue[]>([])
const projectExportDialogOpen = ref(false)
const projectExportDialogTask = ref<ProjectExportTask>(createDefaultProjectExportTask())
const projectExportDocumentCandidates = ref<readonly ExportDocumentCandidate[]>([])
const resourcePackageBuilderOpen = ref(false)
const resourcePackageBuilderEntries = computed(() => indexedEntries.value
  .filter(entry => entry.isFile)
  .map(entry => entry.name.replace(/\\/g, '/')))
const developerMode = ref(false)
const debugHideCdeOverlays = ref(false)
const debugTransparentCdeViewport = ref(false)
const debugPassiveCdeViewport = ref(false)
const DEBUG_NOTICE_COUNT = 128
const DEBUG_NOTICE_INTERVAL_MS = 40
let debugNoticeTimer: number | null = null
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
const isProjectTemplateBusy = computed(() => (
  isActivatingProject.value
  || isCreateProjectOperationBusy.value
  || isImportingResourcePackage.value
))
const settingsCategoryKey = computed<SettingsCategoryKey>(() =>
  shellPage.value.type === 'settings' ? shellPage.value.categoryKey : 'general'
)
const settingsFocusKey = computed(() => (
  shellPage.value.type === 'settings' ? shellPage.value.focusKey : undefined
))
const projectOpen = computed(() => Boolean(projectPath.value))
const systemFontFamilies = ref<readonly string[]>([])
const { categoryTreeData: settingsCategoryTreeData, activeCategory: activeSettingsCategory, settingsAnchorFor } = useSettingsWorkspace({
  settings: settingsStore.settings,
  categoryKey: settingsCategoryKey,
  projectOpen,
  systemFontFamilies,
  translate: t,
})

/**
 * 跳转到某个设置项：切到它所在的分类并把该行带到前台。
 * 供 shell 内部与 settingsNavigation 的通用入口共用同一实现。
 */
function openSettingsAt(key: AppSettingKey): void {
  const anchor = settingsAnchorFor(key)
  shellPage.value = {
    type: 'settings',
    categoryKey: anchor?.category ?? settingsCategoryKey.value,
    returnPage: getCurrentPrimaryShellPage(),
    focusKey: key,
  }
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
const projectTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)

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

const {
  tasks: titleBarTasks,
  setTask: setShellProgressTask,
  removeTask: removeShellProgressTask,
  cancelTask: cancelShellProgressTask,
} = useShellProgressTasks()
const UPDATE_PROGRESS_TASK_KEY = 'app-update'
const EXPORT_TEMPLATE_PROGRESS_TASK_KEY = 'export-template'
const RESOURCE_PACKAGE_INSTALL_TASK_KEY = 'create-project-resource-packages'
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
  openFile: openEditorSession,
  openPreviewFile,
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
  saveActiveSession,
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
  selectChangeNode,
  discardChanges,
  ignoreChangePath,
  ignoreChangeExtension,
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
  settings: settingsStore.settings,
})
const diffSessionState = useOcdocumentDiffSession({
  projectRoot: projectPath,
  filePath: timelineFilePath,
  fileName: timelineFileName,
  revisions: timelineRevisionOptions,
})
let synchronizedDiffSessionKey = ''
watch(
  () => [
    activeSession.value?.id ?? '',
    activeSession.value?.mode ?? 'edit',
    activeSession.value?.diff?.beforeRevisionId ?? null,
    activeSession.value?.diff?.afterRevisionId ?? null,
  ] as const,
  ([sessionId, mode, beforeId, afterId]) => {
    if (mode !== 'diff' || !sessionId || !activeSession.value?.diff) return
    if (beforeId === afterId) return
    const key = `${sessionId}|${beforeId ?? 'current'}|${afterId ?? 'current'}`
    if (key === synchronizedDiffSessionKey) return
    synchronizedDiffSessionKey = key
    void diffSessionState.selectComparison(beforeId, afterId)
  },
  { immediate: true },
)
const editorComparison = computed(() => {
  if (activeSession.value?.mode !== 'diff') return null
  const session = diffSessionState.diffSession.value
  if (!session) return null
  return {
    before: { ...session.before, revisionId: session.before.commitId, resourceRootPath: diffSessionState.beforeSnapshotRoot.value },
    after: { ...session.after, revisionId: session.after.commitId, resourceRootPath: diffSessionState.afterSnapshotRoot.value },
  }
})
/**
 * 进入"某个版本 ↔ 磁盘"的差异模式：两边的快照都取到之后才切换会话。
 * 任何一边取不到（或期间用户切走了别的文件）就保持原来的编辑状态，编辑器不会停在一个空白的对比上。
 */
async function enterDiffComparison(sessionId: string, beforeCommitId: string): Promise<void> {
  await diffSessionState.selectComparison(beforeCommitId, null)
  if (
    diffSessionState.error.value
    || diffSessionState.before.value?.commitId !== beforeCommitId
    || diffSessionState.after.value?.commitId !== null
    || activeSession.value?.id !== sessionId
  ) return

  synchronizedDiffSessionKey = `${sessionId}|${beforeCommitId}|current`
  setSessionMode(sessionId, 'diff', {
    beforeRevisionId: beforeCommitId,
    afterRevisionId: null,
  })
}

async function handleTimelineAction(event: OcNodeActionEvent) {
  if (event.actionKey !== TIMELINE_COMPARE_WITH_DISK_ACTION_KEY || !timelineFilePath.value) return
  const commitId = event.key.startsWith('timeline:') ? event.key.slice('timeline:'.length) : null
  const sessionId = activeSession.value?.id
  if (!commitId || !sessionId) return

  await enterDiffComparison(sessionId, commitId)
}

/**
 * 更改列表点击：打开这条改动对应的文件，并直接进入"它最后一次提交 ↔ 磁盘"的差异模式。
 * 与时间线的"与磁盘版本对比"走同一条落差流程，只是左半边固定成该文件最新的那个提交。
 * 新增的文件还没有可比的版本（照常打开原文），已经删掉的文件磁盘上没有内容（这一条不响应）。
 */
async function handleChangesNodeActivate(event: OcNodeActivateEvent): Promise<void> {
  if (event.key.startsWith(CHANGED_FOLDER_KEY_MARK)) {
    handleChangesExpansionChange({
      key: event.key,
      expanded: !changesExpandedKeys.value.includes(event.key),
    })
    return
  }

  // 未跟踪的目录在更改列表里是一条以 `/` 结尾的整体条目，它没有可以打开的文件。
  const relativePath = event.key
  if (relativePath.endsWith('/')) return
  const entry = statusEntries.value.find(candidate => candidate.path === relativePath)
  if (!entry || entry.indexDeleted || entry.worktreeDeleted) return

  const session = await handleOpenFile(resolveProjectPath(relativePath))
  if (!session || timelineFilePath.value !== relativePath) return

  const beforeCommitId = await latestCommitIdForPath(relativePath)
  if (!beforeCommitId) return

  await enterDiffComparison(session.id, beforeCommitId)
}

/**
 * 更改列表的行内与右键动作：勾选、放弃更改、忽略此文件/此文件夹/这一类扩展名。
 * 放弃会改动磁盘，所以先确认；忽略只是往 `.gitignore` 写一行，随时可以改回来。
 */
async function handleChangesAction(event: OcNodeActionEvent): Promise<void> {
  if (event.actionKey === CHANGE_SELECT_ACTION_KEY || event.actionKey === CHANGE_DESELECT_ACTION_KEY) {
    selectChangeNode(event.key, event.actionKey === CHANGE_SELECT_ACTION_KEY)
    return
  }
  if (event.actionKey === CHANGE_DISCARD_ACTION_KEY) {
    const targets = resolveDiscardTargets(changesTreeData.value, statusEntries.value, event.key)
    if (targets.tracked.length === 0 && targets.untracked.length === 0) return
    const name = changesTreeData.value.items.get(event.key)?.label ?? event.key
    const accepted = await requestConfirmation({
      title: t('sidebar.changesDiscard'),
      message: targets.untracked.length > 0
        ? t('sidebar.changesConfirmDiscardWithNew', { name })
        : t('sidebar.changesConfirmDiscard', { name }),
      confirmLabel: t('sidebar.changesDiscard'),
    })
    if (accepted) await discardChanges(targets)
    return
  }
  if (event.actionKey === CHANGE_IGNORE_FILE_ACTION_KEY) {
    await ignoreChangePath(event.key, 'file')
    return
  }
  if (event.actionKey === CHANGE_IGNORE_EXTENSION_ACTION_KEY) {
    await ignoreChangeExtension(event.key)
    return
  }
  if (event.actionKey.startsWith(CHANGE_IGNORE_FOLDER_PREFIX)) {
    await ignoreChangePath(event.actionKey.slice(CHANGE_IGNORE_FOLDER_PREFIX.length), 'folder')
  }
}

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
    saveActiveSession,
  },
})

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
    openFile: openEditorSession,
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
  shellPage,
  translate: t,
})

/**
 * 创建本身就是复制模板加改名，因此附加包装在项目打开之后才安装：
 * 装包失败只影响那一个包，项目本身照常可用。
 */
async function handleProjectCreated(project: CreatedProject): Promise<void> {
  const activated = await activateCreatedProject(project)
  if (activated) await installAttachedResourcePackages()
}

async function installAttachedResourcePackages(): Promise<void> {
  const packs = attachedResourcePackages.value
  if (packs.length === 0) return
  // 一个 Key 在项目里只能存在一份，因此先装进去的那个生效，其余的同 Key 包都跳过。
  const installedKeys = new Set(
    [...projectStore.projectResourcePackages.value.keys()].map((key) => key.toLocaleLowerCase()),
  )
  const pending = packs.filter((pack) => {
    const key = pack.key.toLocaleLowerCase()
    if (installedKeys.has(key)) {
      notifyWarning(t('projectTemplates.status.resourcePackageAlreadyInstalled', { name: pack.name }))
      return false
    }
    installedKeys.add(key)
    return true
  })
  if (pending.length === 0) return

  let completed = 0
  const publish = () => setShellProgressTask({
    key: RESOURCE_PACKAGE_INSTALL_TASK_KEY,
    title: t('projectTemplates.status.installingResourcePackages'),
    progress: completed / pending.length,
    cancellable: false,
  })
  publish()
  try {
    for (const pack of pending) {
      try {
        const installed = await projectStore.installResourcePackageFile(pack.path)
        notifySuccess(t('resourcePackage.installed', { name: installed.manifest.name }))
      } catch (cause) {
        reportUncodedFailure(
          t('projectTemplates.errors.resourcePackageInstallFailed', { name: pack.name }),
          cause,
        )
      }
      completed += 1
      publish()
    }
  } finally {
    removeShellProgressTask(RESOURCE_PACKAGE_INSTALL_TASK_KEY)
  }
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
 * 会话在壳层里的显示名，列表与页面顶端共用这一份：编辑器声明的标题优先，否则用会话自己的身份名；
 * 外部与草稿带作用域前缀，未保存的会话在名字后加标记。
 */
function formatSessionTitle(session: EditorSession): string {
  const name = `${session.presentation?.title ?? session.name}${session.isDirty ? ' *' : ''}`
  if (session.resourceKind === 'external') {
    return t('sidebar.editorTitles.external', { name })
  }
  if (session.resourceKind === 'draft') {
    return t('sidebar.editorTitles.draft', { name })
  }
  return name
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
  findProjectPackageKeyByNodeKey,
  setProjectEntryExpanded,
} = useShellFileTree({
  projectPath,
  indexedEntries,
  packageManifests: projectPackageManifests,
  hideDotFiles: computed(() => settingsStore.settings.value.workspace.hideDotFiles),
  sessions,
  formatSessionTitle,
  activeSession,
  isDirectoryExpanded,
  activateSession,
  openPreviewFile,
  ensureProjectManagementStructure,
  translate: t,
  registeredFontSources: computed(() => fontRegistryReady.value
    ? projectFontFamilies.value.flatMap(projectFontSources)
    : null),
})

/** 模板节点：用户模板自带"删除"尾部动作，内置模板不能删。 */
function createTemplateItems(templates: readonly ProjectTemplate[], removable: boolean): Map<string, OcNode> {
  const items = new Map<string, OcNode>()
  const removeAction: OcNodeAction = {
    key: TEMPLATE_REMOVE_ACTION_KEY,
    title: t('projectTemplates.actions.delete'),
    icon: 'action.delete',
    iconTone: 'danger',
  }
  for (const template of templates) {
    items.set(template.key, {
      label: resolveProjectTemplateName(template, locale.value),
      visual: { type: 'icon', icon: 'file.opencard' },
      ...(removable ? { tail: [removeAction] } : {}),
    })
  }
  return items
}

function createEmptyCatalogItem(key: string, label: string): [string, OcNode] {
  return [key, { label, visual: { type: 'icon', icon: 'file.generic' }, disabled: true }]
}

function createRecentProjectTreeData(
  paths: readonly string[],
  availability: ReadonlyMap<string, boolean>,
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const rootKeys = paths.map((path) => {
    const key = recentProjectKey(path)
    const isMissing = availability.get(key) === false
    const actions: OcNodeAction[] = [
      isMissing
        ? {
            key: RECENT_PROJECT_RELOCATE_ACTION_KEY,
            title: t('sidebar.relocateRecentProject'),
            icon: 'status.folder-open',
          }
        : {
            key: RECENT_PROJECT_OPEN_ACTION_KEY,
            title: t('sidebar.openRecentProject'),
            icon: 'action.play',
            iconTone: 'success',
          },
    ]
    if (!isMissing) {
      actions.push({
        key: RECENT_PROJECT_REVEAL_ACTION_KEY,
        title: t('sidebar.fileActions.reveal'),
        icon: 'status.folder-open',
      })
    }
    actions.push({
      key: RECENT_PROJECT_REMOVE_ACTION_KEY,
      title: t('sidebar.removeRecentProject'),
      icon: 'action.close',
    })
    items.set(key, {
      label: path.split(/[/\\]/).filter(Boolean).pop() || path,
      tail: [path, ...actions],
      visual: {
        type: 'icon',
        icon: isMissing ? 'status.folder-alert' : 'status.folder-open',
        iconTone: isMissing ? 'warning' : undefined,
      },
    })
    return key
  })
  return { rootKeys, items, children: new Map() }
}

/** 模板树：内置模板与我的模板各成一个分组，导入动作挂在"我的模板"上（和包那棵树同一套结构）。 */
const templateTreeData = computed<OcNodeCollection>(() => {
  const groups: [string, string, readonly ProjectTemplate[], boolean, OcNodeAction[]][] = [
    [BUILTIN_TEMPLATES_GROUP_KEY, t('projectTemplates.sections.builtinTemplates'),
      templateStore.builtinTemplates.value, false, []],
    [USER_TEMPLATES_GROUP_KEY, t('projectTemplates.sections.user'),
      templateStore.userTemplates.value, true, [{
        key: IMPORT_TEMPLATE_ACTION_KEY,
        title: t('projectTemplates.actions.import'),
        icon: 'action.import',
      }]],
  ]
  const items = new Map<string, OcNode>()
  const children = new Map<string, readonly string[]>()
  for (const [groupKey, label, templates, removable, actions] of groups) {
    items.set(groupKey, {
      label,
      visual: { type: 'icon', icon: 'file.package' },
      ...(actions.length ? { tail: actions } : {}),
    })
    if (templates.length === 0) {
      const emptyKey = `${groupKey}:empty`
      const [key, node] = createEmptyCatalogItem(emptyKey, groupKey === USER_TEMPLATES_GROUP_KEY
        ? t('projectTemplates.status.noUserTemplates')
        : t('projectTemplates.status.noBuiltinTemplates'))
      items.set(key, node)
      children.set(groupKey, [emptyKey])
      continue
    }
    children.set(groupKey, templates.map(template => template.key))
    for (const [key, node] of createTemplateItems(templates, removable)) items.set(key, node)
  }
  return {
    rootKeys: [BUILTIN_TEMPLATES_GROUP_KEY, USER_TEMPLATES_GROUP_KEY],
    items,
    children,
  }
})
const resourcePackageTreeData = computed<OcNodeCollection>(() => (
  createResourcePackageTreeData(builtinResourcePackages.value, resourcePackageStore.packs.value)
))
const recentProjectSnapshots = useRecentProjectSnapshots({
  recentProjects: computed(() => settingsStore.settings.value.projectCreation.recentProjects),
})
const recentProjectAvailability = computed<ReadonlyMap<string, boolean>>(() => new Map(
  [...recentProjectSnapshots.snapshots.value].map(([key, snapshot]) => [key, snapshot.available]),
))
const welcomeCoverWallCovers = computed<readonly WelcomeCoverWallCover[]>(() => (
  settingsStore.settings.value.projectCreation.recentProjects.flatMap(path => {
    const snapshot = recentProjectSnapshots.snapshots.value.get(recentProjectKey(path))
    if (!snapshot?.available || !snapshot.cover) return []
    return [{ projectKey: recentProjectKey(path), src: snapshot.cover.src }]
  })
))
const recentProjectTreeData = computed(() => (
  createRecentProjectTreeData(
    settingsStore.settings.value.projectCreation.recentProjects,
    recentProjectAvailability.value,
  )
))
const selectedRecentProjectKeys = ref<string[]>([])
watch(projectPath, () => {
  selectedRecentProjectKeys.value = []
}, { flush: 'sync' })

/** 回到欢迎页时重新探测封面，让刚设置的封面立即可见。 */
watch(isWelcomeMode, (welcome) => {
  if (welcome) void recentProjectSnapshots.refresh()
})

watch(
  () => templateStore.templates.value,
  (templates) => {
    if (selectedTemplateKey.value && templates.some((template) => template.key === selectedTemplateKey.value)) return
    selectedTemplateKey.value = templates[0]?.key ?? null
  },
  { immediate: true },
)
watch(
  () => resourcePackageStore.packs.value,
  (packs) => {
    attachedResourcePackagePaths.value = attachedResourcePackagePaths.value
      .filter((path) => packs.some((pack) => pack.path === path))
  },
  { immediate: true },
)

/** 进入新建项目页时读取软件存储里的包与随应用发布的内置包；被跳过的包只上报一次。 */
watch(isCreateProjectMode, (active) => {
  if (active) void loadStoredResourcePackages()
}, { immediate: true })

async function loadStoredResourcePackages(): Promise<void> {
  const builtin = await loadBuiltinResourcePackages().catch(() => null)
  if (builtin) {
    builtinResourcePackages.value = builtin.packs
    reportCatalogWarnings({
      warnings: builtin.warnings,
      summaryKey: 'projectTemplates.status.unreadableResourcePackages',
      itemKey: 'projectTemplates.status.unreadableResourcePackage',
      translate: t,
    })
  }
  try {
    await resourcePackageStore.load()
    reportCatalogWarnings({
      warnings: resourcePackageStore.warnings.value,
      summaryKey: 'projectTemplates.status.unreadableResourcePackages',
      itemKey: 'projectTemplates.status.unreadableResourcePackage',
      translate: t,
    })
  } catch {
    notifyError(t('projectTemplates.errors.resourcePackageLibraryUnavailable'))
  }
}
const projectName = computed(() => {
  if (!projectPath.value) return ''
  return projectInformation.value?.name || projectPath.value.split(/[/\\]/).pop() || ''
})

const projectFolderName = computed(() => {
  if (!projectPath.value) return ''
  return projectPath.value.split(/[/\\]/).filter(Boolean).pop() || ''
})

const shellMainStyle = computed(() => ({
  '--shell-sidebar-width': effectiveSidebarCollapsed.value ? '0px' : `${sidebarWidth.value}px`,
}))

function normalizeTreePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function exportRelativePath(key: string): string {
  const root = normalizeTreePath(projectPath.value)
  const normalized = normalizeTreePath(key)
  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized
}

function pathContains(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`)
}

function isExportPathExcluded(relativePath: string): boolean {
  return relativePath === '.opencard-cache'
    || relativePath.startsWith('.opencard-cache/')
    || exportTemplateSelection.value.excludedPaths.some((excluded) => pathContains(excluded, relativePath))
}

const exportTemplateTreeData = computed<OcNodeCollection>(() => {
  const items = new Map<string, OcNode>()
  for (const [key, item] of projectTreeData.value.items) {
    const relativePath = exportRelativePath(key)
    const isProjectFile = [
      'project.json',
      'locale.json',
      'fonts/fonts.json',
      'icons/icons.json',
      'packages/packages.json',
    ].includes(relativePath)
    const isRuntimeCache = relativePath === '.opencard-cache' || relativePath.startsWith('.opencard-cache/')
    const isExcluded = isExportPathExcluded(relativePath)
    const isImage = resolveFileType(key).id === 'image'
    const isOpenCard = relativePath.toLowerCase().endsWith(CARD_DOCUMENT_SUFFIX)
    const actions: OcNodeAction[] = []

    if (!isProjectFile && !isRuntimeCache) {
      actions.push(isExcluded
        ? {
            key: TEMPLATE_INCLUDE_ACTION_KEY,
            title: t('templateExport.tree.include'),
            icon: 'status.eye',
          }
        : {
            key: TEMPLATE_EXCLUDE_ACTION_KEY,
            title: t('templateExport.tree.exclude'),
            icon: 'status.eye-off',
          })
    }
    if (!isExcluded && isImage) {
      actions.push(exportTemplateSelection.value.covers.includes(relativePath)
        ? {
            key: TEMPLATE_COVER_REMOVE_ACTION_KEY,
            title: t('templateExport.tree.removeCover'),
            icon: 'action.image-minus',
          }
        : {
            key: TEMPLATE_COVER_ADD_ACTION_KEY,
            title: t('templateExport.tree.addCover'),
            icon: 'action.image-plus',
          })
    }
    if (!isExcluded && isOpenCard) {
      actions.push(exportTemplateSelection.value.entries.includes(relativePath)
        ? {
            key: TEMPLATE_ENTRY_REMOVE_ACTION_KEY,
            title: t('templateExport.tree.removeEntry'),
            icon: 'action.file-minus',
          }
        : {
            key: TEMPLATE_ENTRY_ADD_ACTION_KEY,
            title: t('templateExport.tree.addEntry'),
            icon: 'action.file-plus',
          })
    }

    items.set(key, {
      ...item,
      visual: isExcluded && item.visual?.type === 'icon'
        ? { ...item.visual, iconTone: 'muted' }
        : item.visual,
      disabled: isRuntimeCache,
      disabledReason: isRuntimeCache ? t('templateExport.tree.runtimeCache') : undefined,
      tail: [...normalizeNodeTail(item.tail), ...actions],
    })
  }
  return {
    rootKeys: projectTreeData.value.rootKeys,
    items,
    children: projectTreeData.value.children,
  }
})

const exportTemplateExpandedKeys = computed(() => [...projectTreeData.value.children.keys()])

function createExportSelectionTreeData(
  paths: readonly string[],
  prefix: string,
  icon: IconToken,
  removeAction: OcNodeAction,
  labels: Readonly<Record<string, string>> = {},
): OcNodeCollection {
  const rootKeys = paths.map((path) => `${prefix}${path}`)
  return {
    rootKeys,
    items: new Map(paths.map((path) => [`${prefix}${path}`, {
      label: labels[path] ?? path,
      visual: { type: 'icon', icon },
      tail: [removeAction],
    }])),
    children: new Map(),
  }
}

const exportTemplateEntryTreeData = computed(() => createExportSelectionTreeData(
  exportTemplateSelection.value.entries,
  TEMPLATE_ENTRY_TREE_PREFIX,
  'file.opencard',
  {
    key: TEMPLATE_ENTRY_REMOVE_ACTION_KEY,
    title: t('templateExport.tree.removeEntry'),
    icon: 'action.file-minus',
  },
  exportTemplateSelection.value.entryNames,
))

const exportTemplateCoverTreeData = computed(() => createExportSelectionTreeData(
  exportTemplateSelection.value.covers,
  TEMPLATE_COVER_TREE_PREFIX,
  'file.image',
  {
    key: TEMPLATE_COVER_REMOVE_ACTION_KEY,
    title: t('templateExport.tree.removeCover'),
    icon: 'action.image-minus',
  },
))

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

const primaryPageToggleAction = computed<ShellTitleBarAppAction>(() => {
  const targetPage = getOtherPrimaryShellPage(shellPage.value)
  return {
    key: 'toggle-primary-page',
    icon: targetPage === 'workbench' ? 'nav.workbench' : 'nav.welcome',
    hoverTip: targetPage === 'workbench'
      ? t('app.menu.goWorkbench')
      : t('app.menu.returnWelcome'),
  }
})

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

const { sidebarTailButtons, sidebarBodyGroups } = useShellSidebarLists({
  translate: t,
  shellPage,
  isSettingsMode,
  isCreateProjectMode,
  isExportTemplateMode,
  isWelcomeMode,
  isAboutMode,
  isAuxiliaryMode,
  isProjectTemplateBusy,
  isExportTemplateBusy,
  isCommittingVersion,
  isInitializingRepository,
  projectOpen,
  projectPath,
  projectFolderName,
  repositoryReady,
  repositoryNeedsInitialization,
  projectTreeRef,
  settingsCategoryKey,
  settingsCategoryTreeData,
  selectedTemplateKey,
  templateTreeData,
  templateExpandedKeys,
  handleTemplateExpansionChange,
  resourcePackageStore,
  resourcePackageTreeData,
  resourcePackageExpandedKeys,
  handleResourcePackageExpansionChange,
  resourcePackageSelection: {
    selectedKeys: selectedResourcePackageKeys,
    canUse: canUseSelectedResourcePackages,
    canDisable: canDisableSelectedResourcePackages,
    onChange: handleResourcePackageSelectionChange,
  },
  exportTemplateTreeData,
  exportTemplateExpandedKeys,
  exportTemplateEntryTreeData,
  exportTemplateCoverTreeData,
  recentProjectTreeData,
  selectedRecentProjectKeys,
  openedEditorTreeData,
  openedEditorSelectedKeys,
  projectManagementTreeData,
  selectedManagementKeys,
  projectManagementExpandedKeys,
  projectTreeData,
  selectedProjectEntryKeys,
  projectExpandedKeys,
  timelinePlaceholder,
  timelineFilePath,
  timelineLoading,
  timelineTreeData,
  timelineProjectTreeData,
  changesTreeData,
  selectedChangeCount,
  versionGraphExpandedKeys,
  changesExpandedKeys,
  handleSettingsCategorySelectionChange,
  handleTemplateSelectionChange,
  handleTemplateAction,
  handleResourcePackageAction,
  handleExportTemplateAction,
  handleExportSelectionAction,
  handleRecentProjectSelectionChange,
  handleRecentProjectNodeActivate,
  handleRecentProjectAction,
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
  handleTimelineAction,
  handleVersionGraphExpansionChange,
  handleVersionGraphExpansionSync,
  handleChangesExpansionChange,
  handleChangesExpansionSync,
  handleChangesNodeActivate,
  handleChangesAction,
})

const developerModeMenuActions = computed<readonly OcActionMenuEntry[]>(() => (
  import.meta.env.DEV
    ? [{
        key: 'toggle-developer-mode',
        title: developerMode.value
          ? t('app.updater.disableDeveloperMode')
          : t('app.updater.enableDeveloperMode'),
        icon: developerMode.value ? 'action.check' : 'format.code-braces',
      }]
    : []
))

const debugMenuActions = computed<readonly OcActionMenuEntry[]>(() => (
  import.meta.env.DEV
    ? [
      {
        key: 'toggle-debug-hide-cde-overlays',
        title: debugHideCdeOverlays.value ? t('app.debug.showCdeOverlays') : t('app.debug.hideCdeOverlays'),
        icon: debugHideCdeOverlays.value ? 'action.check' : 'format.code-braces',
      },
      {
        key: 'toggle-debug-transparent-cde-viewport',
        title: debugTransparentCdeViewport.value ? t('app.debug.showCdeViewportBackground') : t('app.debug.transparentCdeViewport'),
        icon: debugTransparentCdeViewport.value ? 'action.check' : 'format.code-braces',
      },
      {
        key: 'toggle-debug-passive-cde-viewport',
        title: debugPassiveCdeViewport.value ? t('app.debug.interactiveCdeViewport') : t('app.debug.passiveCdeViewport'),
        icon: debugPassiveCdeViewport.value ? 'action.check' : 'format.code-braces',
      },
      {
        key: 'send-debug-test-messages',
        title: t('app.debug.sendTestMessages'),
        icon: 'action.refresh',
      },
      {
        key: 'send-debug-output-entries',
        title: t('app.debug.sendOutputEntries'),
        icon: 'action.refresh',
      },
    ]
    : []
))

const titleBarMenus = computed<ShellTitleBarMenuGroup[]>(() => [
  {
    key: 'file',
    label: t('app.menu.file'),
    actions: [
      {
        key: 'new-project',
        title: projectPath.value ? t('app.menu.closeAndNewProject') : t('app.menu.newProject'),
        icon: 'action.folder-plus',
        shortcut: shellShortcutParts.newProject,
      },
      { type: 'divider', key: 'file-open-divider' },
      { key: 'open-project', title: t('sidebar.openProject'), icon: 'status.folder-open' },
      {
        key: 'close-project-and-welcome',
        title: t('app.menu.closeProjectAndWelcome'),
        icon: 'nav.compass',
        disabled: !projectPath.value,
      },
      { type: 'divider', key: 'file-save-divider' },
      {
        key: 'save-active-editor',
        title: t('app.menu.save'),
        icon: 'action.save',
        shortcut: shellShortcutParts.save,
        disabled: !activeSession.value,
      },
      {
        key: 'toggle-auto-save',
        title: settingsStore.settings.value.workspace.autoSave
          ? t('app.menu.disableAutoSave')
          : t('app.menu.enableAutoSave'),
        icon: settingsStore.settings.value.workspace.autoSave ? 'action.save-off' : 'action.save',
      },
      { type: 'divider', key: 'file-export-divider' },
      {
        key: BUILD_RESOURCE_PACKAGE_ACTION_KEY,
        title: t('resourcePackage.buildTitle'),
        icon: 'file.package',
        disabled: !projectPath.value,
      },
      {
        key: 'export-project-template',
        title: t('templateExport.menu'),
        icon: 'action.export',
        disabled: !projectPath.value,
      },
      {
        key: 'export-card-documents',
        title: t('app.menu.exportCardDocuments'),
        icon: 'action.export',
        disabled: !projectPath.value,
      },
    ],
  },
  {
    key: 'edit',
    label: t('app.menu.edit'),
    actions: [
      {
        key: 'undo-active-editor',
        title: t('app.menu.undo'),
        icon: 'action.undo',
        shortcut: shellShortcutParts.undo,
        disabled: isDiffMode.value || !canUndoActiveEditor.value,
      },
      {
        key: 'redo-active-editor',
        title: t('app.menu.redo'),
        icon: 'action.redo',
        shortcut: shellShortcutParts.redo,
        disabled: isDiffMode.value || !canRedoActiveEditor.value,
      },
      { type: 'divider', key: 'edit-settings-divider' },
      { key: 'open-settings', title: t('settings.title'), icon: 'tool.settings' },
    ],
  },
  {
    key: 'view',
    label: t('app.menu.view'),
    actions: [
      {
        key: 'show-welcome',
        title: t('app.menu.showWelcome'),
        icon: 'nav.compass',
        disabled: isWelcomeMode.value,
      },
      {
        key: 'show-workbench',
        title: t('app.menu.showWorkbench'),
        icon: 'nav.files',
        disabled: isWorkbenchMode.value,
      },
      { type: 'divider', key: 'view-page-divider' },
      {
        key: 'toggle-sidebar',
        title: sidebarCollapsed.value ? t('app.shell.expandSidebar') : t('app.shell.collapseSidebar'),
        icon: sidebarCollapsed.value ? 'nav.sidebar-expand' : 'nav.sidebar-collapse',
      },
      {
        key: 'toggle-bottom-panel',
        title: isBottomPanelExpanded.value
          ? t('app.shell.collapseBottomPanel')
          : t('app.shell.expandBottomPanel'),
        icon: isBottomPanelExpanded.value ? 'nav.chevron-down' : 'nav.chevron-up',
      },
      { type: 'divider', key: 'view-window-divider' },
      {
        key: 'toggle-fullscreen',
        title: isWindowFullscreen.value
          ? t('app.shell.exitFullscreen')
          : t('app.shell.enterFullscreen'),
        icon: isWindowFullscreen.value ? 'window.fullscreen-exit' : 'window.fullscreen',
        shortcut: shellShortcutParts.fullscreen,
      },
    ],
  },
  {
    key: 'help',
    label: t('app.menu.help'),
    badge: unreadFeedbackReplyCount.value,
    badgeLabel: unreadFeedbackReplyCount.value > 0
      ? t('app.feedback.unreadReplies', { count: unreadFeedbackReplyCount.value })
      : undefined,
    actions: [
      {
        key: 'check-for-updates',
        title: isCheckingForUpdate.value
          ? t('app.updater.checking')
          : t('app.updater.check'),
        icon: 'action.refresh',
        disabled: isCheckingForUpdate.value
          || isDownloadingUpdate.value
          || isUpdateDownloaded.value
          || isInstallingUpdate.value,
      },
      ...developerModeMenuActions.value,
      ...debugMenuActions.value,
      { type: 'divider', key: 'help-feedback-divider' },
      {
        key: 'send-feedback',
        title: t('app.menu.sendFeedback'),
        icon: 'action.edit',
      },
      {
        key: 'view-feedback',
        title: t('app.menu.viewFeedback'),
        icon: 'data.list-selection',
        badge: unreadFeedbackReplyCount.value,
        badgeLabel: unreadFeedbackReplyCount.value > 0
          ? t('app.feedback.unreadReplies', { count: unreadFeedbackReplyCount.value })
          : undefined,
      },
      { type: 'divider', key: 'help-about-divider' },
      {
        key: 'about-opencard',
        title: t('app.menu.aboutOpenCard'),
        icon: 'status.unknown',
      },
    ],
  },
])

/**
 * 页面顶端的标题、副标题与图标都读会话自己持有的呈现，和列表用的是同一份 —— 编辑器只负责声明，
 * 由 host 写回会话（见 useShellEditorHost）。头部动作仍是编辑器直接声明的，因为它随选区与忙碌态变化。
 */
const workspaceTitle = computed(() => {
  if (isCreateProjectMode.value) return t('projectTemplates.title')
  if (isExportTemplateMode.value) return t('templateExport.title')
  if (isSettingsMode.value) return activeSettingsCategory.value.title
  if (isAboutMode.value) return t('app.about.title')
  if (isWelcomeMode.value) return 'OpenCard'
  return activeSession.value
    ? formatSessionTitle(activeSession.value)
    : projectName.value || t('app.menu.workbench')
})

const workspaceIcon = computed(() => activeSession.value?.presentation?.icon ?? undefined)

const workspaceIconTone = computed(() => activeSession.value?.presentation?.iconTone ?? undefined)

const workspaceSubtitle = computed(() => activeSession.value?.presentation?.description ?? undefined)

/** The active editor owns its own header actions and exposes them through the editor ref. */
const editorHeaderActions = computed<readonly ShellWorkspaceAction[]>(() => (
  currentEditorRef.value?.workspaceActions ?? []
))

const workspaceActions = computed<ShellWorkspaceAction[]>(() => {
  if (!isWorkbenchMode.value) return []
  if (isDiffMode.value) {
    const beforeId = activeSession.value?.diff
      ? activeSession.value.diff.beforeRevisionId
      : diffSessionState.before.value?.commitId ?? null
    const afterId = activeSession.value?.diff
      ? activeSession.value.diff.afterRevisionId
      : diffSessionState.after.value?.commitId ?? null
    const formatRevisionLabel = (option: typeof timelineRevisionOptions.value[number] | undefined, fallback: string) => {
      if (!option) return fallback
      return option.shortId ? `${option.label} ${option.shortId}` : option.label
    }
    const createRevisionMenu = (prefix: string, selectedId: string | null) => timelineRevisionOptions.value.map(option => ({
      key: `${prefix}:${option.commitId ?? 'current'}`,
      title: formatRevisionLabel(option, option.label),
      icon: option.commitId === selectedId ? 'action.check' as const : 'file.git' as const,
    }))
    const beforeOption = timelineRevisionOptions.value.find(option => option.commitId === beforeId)
    const afterOption = timelineRevisionOptions.value.find(option => option.commitId === afterId)
    return [
      beforeOption?.shortId ?? beforeOption?.label ?? t('sidebar.diffViewer.diskVersion'),
      { type: 'selection', key: DIFF_BEFORE_ACTION_KEY, icon: 'file.git', value: formatRevisionLabel(beforeOption, t('sidebar.diffViewer.versionA')), hoverTip: t('sidebar.diffViewer.versionA'), options: createRevisionMenu(DIFF_BEFORE_ACTION_KEY, beforeId) },
      afterOption?.shortId ?? afterOption?.label ?? t('sidebar.diffViewer.diskVersion'),
      { type: 'selection', key: DIFF_AFTER_ACTION_KEY, icon: 'file.git', value: formatRevisionLabel(afterOption, t('sidebar.diffViewer.versionB')), hoverTip: t('sidebar.diffViewer.versionB'), options: createRevisionMenu(DIFF_AFTER_ACTION_KEY, afterId) },
      { key: DIFF_EXIT_ACTION_KEY, icon: 'nav.arrow-left', hoverTip: t('settings.actions.back', 'Back') },
    ]
  }
  if (isActiveDictionaryEditor.value) return [
    {
      key: DICTIONARY_IMPORT_ACTION_KEY,
      icon: 'action.import',
      hoverTip: t('dictionaryEditor.workbook.import'),
      disabled: isDataTableWorkbookBusy.value,
    },
    {
      key: DICTIONARY_EXPORT_ACTION_KEY,
      icon: 'action.export',
      hoverTip: t('dictionaryEditor.workbook.export'),
      disabled: isDataTableWorkbookBusy.value || !canExportDataTableWorkbook.value,
    },
  ]
  if (!isActiveCardDesignerEditor.value) return [...editorHeaderActions.value]
  const tableMode = activeCardDesignerMode.value === 'data-table'
  const modeAction: ShellAction = {
    key: CARD_DESIGNER_MODE_ACTION_KEY,
    icon: tableMode ? 'file.opencard' : 'data.table',
    hoverTip: tableMode
      ? t('cardDesigner.dataTable.switchToDesignMode')
      : t('cardDesigner.dataTable.switchToTableMode'),
  }
  const renderImageAction: ShellAction = {
    key: CARD_RENDER_IMAGE_ACTION_KEY,
    icon: 'action.image-plus',
    hoverTip: t('cardDesigner.renderImage.title'),
    disabled: isProjectExportRunning.value || !canRenderCardImage.value,
    children: ['current', 'both'].map(faceMode => ({
      key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}`,
      title: t(`cardDesigner.renderImage.${faceMode}`),
      children: [
        { key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}.0.5`, title: t('cardDesigner.renderImage.preview') },
        { key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}.1`, title: t('cardDesigner.renderImage.standard') },
        { key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}.2`, title: t('cardDesigner.renderImage.highDefinition') },
      ],
    })),
  }
  if (!tableMode) return [
    renderImageAction, modeAction,
  ]
  return [
    {
      key: CARD_DATA_TABLE_IMPORT_ACTION_KEY,
      icon: 'action.import',
      hoverTip: t('cardDesigner.dataTable.importWorkbook'),
      disabled: isDataTableWorkbookBusy.value,
    },
    {
      key: CARD_DATA_TABLE_EXPORT_ACTION_KEY,
      icon: 'action.export',
      hoverTip: t('cardDesigner.dataTable.exportWorkbook'),
      disabled: isDataTableWorkbookBusy.value || !canExportDataTableWorkbook.value,
    },
    modeAction,
  ]
})

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

async function handleProjectTreeItemToggle(itemKey: string, expanded: boolean) {
  const entry = findProjectEntryByKey(itemKey)
  if (!entry) {
    return
  }

  if (!entry.isDirectory) {
    setProjectEntryExpanded(entry.key, expanded)
    return
  }

  setDirectoryExpanded(entry.key, expanded)

  if (!expanded) {
    return
  }

  try {
    await readDirectoryEntries(entry.key)
  } catch (error) {
    notifyAppError('OC-E2001', { path: entry.key, error }, locale.value)
  }
}

async function handleTemplateSelectionChange(event: OcNodeSelectionEvent): Promise<void> {
  const key = event.selectedKeys[0] as ProjectTemplateKey | undefined
  if (key && templateStore.findTemplate(key)) selectedTemplateKey.value = key
}

function handleTemplateExpansionChange(event: OcNodeExpansionEvent): void {
  templateExpandedKeys.value = event.expanded
    ? [...templateExpandedKeys.value, event.key]
    : templateExpandedKeys.value.filter((key) => key !== event.key)
}

async function handleTemplateAction(event: OcNodeActionEvent): Promise<void> {
  if (isProjectTemplateBusy.value) return
  if (event.actionKey === TEMPLATE_REMOVE_ACTION_KEY) {
    await removeUserTemplate(event.key as ProjectTemplateKey)
    return
  }
  if (event.key !== USER_TEMPLATES_GROUP_KEY || event.actionKey !== IMPORT_TEMPLATE_ACTION_KEY
    || templateStore.isLoading.value) return
  await createProjectWorkspaceRef.value?.beginImport()
}

/** 用户模板的删除入口在列表里（模板节点尾部的删除动作），确认后才真正移除。 */
async function removeUserTemplate(key: ProjectTemplateKey): Promise<void> {
  const template = templateStore.findTemplate(key)
  if (!template) return
  const accepted = await requestConfirmation({
    title: t('projectTemplates.actions.delete'),
    message: t('projectTemplates.confirmDelete'),
    confirmLabel: t('projectTemplates.actions.delete'),
  })
  if (!accepted) return
  try {
    await templateStore.deleteUserTemplate(template)
    if (selectedTemplateKey.value === template.key) {
      selectedTemplateKey.value = templateStore.templates.value[0]?.key ?? null
    }
  } catch (cause) {
    reportUncodedFailure(t('projectTemplates.errors.unknown'), cause)
  }
}

/**
 * 「预装的包」树里的一行同时表达三件事：当前是否预装到新项目、切换预装、以及从软件存储移除。
 * 节点 Key 就是归档的路径（内置包是资源目录里的路径），因此动作不需要再拼上路径。
 * 列表头部的三个动作作用在同一批选中项上：导入、使用选中的包、禁用选中的包。
 */
function handleResourcePackageSelectionChange(event: OcNodeSelectionEvent): void {
  selectedResourcePackageKeys.value = event.selectedKeys
}

function handleResourcePackageExpansionChange(event: OcNodeExpansionEvent): void {
  resourcePackageExpandedKeys.value = event.expanded
    ? [...resourcePackageExpandedKeys.value, event.key]
    : resourcePackageExpandedKeys.value.filter((key) => key !== event.key)
}

function handleResourcePackageAction(event: OcNodeActionEvent): void {
  if (isProjectTemplateBusy.value) return
  const path = event.key
  const pack = allResourcePackages.value.find((candidate) => candidate.path === path)
  if (!pack) return
  if (event.actionKey === ATTACH_RESOURCE_PACKAGE_ACTION_KEY) {
    if (!attachedResourcePackagePaths.value.includes(path)) {
      attachedResourcePackagePaths.value = [...attachedResourcePackagePaths.value, path]
    }
    return
  }
  if (event.actionKey === ATTACHED_RESOURCE_PACKAGE_ACTION_KEY) {
    attachedResourcePackagePaths.value = attachedResourcePackagePaths.value
      .filter((candidate) => candidate !== path)
    return
  }
  if (event.actionKey === REMOVE_RESOURCE_PACKAGE_ACTION_KEY) {
    // 内置包不在软件存储里，没有可移除的对象。
    const stored = resourcePackageStore.findPackage(path)
    if (stored) void removeStoredResourcePackage(stored)
  }
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 一次性失败交给即时信息，同时留在输出里，便于事后查看完整原因。 */
function reportUncodedFailure(message: string, cause: unknown): void {
  notifyError(message)
  publishAppOutput({ severity: 'error', message, detail: describeCause(cause) })
}

/** 导入失败时说清失败发生在导入这一步，具体原因同时留在输出里。 */
function reportResourcePackageImportFailure(cause: unknown): void {
  reportUncodedFailure(
    t('projectTemplates.errors.resourcePackageImportFailed', { message: describeCause(cause) }),
    cause,
  )
}

async function importStoredResourcePackage(): Promise<void> {
  if (isImportingResourcePackage.value) return
  isImportingResourcePackage.value = true
  try {
    const sourcePath = await resourcePackageStore.pickSourceFile(
      t('projectTemplates.dialogs.chooseResourcePackage'),
    )
    if (!sourcePath) return
    const imported = await resourcePackageStore.importPackage(sourcePath)
    notifySuccess(t('projectTemplates.status.resourcePackageImported', { name: imported.name }))
  } catch (cause) {
    reportResourcePackageImportFailure(cause)
  } finally {
    isImportingResourcePackage.value = false
  }
}

/** 没有打开项目时拖入或打开的包进入软件存储，并直接附加到即将新建的项目上。 */
async function importDroppedResourcePackage(path: string): Promise<void> {
  const imported = await resourcePackageStore.importPackage(path).catch((cause: unknown) => {
    reportResourcePackageImportFailure(cause)
    return null
  })
  if (!imported) return
  notifySuccess(t('projectTemplates.status.resourcePackageImported', { name: imported.name }))
  if (!isCreateProjectMode.value) enterCreateProject()
  if (!attachedResourcePackagePaths.value.includes(imported.path)) {
    attachedResourcePackagePaths.value = [...attachedResourcePackagePaths.value, imported.path]
  }
}

async function removeStoredResourcePackage(pack: StoredResourcePackage): Promise<void> {
  const accepted = await requestConfirmation({
    title: t('projectTemplates.sections.resourcePackages'),
    message: t('projectTemplates.confirmRemoveResourcePackage', { name: pack.name }),
    confirmLabel: t('projectTemplates.actions.removeResourcePackage'),
  })
  if (!accepted) return
  try {
    await resourcePackageStore.removePackage(pack.path)
    attachedResourcePackagePaths.value = attachedResourcePackagePaths.value
      .filter((candidate) => candidate !== pack.path)
  } catch (cause) {
    reportUncodedFailure(t('projectTemplates.errors.resourcePackageRemoveFailed'), cause)
  }
}

function handleRecentProjectSelectionChange(event: OcNodeSelectionEvent): void {
  selectedRecentProjectKeys.value = event.selectedKeys
}

function recentProjectPathByNodeKey(key: string): string | undefined {
  return settingsStore.settings.value.projectCreation.recentProjects.find((item) => (
    recentProjectKey(item) === key
  ))
}

function handleRecentProjectNodeActivate(event: OcNodeActivateEvent): void {
  const path = recentProjectPathByNodeKey(event.key)
  if (!path || recentProjectAvailability.value.get(event.key) === false) return
  void openRecentProject(path)
}

function handleRecentProjectAction(event: OcNodeActionEvent): void {
  const path = recentProjectPathByNodeKey(event.key)
  if (!path) return

  if (event.actionKey === RECENT_PROJECT_REMOVE_ACTION_KEY) {
    settingsStore.forgetRecentProject(path)
    selectedRecentProjectKeys.value = selectedRecentProjectKeys.value.filter((key) => key !== event.key)
    return
  }

  if (event.actionKey === RECENT_PROJECT_RELOCATE_ACTION_KEY) {
    void relocateRecentProject(path)
    return
  }

  if (event.actionKey === RECENT_PROJECT_REVEAL_ACTION_KEY) {
    void revealRecentProject(path)
    return
  }

  if (event.actionKey === RECENT_PROJECT_OPEN_ACTION_KEY
    && recentProjectAvailability.value.get(event.key) !== false) {
    void openRecentProject(path)
  }
}

async function revealRecentProject(path: string): Promise<void> {
  try {
    await fileSystemService.revealInFileManager(path)
  } catch (error) {
    notifyAppError('OC-E2004', { actionKey: RECENT_PROJECT_REVEAL_ACTION_KEY, path, error }, locale.value)
  }
}

function handleSidebarBodyGroupChanged(groupKey: string): void {
  if (groupKey === 'version-control' && repositoryReady.value) void refreshTimelineStatus()
}

function handleWindowFocus(): void {
  if (shellPage.value.type === 'workbench' && projectPath.value && repositoryReady.value) {
    void refreshTimelineStatus()
  }
}

async function handleSidebarListAction(listKey: string, actionKey: string): Promise<void> {
  if (listKey === TIMELINE_LIST_KEY && actionKey === TIMELINE_REFRESH_ACTION_KEY) {
    await refreshTimeline()
    return
  }
  if (shellPage.value.type === 'workbench' && listKey === PROJECT_FILES_LIST_KEY) {
    if (actionKey === PROJECT_REVEAL_ACTION_KEY) {
      try {
        await revealEntryInFileManager('')
      } catch (error) {
        notifyAppError('OC-E2004', {
          actionKey,
          path: projectPath.value,
          error,
        }, locale.value)
      }
      return
    }
    if (actionKey === PROJECT_NEW_OPENCARD_ACTION_KEY) {
      await createProjectEntry('opencard')
      return
    }
    if (actionKey === PROJECT_NEW_FOLDER_ACTION_KEY) {
      await createProjectEntry('folder')
      return
    }
  }

  if (shellPage.value.type !== 'create-project' || isProjectTemplateBusy.value) return
  if (listKey === RESOURCE_PACKAGES_LIST_KEY && actionKey === IMPORT_RESOURCE_PACKAGE_ACTION_KEY
    && !resourcePackageStore.isLoading.value) {
    await importStoredResourcePackage()
    return
  }
  if (listKey === RESOURCE_PACKAGES_LIST_KEY && actionKey === USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY) {
    attachedResourcePackagePaths.value = [...new Set([
      ...attachedResourcePackagePaths.value,
      ...selectedResourcePackagePaths.value,
    ])]
    return
  }
  if (listKey === RESOURCE_PACKAGES_LIST_KEY && actionKey === DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY) {
    const disabled = new Set(selectedResourcePackagePaths.value)
    attachedResourcePackagePaths.value = attachedResourcePackagePaths.value
      .filter((path) => !disabled.has(path))
    return
  }
}

function getProjectEntryParentPath(): string {
  const selectedKey = selectedProjectEntryKeys.value[0]
  const selectedEntry = selectedKey ? findProjectEntryByKey(selectedKey) : null
  if (!selectedEntry) return projectPath.value
  if (selectedEntry.isDirectory) return selectedEntry.key
  const separatorIndex = selectedEntry.key.lastIndexOf('/')
  return separatorIndex < 0 ? projectPath.value : selectedEntry.key.slice(0, separatorIndex)
}

async function createProjectEntry(kind: 'folder' | 'opencard'): Promise<void> {
  if (!projectPath.value) return
  const parentPath = getProjectEntryParentPath()
  const parentEntry = findProjectEntryByKey(parentPath)
  if (parentEntry?.isDirectory) setDirectoryExpanded(parentPath, true)

  const baseName = kind === 'folder'
    ? t('sidebar.fileActions.newFolderName')
    : kind === 'opencard'
      ? t('sidebar.fileActions.newOpenCardName')
      : ''
  const content = kind === 'opencard'
    ? createDefaultOpenCardContent(baseName)
    : ''
  const path = await createEntryWithAvailableName(
    parentPath,
    baseName,
    kind === 'folder' ? 'folder' : 'file',
    content,
  )

  selectedProjectEntryKeys.value = [path]
  await nextTick()
  await projectTreeRef.value?.beginRename(path)
}

function handleSettingsCategorySelectionChange(event: OcNodeSelectionEvent): void {
  const categoryKey = event.selectedKeys[0]
  if (isSettingsCategoryKey(categoryKey)) {
    const returnPage = getCurrentPrimaryShellPage()
    shellPage.value = { type: 'settings', categoryKey, returnPage }
  }
}

/** 主题预设的读取走剪贴板：与复制对称，也不再需要中间对话框。 */
async function readThemeFromClipboard(themeId: 'dark' | 'light'): Promise<void> {
  const text = await navigator.clipboard.readText().catch(() => '')
  if (!text.trim()) {
    notifyError(t('settings.themeExchange.emptyClipboard'))
    return
  }
  const definition = parseAppTheme(text)
  if (!definition) {
    notifyError(t('settings.errors.invalidThemeJson'))
    return
  }
  const imported = settingsStore.importThemePreset(themeId, t('settings.values.importedTheme'), definition)
  if (imported) notifySuccess(t('settings.themeExchange.imported'), 'action.import')
  else notifyWarning(t('settings.themeExchange.duplicate'))
}

async function copyThemeJson(themeId: 'dark' | 'light'): Promise<void> {
  const appearance = settingsStore.settings.value.appearance
  const text = serializeAppTheme(themeId, appearance.themeOverrides[themeId], appearance.accentNeighborAngles[themeId], appearance.fontFamilies[themeId])
  try {
    await navigator.clipboard.writeText(text)
    notifySuccess(t('settings.themeExchange.copied'), 'action.copy')
  } catch {
    notifyError(t('settings.themeExchange.copyFailed'))
  }
}

async function handleSettingsIntent(intent: SettingsIntent): Promise<void> {
  if (intent.type === 'setting.preview') {
    settingsStore.previewSetting(intent.key, intent.value)
    return
  }

  if (intent.type === 'setting.change') {
    settingsStore.updateSetting(intent.key, intent.value)
    return
  }

  if (intent.type === 'theme-color.preview' || intent.type === 'theme-color.cancel') {
    settingsStore.previewThemeColor(intent.themeId, intent.token, intent.value)
    return
  }

  if (intent.type === 'theme-color.change') {
    settingsStore.updateThemeColor(intent.themeId, intent.token, intent.value)
    return
  }

  if (intent.type === 'theme-angle.preview') {
    settingsStore.previewThemeAngle(intent.themeId, intent.value)
    return
  }

  if (intent.type === 'theme-angle.change') {
    settingsStore.updateThemeAngle(intent.themeId, intent.value)
    return
  }

  if (intent.type === 'theme-font.change') {
    settingsStore.updateThemeFont(intent.themeId, intent.value)
    return
  }

  if (intent.type === 'theme-preset.change') {
    settingsStore.applyThemePreset(intent.themeId, intent.presetId)
    return
  }

  if (intent.type === 'theme-preset.delete') {
    settingsStore.deleteThemePreset(intent.themeId, intent.presetId)
    return
  }

  if (intent.type === 'theme-name.change') {
    settingsStore.saveThemePreset(intent.themeId, intent.name)
    return
  }

  if (intent.type === 'theme.copy') {
    await copyThemeJson(intent.themeId)
    return
  }

  if (intent.type === 'theme.read') {
    await readThemeFromClipboard(intent.themeId)
    return
  }

  if (intent.type === 'identity.regenerate') {
    settingsStore.updateSetting('identity.publisherKey', createPublisherKey())
    return
  }

  await resetProjectWorkspaceState()
}

async function performApplicationClose(action: ApplicationCloseAction): Promise<void> {
  if (action === 'install-update') {
    if (availableUpdate.value) {
      await installDownloadedUpdate()
    } else if (import.meta.env.DEV && isDeveloperPreviewDownloaded.value) {
      stopDeveloperUpdatePreview()
    }
    return
  }
  await destroyWindow()
}

function performSessionClose(sessionIds: readonly string[]): void {
  for (const sessionId of sessionIds) closeSession(sessionId)
}

async function performPathTrash(path: string): Promise<void> {
  await trashFile(path)
  closeSessionsByPath(path)
  selectedProjectEntryKeys.value = selectedProjectEntryKeys.value.filter(key => key !== path)
}

function handleOpenedEditorSelectionChange(event: OcNodeSelectionEvent): void {
  handleOpenedEditorsSelect(event.selectedKeys)
}

async function handleOpenedEditorAction(event: OcNodeActionEvent): Promise<void> {
  if (event.actionKey === OPENED_EDITOR_CLOSE_ACTION_KEY) await requestSessionClose([event.key])
}

async function handleOpenedEditorAuxClick(event: MouseEvent): Promise<void> {
  if (event.button !== 1) return
  const target = event.target
  if (!(target instanceof Element)) return
  const key = target.closest<HTMLElement>('[data-oc-tree-key]')?.dataset.ocTreeKey
  if (!key || !openedEditorTreeData.value.items.has(key)) return
  event.preventDefault()
  await requestSessionClose([key])
}

async function handleProjectManagementSelectionChange(event: OcNodeSelectionEvent): Promise<void> {
  await handleProjectManagementSelect(event.selectedKeys)
}

function handleProjectManagementExpansionChange(event: OcNodeExpansionEvent): void {
  setProjectManagementEntryExpanded(event.key, event.expanded)
}

async function handleProjectManagementAction(event: OcNodeActionEvent) {
  const packageKey = findProjectPackageKeyByNodeKey(event.key)
  if (!packageKey) return
  if (event.actionKey === PROJECT_PACKAGE_VERIFY_ACTION_KEY) {
    const result = await projectStore.checkResourcePackage(packageKey)
    if (!result) return
    const status = t(`packageManager.status.${result.status}`)
    if (result.status === 'ok') {
      notifySuccess(`${packageKey}: ${status}`)
    } else {
      notifyWarning(`${packageKey}: ${status}`)
    }
    return
  }
  if (event.actionKey !== PROJECT_PACKAGE_DELETE_ACTION_KEY) return
  const required = projectPackageManifests.value.get(packageKey)
  if (!required) return
  const installed = projectStore.projectResourcePackages.value.get(packageKey)
  const packageRootPath = resolveInstalledResourcePackageRootPath(projectPath.value, packageKey)
  try {
    if (!await removeResourcePackage(packageKey)) return
    closeSessionsByPath(packageRootPath)
    selectedManagementKeys.value = []
    notifySuccess(t('resourcePackage.deleted', { name: installed?.manifest.name ?? packageKey }))
  } catch (error) {
    notifyAppError('OC-E3016', { path: packageRootPath, error }, locale.value)
  }
}

async function handleProjectSelectionChange(event: OcNodeSelectionEvent): Promise<void> {
  await handleFileTreeSelect(event.selectedKeys)
}

async function handleProjectExpansionChange(event: OcNodeExpansionEvent): Promise<void> {
  await handleProjectTreeItemToggle(event.key, event.expanded)
}

async function handleProjectRenameCommit(event: OcNodeRenameCommitEvent): Promise<void> {
  const result = await renameEntry(event.key, event.name)
  if (result.ok) remapSessionPaths(result.fromPath, result.toPath)
  else notifyWarning(t('app.notifications.renameRejected'))
}

async function handleProjectMove(event: OcNodeMoveEvent): Promise<void> {
  const result = await moveEntryByDrop(event)
  if (result.ok) remapSessionPaths(result.fromPath, result.toPath)
  else notifyWarning(t('app.notifications.moveRejected'))
}

/**
 * A drop inside the file tree means "copy here", while a drop anywhere else in the window keeps the
 * existing "open/import this file" behavior; the tree only claims drops it can actually deliver.
 */
async function handleProjectExternalDrop(event: OcNodeExternalDropEvent): Promise<void> {
  const result = await copyExternalEntriesIntoProject({
    paths: event.payload,
    targetKey: event.targetKey,
    position: event.position,
  })
  if (!result.ok) {
    notifyWarning(t('app.notifications.externalDropRejected'))
    return
  }
  if (result.copied > 0) notifySuccess(t('app.notifications.externalDropCopied', { count: result.copied }))
  if (result.failed > 0) notifyWarning(t('app.notifications.externalDropFailed', { count: result.failed }))
  if (result.copied === 0 && result.failed === 0) notifyWarning(t('app.notifications.externalDropSkipped'))
}

async function handleProjectAction(event: OcNodeActionEvent): Promise<void> {
  const entry = findProjectEntryByKey(event.key)
  if (!entry) return

  if (event.actionKey === PROJECT_ENTRY_RENAME_ACTION_KEY) {
    await projectTreeRef.value?.beginRename(entry.key)
    return
  }

  if (event.actionKey === PROJECT_ENTRY_CONFIRM_DELETE_ACTION_KEY) {
    await requestPathTrash(entry.key)
    return
  }
  if (event.actionKey === PROJECT_ENTRY_REVEAL_ACTION_KEY) {
    console.debug('[workspace-action] reveal:start', { actionKey: event.actionKey, path: entry.key })
    try {
      await revealEntryInFileManager(entry.key)
      console.debug('[workspace-action] reveal:success', { actionKey: event.actionKey, path: entry.key })
    } catch (error) {
      notifyAppError('OC-E2004', {
        actionKey: event.actionKey,
        path: entry.key,
        error,
      }, locale.value)
    }
    return
  }
  if (event.actionKey === PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY) {
    try {
      await navigator.clipboard.writeText(getRelativeProjectPath(entry.key))
    } catch (error) {
      notifyAppError('OC-E1002', { source: 'project-relative-path', path: entry.key, error }, locale.value)
    }
    return
  }
  if (event.actionKey === PROJECT_ENTRY_COPY_ABSOLUTE_PATH_ACTION_KEY) {
    try {
      await navigator.clipboard.writeText(entry.key)
    } catch (error) {
      notifyAppError('OC-E1002', { source: 'project-absolute-path', path: entry.key, error }, locale.value)
    }
  }
}

async function handleProjectNodeActivate(event: OcNodeActivateEvent): Promise<void> {
  const entry = findProjectEntryByKey(event.key)
  if (!entry) return

  if (entry.isDirectory) {
    await handleProjectTreeItemToggle(entry.key, !entry.isExpanded)
    return
  }

  if (resolveFileType(entry.key, projectPath.value).id === 'font') return

  await handleOpenFile(entry.key)
}

function handleExportTemplateAction(event: OcNodeActionEvent): void {
  const relativePath = exportRelativePath(event.key)
  if (event.actionKey === TEMPLATE_EXCLUDE_ACTION_KEY || event.actionKey === TEMPLATE_INCLUDE_ACTION_KEY) {
    exportTemplateWorkspaceRef.value?.togglePathIncluded(relativePath)
    return
  }
  if (event.actionKey === TEMPLATE_COVER_ADD_ACTION_KEY || event.actionKey === TEMPLATE_COVER_REMOVE_ACTION_KEY) {
    exportTemplateWorkspaceRef.value?.toggleCover(relativePath)
    return
  }
  if (event.actionKey === TEMPLATE_ENTRY_ADD_ACTION_KEY || event.actionKey === TEMPLATE_ENTRY_REMOVE_ACTION_KEY) {
    exportTemplateWorkspaceRef.value?.toggleEntry(relativePath)
  }
}

function handleExportSelectionAction(event: OcNodeActionEvent): void {
  if (event.key.startsWith(TEMPLATE_ENTRY_TREE_PREFIX)) {
    exportTemplateWorkspaceRef.value?.toggleEntry(event.key.slice(TEMPLATE_ENTRY_TREE_PREFIX.length))
    return
  }
  if (event.key.startsWith(TEMPLATE_COVER_TREE_PREFIX)) {
    exportTemplateWorkspaceRef.value?.toggleCover(event.key.slice(TEMPLATE_COVER_TREE_PREFIX.length))
  }
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
        const installed = await projectStore.installResourcePackageFile(normalizedPath, {
          confirmReplacement: async (next, previous) => await showConfirm(t('resourcePackage.confirmUpgrade', {
            name: next.name, version: next.version, previousVersion: previous.version,
          }), { title: t('resourcePackage.title'), kind: 'warning' }),
        })
        notifySuccess(t('resourcePackage.installed', { name: path.split('/').pop() ?? installed.manifest.name }))
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
        showPrimaryShellPage('workbench')
        continue
      }
      if (kind === 'template') {
        const imported = await templateStore.importUserTemplate(normalizedPath)
        selectedTemplateKey.value = imported.key
        shellPage.value = { type: 'create-project', returnPage: getCurrentPrimaryShellPage() }
        continue
      }
      if (kind === 'icon-pack') {
        // 图标集只属于项目，因此打开的图标包交给当前项目的图标页导入。
        if (!projectPath.value) {
          notifyWarning(t('projectConfig.icons.openProjectFirst'))
          continue
        }
        await handleProjectManagementSelect([resolveProjectPath(PROJECT_ICON_REGISTRY_FILE_NAME)])
        showPrimaryShellPage('workbench')
      }
    } catch (error) {
      notifyAppError('OC-E2002', { path: normalizedPath, error }, locale.value)
    }
  }
}

async function relocateRecentProject(missingPath: string): Promise<void> {
  const selectedPath = await relocateRecentProjectPath(missingPath)
  if (!selectedPath) return
  selectedRecentProjectKeys.value = []
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
  showPrimaryShellPage('workbench')
  createDraftSession({
    fileTypeId: 'opencard',
  })
}

function stopDebugTestMessages(): void {
  if (debugNoticeTimer == null) return
  window.clearInterval(debugNoticeTimer)
  debugNoticeTimer = null
}

function sendDebugTestMessages(): void {
  stopDebugTestMessages()
  let sent = 0
  const sendNext = () => {
    sent += 1
    addTitleBarNotice({
      message: `testmessage ${sent}`,
      tone: 'success',
      icon: 'action.check',
    })
    if (sent >= DEBUG_NOTICE_COUNT) stopDebugTestMessages()
  }
  sendNext()
  debugNoticeTimer = window.setInterval(sendNext, DEBUG_NOTICE_INTERVAL_MS)
}

function sendDebugOutputEntries(): void {
  isBottomPanelExpanded.value = true
  activeBottomTab.value = 'output'
  publishAppOutput({ severity: 'info', message: t('app.debug.outputInfo') })
  publishAppOutput({ severity: 'success', message: t('app.debug.outputSuccess') })
  publishAppOutput({ severity: 'warning', message: t('app.debug.outputWarning'), detail: t('app.debug.outputWarningDetail') })
  publishAppOutput({ severity: 'error', message: t('app.debug.outputError') })
  reportAppError('OC-E2003', { path: 'cards/output-test.ocdocument' })
}

async function runShellCommand(actionKey: string) {
  if ((isCreateProjectMode.value && isProjectTemplateBusy.value) || isExportTemplateBusy.value) return

  if (actionKey === BUILD_RESOURCE_PACKAGE_ACTION_KEY) {
    await openResourcePackageBuilder()
    return
  }

  if (actionKey === 'open-settings') {
    shellPage.value = {
      type: 'settings',
      categoryKey: 'general',
      returnPage: getCurrentPrimaryShellPage(),
    }
    return
  }

  if (actionKey === 'check-for-updates') {
    const result = await checkForUpdate()
    if (result === 'failed') {
      notifyWarning(t('app.updater.checkFailed'))
    } else if (result === 'up-to-date') {
      notifySuccess(t('app.updater.upToDate'), 'action.check')
    } else if (result === 'available') {
      notifySuccess(t('app.updater.updateFound', { version: updateVersion.value }), 'action.download')
    }
    return
  }

  if (actionKey === 'toggle-developer-mode' && import.meta.env.DEV) {
    developerMode.value = !developerMode.value
    stopDeveloperUpdatePreview()
    return
  }

  if (actionKey === 'send-debug-test-messages' && import.meta.env.DEV) {
    sendDebugTestMessages()
    return
  }

  if (actionKey === 'send-debug-output-entries' && import.meta.env.DEV) {
    sendDebugOutputEntries()
    return
  }

  if (actionKey === 'toggle-debug-hide-cde-overlays' && import.meta.env.DEV) {
    debugHideCdeOverlays.value = !debugHideCdeOverlays.value
    return
  }

  if (actionKey === 'toggle-debug-transparent-cde-viewport' && import.meta.env.DEV) {
    debugTransparentCdeViewport.value = !debugTransparentCdeViewport.value
    return
  }
  if (actionKey === 'toggle-debug-passive-cde-viewport' && import.meta.env.DEV) {
    debugPassiveCdeViewport.value = !debugPassiveCdeViewport.value
    return
  }

  if (actionKey === 'about-opencard') {
    shellPage.value = {
      type: 'about',
      returnPage: getCurrentPrimaryShellPage(),
    }
    return
  }

  if (actionKey === 'send-feedback') {
    openFeedbackCenter('submit')
    return
  }

  if (actionKey === 'view-feedback') {
    openFeedbackCenter('history')
    return
  }

  if (actionKey === 'save-active-editor') {
    await triggerCurrentEditorSave()
    return
  }

  if (actionKey === 'toggle-auto-save') {
    settingsStore.updateSetting('workspace.autoSave', !settingsStore.settings.value.workspace.autoSave)
    return
  }

  if (actionKey === 'undo-active-editor') {
    if (!isDiffMode.value) await triggerCurrentEditorUndo()
    return
  }

  if (actionKey === 'redo-active-editor') {
    if (!isDiffMode.value) await triggerCurrentEditorRedo()
    return
  }

  if (actionKey === 'toggle-sidebar') {
    toggleSidebarCollapsed()
    return
  }

  if (actionKey === 'toggle-bottom-panel') {
    isBottomPanelExpanded.value = !isBottomPanelExpanded.value
    return
  }

  if (actionKey === 'toggle-fullscreen') {
    try {
      await toggleWindowFullscreen()
    } catch (error) {
      notifyError(t('app.notifications.fullscreenFailed'))
    }
    return
  }

  if (actionKey === 'show-welcome') {
    showPrimaryShellPage('welcome')
    return
  }

  if (actionKey === 'show-workbench') {
    showPrimaryShellPage('workbench')
    return
  }

  if (actionKey === 'return-primary-page') {
    showPrimaryShellPage(getCurrentPrimaryShellPage())
    return
  }

  if (actionKey === 'new-project') {
    await openCreateProject()
    return
  }

  if (actionKey === 'new-open-card') {
    createUntitledOpenCard()
    return
  }

  if (actionKey === 'open-project') {
    await openProject()
    return
  }

  if (actionKey === 'close-project-and-welcome') {
    await closeProjectFolder('welcome')
    return
  }

  if (actionKey === 'publish-version') {
    if (projectPath.value && changesTreeData.value.rootKeys.length > 0) {
      commitVersionError.value = ''
      commitVersionDialogOpen.value = true
    }
    return
  }

  if (actionKey === 'initialize-repository') {
    if (projectPath.value && repositoryNeedsInitialization.value) {
      void initializeProjectRepository()
    }
    return
  }

  if (actionKey === 'export-project-template') {
    if (projectPath.value) {
      const returnPage = getCurrentPrimaryShellPage()
      exportTemplateSelection.value = { excludedPaths: [], entries: [], entryNames: {}, covers: [] }
      await ensureProjectTreeLoaded()
      shellPage.value = { type: 'export-template', returnPage }
    }
    return
  }

  if (actionKey === 'export-card-documents' && projectPath.value) {
    await openProjectExportDialog()
  }
  return
}

/**
 * 「预装的包」树：内置包与软件存储里的包各成一个分组，包节点自身表达"是否预装 / 切换 / 移除"。
 * 内置包不在软件存储里，所以它没有"从软件存储移除"这个动作。
 */
function createResourcePackageTreeData(
  builtinPacks: readonly StoredResourcePackage[],
  storedPacks: readonly StoredResourcePackage[],
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const groups: [string, string, readonly StoredResourcePackage[], boolean][] = [
    [BUILTIN_RESOURCE_PACKAGES_GROUP_KEY, t('projectTemplates.sections.builtinPackages'), builtinPacks, false],
    [STORED_RESOURCE_PACKAGES_GROUP_KEY, t('projectTemplates.sections.userPackages'), storedPacks, true],
  ]
  const children = new Map<string, readonly string[]>()
  const removeResourcePackageAction: OcNodeAction = {
    key: REMOVE_RESOURCE_PACKAGE_ACTION_KEY,
    title: t('projectTemplates.actions.removeResourcePackage'),
    icon: 'action.delete',
    iconTone: 'danger',
  }
  for (const [groupKey, label, packs, removable] of groups) {
    items.set(groupKey, { label, visual: { type: 'icon', icon: 'file.package' } })
    if (packs.length === 0) {
      const emptyKey = `${groupKey}:empty`
      items.set(emptyKey, {
        label: removable
          ? t('projectTemplates.status.noStoredResourcePackages')
          : t('projectTemplates.status.noBuiltinResourcePackages'),
        visual: { type: 'icon', icon: 'file.generic' },
        disabled: true,
      })
      children.set(groupKey, [emptyKey])
      continue
    }
    children.set(groupKey, packs.map((pack) => pack.path))
    for (const pack of packs) {
      const isAttached = attachedResourcePackagePaths.value.includes(pack.path)
      items.set(pack.path, {
        label: pack.name,
        visual: { type: 'icon', icon: 'file.package' },
        tail: [
          pack.version,
          isAttached
            ? {
                key: ATTACHED_RESOURCE_PACKAGE_ACTION_KEY,
                title: t('projectTemplates.actions.detachResourcePackage'),
                icon: 'action.check',
                iconTone: 'success',
              }
            : {
                key: ATTACH_RESOURCE_PACKAGE_ACTION_KEY,
                title: t('projectTemplates.actions.attachResourcePackage'),
                icon: 'action.add',
              },
          ...(removable ? [removeResourcePackageAction] : []),
        ],
      })
    }
  }
  return {
    rootKeys: [BUILTIN_RESOURCE_PACKAGES_GROUP_KEY, STORED_RESOURCE_PACKAGES_GROUP_KEY],
    items,
    children,
  }
}

function copyProjectExportTask(task: ProjectExportTask): ProjectExportTask {
  return { ...task, documentPaths: [...task.documentPaths] }
}

async function openProjectExportDialog(): Promise<void> {
  exportPreparationIssues.value = []
  projectExportDialogTask.value = copyProjectExportTask(
    projectProfile.value?.exportTask ?? createDefaultProjectExportTask(),
  )
  const paths = indexedEntries.value
    .filter(entry => !entry.isDirectory && entry.name.toLocaleLowerCase().endsWith('.ocdocument'))
    .map(entry => entry.name.replace(/\\/g, '/'))
  projectExportDocumentCandidates.value = paths.map(path => ({ path }))
  projectExportDialogOpen.value = true
  projectExportDocumentCandidates.value = await Promise.all(paths.map(async path => {
    try {
      const document = (await loadDocumentSnapshot(path)).document
      const width = Number(document.width)
      const height = Number(document.height)
      return {
        path,
        ...(Number.isFinite(width) && Number.isFinite(height) ? { width, height } : {}),
      }
    } catch {
      return { path }
    }
  }))
}

function closeProjectExportDialog(): void {
  if (!isExportPreparing.value && !isProjectExportRunning.value) projectExportDialogOpen.value = false
}

async function startProjectExport(): Promise<boolean> {
  if (isExportPreparing.value || isProjectExportRunning.value) return false
  isExportPreparing.value = true
  exportPreparationIssues.value = []
  const prepared = await prepareProjectExport(projectExportDialogTask.value)
  if (!prepared.ok) {
    exportPreparationIssues.value = prepared.issues
    isExportPreparing.value = false
    return false
  }
  projectExportDialogOpen.value = false
  isExportPreparing.value = false
  void runProjectExport(prepared.plan)
  return true
}

async function handleTitleBarMenuAction(_menuKey: string, actionKey: string) {
  await runShellCommand(actionKey)
}

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
    await requestApplicationClose('install-update')
    return
  }
  await downloadAvailableUpdate()
}

async function handleTitleBarAppAction(actionKey: string): Promise<void> {
  if (actionKey === 'toggle-primary-page') {
    showPrimaryShellPage(getOtherPrimaryShellPage(shellPage.value))
    return
  }
  if (actionKey !== 'install-update') return
  if (availableUpdate.value) {
    if (isUpdateDownloaded.value) {
      await requestApplicationClose('install-update')
      return
    }
    await downloadAvailableUpdate()
    return
  }
  if (import.meta.env.DEV && developerMode.value) {
    if (isDeveloperPreviewDownloaded.value) {
      await requestApplicationClose('install-update')
      return
    }
    startDeveloperUpdatePreview()
  }
}

async function handleWorkspaceFrameAction(actionKey: string) {
  if (actionKey === BUILD_RESOURCE_PACKAGE_ACTION_KEY) {
    await openResourcePackageBuilder()
    return
  }
  if (actionKey === DIFF_EXIT_ACTION_KEY) {
    if (activeSession.value) setSessionMode(activeSession.value.id, 'edit')
    return
  }
  if (actionKey.startsWith(`${DIFF_BEFORE_ACTION_KEY}:`) || actionKey.startsWith(`${DIFF_AFTER_ACTION_KEY}:`)) {
    const isBefore = actionKey.startsWith(`${DIFF_BEFORE_ACTION_KEY}:`)
    const rawId = actionKey.slice((isBefore ? DIFF_BEFORE_ACTION_KEY : DIFF_AFTER_ACTION_KEY).length + 1)
    const revisionId = rawId === 'current' ? null : rawId
    const currentBefore = diffSessionState.before.value?.commitId ?? null
    const currentAfter = diffSessionState.after.value?.commitId ?? null
    const nextBefore = isBefore ? revisionId : currentBefore
    const nextAfter = isBefore ? currentAfter : revisionId
    const sessionId = activeSession.value?.id
    if (nextBefore === nextAfter || !sessionId) return
    await diffSessionState.selectComparison(nextBefore, nextAfter)
    if (
      diffSessionState.error.value
      || diffSessionState.before.value?.commitId !== nextBefore
      || diffSessionState.after.value?.commitId !== nextAfter
      || activeSession.value?.id !== sessionId
    ) return
    synchronizedDiffSessionKey = `${sessionId}|${nextBefore ?? 'current'}|${nextAfter ?? 'current'}`
    setSessionMode(sessionId, 'diff', { beforeRevisionId: nextBefore, afterRevisionId: nextAfter })
    return
  }
  if (actionKey.startsWith(CARD_RENDER_IMAGE_OPTION_PREFIX)) {
    await handleRenderCardImageAction(actionKey)
    return
  }

  if (actionKey === CARD_DESIGNER_MODE_ACTION_KEY) {
    handleCardDesignerModeUpdate(
      activeCardDesignerMode.value === 'design' ? 'data-table' : 'design',
    )
    return
  }

  if (actionKey === CARD_DATA_TABLE_IMPORT_ACTION_KEY || actionKey === DICTIONARY_IMPORT_ACTION_KEY) {
    await importDataTableWorkbook()
    return
  }

  if (actionKey === CARD_DATA_TABLE_EXPORT_ACTION_KEY || actionKey === DICTIONARY_EXPORT_ACTION_KEY) {
    await exportDataTableWorkbook()
    return
  }

  if (await currentEditorRef.value?.runWorkspaceAction?.(actionKey)) return

  await runShellCommand(actionKey)
}

async function handleRenderCardImageAction(actionKey: string): Promise<void> {
  const match = /^card-designer\.render-image\.(current|both)\.(0\.5|1|2)$/.exec(actionKey)
  if (!match) return
  const source = getCardImageRenderSource()
  if (!source) return

  const faceMode = match[1] as 'current' | 'both'
  const scale = Number(match[2])
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

async function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === SHELL_SHORTCUT_KEYS.fullscreen) {
    event.preventDefault()
    if (!event.repeat) {
      try {
        await toggleWindowFullscreen()
      } catch (error) {
        notifyError(t('app.notifications.fullscreenFailed'))
      }
    }
    return
  }

  if (!(event.ctrlKey || event.metaKey)) {
    return
  }

  if (event.defaultPrevented || event.isComposing) return

  const key = event.key.toLowerCase()
  if (key === SHELL_SHORTCUT_KEYS.newOpenCard && event.shiftKey) {
    event.preventDefault()
    createUntitledOpenCard()
    return
  }

  if (key === SHELL_SHORTCUT_KEYS.newProject) {
    event.preventDefault()
    await openCreateProject()
    return
  }

  if (key === SHELL_SHORTCUT_KEYS.save) {
    event.preventDefault()
    await triggerCurrentEditorSave()
    return
  }

  if (key === SHELL_SHORTCUT_KEYS.undo) {
    if (isDiffMode.value || isNativeHistoryTarget(event.target)) return
    if (!canUndoActiveEditor.value && !(event.shiftKey && canRedoActiveEditor.value)) {
      return
    }

    event.preventDefault()
    if (event.shiftKey) {
      await triggerCurrentEditorRedo()
      return
    }

    await triggerCurrentEditorUndo()
    return
  }

  if (key === SHELL_SHORTCUT_KEYS.redo) {
    if (isDiffMode.value || isNativeHistoryTarget(event.target)) return
    if (!canRedoActiveEditor.value) {
      return
    }

    event.preventDefault()
    await triggerCurrentEditorRedo()
  }
}

function isNativeHistoryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, [contenteditable="true"], .monaco-editor'))
}

async function startAppUpdater(): Promise<void> {
  await initializeAppUpdater()
  const result = await checkForUpdate()
  if (result === 'failed') notifyWarning(t('app.updater.checkFailed'))
}

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
  registerSettingsNavigator(openSettingsAt)
  void startShellWindow()
  void startAppUpdater()
  void startFeedbackInbox()
  if (isTauri()) {
    void loadSystemFontFamilies()
  }
})


onUnmounted(() => {
  stopDebugTestMessages()
  removeShellProgressTask(UPDATE_PROGRESS_TASK_KEY)
  disposeEditorHost()
  registerSettingsNavigator(null)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('focus', handleWindowFocus)
  disposeUnhandledExternalDrop?.()
  disposeUnhandledExternalDrop = null
  disposeShellWindow()
  disposeAppUpdater()
  disposeFeedbackInbox()
})
async function openResourcePackageBuilder(): Promise<void> {
  if (!projectPath.value) return
  await ensureProjectTreeLoaded()
  resourcePackageBuilderOpen.value = true
}</script>

<style scoped>

.open-card-shell__workspace-stack {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.open-card-shell__workbench {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.open-card-shell__workbench > :deep(*) {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.open-card-shell__sidebar-tree {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.shell-file-drop-overlay {
  position: fixed;
  inset: 8px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-3, 8px);
  /* 文件拖放的落点判定依赖 elementFromPoint，遮罩必须不参与命中测试，否则会挡住整棵文件树。 */
  pointer-events: none;
  border: 2px solid var(--oc-border-accent);
  border-radius: var(--oc-radius-lg, 8px);
  background: color-mix(in srgb, var(--oc-bg-base) 88%, transparent);
  color: var(--oc-fg-default);
  font-size: var(--oc-text-lg, 15px);
  font-weight: 600;
}
</style>

