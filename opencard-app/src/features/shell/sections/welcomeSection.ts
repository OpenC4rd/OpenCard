import { computed, type ComputedRef, type Ref } from 'vue'
import type { OcNodeActionEvent, OcNodeActivateEvent, OcNodeCollection, OcNodeSelectionEvent } from '../../../shared/ui/node/node.types'
import type { ShellListGroup } from '../shell.types'
import { RECENT_PROJECTS_LIST_KEY } from '../shellSidebarConfig'

type Translate = (key: string) => string

export interface WelcomeSectionOptions {
  translate: Translate
  recentProjectTreeData: Readonly<Ref<OcNodeCollection>>
  selectedRecentProjectKeys: Readonly<Ref<string[]>>
  onSelectionChange: (event: OcNodeSelectionEvent) => void
  onNodeActivate: (event: OcNodeActivateEvent) => void
  onAction: (event: OcNodeActionEvent) => void
}

export function createWelcomeSection(options: WelcomeSectionOptions): ComputedRef<ShellListGroup[]> {
  return computed(() => [{
    key: 'primary',
    transitionKey: 'space:welcome:none',
    title: '',
    headButtons: [
      { key: 'new-project', icon: 'action.folder-plus', title: options.translate('app.menu.newProject') },
      { key: 'open-project', icon: 'status.folder-open', title: options.translate('sidebar.openProject') },
    ],
    lists: [{
      key: RECENT_PROJECTS_LIST_KEY,
      title: options.translate('sidebar.recentProjects'),
      placeholder: options.translate('sidebar.noRecentProjects'),
      actions: [],
      content: {
        type: 'tree' as const,
        data: options.recentProjectTreeData.value,
        selectedKeys: options.selectedRecentProjectKeys.value,
        role: 'listbox' as const,
        selectionMode: 'single' as const,
        activationMode: 'double-click' as const,
        onSelectionChange: options.onSelectionChange,
        onNodeActivate: options.onNodeActivate,
        onAction: options.onAction,
      },
    }],
  }])
}
