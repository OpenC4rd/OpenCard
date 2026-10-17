import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { PropertyCompletionItem, PropertyCompletionResult } from '../propertyEditor.types'
import { useOverlayDismiss } from '../../useOverlayDismiss'

export function usePropertyCompletion(getControl: () => HTMLElement | null) {
  const completionState = ref<PropertyCompletionResult | null>(null)
  const isMenuOpen = ref(false)
  const isPending = ref(false)
  const activeKey = ref<string | null>(null)
  const autocompleteId = useId()
  let requestId = 0
  const suggestions = computed(() => {
    const result = completionState.value
    return result ? [...result.items, ...(result.parent ? [result.parent] : [])] : []
  })
  const activeDescendantId = computed(() => isMenuOpen.value && activeKey.value
    ? `${autocompleteId}-option-${activeKey.value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    : undefined)

  watch(suggestions, items => {
    if (!items.some(item => item.key === activeKey.value)) activeKey.value = items[0]?.key ?? null
  })

  function invalidate(): void { requestId += 1; isPending.value = false }
  function clear(): void {
    invalidate()
    completionState.value = null
    activeKey.value = null
    isMenuOpen.value = false
  }

  useOverlayDismiss(() => isMenuOpen.value || isPending.value, getControl, clear)

  async function refresh(load: () => PropertyCompletionResult | null | Promise<PropertyCompletionResult | null>, canOpen = () => true): Promise<boolean> {
    const currentRequest = ++requestId
    isPending.value = true
    try {
      const result = await load()
      if (currentRequest !== requestId) return false
      completionState.value = result
      activeKey.value = suggestions.value[0]?.key ?? null
      isMenuOpen.value = document.activeElement === getControl() && canOpen() && suggestions.value.length > 0
      return true
    } catch (error) {
      if (currentRequest !== requestId) return false
      throw error
    } finally {
      if (currentRequest === requestId) isPending.value = false
    }
  }

  function handleKeydown(event: KeyboardEvent, accept: (item: PropertyCompletionItem) => void): boolean {
    if (event.isComposing || event.keyCode === 229) return false
    if (event.key === 'Escape' && (isMenuOpen.value || isPending.value)) {
      event.preventDefault()
      event.stopPropagation()
      clear()
      return true
    }
    if (!isMenuOpen.value || suggestions.value.length === 0) return false
    if (event.key === 'Tab' && event.shiftKey) {
      const parent = completionState.value?.parent
      if (parent) { event.preventDefault(); accept(parent) }
      return true
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const index = Math.max(0, suggestions.value.findIndex(item => item.key === activeKey.value))
      const offset = event.key === 'ArrowDown' ? 1 : -1
      activeKey.value = suggestions.value[(index + offset + suggestions.value.length) % suggestions.value.length]?.key ?? null
      return true
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      const item = suggestions.value.find(item => item.key === activeKey.value)
      if (item) accept(item)
      return true
    }
    return false
  }

  onBeforeUnmount(clear)
  return { completionState, suggestions, isMenuOpen, isPending, activeKey, autocompleteId, activeDescendantId,
    refresh, clear, invalidate, handleKeydown }
}

export function matchStaticCompletion(current: string, values: readonly string[]): string {
  if (!current) return ''
  const trailingMatch = current.match(/([a-z%]+)$/i)
  const fragment = trailingMatch?.[1] ?? current
  const prefix = trailingMatch ? current.slice(0, -fragment.length) : ''
  const match = [...values]
    .filter(value => value.length > fragment.length && value.toLowerCase().startsWith(fragment.toLowerCase()))
    .sort((left, right) => left.length - right.length || left.localeCompare(right, undefined, { sensitivity: 'base' }))[0]
  return match ? `${prefix}${match}` : ''
}
