import { computed, type ComputedRef, type Ref } from 'vue'
import type { OcNodeActionEvent, OcNodeActivateEvent, OcNodeCollection, OcNodeExpansionEvent, OcNodeExpansionSyncEvent } from '../../../shared/ui/node/node.types'
import type { ShellListGroup } from '../shell.types'

type Translate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string

interface CollaborationSectionOptions {
  translate: Translate
  projectOpen: Readonly<Ref<boolean>>
  onAction: (key: string) => void | Promise<void>
  version: {
    ready: Readonly<Ref<boolean>>
    needsInitialization: Readonly<Ref<boolean>>
    initializing: Readonly<Ref<boolean>>
    committing: Readonly<Ref<boolean>>
    selectedChangeCount: Readonly<Ref<number>>
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

/** 未打开项目时的协作侧栏空状态：走空树，与其它侧栏列表共用同一套空状态渲染。 */
const EMPTY_TREE_DATA: OcNodeCollection = { rootKeys: [], items: new Map(), children: new Map() }

export function createCollaborationSection(options: CollaborationSectionOptions): ComputedRef<ShellListGroup[]> {
  return computed(() => {
    if (!options.projectOpen.value) {
      return [{
        key: 'version-control',
        title: options.translate('versionControl.title', 'Version Control'),
        icon: 'mdiAccountGroup',
        onAction: options.onAction,
        headButtons: [{
          key: 'open-project',
          icon: 'mdiFolderOpenOutline',
          title: options.translate('sidebar.openProject', 'Open Project Folder'),
        }],
        lists: [{
          key: 'collaboration-empty',
          title: options.translate('versionControl.title', 'Version Control'),
          placeholder: options.translate('versionControl.empty', 'Open a project to see changes and version history'),
          actions: [],
          content: {
            type: 'tree' as const,
            data: EMPTY_TREE_DATA,
            role: 'tree' as const,
            selectionMode: 'none' as const,
            activationMode: 'none' as const,
          },
        }],
      }]
    }
    return [
      {
        key: 'version-control',
        title: options.translate('versionControl.title', 'Version Control'),
        icon: 'mdiAccountGroup',
        onAction: options.onAction,
        headButtons: options.version.needsInitialization.value
          ? [{
              key: 'initialize-repository',
              tutorialKey: 'collaboration.initialize',
              icon: 'mdiSourceBranch',
              title: options.translate('versionControl.initializeRepository', 'Initialize repository'),
              disabled: options.version.initializing.value,
            }]
          : options.version.ready.value
            ? [{
                key: 'publish-version',
                tutorialKey: 'collaboration.commit',
                icon: 'mdiRocketLaunchOutline',
                title: options.translate('versionControl.commitVersion', 'Commit version'),
                hoverTip: options.translate('versionControl.commitSelectedCount', { count: options.version.selectedChangeCount.value }),
                badge: options.version.selectedChangeCount.value,
                disabled: options.version.selectedChangeCount.value === 0 || options.version.committing.value,
              }]
            : [],
        lists: options.version.ready.value
          ? [
              {
                key: 'changes',
                tutorialKey: 'collaboration.changes',
                title: options.translate('versionControl.changes', 'Changes'),
                placeholder: options.translate('versionControl.changesEmpty', 'Uncommitted project files appear here'),
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
                tutorialKey: 'collaboration.graph',
                title: options.translate('versionControl.versionGraph', 'Version graph'),
                placeholder: options.translate('versionControl.versionGraphEmpty', 'Project commits appear here'),
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
      }
    ]
  })
}
