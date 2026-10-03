import { useI18n } from 'vue-i18n'
import { notifyAppError, notifySuccess, notifyWarning } from '../../notifications/titlebarNotices'
import type {
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeExternalDropEvent,
  OcNodeMoveEvent,
  OcNodeRenameCommitEvent,
  OcNodeSelectionEvent,
} from '../../../shared/ui/node/node.types'
import type { Ref } from 'vue'
import {
  OPENED_EDITOR_CLOSE_ACTION_KEY, PROJECT_PACKAGE_ADD_ACTION_KEY,
  PROJECT_ENTRY_RENAME_ACTION_KEY, PROJECT_ENTRY_CONFIRM_DELETE_ACTION_KEY,
  PROJECT_ENTRY_REVEAL_ACTION_KEY, PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY,
  PROJECT_ENTRY_COPY_ABSOLUTE_PATH_ACTION_KEY,
} from './useShellFileTree'
import type { useShellFileTree } from './useShellFileTree'
import type { useProjectStore } from '../../workspace/store/projectStore'

export function useShellWorkbenchActions(options: {
  projectPath: Readonly<Ref<string>>
  openedEditorTreeData: Readonly<Ref<OcNodeCollection>>
  tree: Pick<ReturnType<typeof useShellFileTree>, 'handleOpenedEditorsSelect' | 'handleProjectManagementSelect'
    | 'handleFileTreeSelect' | 'setProjectManagementEntryExpanded' | 'findProjectEntryByKey' | 'setProjectEntryExpanded'>
  project: Pick<ReturnType<typeof useProjectStore>, 'setDirectoryExpanded' | 'readDirectoryEntries'
    | 'renameEntry' | 'moveEntryByDrop' | 'copyExternalEntriesIntoProject' | 'revealEntryInFileManager' | 'getRelativeProjectPath'>
  close: {
    requestSessionClose: (ids: readonly string[]) => Promise<unknown>
    requestPathTrash: (path: string) => Promise<unknown>
  }
  editor: {
    openFile: (path: string) => Promise<void>
    remapSessionPaths: (fromPath: string, toPath: string) => void
    resolveFileType: (path: string) => { id: string }
  }
  projectManagement: { pickAndAddPackage: () => Promise<void> }
  beginRename: Ref<{ beginRename: (key: string) => Promise<void> } | null>
  managementTree: Ref<{ beginRename: (key: string) => Promise<void> } | null>
}) {
  const { t, locale } = useI18n()
  async function runProjectEntryAction(
    actionKey: string, path: string, tree: typeof options.beginRename,
  ): Promise<void> {
    if (actionKey === PROJECT_ENTRY_RENAME_ACTION_KEY) {
      await tree.value?.beginRename(path)
      return
    }
    if (actionKey === PROJECT_ENTRY_CONFIRM_DELETE_ACTION_KEY) {
      try { await options.close.requestPathTrash(path) }
      catch (error) { notifyAppError('OC-E3016', { path, error }, locale.value) }
      return
    }
    if (actionKey === PROJECT_ENTRY_REVEAL_ACTION_KEY) {
      try { await options.project.revealEntryInFileManager(path) }
      catch (error) { notifyAppError('OC-E2004', { actionKey, path, error }, locale.value) }
      return
    }
    if (actionKey !== PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY && actionKey !== PROJECT_ENTRY_COPY_ABSOLUTE_PATH_ACTION_KEY) return
    const relative = actionKey === PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY
    try { await navigator.clipboard.writeText(relative ? options.project.getRelativeProjectPath(path) : path) }
    catch (error) {
      notifyAppError('OC-E1002', { source: relative ? 'project-relative-path' : 'project-absolute-path', path, error }, locale.value)
    }
  }
  async function handleProjectTreeItemToggle(itemKey: string, expanded: boolean): Promise<void> {
    const entry = options.tree.findProjectEntryByKey(itemKey)
    if (!entry) return
    if (!entry.isDirectory) {
      options.tree.setProjectEntryExpanded(entry.key, expanded)
      return
    }
    options.project.setDirectoryExpanded(entry.key, expanded)
    if (!expanded) return
    try { await options.project.readDirectoryEntries(entry.key) }
    catch (error) { notifyAppError('OC-E2001', { path: entry.key, error }, locale.value) }
  }
  function handleOpenedEditorSelectionChange(event: OcNodeSelectionEvent): void {
    options.tree.handleOpenedEditorsSelect(event.selectedKeys)
  }
  async function handleOpenedEditorAction(event: OcNodeActionEvent): Promise<void> {
    if (event.actionKey === OPENED_EDITOR_CLOSE_ACTION_KEY) await options.close.requestSessionClose([event.key])
  }
  async function handleOpenedEditorAuxClick(event: MouseEvent): Promise<void> {
    if (event.button !== 1 || !(event.target instanceof Element)) return
    const key = event.target.closest<HTMLElement>('[data-oc-tree-key]')?.dataset.ocTreeKey
    if (!key || !options.openedEditorTreeData.value.items.has(key)) return
    event.preventDefault()
    await options.close.requestSessionClose([key])
  }
  async function handleProjectManagementSelectionChange(event: OcNodeSelectionEvent): Promise<void> {
    await options.tree.handleProjectManagementSelect(event.selectedKeys)
  }
  function handleProjectManagementExpansionChange(event: OcNodeExpansionEvent): void {
    options.tree.setProjectManagementEntryExpanded(event.key, event.expanded)
  }
  async function handleProjectManagementAction(event: OcNodeActionEvent): Promise<void> {
    if (event.actionKey === PROJECT_PACKAGE_ADD_ACTION_KEY) {
      await options.projectManagement.pickAndAddPackage()
      return
    }
    await runProjectEntryAction(event.actionKey, event.key, options.managementTree)
  }
  async function handleProjectSelectionChange(event: OcNodeSelectionEvent): Promise<void> {
    await options.tree.handleFileTreeSelect(event.selectedKeys)
  }
  async function handleProjectExpansionChange(event: OcNodeExpansionEvent): Promise<void> {
    await handleProjectTreeItemToggle(event.key, event.expanded)
  }
  async function handleProjectRenameCommit(event: OcNodeRenameCommitEvent): Promise<void> {
    const result = await options.project.renameEntry(event.key, event.name)
    if (result.ok) options.editor.remapSessionPaths(result.fromPath, result.toPath)
    // 名字没改（输入框里原样确认）不是失败：什么都没发生，也就不必报。
    else if (result.reason !== 'same-path') notifyWarning(t('app.notifications.renameRejected'))
  }
  async function handleProjectMove(event: OcNodeMoveEvent): Promise<void> {
    const result = await options.project.moveEntryByDrop(event)
    if (result.ok) options.editor.remapSessionPaths(result.fromPath, result.toPath)
    else notifyWarning(t('app.notifications.moveRejected'))
  }
  async function handleProjectExternalDrop(event: OcNodeExternalDropEvent): Promise<void> {
    const result = await options.project.copyExternalEntriesIntoProject({ paths: event.payload, targetKey: event.targetKey, position: event.position })
    if (!result.ok) { notifyWarning(t('app.notifications.externalDropRejected')); return }
    if (result.copied > 0) notifySuccess(t('app.notifications.externalDropCopied', { count: result.copied }))
    if (result.failed > 0) notifyWarning(t('app.notifications.externalDropFailed', { count: result.failed }))
    if (result.copied === 0 && result.failed === 0) notifyWarning(t('app.notifications.externalDropSkipped'))
  }
  async function handleProjectAction(event: OcNodeActionEvent): Promise<void> {
    const entry = options.tree.findProjectEntryByKey(event.key)
    if (entry) await runProjectEntryAction(event.actionKey, entry.key, options.beginRename)
  }
  async function handleProjectNodeActivate(event: OcNodeActivateEvent): Promise<void> {
    const entry = options.tree.findProjectEntryByKey(event.key)
    if (!entry) return
    if (entry.isDirectory) { await handleProjectTreeItemToggle(entry.key, !entry.isExpanded); return }
    if (options.editor.resolveFileType(entry.key).id === 'font') return
    await options.editor.openFile(entry.key)
  }
  return {
    handleProjectTreeItemToggle,
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
  }
}
