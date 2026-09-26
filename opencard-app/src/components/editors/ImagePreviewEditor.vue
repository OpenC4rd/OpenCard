<!-- Image viewport: resolves an asset source and emits keyless viewport transform changes. -->
<template>
  <div
    ref="viewportRef"
    class="image-preview-editor"
    :class="{ 'is-panning': isPanning }"
    tabindex="0"
    :aria-label="t('imagePreview.viewport', { name: fileName })"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="stopPanning"
    @pointercancel="stopPanning"
    @dblclick="resetView"
    @wheel.prevent="handleWheel"
    @keydown="handleKeydown"
  >
    <div v-if="isDiff" class="image-preview-editor__diff-viewports">
      <article v-for="side in diffSides" :key="side.key" class="image-preview-editor__diff-panel">
        <header class="image-preview-editor__diff-label">{{ side.label }}</header>
        <img
          v-if="side.src"
          class="image-preview-editor__image"
          :class="{ 'is-pixelated': pixelated }"
          :src="side.src"
          :alt="`${fileName} (${side.label})`"
          :style="resolveImageStyle(side.key)"
          :data-image-side="side.key"
          draggable="false"
          @load="handleLoad"
          @error="handleError"
        />
      </article>
    </div>
    <img
      v-else-if="imageSrc && !loadError"
      class="image-preview-editor__image"
      :class="{ 'is-pixelated': pixelated }"
      :src="imageSrc"
      :alt="fileName"
      :style="resolveImageStyle('single')"
      data-image-side="single"
      draggable="false"
      @load="handleLoad"
      @error="handleError"
    />

    <div v-if="loadError" class="image-preview-editor__empty">
      <OcText tone="muted" size="xl">{{ t('imagePreview.unavailable') }}</OcText>
      <OcText tone="muted">{{ fileName }}</OcText>
    </div>

    <OcOverlayToolbar
      v-if="isImageReady"
      class="image-preview-editor__controls"
      :label="t('imagePreview.controls')"
      :items="toolbarItems"
      @select="handleToolbarSelect"
      @pointerdown.stop
      @dblclick.stop
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { clamp } from '../../shared/model/number'
import {
  VIEWPORT_WHEEL_ZOOM_SENSITIVITY,
  VIEWPORT_ZOOM_ANIMATION_EPSILON,
  VIEWPORT_ZOOM_ANIMATION_SMOOTHING,
  normalizeViewportWheelDelta,
} from '../../shared/ui/viewport/viewportNavigation'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import OcText from '../base/OcText.vue'
import OcOverlayToolbar, { createViewportToolbarItems } from '../standard/OcOverlayToolbar.vue'

type ViewportTransform = { x: number; y: number; scale: number }
type ImageSideKey = 'single' | 'before' | 'after'
type ImageState = { width: number; height: number; failed: boolean }

const MIN_SCALE = 0.1
const MAX_SCALE = 16
const ZOOM_STEP = 1.25
const TRANSFORM_EPSILON = 0.01
const VIEWPORT_PADDING = 32
const KEYBOARD_PAN_STEP = 32

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const { resolveAssetSrc } = useProjectStore()

const viewportRef = ref<HTMLElement | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)
const imageStates = reactive<Record<ImageSideKey, ImageState>>({
  single: { width: 0, height: 0, failed: false },
  before: { width: 0, height: 0, failed: false },
  after: { width: 0, height: 0, failed: false },
})
const panX = ref(props.viewportTransform?.x ?? 0)
const panY = ref(props.viewportTransform?.y ?? 0)
const scale = ref(clamp(props.viewportTransform?.scale ?? 1, MIN_SCALE, MAX_SCALE))
const targetPanX = ref(panX.value)
const targetPanY = ref(panY.value)
const targetScale = ref(scale.value)
const isPanning = ref(false)
const activePointerId = ref<number | null>(null)
const lastPointerX = ref(0)
const lastPointerY = ref(0)

let resizeObserver: ResizeObserver | null = null
let zoomAnimationFrame: number | null = null
let lastEmittedTransform: ViewportTransform | null = props.viewportTransform
  ? normalizeTransform(props.viewportTransform)
  : null

const imageSrc = computed(() => resolveAssetSrc(props.filePath))
const isDiff = computed(() => props.mode === 'diff' && Boolean(props.comparison))
function snapshotRelativePath(): string {
  const normalizedPath = props.filePath.replace(/\\/g, '/')
  const normalizedProjectRoot = props.resourceRootPath?.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalizedProjectRoot
    && normalizedPath.toLocaleLowerCase().startsWith(`${normalizedProjectRoot.toLocaleLowerCase()}/`)) {
    return normalizedPath.slice(normalizedProjectRoot.length + 1)
  }
  return normalizedPath.replace(/^[/\\]+/, '')
}

