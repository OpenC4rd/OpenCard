import type { IconToken, IconTone } from '../icon/iconRegistry'

export type ActionButtonSize = 'sm' | 'md' | 'lg'
export type ActionButtonVariant = 'solid' | 'soft' | 'ghost' | 'outline'

export type OcShortcutPart = string | { icon: IconToken } | { separator: string }

export interface OcActionDefinition {
  type?: 'action'
  key: string
  icon?: IconToken
  iconTone?: IconTone
  thumbnailStyle?: Readonly<Record<string, string>>
  thumbnailLabel?: string
  title?: string
  badge?: number
  badgeLabel?: string
  shortcut?: readonly OcShortcutPart[]
  disabled?: boolean
  disabledReason?: string
  children?: readonly OcActionMenuEntry[] | (() => readonly OcActionMenuEntry[])
  /** 操作条空间不足时也不收进「更多」。 */
  alwaysVisible?: boolean
  /** 切换型操作的当前状态：给了就按切换按钮呈现（按下态与 aria-pressed）。 */
  active?: boolean
}

export interface OcActionDivider {
  type: 'divider'
  key: string
}

export type OcActionMenuEntry = OcActionDefinition | OcActionDivider

/** 操作条的一项：操作、分隔线，或一段只读文字（如缩放比例）。 */
export type OcActionBarItem = OcActionMenuEntry | string

export function actionChildren(action: OcActionDefinition): readonly OcActionMenuEntry[] {
  return typeof action.children === 'function' ? action.children() : action.children ?? []
}

export function hasActionChildren(action: OcActionDefinition): boolean {
  return typeof action.children === 'function' || Boolean(action.children?.length)
}

export interface OcActionSelectPayload {
  key: string
  /** 菜单栏里选中项所属的顶层菜单：折叠进「更多」后也能路由回原来的组。 */
  rootKey?: string
}
