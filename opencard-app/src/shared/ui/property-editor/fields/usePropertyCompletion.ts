import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { PropertyCompletionItem, PropertyCompletionResult } from '../propertyEditor.types'

export function usePropertyCompletion() {
  const completionState = ref<PropertyCompletionResult | null>(null)
  const isMenuOpen = ref(false)
  const activeKey = ref<string | null>(null)
  const autocompleteId = useId()
  let requestId = 0
  let blurTimer: ReturnType<typeof setTimeout> | undefined
  const suggestions = computed(() => {
    const result = completionState.value
    return result ? [...result.items, ...(result.parent ? [result.parent] : [])] : []
  })
  const activeDescendantId = computed(() => activeKey.value
    ? `${autocompleteId}-option-${activeKey.value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    : undefined)

  watch(suggestions, items => {
    if (!items.some(item => item.key === activeKey.value)) activeKey.value = items[0]?.key ?? null
  })

  function invalidate(): void { requestId += 1 }
  function cancelBlur(): void { clearTimeout(blurTimer) }
  function clear(): void {
    cancelBlur()
    invalidate()
    completionState.value = null
    activeKey.value = null
    isMenuOpen.value = false
  }

  function closeAfterBlur(clearResult = true): void {
    invalidate()
    cancelBlur()
    blurTimer = setTimeout(() => {
      if (clearResult) clear()
      else isMenuOpen.value = false
    }, 0)
  }

  async function refresh(load: () => PropertyCompletionResult | null | Promise<PropertyCompletionResult | null>, canOpen = () => true): Promise<boolean> {
    cancelBlur()
    const currentRequest = ++requestId
    try {
      const result = await load()
      if (currentRequest !== requestId) return false
      completionState.value = result
      activeKey.value = suggestions.value[0]?.key ?? null
      isMenuOpen.value = canOpen() && suggestions.value.length > 0
      return true
    } catch (error) {
      if (currentRequest !== requestId) return false
      throw error
    }
  }

  function handleKeydown(event: KeyboardEvent, accept: (item: PropertyCompletionItem) => void): boolean {
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
    if (event.key === 'Escape') {
      event.preventDefault()
      invalidate()
      isMenuOpen.value = false
      return true
    }
    return false
  }

  onBeforeUnmount(clear)
  return { completionState, suggestions, isMenuOpen, activeKey, autocompleteId, activeDescendantId,
    refresh, clear, invalidate, closeAfterBlur, handleKeydown }
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
