<!-- 项目图标预览：把选中的图标画在可缩放平移的画布上。裁切出来的图标画整个文件，聚焦在它那一块上。 -->
<template>
  <div ref="viewportRef" class="project-icon-preview" :class="{ 'is-panning': isPanning }"
    role="group" tabindex="0" :aria-label="t('projectConfig.icons.previewLabel', { name: entry.name })"
    @pointerdown="handlePointerDown" @pointermove="handlePointerMove"
    @pointerup="stopPanning" @pointercancel="stopPanning"
    @dblclick="resetView" @wheel.prevent="handleWheel" @keydown="handleKeydown">
    <!-- 裁切出来的图标：整个文件都画出来，这一块加框、其余压暗，默认缩放到正好框住这一块。 -->
    <div v-if="sheetStyle" class="project-icon-preview__sheet" :style="sheetStyle" :aria-label="t('projectConfig.icons.cellInSheet')">
      <img class="project-icon-preview__sheet-image" :src="entry.src" alt="" :data-pixelated="entry.pixelated || undefined" />
      <span class="project-icon-preview__sheet-cell" :style="cellInSheet!" />
    </div>
    <ProjectIconView v-else class="project-icon-preview__icon" :entry="entry" mode="preview" :style="iconStyle" />
    <OcOverlayToolbar class="project-icon-preview__controls"
      :label="t('projectConfig.icons.previewControls')" :items="toolbarItems"
      @select="handleToolbarSelect" @pointerdown.stop @dblclick.stop />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { clamp } from '../../shared/model/number'
import type { ProjectIconCatalogEntry } from '../../features/workspace/services/projectIconCatalog'
import ProjectIconView from '../../features/workspace/components/ProjectIconView.vue'
import { iconSize } from '../../shared/model/iconGeometry'
import { readProjectIconSize } from '../../features/workspace/services/projectIconDimensionResolver'
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
/** Room kept around the icon when it is fitted, the same margin the image preview keeps. */
const VIEWPORT_PADDING = 32
/** Box for an icon whose size is not known yet; replaced as soon as the file is measured. */
const UNMEASURED_BOX = 128

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
 * Screen pixels per icon pixel when the view was last fitted. It is measured once, when an icon is
 * opened or the user asks to fit again, and then left alone: resizing the panel does not move the view.
 */
const fitBase = ref<number | null>(null)

/**
 * Zoom works the way the image preview does: `scale` is relative to the fitted view, and the label is
 * the real ratio of screen pixels to the icon's own pixels. So 100% is the icon at its actual size, and
 * a 16-pixel cell fitted into the canvas reads as the large zoom it is. The icon's own size is its crop,
 * or its measured file.
 */
