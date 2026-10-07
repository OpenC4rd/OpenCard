import type { Component, Ref } from 'vue'
import type { OcNodeCollection } from '../../shared/ui/node/node.types'
import type { ShellHeaderModel, ShellListGroup, ShellMenuContribution, ShellSpaceDefinition } from './shell.types'
import type { ShellPage } from './shellLocation'

/** A page contributes data and callbacks; only its content controls the workspace DOM. */
export interface SpacePage {
  key: ShellPage
  navigation?: ShellSpaceDefinition
  content: Component
  contentProps: Readonly<Ref<Record<string, unknown>>>
  sidebar: Readonly<Ref<ShellListGroup[]>>
  sidebarLayout?: { persistenceKey: Readonly<Ref<string>>; expandOnNarrowViewport?: boolean }
  header: Readonly<Ref<ShellHeaderModel>>
  bottomPanel?: Readonly<Ref<SpacePageProblems>>
  menuContribution?: Readonly<Ref<Partial<Record<'file' | 'edit' | 'view' | 'help', ShellMenuContribution>>>>
  selectSidebarGroup?: (key: string) => void
  handleKeydown?: (event: KeyboardEvent) => Promise<void> | void
  overlays?: Component
  overlayProps?: Readonly<Ref<Record<string, unknown>>>
}

export interface SpacePageProblems {
  treeData: OcNodeCollection
  count: number
  severity: 'error' | 'warning' | 'info' | null
  expandedKeys: readonly string[]
  setExpanded: (key: string, expanded: boolean) => void
  activate: (key: string) => Promise<void> | void
  copy: (key: string) => Promise<void> | void
}

export const COPY_ISSUE_ACTION_KEY = 'copy-issue'

export const EMPTY_PAGE_PROBLEMS: SpacePageProblems = {
  treeData: { rootKeys: [], items: new Map(), children: new Map() },
  count: 0, severity: null, expandedKeys: [],
  setExpanded() {}, activate() {}, copy() {},
}
