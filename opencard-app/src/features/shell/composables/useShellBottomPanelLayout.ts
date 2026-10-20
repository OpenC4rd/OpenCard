import { computed, ref, nextTick, onScopeDispose, type Ref } from 'vue'

const MIN_HEIGHT_RATIO = 0.2
const MAX_HEIGHT_RATIO = 0.5

export function useShellBottomPanelLayout(stackRef: Ref<HTMLElement | null>) {
  const isExpanded = ref(false)
  const height = ref(180)
  const previewHeight = ref(180)
  const isResizing = ref(false)
  const minimum = ref(1)
  const maximum = ref(Number.POSITIVE_INFINITY)
  const animations = new Map<HTMLElement, Animation>()
  let transitionRevision = 0
  function cancelAnimations(): void {
    transitionRevision++
    for (const animation of animations.values()) animation.cancel()
    animations.clear()
  }
  onScopeDispose(cancelAnimations)

  async function animateLayoutChange(): Promise<void> {
    const content = stackRef.value?.querySelector<HTMLElement>('.open-card-shell__page-content')
    if (!content) return
    const beforeHeight = content.clientHeight
    const anchors = [...content.querySelectorAll<HTMLElement>('[data-oc-layout-anchor]')].map(element => ({
      element,
      offset: Number.parseFloat(getComputedStyle(element).translate.split(' ')[1] ?? '0') || 0,
    }))
    cancelAnimations()
    const revision = transitionRevision
    await nextTick()
    if (revision !== transitionRevision || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const delta = beforeHeight - content.clientHeight
    const style = getComputedStyle(content)
    const token = style.getPropertyValue('--oc-duration').trim()
    const parsedDuration = Number.parseFloat(token) * (token.endsWith('ms') ? 1 : 1000)
    const duration = Number.isFinite(parsedDuration) ? parsedDuration : 180
    if (duration <= 0) return
    const easing = style.getPropertyValue('--oc-ease').trim() || 'ease'
    for (const { element, offset } of anchors) {
      if (!element.animate) continue
      const from = offset + delta * (element.dataset.ocLayoutAnchor === 'bottom' ? 1 : 0.5)
      if (!from) continue
      const animation = element.animate({ translate: [`0 ${from}px`, '0 0'] }, { duration, easing })
      animations.set(element, animation)
      animation.onfinish = () => { if (animations.get(element) === animation) animations.delete(element) }
    }
  }
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
    cancelAnimations()
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
    minimum, maximum, measure, startResize, resize, finishResize, animateLayoutChange }
}
