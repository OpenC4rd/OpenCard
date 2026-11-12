import { nextTick, onScopeDispose, ref } from 'vue'
import { prefersReducedMotion } from '../../shared/ui/foundation/prefersReducedMotion'

const HALF_DURATION_RATIO = 0.5
const PERSPECTIVE_WIDTHS = 3
const FLIPPING_CLASS = 'card-viewport--face-flipping'

/** 在舞台原有的平移缩放之后，绕卡片自身中心做带透视的 Y 轴旋转。 */
function flipTransform(stage: HTMLElement, baseTransform: string, angle: number): string {
  const centerX = stage.offsetWidth / 2
  const centerY = stage.offsetHeight / 2
  const perspective = stage.offsetWidth * PERSPECTIVE_WIDTHS
  return `${baseTransform} translate(${centerX}px, ${centerY}px) perspective(${perspective}px) rotateY(${angle}deg) translate(${-centerX}px, ${-centerY}px)`
}

/**
 * 正反面切换的翻页动画：只翻卡片本身，先转到 90° 再换面，换面后从 -90° 转回。
 * 时长跟随 `--oc-duration`（设置里的过渡速度），过渡关闭或系统要求减少动效时直接换面。
 */
export function useCdeFaceFlip(options: {
  /** CardViewport 的根元素。 */
  getViewport: () => HTMLElement | null
}) {
  const flipping = ref(false)
  let disposed = false
  onScopeDispose(() => { disposed = true })

  function halfDuration(): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--oc-duration')
    const duration = Number.parseFloat(raw)
    return Number.isFinite(duration) ? duration * HALF_DURATION_RATIO : 0
  }

  async function flip(swap: () => void): Promise<void> {
    if (flipping.value) return
    const viewport = options.getViewport()
    const stage = viewport?.querySelector<HTMLElement>(':scope > .card-viewport-stage') ?? null
    const duration = halfDuration()
    if (!viewport || !stage || duration <= 0 || prefersReducedMotion() || typeof stage.animate !== 'function') {
      swap()
      return
    }
    flipping.value = true
    const previousPointerEvents = viewport.style.pointerEvents
    viewport.style.pointerEvents = 'none'
    viewport.classList.add(FLIPPING_CLASS)
    // 透视动画会让浏览器放弃按当前缩放栅格化，首帧发糊；提前声明后按当前缩放保持清晰
    stage.style.willChange = 'transform'
    try {
      const base = stage.style.transform
      const out = stage.animate(
        [{ transform: flipTransform(stage, base, 0) }, { transform: flipTransform(stage, base, 90) }],
        { duration, easing: 'ease-in', fill: 'forwards' },
      )
      await out.finished
      if (disposed) return
      swap()
      await nextTick()
      const nextBase = stage.style.transform
      const back = stage.animate(
        [{ transform: flipTransform(stage, nextBase, -90) }, { transform: flipTransform(stage, nextBase, 0) }],
        { duration, easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)' },
      )
      out.cancel()
      await back.finished
    } catch {
      // 动画被中断（卸载等）：不再继续
    } finally {
      viewport.classList.remove(FLIPPING_CLASS)
      stage.style.willChange = ''
      viewport.style.pointerEvents = previousPointerEvents
      flipping.value = false
    }
  }

  return { flipping, flip }
}
