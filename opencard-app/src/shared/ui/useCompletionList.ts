import { computed, ref, useId, watch } from 'vue'
import { useOverlayDismiss } from './useOverlayDismiss'

export type CompletionList<T extends { key: string }> = ReturnType<typeof useCompletionList<T>>

/** 选项的 DOM id：列表渲染与输入框的 aria-activedescendant 必须是同一个拼法。 */
export function completionOptionId(listId: string, key: string): string {
  return `${listId}-option-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

/** 补全列表的开关、当前项与方向键导航；候选由调用方给，渲染交给 OcCompletionPopup。 */
export function useCompletionList<T extends { key: string }>(
  getItems: () => readonly T[],
  getControl: () => HTMLElement | null,
) {
  const id = useId()
  const items = computed(getItems)
  const control = computed(getControl)
  const open = ref(false)
  const activeKey = ref<string | null>(null)
  const activeItem = computed(() => items.value.find(item => item.key === activeKey.value) ?? null)
  const activeDescendantId = computed(() => open.value && activeKey.value
    ? completionOptionId(id, activeKey.value)
    : undefined)

  // 候选变了而当前项不在其中：回到第一项。
  watch(items, list => {
    if (!list.some(item => item.key === activeKey.value)) activeKey.value = list[0]?.key ?? null
  }, { immediate: true })

  /** 从第一项重新开始；没有候选就保持关闭。 */
  function show(): void {
    activeKey.value = items.value[0]?.key ?? null
    open.value = items.value.length > 0
  }

  function close(): void {
    open.value = false
  }

  /** 开着时方向键移动当前项、Esc 收起且不让外层再处理；返回是否消费了这个键。 */
  function handleKeydown(event: KeyboardEvent): boolean {
    if (!open.value || event.isComposing || event.keyCode === 229) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return true
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false
    event.preventDefault()
    const list = items.value
    const index = Math.max(0, list.findIndex(item => item.key === activeKey.value))
    const offset = event.key === 'ArrowDown' ? 1 : -1
    activeKey.value = list[(index + offset + list.length) % list.length]?.key ?? null
    return true
  }

  useOverlayDismiss(() => open.value, getControl, close)

  return { id, items, control, open, activeKey, activeItem, activeDescendantId, show, close, handleKeydown }
}
