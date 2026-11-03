import { computed, onBeforeUnmount, ref } from 'vue'
import type { PropertyCompletionItem, PropertyCompletionResult } from '../propertyEditor.types'
import { useCompletionList } from '../../useCompletionList'
import { useOverlayDismiss } from '../../useOverlayDismiss'

/** 由 provider 异步给出候选的补全：在通用补全列表上加替换区间、父级项与 Tab / Enter 接受。 */
export function usePropertyCompletion(getControl: () => HTMLElement | null) {
  const completionState = ref<PropertyCompletionResult | null>(null)
  const isPending = ref(false)
  let requestId = 0
  const list = useCompletionList(() => {
    const result = completionState.value
    return result ? [...result.items, ...(result.parent ? [result.parent] : [])] : []
  }, getControl)
  /** 单行输入的光标事实上固定在一行，锚控件就够；多行才需要跟随光标所在行。 */
  const anchor = computed<HTMLElement | (() => DOMRect | null) | null>(() => {
    const element = list.control.value
    if (!element) return null
    return element instanceof HTMLTextAreaElement ? () => caretRectOf(element) : element
  })

  function clear(): void {
    requestId += 1
    isPending.value = false
    completionState.value = null
    list.close()
  }

  // 列表关着、请求还在路上时点外面：作废这次请求，免得结果回来又把列表打开。
  useOverlayDismiss(() => isPending.value, getControl, clear)

  async function refresh(load: () => PropertyCompletionResult | null | Promise<PropertyCompletionResult | null>, canOpen = () => true): Promise<boolean> {
    const currentRequest = ++requestId
    isPending.value = true
    try {
      const result = await load()
      if (currentRequest !== requestId) return false
      completionState.value = result
      if (document.activeElement === getControl() && canOpen()) list.show()
      else list.close()
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
    if (event.key === 'Escape' && (list.open.value || isPending.value)) {
      event.preventDefault()
      event.stopPropagation()
      clear()
      return true
    }
    if (list.handleKeydown(event)) return true
    if (!list.open.value || list.items.value.length === 0) return false
    if (event.key === 'Tab' && event.shiftKey) {
      const parent = completionState.value?.parent
      if (parent) { event.preventDefault(); accept(parent) }
      return true
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      const item = list.activeItem.value
      if (item) accept(item)
      return true
    }
    return false
  }

  onBeforeUnmount(clear)
  return { list, completionState, isPending, anchor, refresh, clear, handleKeydown }
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