function snapshotAssetSrc(root: string | null | undefined): string {
  if (!root) return ''
  return convertFileSrc(`${root.replace(/[\\/]+$/, '')}/${snapshotRelativePath()}`)
}

const beforeImageSrc = computed(() => snapshotAssetSrc(props.comparison?.before.resourceRootPath))
const afterImageSrc = computed(() => snapshotAssetSrc(props.comparison?.after.resourceRootPath))
const diffSides = computed(() => ([
  {
    key: 'before' as const,
    label: props.comparison?.before.label ?? 'Before',
    src: beforeImageSrc.value,
  },
  {
    key: 'after' as const,
    label: props.comparison?.after.label ?? 'After',
    src: afterImageSrc.value,
  },
]))
const fileName = computed(() => props.filePath.split(/[/\\]/).pop() || props.filePath)
const loadError = computed(() => !imageSrc.value || imageStates.single.failed)
const primaryImageState = computed(() => {
  if (!isDiff.value) return imageStates.single
  if (imageStates.after.width > 0 && imageStates.after.height > 0) return imageStates.after
  return imageStates.before
})
const isImageReady = computed(() => {
  if (!isDiff.value) return imageStates.single.width > 0 && imageStates.single.height > 0 && !loadError.value
  return [imageStates.before, imageStates.after].some(state => state.width > 0 && state.height > 0 && !state.failed)
})
const contentViewportWidth = computed(() => isDiff.value ? viewportWidth.value / 2 : viewportWidth.value)

function resolveFitScale(state: ImageState): number {
  if (state.width <= 0 || state.height <= 0 || contentViewportWidth.value <= 0 || viewportHeight.value <= 0) return 1
  const availableWidth = Math.max(1, contentViewportWidth.value - VIEWPORT_PADDING)
  const availableHeight = Math.max(1, viewportHeight.value - VIEWPORT_PADDING)
  return Math.min(availableWidth / state.width, availableHeight / state.height)
}

const fitScale = computed(() => resolveFitScale(primaryImageState.value))
const renderedScale = computed(() => fitScale.value * scale.value)
function resolveImageStyle(side: ImageSideKey): CSSProperties {
  const state = imageStates[side]
  const sideFitScale = resolveFitScale(state)
  const sideRenderedScale = sideFitScale * scale.value
  const offsetX = (contentViewportWidth.value - state.width * sideRenderedScale) / 2
  const offsetY = (viewportHeight.value - state.height * sideRenderedScale) / 2
  return {
    width: `${state.width}px`,
    height: `${state.height}px`,
    transform: `translate(${offsetX + panX.value}px, ${offsetY + panY.value}px) scale(${sideRenderedScale})`,
  }
}
const scaleLabel = computed(() => `${Math.round(renderedScale.value * 100)}%`)
const pixelated = computed(() => props.pixelated ?? false)
const pixelatedLabel = computed(() => t('projectConfig.icons.pixelated'))
const toolbarItems = computed(() => [
  ...createViewportToolbarItems(scaleLabel.value, {
    zoomOut: t('cardDesigner.shortcuts.zoomOut'),
    fit: t('cardDesigner.shortcuts.fitViewport'),
    zoomIn: t('cardDesigner.shortcuts.zoomIn'),
  }),
  { type: 'divider' as const, key: 'image-options' },
  {
    key: 'toggle-pixelated',
    icon: 'tool.pixelated' as const,
    title: pixelatedLabel.value,
    active: pixelated.value,
    variant: pixelated.value ? 'soft' as const : 'ghost' as const,
  },
])

function handleToolbarSelect({ key }: { key: string }): void {
  if (key === 'viewport.zoom-out') zoomBy(1 / ZOOM_STEP)
  else if (key === 'viewport.fit') resetView()
  else if (key === 'viewport.zoom-in') zoomBy(ZOOM_STEP)
  else if (key === 'toggle-pixelated') emit('update:pixelated', !pixelated.value)
}

function normalizeTransform(value: ViewportTransform): ViewportTransform {
  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
    scale: clamp(Number.isFinite(value.scale) ? value.scale : 1, MIN_SCALE, MAX_SCALE),
  }
}

function applyViewportTransform(value?: ViewportTransform): void {
  stopZoomAnimation()
  const next = normalizeTransform(value ?? { x: 0, y: 0, scale: 1 })
  panX.value = next.x
  panY.value = next.y
  scale.value = next.scale
  targetPanX.value = next.x
  targetPanY.value = next.y
  targetScale.value = next.scale
  lastEmittedTransform = next
}

function getBaseOffsetX(zoomScale: number): number {
  const state = primaryImageState.value
  return (contentViewportWidth.value - state.width * fitScale.value * zoomScale) / 2
}

