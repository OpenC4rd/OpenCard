import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeExpansionSyncEvent,
  OcNodeExternalDropEvent,
  OcNodeMoveEvent,
  OcNodeRenameCommitEvent,
  OcNodeSelectionEvent,
} from '../../../shared/ui/node/node.types'
import type { ShellList, ShellListGroup } from '../shell.types'
import {
  OPENED_EDITORS_LIST_KEY,
  PROJECT_FILES_LIST_KEY,
  PROJECT_MANAGEMENT_LIST_KEY,
  PROJECT_NEW_FILE_ACTION_KEY,
  PROJECT_NEW_FOLDER_ACTION_KEY,
  PROJECT_NEW_OPENCARD_ACTION_KEY,
  PROJECT_REVEAL_ACTION_KEY,
  TIMELINE_LIST_KEY,
  TIMELINE_REFRESH_ACTION_KEY,
} from '../shellSidebarConfig'

type Translate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string
type RenameTree = (instance: unknown) => void

export interface WorkbenchSectionOptions {
  translate: Translate
  project: {
    open: Readonly<Ref<boolean>>
    path: Readonly<Ref<string>>
    folderName: Readonly<Ref<string>>
    openedEditors: {
      data: Readonly<Ref<OcNodeCollection>>
      selectedKeys: Readonly<Ref<string[]>>
      onSelectionChange: (event: OcNodeSelectionEvent) => void
      onAction: (event: OcNodeActionEvent) => Promise<void>
      onAuxclick: (event: MouseEvent) => Promise<void>
    }
    management: {
      data: Readonly<Ref<OcNodeCollection>>
      selectedKeys: Readonly<Ref<string[]>>
      expandedKeys: Readonly<Ref<string[]>>
      onSelectionChange: (event: OcNodeSelectionEvent) => Promise<void>
      onExpansionChange: (event: OcNodeExpansionEvent) => void
      onAction: (event: OcNodeActionEvent) => Promise<void>
      onRenameCommit: (event: OcNodeRenameCommitEvent) => Promise<void>
      onMove: (event: OcNodeMoveEvent) => Promise<void>
      onExternalDrop: (event: OcNodeExternalDropEvent) => Promise<void>
      captureInstance: RenameTree
    }
    files: {
      data: Readonly<Ref<OcNodeCollection>>
      selectedKeys: Readonly<Ref<string[]>>
      expandedKeys: Readonly<Ref<string[]>>
      onSelectionChange: (event: OcNodeSelectionEvent) => Promise<void>
      onExpansionChange: (event: OcNodeExpansionEvent) => Promise<void>
      onAction: (event: OcNodeActionEvent) => Promise<void>
      onNodeActivate: (event: OcNodeActivateEvent) => Promise<void>
      onRenameCommit: (event: OcNodeRenameCommitEvent) => Promise<void>
      onMove: (event: OcNodeMoveEvent) => Promise<void>
      onExternalDrop: (event: OcNodeExternalDropEvent) => Promise<void>
      captureInstance: RenameTree
    }
  }
  version: {
    ready: Readonly<Ref<boolean>>
    needsInitialization: Readonly<Ref<boolean>>
    initializing: Readonly<Ref<boolean>>
    committing: Readonly<Ref<boolean>>
    selectedChangeCount: Readonly<Ref<number>>
    timeline: {
      placeholder: Readonly<Ref<string>>
      filePath: Readonly<Ref<string | null>>
      loading: Readonly<Ref<boolean>>
      data: Readonly<Ref<OcNodeCollection>>
      onAction: (event: OcNodeActionEvent) => Promise<void>
    }
    changes: {
      data: Readonly<Ref<OcNodeCollection>>
      expandedKeys: Readonly<Ref<string[]>>
      onExpansionChange: (event: OcNodeExpansionEvent) => void
      onExpansionSync: (event: OcNodeExpansionSyncEvent) => void
      onNodeActivate: (event: OcNodeActivateEvent) => Promise<void>
      onAction: (event: OcNodeActionEvent) => Promise<void>
    }
    graph: {
      data: Readonly<Ref<OcNodeCollection>>
      expandedKeys: Readonly<Ref<string[]>>
      onExpansionChange: (event: OcNodeExpansionEvent) => void
      onExpansionSync: (event: OcNodeExpansionSyncEvent) => void
    }
  }
}

