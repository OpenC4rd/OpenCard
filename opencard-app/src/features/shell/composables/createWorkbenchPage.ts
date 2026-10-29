import { ref, shallowRef, computed, nextTick, onUnmounted, watch } from 'vue'
import { taskScheduler } from '../../../utils/taskScheduler'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../workspace/store/projectStore'
import { projectFontSources } from '../../workspace/model/projectFontRegistry'
import { createDefaultOpenCardContent, createEditorSessionManager } from '../../workspace/store/editorSessionManager'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import { useTutorialStore } from '../../tutorials/tutorialStore'
import { useStoredResourcePackageStore } from '../../workspace/store/storedResourcePackageStore'
import type { AppSettingKey } from '../../settings/model/appSettings'
import { getPathDirectory } from '../../../shared/model/filePath'
import { isMacPlatform } from '../../../shared/model/platform'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { notifyAppError, notifyError, notifySuccess } from '../../notifications/titlebarNotices'
import { editorHistoryManager } from '../../editor-runtime/history/editorHistoryManager'
import type { SessionIssueNavigationRequest } from '../../editor-runtime/model/editorIssue'
import { resolveFileType } from '../../workspace/model/fileTypes'
import { resolveSessionLabel } from '../../workspace/model/sessionLabel'
import { PROJECT_ICON_REGISTRY_FILE_NAME } from '../../workspace/model/projectStructure'
import { formatPackageCoordinate } from '../../workspace/model/packageCoordinate'
import { useProjectExport } from './useProjectExport'
import { useWorkbenchCloseCoordinator } from './useWorkbenchCloseCoordinator'
import type { ApplicationCloseAction } from './useUnsavedSessionGuard'
import { useWorkbenchEditorHost } from './useWorkbenchEditorHost'
import { useWorkbenchActions } from './useWorkbenchActions'
import { useWorkbenchVersionActions } from './useWorkbenchVersionActions'
import { useWorkbenchProjectExport } from './useWorkbenchProjectExport'
import { useWorkbenchVersionControl } from './useWorkbenchVersionControl'
import { useWorkbenchFileTree } from './useWorkbenchFileTree'
import { useWorkbenchIssues } from './useWorkbenchIssues'
import { navigateWorkspaceIssue } from '../services/workspaceIssueNavigation'
import { useShellNavigation } from './useShellNavigation'
import { createWorkbenchSection } from '../sections/workbenchSection'
import type { PageHeaderAction } from '../shell.types'
import type { SpacePage, SpacePageProblems } from '../spacePage'
import type { ProjectCloseDestination } from '../shellLocation'
import { requestConfirmation } from '../services/appConfirmation'
import { useAppProjectActions } from '../services/appProjectActions'
import WorkbenchPageContent from '../components/WorkbenchPageContent.vue'
import WorkbenchOverlays from '../components/WorkbenchOverlays.vue'
import { useWorkbenchKeyboardShortcuts } from './useWorkbenchKeyboardShortcuts'
import type { ProjectExportTask } from '../../workspace/model/projectMetadata'
import { PROJECT_FILES_LIST_KEY, PROJECT_NEW_FOLDER_ACTION_KEY, PROJECT_NEW_OPENCARD_ACTION_KEY, PROJECT_NEW_MARKDOWN_ACTION_KEY, PROJECT_NEW_TEXT_ACTION_KEY, PROJECT_REVEAL_ACTION_KEY, TIMELINE_LIST_KEY, TIMELINE_REFRESH_ACTION_KEY } from '../shellSidebarConfig'

/** 仅保留树公开的重命名能力，避免侧栏投影持有整个组件实例。 */
function captureBeginRename(instance: unknown): { beginRename: (key: string) => Promise<void> } | null {
  const tree = instance as { beginRename?: (key: string) => Promise<void> } | null
  return typeof tree?.beginRename === 'function' ? { beginRename: tree.beginRename.bind(tree) } : null
}

