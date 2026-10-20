/**
 * Owns the Card Designer viewport navigation session.
 * Document loading, selection commands, and layer-view routing stay with the caller.
 */
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type CSSProperties,
  type Ref,
} from 'vue'
import type { EditorViewportTransform } from '../editor-runtime/model/editorUiState'
import { taskScheduler } from '../../utils/taskScheduler'

export type CdeViewportPort = {
  zoomBy: (factor: number) => void
  zoomByWheelAt: (
    deltaY: number,
    deltaMode: number,
    viewportX: number,
    viewportY: number,
  ) => void
  fitView: (targetRect?: { left: number; top: number; width: number; height: number }) => void
}

type UseCdeViewportControllerOptions = {
  faceSize: Readonly<Ref<{ width: number; height: number } | null>>
  viewportPort: Readonly<Ref<CdeViewportPort | null>>
  initialTransform?: Readonly<Ref<EditorViewportTransform | undefined>>
  commitTransform: (transform: EditorViewportTransform) => void
}

type PreviewDragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startTransform: EditorViewportTransform
}

const DEFAULT_VIEWPORT_TRANSFORM: EditorViewportTransform = { x: 0, y: 0, scale: 1 }
const VIEWPORT_ZOOM_STEP = 1.25
const TRANSFORM_PREVIEW_MAX_SIDE = 220
const TRANSFORM_PREVIEW_VISIBILITY_COVERAGE = 0.7