export function createWorkbenchSection(options: WorkbenchSectionOptions): ComputedRef<ShellListGroup[]> {
  return computed(() => {
    if (!options.project.open.value) {
      return [{
        key: 'workspace',
        title: options.translate('sidebar.workspaceGroup', 'Workspace'),
        icon: 'status.folder-open',
        headButtons: [{
          key: 'open-project',
          icon: 'status.folder-open',
          title: options.translate('sidebar.openProject', 'Open Project Folder'),
        }],
        lists: [{
          key: OPENED_EDITORS_LIST_KEY,
          title: options.translate('sidebar.openedEditors'),
          placeholder: options.translate('sidebar.noOpenedEditors', 'No open editors'),
          actions: [],
          content: {
            type: 'tree' as const,
            data: options.project.openedEditors.data.value,
            selectedKeys: options.project.openedEditors.selectedKeys.value,
            role: 'listbox' as const,
            selectionMode: 'single' as const,
            activationMode: 'none' as const,
            onSelectionChange: options.project.openedEditors.onSelectionChange,
            onAction: options.project.openedEditors.onAction,
            onAuxclick: options.project.openedEditors.onAuxclick,
          },
        }],
      }]
    }

    const projectLists: ShellList[] = [
      {
        key: OPENED_EDITORS_LIST_KEY,
        title: options.translate('sidebar.openedEditors'),
        placeholder: options.translate('sidebar.noOpenedEditors', 'No open editors'),
        actions: [],
        content: {
          type: 'tree' as const,
          data: options.project.openedEditors.data.value,
          selectedKeys: options.project.openedEditors.selectedKeys.value,
          role: 'listbox' as const,
          selectionMode: 'single' as const,
          activationMode: 'none' as const,
          onSelectionChange: options.project.openedEditors.onSelectionChange,
          onAction: options.project.openedEditors.onAction,
          onAuxclick: options.project.openedEditors.onAuxclick,
        },
      },
      {
        key: PROJECT_MANAGEMENT_LIST_KEY,
        title: options.translate('sidebar.projectManagement'),
        placeholder: '',
        actions: [],
        content: {
          type: 'tree' as const,
          data: options.project.management.data.value,
          selectedKeys: options.project.management.selectedKeys.value,
          expandedKeys: options.project.management.expandedKeys.value,
          role: 'tree' as const,
          selectionMode: 'single' as const,
          activationMode: 'none' as const,
          onSelectionChange: options.project.management.onSelectionChange,
          onExpansionChange: options.project.management.onExpansionChange,
          onRenameCommit: options.project.management.onRenameCommit,
          onMove: options.project.management.onMove,
          onExternalDrop: options.project.management.onExternalDrop,
          externalDrop: options.project.open.value,
          onAction: options.project.management.onAction,
          captureInstance: options.project.management.captureInstance,
        },
      },
      {
        key: PROJECT_FILES_LIST_KEY,
        title: options.project.folderName.value || options.translate('sidebar.files'),
        placeholder: options.project.path.value
          ? options.translate('sidebar.emptyProject', 'Folder is empty')
          : options.translate('sidebar.openProject', 'Open Project Folder'),
        actions: [
          {
            key: PROJECT_REVEAL_ACTION_KEY,
            icon: 'status.folder-open',
            hoverTip: options.translate('sidebar.fileActions.reveal'),
            disabled: !options.project.path.value,
          },
          {
            key: PROJECT_NEW_FILE_ACTION_KEY,
            icon: 'action.file-plus',
            hoverTip: options.translate('sidebar.fileActions.newFile'),
            disabled: !options.project.path.value,
            children: [{
              key: PROJECT_NEW_OPENCARD_ACTION_KEY,
              title: options.translate('sidebar.fileActions.newOpenCard'),
              icon: 'file.opencard',
            }],
          },
          {
            key: PROJECT_NEW_FOLDER_ACTION_KEY,
            icon: 'action.folder-plus',
            hoverTip: options.translate('sidebar.fileActions.newFolder'),
            disabled: !options.project.path.value,
          },
        ],
        content: {
          type: 'tree' as const,
          data: options.project.files.data.value,
          selectedKeys: options.project.files.selectedKeys.value,
          expandedKeys: options.project.files.expandedKeys.value,
          role: 'tree' as const,
          selectionMode: 'single' as const,
          activationMode: 'double-click' as const,
          onSelectionChange: options.project.files.onSelectionChange,
          onExpansionChange: options.project.files.onExpansionChange,
          onRenameCommit: options.project.files.onRenameCommit,
          onMove: options.project.files.onMove,
          onExternalDrop: options.project.files.onExternalDrop,
          externalDrop: options.project.open.value,
          onAction: options.project.files.onAction,
          onNodeActivate: options.project.files.onNodeActivate,
          captureInstance: options.project.files.captureInstance,
        },
      },
    ]
    if (options.version.ready.value) {
      projectLists.push({
        key: TIMELINE_LIST_KEY,
        title: options.translate('sidebar.timeline'),
        placeholder: options.version.timeline.placeholder.value,
        actions: [{
          key: TIMELINE_REFRESH_ACTION_KEY,
          icon: 'action.refresh',
          hoverTip: options.translate('sidebar.timelineRefresh'),
          disabled: !options.version.timeline.filePath.value || options.version.timeline.loading.value,
        }],
        content: {
          type: 'tree' as const,
          data: options.version.timeline.data.value,
          selectedKeys: [],
          role: 'tree' as const,
          selectionMode: 'none' as const,
          activationMode: 'none' as const,
          onAction: options.version.timeline.onAction,
        },
      })
    }

    return [
      {
        key: 'workspace',
        title: options.translate('sidebar.workspaceGroup', 'Workspace'),
        icon: 'status.folder-open',
        headButtons: [{ key: 'new-open-card', icon: 'action.file-plus', title: options.translate('app.menu.newOpenCard') }],
        lists: projectLists,
      },
      {
        key: 'version-control',
        title: options.translate('sidebar.versionControlGroup', 'Version Control'),
        icon: 'file.git',
        headButtons: options.version.needsInitialization.value
          ? [{
              key: 'initialize-repository',
              icon: 'file.git',
              title: options.translate('sidebar.initializeRepository', 'Initialize repository'),
              disabled: options.version.initializing.value,
            }]
          : options.version.ready.value
            ? [{
                key: 'publish-version',
                icon: 'action.publish',
                title: options.translate('sidebar.commitVersion', 'Commit version'),
                hoverTip: options.translate('sidebar.commitSelectedCount', { count: options.version.selectedChangeCount.value }),
                badge: options.version.selectedChangeCount.value,
                disabled: options.version.selectedChangeCount.value === 0 || options.version.committing.value,
              }]
            : [],
        lists: options.version.ready.value
          ? [
              {
                key: 'changes',
                title: options.translate('sidebar.changes', 'Changes'),
                placeholder: options.translate('sidebar.changesEmpty', 'Uncommitted project files appear here'),
                actions: [],
                content: {
                  type: 'tree' as const,
                  data: options.version.changes.data.value,
                  selectedKeys: [],
                  expandedKeys: options.version.changes.expandedKeys.value,
                  role: 'tree' as const,
                  selectionMode: 'none' as const,
                  activationMode: 'single-click' as const,
                  actionVisibility: 'always' as const,
                  onExpansionChange: options.version.changes.onExpansionChange,
                  onExpansionSync: options.version.changes.onExpansionSync,
                  onNodeActivate: options.version.changes.onNodeActivate,
                  onAction: options.version.changes.onAction,
                },
              },
              {
                key: 'version-graph',
                title: options.translate('sidebar.versionGraph', 'Version graph'),
                placeholder: options.translate('sidebar.versionGraphEmpty', 'Project commits appear here'),
                actions: [],
                content: {
                  type: 'tree' as const,
                  data: options.version.graph.data.value,
                  selectedKeys: [],
                  expandedKeys: options.version.graph.expandedKeys.value,
                  role: 'tree' as const,
                  selectionMode: 'none' as const,
                  activationMode: 'none' as const,
                  onExpansionChange: options.version.graph.onExpansionChange,
                  onExpansionSync: options.version.graph.onExpansionSync,
                },
              },
            ]
          : [],
      },
    ]
  })
}
