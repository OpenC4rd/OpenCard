import { computed, ref, type Ref } from 'vue'

const MIN_HEIGHT_RATIO = 0.2
const MAX_HEIGHT_RATIO = 0.5

export function useShellBottomPanelLayout(stackRef: Ref<HTMLElement | null>) {
  const isExpanded = ref(false)
  const height = ref(180)
  const previewHeight = ref(180)
  const isResizing = ref(false)
  const minimum = ref(1)
  const maximum = ref(Number.POSITIVE_INFINITY)
  const previewPercentage = computed(() => {
    const stackHeight = stackRef.value?.clientHeight ?? 0
    return stackHeight > 0 ? Math.round((previewHeight.value / stackHeight) * 100) : 0
  })

  function measure(): void {
    const stackHeight = stackRef.value?.clientHeight ?? window.innerHeight
    minimum.value = Math.max(1, Math.floor(stackHeight * MIN_HEIGHT_RATIO))
    maximum.value = Math.max(minimum.value, Math.floor(stackHeight * MAX_HEIGHT_RATIO))
  }
  function startResize(): void {
    measure()
    previewHeight.value = height.value
    isResizing.value = true
  }
  function resize(value: number): void {
    previewHeight.value = Math.round(value)
    if (!isResizing.value) height.value = previewHeight.value
  }
  function finishResize(apply: boolean): void {
    if (apply) height.value = previewHeight.value
    else previewHeight.value = height.value
    isResizing.value = false
  }

  return { isExpanded, height, previewHeight, isResizing, previewPercentage,
    minimum, maximum, measure, startResize, resize, finishResize }
}
