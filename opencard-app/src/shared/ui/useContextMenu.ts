import { nextTick, onBeforeUnmount, ref, shallowReactive } from 'vue'
import type { OcActionMenuEntry } from './action/action.types'
import { useOverlayDismiss } from './useOverlayDismiss'

export type ContextMenu = ReturnType<typeof useContextMenu>

function isMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** 宿主组件的右键 / 键盘菜单；由 OcContextMenu 渲染。 */
export function useContextMenu() {
  const markerRef = ref<{ open: () => void; close: () => void } | null>(null)
  // shallow：锚点与归属是 DOM 节点，不能被深层代理。
  const view = shallowReactive({
    open: false,
    items: [] as readonly OcActionMenuEntry[],
    anchor: null as HTMLElement | DOMRect | null,
    owner: null as HTMLElement | null,
  })
  let handler: ((key: string) => void) | null = null

  const close = (): void => { markerRef.value?.close() }

  /** Esc：菜单开着时收掉它并阻止上层弹窗把同一个 Esc 当成自己的关闭；没开就保持原义。 */
  function dismissOnEscape(event: KeyboardEvent): void {
    if (!view.open) return
    event.preventDefault()
    close()
  }

  /**
   * 触发元素的 contextmenu 与 keydown 都接到这里：右键在指针处、菜单键在元素上打开，
   * Esc 收起已开的菜单。菜单项惰性求值，没有菜单项就不拦截事件。
   */
  function trigger(
    event: MouseEvent | KeyboardEvent,
    resolveItems: () => readonly OcActionMenuEntry[],
    onSelect: (key: string) => void,
  ): void {
    if (event instanceof KeyboardEvent) {
      if (event.key === 'Escape') return dismissOnEscape(event)
      if (!isMenuKey(event)) return
    }
    const owner = event.currentTarget
    if (!(owner instanceof HTMLElement)) return
    const items = resolveItems()
    if (items.length === 0) return
    event.preventDefault()
    view.items = items
    view.anchor = event instanceof MouseEvent ? new DOMRect(event.clientX, event.clientY, 0, 0) : owner
    view.owner = owner
    handler = onSelect
    // marker 的 open() 读的是已提交的 props：等这帧把新锚点与归属落到 marker 上再开，
    // 否则换触发元素时会沿用上一次的 anchor / owner。
    void nextTick(() => markerRef.value?.open())
  }

  /** 选中一项先收起菜单再执行：动作自己带闭包，不依赖菜单还开着。 */
  function select(key: string): void {
    const selected = handler
    close()
    selected?.(key)
  }

  /** marker / 菜单关闭的回调：收起状态并丢掉这次的动作闭包。 */
  function handleClose(): void {
    view.open = false
    handler = null
  }

  useOverlayDismiss(() => view.open, () => view.owner, close)

  // 宿主被卸载时它打开的菜单不能留在组里变成空面板。
  onBeforeUnmount(close)

  return {
    trigger,
    dismissOnEscape,
    /** 只给 OcContextMenu 绑定用，宿主不碰。 */
    binding: { markerRef, view, select, handleClose },
  }
}
