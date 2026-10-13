import { computed, type ComputedRef, type Ref } from 'vue'
import type { OcNodeActionEvent, OcNodeActivateEvent, OcNodeCollection, OcNodeExpansionEvent, OcNodeExpansionSyncEvent } from '../../../shared/ui/node/node.types'
import type { ShellListGroup } from '../shell.types'

type Translate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string

export interface CollaborationSectionOptions {
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

export function createCollaborationSection(options: CollaborationSectionOptions): ComputedRef<ShellListGroup[]> {
  return computed(() => {
    if (!options.projectOpen.value) {
      return [{
        key: 'version-control',
        title: options.translate('sidebar.versionControlGroup', 'Version Control'),
        icon: 'nav.collaboration',
        onAction: options.onAction,
        headButtons: [{
          key: 'open-project',
          icon: 'status.folder-open',
          title: options.translate('sidebar.openProject', 'Open Project Folder'),
        }],
        lists: [{
          key: 'collaboration-empty',
          title: options.translate('sidebar.versionControlGroup', 'Version Control'),
          placeholder: options.translate('sidebar.collaborationEmpty', 'Open a project to see changes and version history'),
          actions: [],
          content: {
            type: 'empty' as const,
            text: options.translate('sidebar.collaborationEmpty', 'Open a project to see changes and version history'),
          },
        }],
      }]
    }
    return [
      {
        key: 'version-control',
        title: options.translate('sidebar.versionControlGroup', 'Version Control'),
        icon: 'nav.collaboration',
        onAction: options.onAction,
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
      }
    ]
  })
}