function getBaseOffsetY(zoomScale: number): number {
  const state = primaryImageState.value
  return (viewportHeight.value - state.height * fitScale.value * zoomScale) / 2
}

function resolveImageSide(image: HTMLImageElement): ImageSideKey {
  const side = image.dataset.imageSide
  return side === 'before' || side === 'after' ? side : 'single'
}

function handleLoad(event: Event): void {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement)) return
  const state = imageStates[resolveImageSide(image)]
  state.width = image.naturalWidth
  state.height = image.naturalHeight
  state.failed = false
  emit('modified', false)
}

function handleError(event: Event): void {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement)) return
  const state = imageStates[resolveImageSide(image)]
  state.width = 0
  state.height = 0
  state.failed = true
  emit('modified', false)
}

function handlePointerDown(event: PointerEvent): void {
  if (!isImageReady.value || (event.button !== 0 && event.button !== 1)) return
  event.preventDefault()
  stopZoomAnimation()
  isPanning.value = true
  activePointerId.value = event.pointerId
  lastPointerX.value = event.clientX
  lastPointerY.value = event.clientY
  viewportRef.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent): void {
  if (!isPanning.value || activePointerId.value !== event.pointerId) return
  const deltaX = event.clientX - lastPointerX.value
  const deltaY = event.clientY - lastPointerY.value
  panX.value += deltaX
  panY.value += deltaY
  targetPanX.value = panX.value
  targetPanY.value = panY.value
  lastPointerX.value = event.clientX
  lastPointerY.value = event.clientY
}

function stopPanning(event?: PointerEvent): void {
  if (event && activePointerId.value !== event.pointerId) return
  if (event && viewportRef.value?.hasPointerCapture(event.pointerId)) {
    viewportRef.value.releasePointerCapture(event.pointerId)
  }
  isPanning.value = false
  activePointerId.value = null
}

function handleWheel(event: WheelEvent): void {
  if (!isImageReady.value) return
  const viewport = viewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const delta = normalizeViewportWheelDelta(
    event.deltaY,
    event.deltaMode,
    viewportHeight.value || window.innerHeight,
  )
  const nextScale = targetScale.value * Math.exp(-delta * VIEWPORT_WHEEL_ZOOM_SENSITIVITY)
  const pointerX = event.clientX - rect.left
  const viewportX = isDiff.value && contentViewportWidth.value > 0
    ? pointerX % contentViewportWidth.value
    : pointerX
  zoomAt(nextScale, viewportX, event.clientY - rect.top)
}

function zoomBy(factor: number): void {
  zoomAt(
    targetScale.value * factor,
    contentViewportWidth.value / 2,
    viewportHeight.value / 2,
  )
}

function zoomAt(nextValue: number, viewportX: number, viewportY: number): void {
  const previousScale = targetScale.value
  const nextScale = clamp(nextValue, MIN_SCALE, MAX_SCALE)
  if (Math.abs(nextScale - previousScale) < 0.0001) return

  const previousRenderedScale = fitScale.value * previousScale
  const imageX = (viewportX - getBaseOffsetX(previousScale) - targetPanX.value) / previousRenderedScale
  const imageY = (viewportY - getBaseOffsetY(previousScale) - targetPanY.value) / previousRenderedScale
  const nextRenderedScale = fitScale.value * nextScale

  targetScale.value = nextScale
  targetPanX.value = viewportX - getBaseOffsetX(nextScale) - imageX * nextRenderedScale
  targetPanY.value = viewportY - getBaseOffsetY(nextScale) - imageY * nextRenderedScale
  startZoomAnimation()
}

function resetView(): void {
  stopZoomAnimation()
  panX.value = 0
  panY.value = 0
  scale.value = 1
  targetPanX.value = 0
  targetPanY.value = 0
  targetScale.value = 1
}

function handleKeydown(event: KeyboardEvent): void {
  if (!isImageReady.value) return
  if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP)
  else if (event.key === '-') zoomBy(1 / ZOOM_STEP)
  else if (event.key === '0') resetView()
  else if (event.key === 'ArrowLeft') moveBy(KEYBOARD_PAN_STEP, 0)
  else if (event.key === 'ArrowRight') moveBy(-KEYBOARD_PAN_STEP, 0)
  else if (event.key === 'ArrowUp') moveBy(0, KEYBOARD_PAN_STEP)
  else if (event.key === 'ArrowDown') moveBy(0, -KEYBOARD_PAN_STEP)
  else return
  event.preventDefault()
}

function moveBy(deltaX: number, deltaY: number): void {
  stopZoomAnimation()
  panX.value += deltaX
  panY.value += deltaY
  targetPanX.value = panX.value
  targetPanY.value = panY.value
}

