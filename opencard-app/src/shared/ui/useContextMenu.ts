import { shallowReactive } from 'vue'
import type { OcActionMenuEntry } from './action/action.types'
import { useOverlayDismiss } from './useOverlayDismiss'

export type ContextMenu = ReturnType<typeof useContextMenu>

function isMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** 宿主组件的右键 / 键盘菜单；由 OcContextMenu 渲染。 */
export function useContextMenu() {
  // shallow：锚点与归属是 DOM 节点，不能被深层代理。
  const view = shallowReactive({
    open: false,
    items: [] as readonly OcActionMenuEntry[],
    anchor: null as HTMLElement | DOMRect | null,
    owner: null as HTMLElement | null,
  })
  let handler: ((key: string) => void) | null = null

  /** 收起菜单并丢掉这次的动作闭包；marker 跟着 open 关掉自己。 */
  function close(): void {
    view.open = false
    handler = null
  }

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
    // 已经开着时 open 不变：marker 看到新锚点会自己滑过去。
    view.open = true
  }

  /** 选中一项先收起菜单再执行：动作自己带闭包，不依赖菜单还开着。 */
  function select(key: string): void {
    const selected = handler
    close()
    selected?.(key)
  }

  useOverlayDismiss(() => view.open, () => view.owner, close)

  return {
    trigger,
    dismissOnEscape,
    /** 只给 OcContextMenu 绑定用，宿主不碰。 */
    binding: { view, select, close },
  }
}
