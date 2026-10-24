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
}

export interface OcActionDivider {
  type: 'divider'
  key: string
}

export type OcActionMenuEntry = OcActionDefinition | OcActionDivider

export function actionChildren(action: OcActionDefinition): readonly OcActionMenuEntry[] {
  return typeof action.children === 'function' ? action.children() : action.children ?? []
}

export function hasActionChildren(action: OcActionDefinition): boolean {
  return typeof action.children === 'function' || Boolean(action.children?.length)
}

export interface OcActionSelectPayload {
  key: string
}
