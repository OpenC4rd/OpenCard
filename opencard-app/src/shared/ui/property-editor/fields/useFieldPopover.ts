import { onBeforeUnmount, ref, useId, watch } from 'vue'
import { useOverlayDismiss } from '../../useOverlayDismiss'
import type { OcNode, OcNodeCollection, OcNodeKey } from '../../node/node.types'
import type { IconToken } from '../../icon/iconRegistry'

interface UseFieldPopoverOptions {
  isReadonly?: () => boolean | undefined
  onOpen?: () => void
}

export function useFieldPopover(prefix: string, options: UseFieldPopoverOptions = {}) {
  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const layer = ref<{ close: () => void } | null>(null)
  const pickerId = `${prefix}-${useId().replace(/:/g, '')}`
  const open = ref(false)

  function openPopover(): void {
    if (options.isReadonly?.()) return
    options.onOpen?.()
    open.value = true
  }

  function togglePopover(): void {
    if (options.isReadonly?.()) return
    if (open.value) closePopover(false)
    else openPopover()
  }

  function closePopover(restoreFocus = false): void {
    open.value = false
    if (restoreFocus) triggerRef.value?.focus()
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (options.isReadonly?.()) return
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPopover()
    } else if (event.key === 'Escape' && open.value) {
      event.preventDefault()
      event.stopPropagation()
      closePopover(true)
    }
  }

  useOverlayDismiss(() => open.value, () => rootRef.value, () => closePopover(false))

  if (options.isReadonly) {
    watch(options.isReadonly, readonly => {
      if (readonly) closePopover(false)
    })
  }

  onBeforeUnmount(() => layer.value?.close())

  return {
    rootRef,
    triggerRef,
    layer,
    pickerId,
    open,
    openPopover,
    togglePopover,
    closePopover,
    handleTriggerKeydown,
  }
}

export function buildGroupedScopeTree<TGroup, TEntry>(
  scopes: readonly { key: string; label: string; packageKey?: string | null; groups: readonly TGroup[] }[],
  entriesOf: (group: TGroup) => readonly TEntry[],
  groupInfo: (group: TGroup) => { key: string; name: string; icon?: IconToken },
  entryInfo: (entry: TEntry, group: TGroup) => {
    key: string
    label: string
    searchText: string
    node: Omit<OcNode, 'label'>
  },
  query: string,
  prefixes: { scope: string; group: string; entry: string },
): OcNodeCollection {
  const items = new Map<OcNodeKey, OcNode>()
  const children = new Map<OcNodeKey, readonly OcNodeKey[]>()
  const rootKeys: OcNodeKey[] = []
  const q = query.trim().toLocaleLowerCase()

  for (const scope of scopes) {
    const sKey = `${prefixes.scope}::${scope.key}`
    const groupKeys: OcNodeKey[] = []
    for (const group of scope.groups) {
      const g = groupInfo(group)
      const gKey = `${prefixes.group}::${scope.key}::${g.key}`
      const entryKeys: OcNodeKey[] = []
      for (const rawEntry of entriesOf(group)) {
        const item = entryInfo(rawEntry, group)
        if (q && !item.searchText.toLocaleLowerCase().includes(q)) continue
        const eKey = `${prefixes.entry}::${item.key}`
        items.set(eKey, { label: item.label, ...item.node })
        entryKeys.push(eKey)
      }
      if (entryKeys.length > 0) {
        items.set(gKey, { label: g.name, visual: { type: 'icon', icon: g.icon ?? 'mdiFolder' } })
        children.set(gKey, entryKeys)
        groupKeys.push(gKey)
      }
    }
    if (groupKeys.length > 0) {
      rootKeys.push(sKey)
      items.set(sKey, {
        label: scope.label,
        visual: { type: 'icon', icon: scope.packageKey ? 'mdiPackageVariantClosed' : 'mdiFolder' },
      })
      children.set(sKey, groupKeys)
    }
  }
  return { rootKeys, items, children }
}
