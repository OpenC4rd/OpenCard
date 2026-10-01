import { computed, ref, type Ref } from 'vue'

const MIN_HEIGHT_RATIO = 0.2
const MAX_HEIGHT_RATIO = 0.5

export function useShellBottomPanelLayout(stackRef: Ref<HTMLElement | null>) {
  const isExpanded = ref(false)
  const height = ref(180)
  const previewHeight = ref(180)
  const isResizing = ref(false)
  const previewPercentage = computed(() => {
    const stackHeight = stackRef.value?.clientHeight ?? 0
    return stackHeight > 0 ? Math.round((previewHeight.value / stackHeight) * 100) : 0
  })

  function startResize(event: PointerEvent): void {
    if (!isExpanded.value || isResizing.value) return
    isResizing.value = true
    const startY = event.clientY
    const startHeight = height.value
    previewHeight.value = startHeight
    const stackHeight = stackRef.value?.clientHeight ?? window.innerHeight
    const minHeight = Math.max(1, Math.floor(stackHeight * MIN_HEIGHT_RATIO))
    const maxHeight = Math.max(minHeight, Math.floor(stackHeight * MAX_HEIGHT_RATIO))
    const move = (moveEvent: PointerEvent): void => {
      if (isResizing.value) {
        previewHeight.value = Math.round(Math.min(maxHeight, Math.max(minHeight, startHeight + startY - moveEvent.clientY)))
      }
    }
    const stop = (apply: boolean): void => {
      isResizing.value = false
      if (apply) height.value = previewHeight.value
      else previewHeight.value = height.value
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
    const handlePointerUp = (): void => stop(true)
    const handlePointerCancel = (): void => stop(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
  }

  return {
    isExpanded,
    height,
    previewHeight,
    isResizing,
    previewPercentage,
    startResize,
  }
}
