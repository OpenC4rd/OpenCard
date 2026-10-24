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
  const control = computed(() => getControl())
  /** 单行输入的光标事实上固定在一行，锚控件就够；多行才需要跟随光标所在行。 */
  const anchor = computed<HTMLElement | (() => DOMRect | null) | null>(() => {
    const element = control.value
    if (!element) return null
    return element instanceof HTMLTextAreaElement ? () => caretRectOf(element) : element
  })

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
    control, anchor, refresh, clear, invalidate, handleKeydown }
}

/**
 * 浏览器不提供 input/textarea 的光标矩形，只能复刻排版量一次。
 * 只在 textarea 路径调用：镜像复刻字体与内距，量到 selectionStart 的偏移。
 */
function caretRectOf(control: HTMLTextAreaElement): DOMRect {
  const style = getComputedStyle(control)
  const mirror = document.createElement('div')
  mirror.style.cssText = [
    'position:fixed', 'left:0', 'top:0', 'visibility:hidden', 'pointer-events:none',
    'box-sizing:border-box', `width:${control.clientWidth}px`,
    `padding:${style.padding}`, `font:${style.font}`,
    `line-height:${style.lineHeight}`, `letter-spacing:${style.letterSpacing}`,
    'white-space:pre-wrap', 'overflow-wrap:break-word',
  ].join(';')
  mirror.textContent = control.value.slice(0, control.selectionStart ?? 0)
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.append(marker)
  document.body.append(mirror)
  const origin = mirror.getBoundingClientRect()
  const caret = marker.getBoundingClientRect()
  mirror.remove()
  const box = control.getBoundingClientRect()
  return new DOMRect(
    box.left + caret.left - origin.left - control.scrollLeft,
    box.top + caret.top - origin.top - control.scrollTop,
    0,
    caret.height || Number.parseFloat(style.lineHeight) || box.height,
  )
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