const naturalSize = computed(() => iconSize(props.entry, readProjectIconSize(props.entry)))
function measureFit(): number | null {
  const size = naturalSize.value
  const viewport = viewportRef.value
  if (!size || !viewport || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return null
  return Math.min(
    Math.max(1, viewport.clientWidth - VIEWPORT_PADDING * 2) / size.width,
    Math.max(1, viewport.clientHeight - VIEWPORT_PADDING * 2) / size.height,
  )
}
/** Where the cell sits in its sheet, as fractions of the sheet: the sheet's size is the file's own. */
const cellInSheet = computed<CSSProperties | null>(() => {
  const crop = props.entry.crop
  const sheet = crop ? readProjectIconSize(props.entry) : undefined
  if (!crop || !sheet) return null
  const percent = (value: number, whole: number) => `${(value / whole) * 100}%`
  return {
    left: percent(crop.x, sheet.width),
    top: percent(crop.y, sheet.height),
    width: percent(crop.w, sheet.width),
    height: percent(crop.h, sheet.height),
  }
})
const renderedScale = computed(() => fitBase.value === null ? null : fitBase.value * scale.value)

/**
 * The whole file, laid out so the crop's centre sits at the canvas centre at the current zoom. Zoom and
 * pan therefore behave exactly as for any other icon; they just reveal the rest of the file around it.
 */
const sheetStyle = computed<CSSProperties | null>(() => {
  const crop = props.entry.crop
  const sheet = crop ? readProjectIconSize(props.entry) : undefined
  const zoom = renderedScale.value
  if (!crop || !sheet || zoom === null) return null
  const focusX = (crop.x + crop.w / 2) * zoom
  const focusY = (crop.y + crop.h / 2) * zoom
  return {
    width: `${sheet.width * zoom}px`,
    height: `${sheet.height * zoom}px`,
    transform: `translate(${panX.value - focusX}px, ${panY.value - focusY}px)`,
  }
})

/**
 * The icon paints itself in `em` with its longer side as 1em, so zoom is a font size and pan is a
 * translation. No second rendering path: a context-tinted or pixelated icon looks as it does on a card.
 */
const iconStyle = computed<CSSProperties>(() => ({
  fontSize: renderedScale.value === null || !naturalSize.value
    ? `${UNMEASURED_BOX * scale.value}px`
    : `${Math.max(naturalSize.value.width, naturalSize.value.height) * renderedScale.value}px`,
  transform: `translate(${panX.value}px, ${panY.value}px)`,
}))
const scaleLabel = computed(() => renderedScale.value === null ? '…' : `${Math.round(renderedScale.value * 100)}%`)

onMounted(resetView)
// A file's size arrives after it is opened: fit then, once, if nothing has been fitted yet.
watch(naturalSize, () => { if (fitBase.value === null) resetView() })
const toolbarItems = computed(() => createViewportToolbarItems(scaleLabel.value, {
  zoomOut: t('cardDesigner.shortcuts.zoomOut'),
  fit: t('cardDesigner.shortcuts.fitViewport'),
  zoomIn: t('cardDesigner.shortcuts.zoomIn'),
}))

/**
 * A different icon is a different picture, so it is fitted afresh. The same icon after an edit (the
 * catalog hands over a new entry for every change) keeps the view the user left it at.
 */
watch(() => `${props.entry.seriesKey}\u0000${props.entry.iconKey}`, resetView)

function handleToolbarSelect({ key }: { key: string }): void {
  if (key === 'viewport.zoom-out') zoomBy(1 / ZOOM_STEP)
  else if (key === 'viewport.fit') resetView()
  else if (key === 'viewport.zoom-in') zoomBy(ZOOM_STEP)
}

/** 以画布中心缩放：图标始终居中长大，平移量不动。比例相对“适应画布”，回到 1 就是适应。 */
function setScale(nextValue: number): void {
  scale.value = clamp(nextValue, MIN_SCALE, MAX_SCALE)
}

function zoomBy(factor: number): void {
  setScale(scale.value * factor)
}

/** Fits the icon in the canvas as it is now. Opening an icon, the fit button and double-click all land here. */
function resetView(): void {
  fitBase.value = measureFit()
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
  height: 100%;
  min-width: 0;
  min-height: 0;
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

/* 整个文件从画布中心起排，位置由 transform 把裁切那一块挪到中心。 */
.project-icon-preview__sheet {
  position: absolute;
  top: 50%;
  left: 50%;
  overflow: hidden;
  pointer-events: none;
}
.project-icon-preview__sheet-image { display: block; width: 100%; height: 100%; }
.project-icon-preview__sheet-image[data-pixelated] { image-rendering: pixelated; }
/* 框住这一块，并把文件的其余部分压暗。 */
.project-icon-preview__sheet-cell {
  position: absolute;
  outline: var(--oc-border-width) solid var(--oc-border-accent);
  box-shadow: 0 0 0 100vmax var(--oc-bg-modal-backdrop);
}

.project-icon-preview__controls {
  position: absolute;
  left: 50%;
  bottom: var(--oc-space-xs);
  transform: translateX(-50%);
}
</style>