export function createWorkbenchPage(options: {
  openSetting: (key: AppSettingKey) => void
  completeProjectClose: (destination: ProjectCloseDestination) => Promise<void>
  completeApplicationClose: (action: ApplicationCloseAction) => Promise<void>
}) {
  const { t, locale } = useI18n()
  const BUILD_RESOURCE_PACKAGE_ACTION_KEY = 'file.build-package'
  const settingsStore = useAppSettingsStore()
  const app = useAppProjectActions()
  const { page: shellPage, showPrimarySpace: showPrimarySpacePage } = useShellNavigation()
  const isWorkbenchMode = computed(() => shellPage.value === 'workbench' || shellPage.value === 'collaboration')
  const openSettingsAt = options.openSetting
  const resourcePackageStore = useStoredResourcePackageStore()
  const resourcePackageBuilderOpen = ref(false)
  const resourcePackageBuilderEntries = shallowRef<readonly string[]>([])
  let packageScan: AbortController | undefined
  const projectTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)
  const projectManagementTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)
  watch(() => settingsStore.settings.value.workspace.historyEntryLimit, limit => editorHistoryManager.setEntryLimit(limit), { immediate: true })
  const projectStore = useProjectStore()
  const projectOpen = computed(() => Boolean(projectStore.projectPath.value))
  const tutorial = useTutorialStore()
  watch([shellPage, projectStore.projectPath], ([page, path], [, previousPath]) => {
    if (path === previousPath && path && page === 'collaboration') tutorial.completeStep('workbench', 'collaboration')
    if (tutorial.session.value?.tutorialId === 'workbench' && (page !== 'workbench' || path !== previousPath)) tutorial.exit()
  })
  watch(() => settingsStore.isReady.value && projectOpen.value && shellPage.value === 'workbench'
    && !tutorial.session.value && !settingsStore.settings.value.tutorials.seen.includes('workbench'), ready => {
    if (ready) tutorial.start('workbench')
  }, { immediate: true })
  const {
    projectPath,
    projectProfile,
    resolvedProject,
    projectFontFamilies,
    fontRegistryReady,
    renderEnvironment: projectRenderEnvironment,
    indexedEntries,
    fileChangeRevision,
    isDirectoryExpanded,
    readDirectoryEntries,
    readFile: readProjectFile,
    resolveProjectPath,
    setDirectoryExpanded,
    createEntryWithAvailableName,
    trashFile,
    revealEntryInFileManager,
    getRelativeProjectPath,
    moveEntryByDrop,
    copyExternalEntriesIntoProject,
    renameEntry,
  } = projectStore

  const sessionManager = createEditorSessionManager(id => { void projectStore.releaseComparison(id) })
  const { sessions, activeSession, open: openEditorSession, activateSession, createDraftSession,
    closeSession, closeWorkspaceSessions, closeSessionsByPath, remapSessionPaths } = sessionManager

  const visibleEditorSession = computed(() => (
    isWorkbenchMode.value ? activeSession.value : null
  ))

  let autoSaveTimer: number | null = null
  function restartAutoSaveTimer(): void {
    if (autoSaveTimer !== null) {
      window.clearInterval(autoSaveTimer)
      autoSaveTimer = null
    }
    const workspaceSettings = settingsStore.settings.value.workspace
    if (!workspaceSettings.autoSave) return
    autoSaveTimer = window.setInterval(() => {
      void Promise.all(sessions.value.filter(session => session.state.isDirty && session.state.path).map(async session => {
        return await session.save() === 'saved' ? session.state.name : null
      }))
        .then(names => names.filter(name => name !== null).forEach(name => notifySuccess(t('app.notifications.saved', { name }), 'mdiContentSaveOutline')))
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

  const versionControl = useWorkbenchVersionControl({
    projectPath, activeSession, locale, translate: t, fileChangeRevision, getRelativeProjectPath,
    moveProjectEntryToTrash: trashFile,
    requestPathChanges: (paths, perform) => requestPathChanges(paths.map(resolveProjectPath), perform),
    openSetting: openSettingsAt, settings: settingsStore.settings, requestConfirmation,
  })
  const {
    timelineFilePath,
    timelineFileName,
    timelineTreeData,
    statusEntries,
    timelineLoading,
    timelineRevisionOptions,
    latestCommitIdForPath,
    refreshTimeline,
    timelinePlaceholder,
    changesExpandedKeys,
    repositoryReady,
    handleChangesExpansionChange,
  } = versionControl
  const {
    diffSessionState,
    editorComparison,
    handleTimelineAction,
    handleChangesNodeActivate,
    selectWorkspaceDiff,
  } = useWorkbenchVersionActions({
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
    onChangesExpansionChange: handleChangesExpansionChange,
  })
  const {
    isRunning: isProjectExportRunning,
    loadDocumentSnapshot,
    prepare: prepareProjectExport,
    run: runProjectExport,
    renderCardImages, cancelAndWait: cancelExportsAndWait,
  } = useProjectExport({
    sessions,
    renderEnvironment: projectRenderEnvironment,
    readProjectFile,
    resolveProjectPath,
    getRelativeProjectPath,
    translate: t,
  })
  const {
    editorRef: currentEditorRef, key: currentEditorKey, mount: currentEditorMount, contribution: editorContribution,
    canUndo: canUndoActiveEditor, canRedo: canRedoActiveEditor,
    save: triggerCurrentEditorSave, undo: triggerCurrentEditorUndo, redo: triggerCurrentEditorRedo,
  } = useWorkbenchEditorHost({
    activeSession: visibleEditorSession, comparison: editorComparison,
    cardProps: computed(() => ({ renderCardImages, imageExportBusy: isProjectExportRunning.value,
    })),
    reportIssues: (id, snapshot) => reportSessionIssueSnapshot(id, snapshot),
    openFile: path => handleOpenFile(path), trashFile: path => handleEditorTrashFile(path), translate: t,
  })
  const isDiffMode = computed(() => isWorkbenchMode.value && activeSession.value?.state.mode === 'diff')
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
    requestPathChanges,
    requestApplicationClose,
    discardSingle: discardSingleUnsavedEditor,
    saveSingle: saveSingleUnsavedEditor,
  } = useWorkbenchCloseCoordinator({
    sessions,
    pickDraftDirectory: () => fileSystemService.pickDirectory(t('app.unsavedEditors.pickDraftDirectory')),
    fileExists: path => fileSystemService.fileExists(path),
    completions: {
      sessions: performSessionClose,
      project: async destination => { await cancelExportsAndWait(); await options.completeProjectClose(destination) },
      trash: performPathTrash,
      application: async action => { await cancelExportsAndWait(); await projectStore.disposeResources(); await options.completeApplicationClose(action) },
    },
  })

  /** 用户取消关闭时，一并放弃“关完再打开新项目”的暂存请求。 */
  function cancelUnsavedCloseRequest(): void {
    app.cancelDeferredOpen()
    cancelUnsavedClose()
  }

  const sessionScopeTexts = {
    external: (name: string) => t('sidebar.editorTitles.external', { name }),
    draft: (name: string) => t('sidebar.editorTitles.draft', { name }),
  }

  function formatSessionTitle(session: EditorSession): string {
    return resolveSessionLabel(session.state, sessionScopeTexts)
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
  } = useWorkbenchIssues({ sessions, copyIssueLabel: t('app.problems.copyIssue') })

  watch(locale, clearAllSessionIssues, { flush: 'sync' })
  watch(projectPath, (nextPath, previousPath) => {
    if (nextPath !== previousPath) { clearAllSessionIssues(); closeResourcePackageBuilder() }
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
  } = useWorkbenchProjectExport({
    projectProfile,
    listDocuments: async signal => {
      const paths: string[] = []
      await taskScheduler.forEach(await projectStore.scanProjectEntries(signal), entry => {
        if (entry.isFile && entry.name.toLowerCase().endsWith('.ocdocument')) paths.push(entry.name)
      }, signal)
      return paths
    },
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
  } = useWorkbenchFileTree({
    projectPath,
    indexedEntries,
    hideDotFiles: computed(() => settingsStore.settings.value.workspace.hideDotFiles),
    packagePaths: computed(() => [...projectStore.projectResourcePackageFiles.value, ...projectStore.unreadableProjectResourcePackages.value].map(pkg => pkg.archivePath)),
    packageCoordinates: computed(() => new Map(
      [...projectStore.projectResourcePackages.value.values()]
        .map(pkg => [pkg.archivePath.replace(/\\/g, '/'), formatPackageCoordinate(pkg.coordinate)] as const),
    )),
    sessions,
    formatSessionTitle,
    activeSession,
    isDirectoryExpanded,
    expandedDirectories: projectStore.expandedDirectories,
    getDirectoryState: path => projectStore.directoryStates.get(getRelativeProjectPath(path)),
    activateSession,
    openPreviewFile: (path: string) => openEditorSession(path, { preview: true }),
    translate: t,
    registeredFontSources: computed(() => fontRegistryReady.value
      ? projectFontFamilies.value.flatMap(projectFontSources)
      : null),
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
  } = useWorkbenchActions({
    projectPath,
    openedEditorTreeData,
    tree: {
      handleOpenedEditorsSelect,
      handleProjectManagementSelect,
      handleFileTreeSelect,
      selectedProjectEntryKeys,
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
    close: { requestSessionClose, requestPathTrash, requestPathChanges, performPathTrash },
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
      timeline: {
        placeholder: timelinePlaceholder,
        filePath: timelineFilePath,
        loading: timelineLoading,
        data: timelineTreeData,
        onAction: handleTimelineAction,
      },
    },
  })
  const headerContribution = computed(() => {
    const session = visibleEditorSession.value
    const editorKey = currentEditorKey.value
    if (!session) return { actions: [], onAction: () => {} }
    const isCurrent = () => visibleEditorSession.value?.state.id === session.state.id
      && currentEditorKey.value === editorKey
    if (!isDiffMode.value) return editorContribution.value
    const revisions = timelineRevisionOptions.value
    const actions: PageHeaderAction[] = []
    for (const side of ['before', 'after'] as const) {
      const id = session.state.diff?.[`${side}RevisionId`] ?? diffSessionState[side].value?.commitId ?? null
      const selected = revisions.find(option => option.commitId === id)
      const title = t(side === 'before' ? 'versionControl.diffViewer.versionA' : 'versionControl.diffViewer.versionB')
      actions.push(selected?.shortId ?? selected?.label ?? t('versionControl.diffViewer.diskVersion'), {
        key: `diff.${side}`, icon: side === 'before' ? 'mdiSeed' : 'mdiSprout', title,
        children: revisions.map(option => ({
          key: `diff.${side}:${option.commitId ?? 'current'}`,
          title: option.shortId ? `${option.label} ${option.shortId}` : option.label,
          icon: option.commitId === id ? 'mdiCheck' : 'mdiSourceBranch',
        })),
      })
    }
    actions.push({ key: 'diff.exit', icon: 'mdiArrowLeft', title: t('versionControl.diffViewer.exitComparison') })
    return { actions, onAction: async (key: string) => {
      if (!isCurrent() || !isDiffMode.value) return
      if (key === 'diff.exit') { session.setMode('edit'); return }
      const match = /^diff\.(before|after):(.+)$/.exec(key)
      if (match) await selectWorkspaceDiff(match[1] as 'before' | 'after', match[2] === 'current' ? null : match[2]!)
    } }
  })

  async function handleWorkspaceIssueNavigate(request: SessionIssueNavigationRequest): Promise<void> {
    await navigateWorkspaceIssue(request, {
      hasSession: (sessionId) => sessions.value.some((session) => session.state.id === sessionId),
      activateSession,
      waitForEditorMount: nextTick,
      getActiveSessionId: () => activeSession.value?.state.id ?? null,
      getEditorNavigator: () => currentEditorRef.value,
    })
  }

  async function createProjectEntry(kind: 'folder' | 'opencard' | 'markdown' | 'text'): Promise<void> {
    if (!projectPath.value) return
    const selectedKey = selectedProjectEntryKeys.value[0]
    const selectedEntry = selectedKey ? findProjectEntryByKey(selectedKey) : null
    const parentPath = selectedEntry?.isDirectory ? selectedEntry.key
      : selectedEntry ? getPathDirectory(selectedEntry.key) || projectPath.value : projectPath.value
    if (findProjectEntryByKey(parentPath)?.isDirectory) setDirectoryExpanded(parentPath, true)
    const baseName = t({
      folder: 'sidebar.fileActions.newFolderName', opencard: 'sidebar.fileActions.newOpenCardName',
      markdown: 'sidebar.fileActions.newMarkdownName', text: 'sidebar.fileActions.newTextName',
    }[kind])
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
      if (actionKey === PROJECT_NEW_MARKDOWN_ACTION_KEY) return createProjectEntry('markdown')
      if (actionKey === PROJECT_NEW_TEXT_ACTION_KEY) return createProjectEntry('text')
      if (actionKey === PROJECT_NEW_FOLDER_ACTION_KEY) return createProjectEntry('folder')
    }

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
  }

  function createUntitledOpenCard() {
    showPrimarySpacePage('workbench')
    createDraftSession({
      fileTypeId: 'opencard',
    })
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
    if (path) { await handleOpenFile(path); showPrimarySpacePage('workbench') }
  }

  async function saveAllEditors(): Promise<void> {
    for (const session of sessions.value) {
      if (session.state.isDirty) await session.save()
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

  async function openResourcePackageBuilder(): Promise<void> {
    if (!projectPath.value) return
    packageScan?.abort()
    const owner = new AbortController()
    packageScan = owner
    const root = projectPath.value
    try {
      const entries = await projectStore.scanProjectEntries(owner.signal)
      const candidates: string[] = []
      await taskScheduler.forEach(entries, entry => {
        if (entry.isFile) candidates.push(entry.name.replace(/\\/g, '/'))
      }, owner.signal)
      if (owner.signal.aborted || projectPath.value !== root) return
      resourcePackageBuilderEntries.value = candidates
      resourcePackageBuilderOpen.value = true
    } catch (error) {
      if (!owner.signal.aborted && projectPath.value === root && !(error instanceof Error && error.name === 'AbortError')) throw error
    } finally { if (packageScan === owner) packageScan = undefined }
  }

  function closeResourcePackageBuilder(): void {
    packageScan?.abort()
    packageScan = undefined
    resourcePackageBuilderOpen.value = false
    resourcePackageBuilderEntries.value = []
  }

  async function runWorkbenchAction(key: string): Promise<void> {
    if (['save-active-editor', 'save-active-editor-as', 'save-all-editors', 'undo-active-editor', 'redo-active-editor'].includes(key)
      && !visibleEditorSession.value) return
    switch (key) {
      case 'file.build-package': return openResourcePackageBuilder()
      case 'save-active-editor': return triggerCurrentEditorSave()
      case 'save-active-editor-as': if (activeSession.value) await activeSession.value.saveAs(); return
      case 'save-all-editors': return saveAllEditors()
      case 'undo-active-editor': if (!isDiffMode.value) await triggerCurrentEditorUndo(); return
      case 'redo-active-editor': if (!isDiffMode.value) await triggerCurrentEditorRedo(); return
      case 'toggle-auto-save': settingsStore.updateSetting('workspace.autoSave', !settingsStore.settings.value.workspace.autoSave); return
      case 'new-open-card': return createUntitledOpenCard()
      case 'open-project': await app.openProject(); return
      case 'export-project-template': return app.exportTemplate()
      case 'export-card-documents': if (projectPath.value) await openProjectExportDialog(); return
    }
  }

  const { handle: handleKeydown } = useWorkbenchKeyboardShortcuts({
    saveKey: 's', undoKey: 'z', redoKey: 'y',
    hasVisibleEditor: computed(() => Boolean(visibleEditorSession.value)), isDiffMode,
    canUndo: canUndoActiveEditor, canRedo: canRedoActiveEditor,
    save: () => runWorkbenchAction('save-active-editor'), undo: () => runWorkbenchAction('undo-active-editor'), redo: () => runWorkbenchAction('redo-active-editor'),
  })

  const menuContribution = computed<NonNullable<SpacePage['menuContribution']>['value']>(() => {
    const primary = (key: string, shift = false) => isMacPlatform()
      ? [...(shift ? ['⇧'] : []), '⌘', key.toUpperCase()] : ['Ctrl', ...(shift ? ['Shift'] : []), key.toUpperCase()]
    const options = {
      projectPath: projectPath.value, autoSave: settingsStore.settings.value.workspace.autoSave,
      buildResourcePackageActionKey: BUILD_RESOURCE_PACKAGE_ACTION_KEY,
      editor: visibleEditorSession.value ? { isDiff: isDiffMode.value, canUndo: canUndoActiveEditor.value, canRedo: canRedoActiveEditor.value } : null,
      shortcuts: { save: primary('s'), undo: primary('z'), redo: isMacPlatform() ? primary('z', true) : primary('y') },
    }
    const actions: Partial<Record<'file' | 'edit', import('../shell.types').ShellMenuContribution['actions']>> = { file: [
      { type: 'divider', key: 'file-save-divider' },
      {
        key: 'save-active-editor',
        title: t('app.menu.save'),
        icon: 'mdiContentSaveOutline',
        shortcut: options.shortcuts.save,
        disabled: !options.editor,
      },
      {
        key: 'save-active-editor-as',
        title: t('app.menu.saveAs'),
        icon: 'mdiContentSaveOutline',
        disabled: !options.editor,
      },
      {
        key: 'save-all-editors',
        title: t('app.menu.saveAll'),
        icon: 'mdiContentSaveOutline',
        disabled: !options.editor,
      },
      {
        key: 'toggle-auto-save',
        title: options.autoSave ? t('app.menu.disableAutoSave') : t('app.menu.enableAutoSave'),
        icon: options.autoSave ? 'mdiContentSaveOffOutline' : 'mdiContentSaveOutline',
      },
      { type: 'divider', key: 'file-export-divider' },
      { key: options.buildResourcePackageActionKey, title: t('resourcePackage.buildTitle'), icon: 'mdiPackageVariantClosed', disabled: !options.projectPath },
      { key: 'export-project-template', title: t('templateExport.menu'), icon: 'mdiExport', disabled: !options.projectPath },
      { key: 'export-card-documents', title: t('app.menu.exportCardDocuments'), icon: 'mdiExport', disabled: !options.projectPath },

    ], edit: [
      {
        key: 'undo-active-editor',
        title: t('app.menu.undo'),
        icon: 'mdiUndoVariant',
        shortcut: options.shortcuts.undo,
        disabled: !options.editor || options.editor.isDiff || !options.editor.canUndo,
      },
      {
        key: 'redo-active-editor',
        title: t('app.menu.redo'),
        icon: 'mdiRedoVariant',
        shortcut: options.shortcuts.redo,
        disabled: !options.editor || options.editor.isDiff || !options.editor.canRedo,
      },

    ] }
    return Object.fromEntries(Object.entries(actions).map(([key, entries]) => [key, { actions: entries, onAction: runWorkbenchAction }]))
  })

  const page: SpacePage = {
    menuContribution,
    key: 'workbench',
    navigation: { key: 'workbench', icon: 'mdiPencilRuler', labelKey: 'app.shell.space.workbench' },
    content: WorkbenchPageContent,
    contentProps: computed(() => {
      const session = activeSession.value
      return {
        hasActiveEditor: Boolean(session), hasProject: Boolean(projectPath.value), onOpenProject: app.openProject,
        editor: currentEditorMount.value,
      }
    }),
    sidebar: computed(() => workbenchSection.value.map(group => ({ ...group, onAction: runWorkbenchAction,
      lists: group.lists.map(list => ({ ...list, onAction: key => handleSidebarListAction(list.key, key) })),
    }))),
    sidebarLayout: { persistenceKey: computed(() => projectPath.value.replace(/\\/g, '/').replace(/\/+$/, '')) },
    header: computed(() => projectPath.value || activeSession.value ? ({
      title: activeSession.value ? formatSessionTitle(activeSession.value) : projectName.value || t('app.menu.workbench'),
      titleLoading: Boolean(activeSession.value && activeSession.value.state.presentation === undefined),
      icon: activeSession.value?.state.presentation?.icon, iconTone: activeSession.value?.state.presentation?.iconTone,
      subtitle: activeSession.value?.state.presentation?.description, actions: headerContribution.value.actions, onAction: headerContribution.value.onAction,
    }) : null),
    bottomPanel: computed<SpacePageProblems>(() => ({
      treeData: issueTreeData.value, count: issueCount.value, severity: highestIssueSeverity.value,
      expandedKeys: expandedIssueKeys.value, setExpanded: setIssueNodeExpanded,
      activate: async key => { const target = issueNavigationTargets.value.get(key); if (target) await handleWorkspaceIssueNavigate(target) },
      copy: async key => {
        const issue = issueDetails.value.get(key)
        if (!issue) return
        try { await navigator.clipboard.writeText(JSON.stringify(issue, null, 2)) }
        catch (error) { notifyAppError('OC-E1002', { source: 'issue-entry', issueId: issue.id, error }, locale.value) }
      },
    })),
    handleKeydown,
    overlays: WorkbenchOverlays,
    overlayProps: computed(() => ({
      projectExportDialogOpen: projectExportDialogOpen.value, projectExportDialogTask: projectExportDialogTask.value,
      projectExportDocumentCandidates: projectExportDocumentCandidates.value, isExportPreparing: isExportPreparing.value, isProjectExportRunning: isProjectExportRunning.value,
      exportPreparationIssues: exportPreparationIssues.value, resourcePackageBuilderOpen: resourcePackageBuilderOpen.value, projectPath: projectPath.value,
      projectName: projectName.value, resourcePackageBuilderEntries: resourcePackageBuilderEntries.value,
      isUnsavedEditorsDialogOpen: isUnsavedEditorsDialogOpen.value, pendingCloseIntent: pendingCloseIntent.value,
      unsavedEditorDecisions: unsavedEditorDecisions.value, isUnsavedCloseBusy: isUnsavedCloseBusy.value, unsavedCloseError: unsavedCloseError.value,
      unsavedSelectedCount: unsavedSelectedCount.value, unsavedPendingCount: unsavedPendingCount.value, unsavedSaveCount: unsavedSaveCount.value,
      unsavedDiscardCount: unsavedDiscardCount.value, allUnsavedPendingSelected: allUnsavedPendingSelected.value, someUnsavedPendingSelected: someUnsavedPendingSelected.value,
      canConfirmUnsavedClose: canConfirmUnsavedClose.value,
      'onUpdate:projectExportDialogTask': (value: ProjectExportTask) => { projectExportDialogTask.value = value },
      onCloseProjectExport: closeProjectExportDialog, onSubmitProjectExport: startProjectExport,
      onCloseResourcePackageBuilder: closeResourcePackageBuilder,
      onSelectAllUnsaved: setAllUnsavedPendingSelected, onSelectUnsavedRow: setUnsavedRowSelected, onMarkUnsavedDiscard: markSelectedUnsavedDiscard,
      onMarkUnsavedSave: markSelectedUnsavedSave, onResetUnsavedDecision: resetUnsavedDecision, onCancelUnsavedClose: cancelUnsavedCloseRequest,
      onConfirmUnsavedClose: confirmUnsavedClose, onDiscardSingleUnsaved: discardSingleUnsavedEditor, onSaveSingleUnsaved: saveSingleUnsavedEditor,
    })),
  }
  onUnmounted(() => { closeResourcePackageBuilder(); sessionManager.dispose(); void cancelExportsAndWait() })
  return {
    page, versionControl, handleChangesNodeActivate, openProject: app.openProject,
    openFile: openFileFromPicker, open: openEditorSession,
    closeWorkspaceSessions, requestProjectClose, requestApplicationClose, cancelExportsAndWait,
    newDocument: createUntitledOpenCard, addResourcePackageToProject,
    openIconRegistry: async () => { await handleProjectManagementSelect([resolveProjectPath(PROJECT_ICON_REGISTRY_FILE_NAME)]) },
    templateTree: { projectTreeData, selectedProjectEntryKeys },
  }
}
