/**
 * 指针拖拽的统一脚手架：监听挂在 window 上，拖得再快、划出元素、移出窗口都不丢；
 * `threshold` 以内算点击（不触发 onMove），松手 / 取消 / 失焦统一走 onEnd。
 * 返回的函数可主动中止（onEnd 的 event 为 null）。
 */
export type PointerDragHandlers = {
  threshold?: number
  onMove: (event: PointerEvent, delta: { x: number; y: number }) => void
  onEnd: (event: PointerEvent | null, dragged: boolean) => void
}

export function trackPointerDrag(
  start: { clientX: number; clientY: number },
  handlers: PointerDragHandlers,
): () => void {
  const threshold = handlers.threshold ?? 0
  let dragged = false
  const move = (event: PointerEvent): void => {
    const delta = { x: event.clientX - start.clientX, y: event.clientY - start.clientY }
    if (!dragged && Math.hypot(delta.x, delta.y) < threshold) return
    dragged = true
    handlers.onMove(event, delta)
  }
  const end = (event: Event | null): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
    handlers.onEnd(event as PointerEvent | null, dragged)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('blur', end)
  return () => end(null)
}
