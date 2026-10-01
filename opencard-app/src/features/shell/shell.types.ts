import type {
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeExpansionSyncEvent,
  OcNodeExternalDropEvent,
  OcNodeKey,
  OcNodeMoveEvent,
  OcNodeRenameCommitEvent,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type { OcActionMenuEntry } from '../../shared/ui/action/action.types'

export interface ShellAction {
  type?: 'action' | 'selection';
  key?: string;
  value?: string;
  options?: readonly OcActionMenuEntry[];
  hoverTip?: string;
  icon: IconToken;
  disabled?: boolean;
  badge?: number;
  badgeLabel?: string;
  children?: readonly OcActionMenuEntry[];
}

export interface ShellButton {
  icon?: IconToken;
  title: string;
  hoverTip?: string;
  key: string;
  disabled?: boolean;
  /** 紧跟标题的数字徽标（例如"这次提交会带上几条改动"）。 */
  badge?: number;
}

export type ShellWorkspaceAction = ShellAction | string

export interface ShellTreeContent {
  type: 'tree';
  data: OcNodeCollection;
  selectedKeys?: readonly OcNodeKey[];
  expandedKeys?: readonly OcNodeKey[];
  role?: 'tree' | 'listbox' | 'menu';
  selectionMode?: 'none' | 'single' | 'multiple';
  activationMode?: 'none' | 'single-click' | 'double-click';
  selectionExpansionMode?: 'none' | 'expand' | 'expand-exclusive';
  scrollToSelection?: boolean;
  virtualized?: boolean;
  actionVisibility?: 'on-interaction' | 'always';
  tabNavigation?: 'roving' | 'none';
  externalDrop?: boolean;
  onSelectionChange?: (event: OcNodeSelectionEvent) => void;
  onExpansionChange?: (event: OcNodeExpansionEvent) => void;
  onExpansionSync?: (event: OcNodeExpansionSyncEvent) => void;
  onNodeActivate?: (event: OcNodeActivateEvent) => void;
  onAction?: (event: OcNodeActionEvent) => void;
  onRenameCommit?: (event: OcNodeRenameCommitEvent) => void;
  onMove?: (event: OcNodeMoveEvent) => void;
  onExternalDrop?: (event: OcNodeExternalDropEvent) => void;
  onAuxclick?: (event: MouseEvent) => void;
  captureInstance?: (instance: unknown) => void;
}

export interface ShellEmptyContent {
  type: 'empty';
  text?: string;
}

export interface ShellNoneContent {
  type: 'none';
}

export type ShellListContent = ShellTreeContent | ShellEmptyContent | ShellNoneContent

export interface ShellList {
  title: string;
  placeholder: string;
  key: string;
  actions: ShellAction[];
  content?: ShellListContent;
}

export interface ShellListGroup {
  key: string;
  transitionKey?: string;
  title: string;
  icon?: IconToken;
  headButtons?: ShellButton[];
  lists: ShellList[];
}
export interface ShellTitleBarMenuGroup {
  key: string;
  label: string;
  badge?: number;
  badgeLabel?: string;
  actions: readonly OcActionMenuEntry[];
}

export interface ShellTitleBarAppAction {
  key: string;
  icon: IconToken;
  hoverTip?: string;
  disabled?: boolean;
}

export interface ShellProgressTask {
  key: string;
  title: string;
  progress: number;
  weight?: number;
  active?: boolean;
  detail?: string;
  cancellable?: boolean;
}

export interface ShellTitleBarWindowControl extends ShellTitleBarAppAction {
  group?: 'app' | 'window';
  danger?: boolean;
}