function startZoomAnimation(): void {
  if (zoomAnimationFrame !== null) return
  const animate = () => {
    const scaleDelta = targetScale.value - scale.value
    const panXDelta = targetPanX.value - panX.value
    const panYDelta = targetPanY.value - panY.value
    if (
      Math.abs(scaleDelta) < VIEWPORT_ZOOM_ANIMATION_EPSILON
      && Math.abs(panXDelta) < VIEWPORT_ZOOM_ANIMATION_EPSILON
      && Math.abs(panYDelta) < VIEWPORT_ZOOM_ANIMATION_EPSILON
    ) {
      scale.value = targetScale.value
      panX.value = targetPanX.value
      panY.value = targetPanY.value
      zoomAnimationFrame = null
      return
    }
    scale.value += scaleDelta * VIEWPORT_ZOOM_ANIMATION_SMOOTHING
    panX.value += panXDelta * VIEWPORT_ZOOM_ANIMATION_SMOOTHING
    panY.value += panYDelta * VIEWPORT_ZOOM_ANIMATION_SMOOTHING
    zoomAnimationFrame = requestAnimationFrame(animate)
  }
  zoomAnimationFrame = requestAnimationFrame(animate)
}

function stopZoomAnimation(): void {
  if (zoomAnimationFrame !== null) cancelAnimationFrame(zoomAnimationFrame)
  zoomAnimationFrame = null
  targetScale.value = scale.value
  targetPanX.value = panX.value
  targetPanY.value = panY.value
}

function hasSameTransform(left: ViewportTransform | null, right: ViewportTransform): boolean {
  return Boolean(left)
    && Math.abs(left!.x - right.x) < TRANSFORM_EPSILON
    && Math.abs(left!.y - right.y) < TRANSFORM_EPSILON
    && Math.abs(left!.scale - right.scale) < TRANSFORM_EPSILON
}

function save(): void {
  emit('save')
}

watch([imageSrc, beforeImageSrc, afterImageSrc], () => {
  for (const state of Object.values(imageStates)) {
    state.width = 0
    state.height = 0
    state.failed = false
  }
  applyViewportTransform(props.viewportTransform)
})

watch(
  () => props.viewportTransform,
  (value) => {
    if (!value || hasSameTransform(value, { x: panX.value, y: panY.value, scale: scale.value })) return
    applyViewportTransform(value)
  },
  { deep: true },
)

watch(
  () => [panX.value, panY.value, scale.value] as const,
  ([x, y, zoomScale]) => {
    const next = { x, y, scale: zoomScale }
    if (hasSameTransform(lastEmittedTransform, next)) return
    lastEmittedTransform = next
    emit('update-viewport-transform', next)
  },
)

onMounted(() => {
  const viewport = viewportRef.value
  if (viewport) {
    resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      viewportWidth.value = entry.contentRect.width
      viewportHeight.value = entry.contentRect.height
    })
    viewportWidth.value = viewport.clientWidth
    viewportHeight.value = viewport.clientHeight
    resizeObserver.observe(viewport)
  }
  emit('modified', false)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  stopZoomAnimation()
})

const presentation = computed<EditorPresentation>(() => ({
  title: fileName.value,
  description: '',
  icon: 'file.image',
}))

defineExpose({ save, resetView, presentation })
</script>

<style scoped>
.image-preview-editor {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  outline: none;
  background-color: var(--oc-bg-raised);
  background-image: var(--oc-viewport-dot-pattern);
  background-size: var(--oc-viewport-dot-size);
  background-position: var(--oc-viewport-dot-position);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.image-preview-editor:focus-visible {
  box-shadow: inset var(--oc-focus-ring);
}

.image-preview-editor.is-panning {
  cursor: grabbing;
}

.image-preview-editor__image {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  max-width: none;
  max-height: none;
  transform-origin: 0 0;
  pointer-events: none;
  box-shadow: var(--oc-shadow-md);
}

.image-preview-editor__image.is-pixelated {
  image-rendering: pixelated;
}

.image-preview-editor__diff-viewports {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  height: 100%;
}

.image-preview-editor__diff-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  margin: 0;
  overflow: hidden;
}

.image-preview-editor__diff-panel + .image-preview-editor__diff-panel {
  border-left: var(--oc-border-width) solid var(--oc-border-muted);
}

.image-preview-editor__diff-label {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  left: 0;
  padding: var(--oc-space-2) var(--oc-space-3);
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.image-preview-editor__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-2);
}

.image-preview-editor__controls {
  position: absolute;
  left: 50%;
  bottom: var(--oc-floating-surface-gap);
  transform: translateX(-50%);
}
</style>
