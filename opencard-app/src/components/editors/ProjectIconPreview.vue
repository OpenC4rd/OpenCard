<!-- 项目图标预览：把选中的图标画在可缩放平移的画布上；图标本身仍由共享的图标样式绘制。 -->
<template>
  <div ref="viewportRef" class="project-icon-preview" :class="{ 'is-panning': isPanning }"
    role="group" tabindex="0" :aria-label="t('projectConfig.icons.previewLabel', { name: entry.name })"
    @pointerdown="handlePointerDown" @pointermove="handlePointerMove"
    @pointerup="stopPanning" @pointercancel="stopPanning"
    @dblclick="resetView" @wheel.prevent="handleWheel" @keydown="handleKeydown">
    <ProjectIconView class="project-icon-preview__icon" :entry="entry" mode="preview" :style="iconStyle" />
    <OcOverlayToolbar class="project-icon-preview__controls"
      :label="t('projectConfig.icons.previewControls')" :items="toolbarItems"
      @select="handleToolbarSelect" @pointerdown.stop @dblclick.stop />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { clamp } from '../../shared/model/number'
import type { ProjectIconCatalogEntry } from '../../features/workspace/services/projectIconCatalog'
import ProjectIconView from '../../features/workspace/components/ProjectIconView.vue'
import {
  VIEWPORT_WHEEL_ZOOM_SENSITIVITY,
  normalizeViewportWheelDelta,
} from '../../shared/ui/viewport/viewportNavigation'
import OcOverlayToolbar from '../standard/OcOverlayToolbar.vue'
import { createViewportToolbarItems } from '../standard/overlayToolbarItems'

const MIN_SCALE = 0.1
const MAX_SCALE = 16
const ZOOM_STEP = 1.25
const KEYBOARD_PAN_STEP = 32

const props = defineProps<{ entry: ProjectIconCatalogEntry }>()
const { t } = useI18n()
const viewportRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
const activePointerId = ref<number | null>(null)
const lastPointerX = ref(0)
const lastPointerY = ref(0)

/**
 * The icon paints itself in `em`, so zoom is a font size and pan is a translation. No second
 * rendering path: a rotated, theme-tinted or pixelated icon looks here exactly as it does on a card.
 */
const iconStyle = computed<CSSProperties>(() => ({
  fontSize: `calc(var(--oc-project-icon-preview-size) * ${scale.value})`,
  transform: `translate(${panX.value}px, ${panY.value}px)`,
}))
const scaleLabel = computed(() => `${Math.round(scale.value * 100)}%`)
const toolbarItems = computed(() => createViewportToolbarItems(scaleLabel.value, {
  zoomOut: t('cardDesigner.shortcuts.zoomOut'),
  fit: t('cardDesigner.shortcuts.fitViewport'),
  zoomIn: t('cardDesigner.shortcuts.zoomIn'),
}))

/** A different icon is a different picture: showing it at the previous zoom would be a lie. */
watch(() => props.entry, resetView)

function handleToolbarSelect({ key }: { key: string }): void {
  if (key === 'viewport.zoom-out') zoomBy(1 / ZOOM_STEP)
  else if (key === 'viewport.fit') resetView()
  else if (key === 'viewport.zoom-in') zoomBy(ZOOM_STEP)
}

/** 以画布中心缩放：图标始终居中长大，平移量不动。 */
function setScale(nextValue: number): void {
  scale.value = clamp(nextValue, MIN_SCALE, MAX_SCALE)
}

function zoomBy(factor: number): void {
  setScale(scale.value * factor)
}

function resetView(): void {
  scale.value = 1
  panX.value = 0
  panY.value = 0
}

function handleWheel(event: WheelEvent): void {
  const viewport = viewportRef.value
  if (!viewport) return
  const delta = normalizeViewportWheelDelta(event.deltaY, event.deltaMode, viewport.clientHeight || window.innerHeight)
  zoomBy(Math.exp(-delta * VIEWPORT_WHEEL_ZOOM_SENSITIVITY))
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== 1) return
  event.preventDefault()
  isPanning.value = true
  activePointerId.value = event.pointerId
  lastPointerX.value = event.clientX
  lastPointerY.value = event.clientY
  viewportRef.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent): void {
  if (!isPanning.value || activePointerId.value !== event.pointerId) return
  panX.value += event.clientX - lastPointerX.value
  panY.value += event.clientY - lastPointerY.value
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

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP)
  else if (event.key === '-') zoomBy(1 / ZOOM_STEP)
  else if (event.key === '0') resetView()
  else if (event.key === 'ArrowLeft') panX.value += KEYBOARD_PAN_STEP
  else if (event.key === 'ArrowRight') panX.value -= KEYBOARD_PAN_STEP
  else if (event.key === 'ArrowUp') panY.value += KEYBOARD_PAN_STEP
  else if (event.key === 'ArrowDown') panY.value -= KEYBOARD_PAN_STEP
  else return
  event.preventDefault()
}
</script>

<style scoped>
.project-icon-preview {
  position: relative;
  display: grid;
  height: var(--oc-project-icon-preview-height);
  min-width: 0;
  overflow: hidden;
  place-items: center;
  outline: none;
  background-color: var(--oc-bg-raised);
  background-image: var(--oc-viewport-dot-pattern);
  background-size: var(--oc-viewport-dot-size);
  background-position: var(--oc-viewport-dot-position);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.project-icon-preview:focus-visible {
  box-shadow: inset var(--oc-focus-ring);
}

.project-icon-preview.is-panning {
  cursor: grabbing;
}

.project-icon-preview__icon {
  pointer-events: none;
}

.project-icon-preview__controls {
  position: absolute;
  left: 50%;
  bottom: var(--oc-floating-surface-gap);
  transform: translateX(-50%);
}
</style>
