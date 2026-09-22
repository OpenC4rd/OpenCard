/** Key-only UI contract for node collections consumed by OcTree and OcAlbum. */
import type { IconToken, IconTone } from '../icon/iconRegistry'
import type { OcVisual } from '../visual/visual.types'
import type { OcActionButtonAction } from '../../../components/standard/OcActionButton.vue'
import type { OcActionDivider } from '../../../components/standard/OcActionMenu.vue'

export type OcNodeKey = string

/** Locale-independent tone applied to the node label. */
export type OcNodeTone = 'default' | 'muted' | 'subtle' | 'accent' | 'success' | 'warning' | 'danger'

export type OcNodeDropPosition = 'before' | 'inside' | 'after'

export interface OcNodeRenameSelection {
  start: number
  end: number
}

/** Read-only status chip shown in the node tail. */
export interface OcNodeBadge {
  type: 'badge'
  icon: IconToken
  tone?: IconTone
  label: string
}

/** Inline action definition; its `key` is reported back through the node action event. */
export type OcNodeAction = OcActionButtonAction

/**
 * One ordered trailing line per node: secondary text, read-only status chips, and commands.
 * Commands are the parts that carry a `key`; views render them as buttons in the same order,
 * revealed on interaction.
 */
export type OcNodeTailPart = string | OcNodeBadge | OcNodeAction

/** The display-only subset of a tail, for views whose commands live elsewhere. */
export type OcNodeTailDisplayPart = string | OcNodeBadge

export type OcNodeContextEntry = OcNodeAction | OcActionDivider

/** Presentation of one node; its identity is the key it is stored under in `OcNodeCollection.items`. */
export interface OcNode {
  label: string
  /** 标签使用的 CSS `font-family` 值。只决定标签用哪套字面绘制，不影响色调、省略与节点几何；省略时沿用界面字体。 */
  labelFont?: string
  /** 标签之前的视觉；所有节点视图都以同样的方式渲染它。 */
  visual?: OcVisual
  /** 相册这类卡片视图独有的封面视觉，绘制在卡片的媒体区域；其余视图忽略它。 */
  cover?: OcVisual
  tone?: OcNodeTone
  /** Trailing line of the node, in order; text and badges are always visible, commands appear on interaction. */
  tail?: OcNodeTailPart | readonly OcNodeTailPart[]
  disabled?: boolean
  disabledReason?: string
  renamable?: boolean
  renameSelection?: OcNodeRenameSelection
  draggable?: boolean
  /** Context-menu entries offered by this node. */
  contextActions?: readonly OcNodeContextEntry[]
}

export interface OcNodeCollection {
  rootKeys: readonly OcNodeKey[]
  items: ReadonlyMap<OcNodeKey, OcNode>
  children: ReadonlyMap<OcNodeKey, readonly OcNodeKey[]>
}

export interface OcNodeSelectionEvent {
  triggerKey: OcNodeKey
  selectedKeys: OcNodeKey[]
}

export interface OcNodeExpansionEvent {
  key: OcNodeKey
  expanded: boolean
}

export interface OcNodeExpansionSyncEvent {
  expandedKeys: OcNodeKey[]
}

export interface OcNodeActivateEvent {
  key: OcNodeKey
}

export interface OcNodeActionEvent {
  key: OcNodeKey
  actionKey: string
  source: 'inline' | 'context'
}

export interface OcNodeRenameCommitEvent {
  key: OcNodeKey
  name: string
}

export interface OcNodeMoveEvent {
  key: OcNodeKey
  targetKey: OcNodeKey | null
  position: OcNodeDropPosition
}

/**
 * An external drop (files dragged in from outside the application) that landed on the tree.
 * `targetKey === null` means the empty area of the tree, and `payload` is opaque: the view reports
 * what the platform handed it and never inspects or interprets it.
 */
export interface OcNodeExternalDropEvent {
  targetKey: OcNodeKey | null
  position: OcNodeDropPosition
  payload: readonly string[]
}

export function normalizeNodeTail(
  tail: OcNode['tail'],
): readonly OcNodeTailPart[] {
  if (!tail) return []
  return Array.isArray(tail) ? tail : [tail]
}

/** A tail part is a command when it carries a badge-free `key`; badges are the only other object part. */
export function isNodeTailAction(part: OcNodeTailPart): part is OcNodeAction {
  return typeof part !== 'string' && part.type !== 'badge'
}