export function useCdeViewportController(options: UseCdeViewportControllerOptions) {
  const transformPreviewHostRef = ref<HTMLElement | null>(null)
  const transformPreviewViewportRef = ref<HTMLElement | null>(null)
  const viewportTransform = ref<EditorViewportTransform>({ ...(options.initialTransform?.value ?? DEFAULT_VIEWPORT_TRANSFORM) })
  const viewportSize = ref({ width: 0, height: 0 })
  const transformPreviewHostSize = ref({
    width: TRANSFORM_PREVIEW_MAX_SIDE,
    height: TRANSFORM_PREVIEW_MAX_SIDE,
  })
  const previewDragState = ref<PreviewDragState | null>(null)
  let initialFitPending = !options.initialTransform?.value
  let initialFitRequested = false
  let transformPreviewSizeObserver: ResizeObserver | null = null
  const previewDragInput = taskScheduler.frame(applyPreviewViewportDrag)

  const transformPreviewScale = computed(() => {
    const face = options.faceSize.value
    if (!face) return 1
    return Math.min(
      transformPreviewHostSize.value.width / face.width,
      transformPreviewHostSize.value.height / face.height,
      1,
    )
  })
  const transformPreviewRendererStyle = computed<CSSProperties>(() => ({
    transform: `scale(${transformPreviewScale.value})`,
    transformOrigin: '0 0',
  }))
  const transformPreviewViewportStyle = computed<CSSProperties>(() => {
    const face = options.faceSize.value
    if (!face) return {}
    return {
      width: `${Math.round(face.width * transformPreviewScale.value)}px`,
      height: `${Math.round(face.height * transformPreviewScale.value)}px`,
    }
  })
  const transformPreviewWorldRect = computed(() => {
    const face = options.faceSize.value
    const { scale, x, y } = viewportTransform.value
    const { width, height } = viewportSize.value
    if (!face || scale <= 0 || width <= 0 || height <= 0) return null

    const worldWidth = width / scale
    const worldHeight = height / scale
    return {
      left: face.width / 2 - worldWidth / 2 - x / scale,
      top: face.height / 2 - worldHeight / 2 - y / scale,
      width: worldWidth,
      height: worldHeight,
    }
  })
  const transformPreviewFrameStyle = computed<CSSProperties | null>(() => {
    const rect = transformPreviewWorldRect.value
    const previewScale = transformPreviewScale.value
    if (!rect || previewScale <= 0) return null
    return {
      transform: `translate3d(${rect.left * previewScale}px, ${rect.top * previewScale}px, 0)`,
      width: `${rect.width * previewScale}px`,
      height: `${rect.height * previewScale}px`,
    }
  })
  const transformPreviewVisibleCoverage = computed(() => {
    const face = options.faceSize.value
    const rect = transformPreviewWorldRect.value
    if (!face || !rect || face.width <= 0 || face.height <= 0) return 1

    const intersectionWidth = Math.max(
      0,
      Math.min(face.width, rect.left + rect.width) - Math.max(0, rect.left),
    )
    const intersectionHeight = Math.max(
      0,
      Math.min(face.height, rect.top + rect.height) - Math.max(0, rect.top),
    )
    return intersectionWidth * intersectionHeight / (face.width * face.height)
  })
  const isPreviewViewportDragging = computed(() => previewDragState.value !== null)
  const isTransformPreviewFrameVisible = computed(() => (
    transformPreviewVisibleCoverage.value < TRANSFORM_PREVIEW_VISIBILITY_COVERAGE
    || isPreviewViewportDragging.value
  ))
  const viewportScaleLabel = computed(() => `${Math.round(viewportTransform.value.scale * 100)}%`)

  function updateTransformPreviewHostSize(width: number, height: number): void {
    transformPreviewHostSize.value = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    }
  }

  watch(transformPreviewHostRef, (nextHost, previousHost) => {
    if (!transformPreviewSizeObserver) return
    if (previousHost) transformPreviewSizeObserver.unobserve(previousHost)
    if (nextHost) {
      transformPreviewSizeObserver.observe(nextHost)
      updateTransformPreviewHostSize(nextHost.clientWidth, nextHost.clientHeight)
    }
  })

  function commitViewportTransform(transform: EditorViewportTransform): void {
    viewportTransform.value = transform
    options.commitTransform(transform)
  }

  function zoomViewportIn(): void {
    options.viewportPort.value?.zoomBy(VIEWPORT_ZOOM_STEP)
  }

  function zoomViewportOut(): void {
    options.viewportPort.value?.zoomBy(1 / VIEWPORT_ZOOM_STEP)
  }

  function handlePreviewViewportWheel(event: WheelEvent): void {
    const previewViewport = transformPreviewViewportRef.value
    const previewWorldRect = transformPreviewWorldRect.value
    const previewScale = transformPreviewScale.value
    if (!previewViewport || previewScale <= 0) return

    const previewRect = previewViewport.getBoundingClientRect()
    const previewX = Math.min(Math.max(event.clientX - previewRect.left, 0), previewRect.width)
    const previewY = Math.min(Math.max(event.clientY - previewRect.top, 0), previewRect.height)
    const worldX = previewX / previewScale
    const worldY = previewY / previewScale
    const viewportX = previewWorldRect
      ? (worldX - previewWorldRect.left) * viewportTransform.value.scale
      : viewportSize.value.width / 2
    const viewportY = previewWorldRect
      ? (worldY - previewWorldRect.top) * viewportTransform.value.scale
      : viewportSize.value.height / 2
    options.viewportPort.value?.zoomByWheelAt(
      event.deltaY,
      event.deltaMode,
      viewportX,
      viewportY,
    )
  }

  function fitViewport(): void {
    options.viewportPort.value?.fitView()
  }

  function fitBottomRightHalfViewport(): void {
    const { width, height } = viewportSize.value
    if (width <= 0 || height <= 0) return
    options.viewportPort.value?.fitView({
      left: width / 2,
      top: height / 2,
      width: width / 2,
      height: height / 2,
    })
  }

  function scheduleInitialViewportFit(): void {
    void nextTick(() => {
      if (
        !initialFitPending
        || !initialFitRequested
        || viewportSize.value.width <= 0
        || viewportSize.value.height <= 0
        || !options.faceSize.value
      ) return

      initialFitPending = false
      initialFitRequested = false
      fitViewport()
    })
  }

  function prepareForFileChange(): void {
    previewDragInput.cancel()
    initialFitPending = !options.initialTransform?.value
    initialFitRequested = false
    previewDragState.value = null
    viewportTransform.value = { ...(options.initialTransform?.value ?? DEFAULT_VIEWPORT_TRANSFORM) }
  }

  function completeFileLoad(): void {
    initialFitRequested = true
    scheduleInitialViewportFit()
  }

  function handleViewportTransformChange(transform: EditorViewportTransform): void {
    commitViewportTransform(transform)
  }

  function handleViewportSizeChange(size: { width: number; height: number }): void {
    viewportSize.value = size
    scheduleInitialViewportFit()
  }

  function startPreviewViewportDrag(event: PointerEvent): void {
    if (event.button !== 0 || transformPreviewScale.value <= 0) return
    previewDragInput.cancel()
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    if (target instanceof HTMLElement) {
      target.focus()
      target.setPointerCapture(event.pointerId)
    }
    previewDragState.value = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTransform: { ...viewportTransform.value },
    }
  }

  function handlePreviewViewportDrag(event: PointerEvent): void {
    if (previewDragState.value?.pointerId !== event.pointerId) return
    previewDragInput.schedule(event)
  }

  function applyPreviewViewportDrag(event: PointerEvent): void {
    const state = previewDragState.value
    const previewScale = transformPreviewScale.value
    if (!state || state.pointerId !== event.pointerId || previewScale <= 0) return

    const worldDeltaX = (event.clientX - state.startClientX) / previewScale
    const worldDeltaY = (event.clientY - state.startClientY) / previewScale
    commitViewportTransform({
      x: state.startTransform.x - worldDeltaX * state.startTransform.scale,
      y: state.startTransform.y - worldDeltaY * state.startTransform.scale,
      scale: state.startTransform.scale,
    })
  }

  function stopPreviewViewportDrag(event: PointerEvent): void {
    const state = previewDragState.value
    if (!state || state.pointerId !== event.pointerId) return
    previewDragInput.flush()
    const target = event.currentTarget
    if (target instanceof HTMLElement && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    previewDragState.value = null
  }

  function handlePreviewViewportKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 40 : 10
    const movement = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }[event.key]
    if (!movement) return

    event.preventDefault()
    commitViewportTransform({
      x: viewportTransform.value.x - movement.x * viewportTransform.value.scale,
      y: viewportTransform.value.y - movement.y * viewportTransform.value.scale,
      scale: viewportTransform.value.scale,
    })
  }

  onMounted(() => {
    transformPreviewSizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === transformPreviewHostRef.value) {
          updateTransformPreviewHostSize(entry.contentRect.width, entry.contentRect.height)
        }
      })
    })
    const host = transformPreviewHostRef.value
    if (host) {
      transformPreviewSizeObserver.observe(host)
      updateTransformPreviewHostSize(host.clientWidth, host.clientHeight)
    }
  })

  onUnmounted(() => {
    previewDragInput.cancel()
    transformPreviewSizeObserver?.disconnect()
    transformPreviewSizeObserver = null
    previewDragState.value = null
  })

  return {
    completeFileLoad,
    fitBottomRightHalfViewport,
    fitViewport,
    handlePreviewViewportDrag,
    handlePreviewViewportKeydown,
    handlePreviewViewportWheel,
    handleViewportSizeChange,
    handleViewportTransformChange,
    isPreviewViewportDragging,
    isTransformPreviewFrameVisible,
    prepareForFileChange,
    startPreviewViewportDrag,
    stopPreviewViewportDrag,
    transformPreviewFrameStyle,
    transformPreviewHostRef,
    transformPreviewRendererStyle,
    transformPreviewViewportRef,
    transformPreviewViewportStyle,
    viewportScaleLabel,
    viewportTransform,
    zoomViewportIn,
    zoomViewportOut,
  }
}
