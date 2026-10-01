import { shallowReadonly, shallowRef } from 'vue'
import type { OcActionMenuEntry } from '../shared/ui/action/action.types'

export type FloatingMenuItem = OcActionMenuEntry

export type FloatingMenuPlacement = 'bottom-start' | 'bottom-end'

interface FloatingMenuState {
  isOpen: boolean
  items: readonly FloatingMenuItem[]
  anchor: HTMLElement | DOMRect | null
  placement: FloatingMenuPlacement
  focusOnOpen: boolean
}

export interface OpenFloatingMenuOptions {
  anchor: HTMLElement | DOMRect
  items: readonly FloatingMenuItem[]
  placement?: FloatingMenuPlacement
  onSelect?: (key: string) => void
  focusOnOpen?: boolean
  returnFocusTo?: HTMLElement | null
}

export interface OpenContextMenuOptions {
  event?: MouseEvent
  anchor?: HTMLElement | DOMRect
  items: readonly FloatingMenuItem[]
  onSelect?: (key: string) => void
}

const state = shallowRef<FloatingMenuState>({
  isOpen: false,
  items: [],
  anchor: null,
  placement: 'bottom-end',
  focusOnOpen: false,
})

const publicState = shallowReadonly(state)

let selectHandler: ((key: string) => void) | null = null
let returnFocusTarget: HTMLElement | null = null

function openMenu(options: OpenFloatingMenuOptions): void {
  state.value = {
    isOpen: true,
    items: options.items,
    anchor: options.anchor,
    placement: options.placement ?? 'bottom-end',
    focusOnOpen: options.focusOnOpen ?? false,
  }
  selectHandler = options.onSelect ?? null
  returnFocusTarget = options.returnFocusTo ?? null
}

function openContextMenu(options: OpenContextMenuOptions): boolean {
  if (options.items.length === 0) return false
  const event = options.event
  const anchor = options.anchor ?? (event
    ? new DOMRect(event.clientX, event.clientY, 0, 0)
    : null)
  if (!anchor) return false
  event?.preventDefault()
  openMenu({
    anchor,
    items: options.items,
    placement: 'bottom-start',
    onSelect: options.onSelect,
    focusOnOpen: true,
    returnFocusTo: event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : options.anchor instanceof HTMLElement ? options.anchor : null,
  })
  return true
}

/** Opens the context menu from the keyboard gesture the tree and grid rows share. */
function openKeyboardContextMenu(
  event: KeyboardEvent,
  items: readonly FloatingMenuItem[],
  onSelect?: (key: string) => void,
): void {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
  if (!(event.currentTarget instanceof HTMLElement)) return
  event.preventDefault()
  openContextMenu({ anchor: event.currentTarget, items, onSelect })
}

function closeMenu(): void {
  const focusTarget = returnFocusTarget
  state.value = {
    ...state.value,
    isOpen: false,
    items: [],
    anchor: null,
  }
  selectHandler = null
  returnFocusTarget = null
  focusTarget?.focus()
}

function selectMenuItem(key: string): void {
  const handler = selectHandler
  closeMenu()
  handler?.(key)
}

export function useFloatingMenu() {
  return {
    state: publicState,
    openMenu,
    openContextMenu,
    openKeyboardContextMenu,
    closeMenu,
    selectMenuItem,
  }
}
