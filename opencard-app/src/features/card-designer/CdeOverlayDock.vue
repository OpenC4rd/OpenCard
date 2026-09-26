<template>
  <aside
    ref="dockRef"
    class="cde-overlay-dock"
    :class="[
      `cde-overlay-dock--${props.side}`,
      { 'is-resizing': isResizing },
    ]"
    :style="dockStyle"
  >
    <div ref="stackRef" class="cde-overlay-dock__stack" :style="stackStyle">
      <div ref="topPanelRef" class="cde-overlay-dock__panel cde-overlay-dock__panel--top">
        <slot name="top" />
      </div>

      <div
        v-if="canResizeStack"
        class="cde-overlay-dock__split-handle"
        :style="splitHandleStyle"
      >
        <OcResizeTrack
          :minimum="props.topMinHeight"
          :maximum="splitMaximum"
          :value="splitHandleValue"
          :label="props.splitLabel"
          orientation="horizontal"
          direction="normal"
          @resize-start="handleSplitResizeStart"
          @resize="handleSplitResize"
          @resize-end="handleSplitResizeEnd"
          @resize-cancel="handleSplitResizeCancel"
        />
      </div>

      <div class="cde-overlay-dock__panel cde-overlay-dock__panel--bottom">
        <slot name="bottom" />
      </div>
    </div>

    <OcResizeTrack
      class="cde-overlay-dock__width-handle"
      :minimum="props.collapsedExtent"
      :maximum="props.maxExtent"
      :value="props.extent"
      :label="props.widthLabel"
      :tooltip="props.widthTooltip"
      orientation="vertical"
      :edge="props.side === 'left' ? 'right' : 'left'"
      placement="outside"
      :direction="props.side === 'left' ? 'normal' : 'reverse'"
      @resize-start="handleWidthResizeStart"
      @resize="handleWidthResize"
      @resize-end="handleWidthResizeEnd"
      @resize-cancel="handleWidthResizeCancel"
      @double-click="handleWidthDoubleClick"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { clamp } from '../../shared/model/number'
import OcResizeTrack from '../../components/standard/OcResizeTrack.vue'
import {
  resolveCdeOverlayDockGeometry,
  settleCdeOverlayExtent,
  type CdeOverlayGeometryConfig,
  type CdeOverlaySide,
} from './cdeOverlayGeometry'
import type { OcResizeHandleChange } from '../../components/standard/OcResizeHandle.vue'

defineOptions({ name: 'CdeOverlayDock' })

const props = withDefaults(defineProps<{
  side: CdeOverlaySide
  extent: number
  collapsedExtent: number
  minExtent: number
  maxExtent: number
  expandDragThreshold: number
  collapseDragThreshold: number
  floatingGap: number
  topExpanded: boolean
  bottomExpanded: boolean
  topSize: number | null
  topMinHeight: number
  bottomMinHeight: number
  splitGap: number
  responsiveMinStageWidth: number
  widthLabel: string
  widthTooltip?: string
  splitLabel: string
}>(), {
  topSize: null,
  widthTooltip: undefined,
})

const emit = defineEmits<{
  'update:extent': [value: number]
  'update:top-size': [value: number]
  'toggle-collapse': []
  'resize-start': [axis: 'width' | 'split']
  'resize-end': [axis: 'width' | 'split']
}>()

const dockRef = ref<HTMLElement | null>(null)
const stackRef = ref<HTMLElement | null>(null)
const topPanelRef = ref<HTMLElement | null>(null)
const measuredTopSize = ref(0)
const measuredStackHeight = ref(0)
const isResizing = ref(false)
const widthStartExtent = ref(props.extent)
const widthCurrentExtent = ref(props.extent)
const splitValue = ref(props.topSize ?? props.topMinHeight)
const splitStartValue = ref(props.topSize ?? props.topMinHeight)
let resizeObserver: ResizeObserver | null = null

const geometryConfig = computed<CdeOverlayGeometryConfig>(() => ({
  collapsedExtent: props.collapsedExtent,
  minExtent: props.minExtent,
  maxExtent: props.maxExtent,
  expandDragThreshold: props.expandDragThreshold,
  collapseDragThreshold: props.collapseDragThreshold,
  floatingGap: props.floatingGap,
}))
const geometry = computed(() => resolveCdeOverlayDockGeometry(
  props.side,
  props.extent,
  geometryConfig.value,
))
const hasExpandedPanel = computed(() => props.topExpanded || props.bottomExpanded)
const canResizeStack = computed(() => props.topExpanded && props.bottomExpanded)
const splitMaximum = computed(() => {
  return Math.max(
    props.topMinHeight,
    measuredStackHeight.value - props.bottomMinHeight - props.splitGap,
  )
})
const resolvedTopSize = computed(() => {
  const source = (props.topSize ?? measuredTopSize.value) || props.topMinHeight
  return clamp(source, props.topMinHeight, splitMaximum.value)
})
// Before the first drag, the measured panel height is the only reliable origin.
// Keep the handle and the grid row on that same value so pointerdown cannot
// start from the stale minimum while the visible separator is already lower.
const splitHandleValue = computed(() => (
  props.topSize ?? (isResizing.value ? splitValue.value : resolvedTopSize.value)
))
const dockStyle = computed<CSSProperties>(() => ({
  width: `${geometry.value.contentWidth}px`,
  transform: `translateX(${geometry.value.translationX}px)`,
  top: props.floatingGap,
  bottom: hasExpandedPanel.value ? `${props.floatingGap}px` : 'auto',
  height: hasExpandedPanel.value ? `calc(100% - ${props.floatingGap * 2}px)` : 'auto',
}))
const stackStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = { gap: `${props.splitGap}px` }
  if (!props.topExpanded && !props.bottomExpanded) {
    return { ...style, gridTemplateRows: 'auto auto' }
  }
  if (!props.topExpanded) return { ...style, gridTemplateRows: 'auto minmax(0, 1fr)' }
  if (!props.bottomExpanded) return { ...style, gridTemplateRows: 'minmax(0, 1fr) auto' }
  if (props.topSize === null) {
    return { ...style, gridTemplateRows: `minmax(${props.topMinHeight}px, 1fr) minmax(0, 1fr)` }
  }
  return { ...style, gridTemplateRows: `${resolvedTopSize.value}px minmax(0, 1fr)` }
})
const splitHandleStyle = computed<CSSProperties>(() => ({
  top: `${resolvedTopSize.value}px`,
  height: `${props.splitGap}px`,
}))

function measureTopSize(): void {
  measuredStackHeight.value = stackRef.value?.getBoundingClientRect().height ?? 0
  const height = topPanelRef.value?.getBoundingClientRect().height ?? 0
  if (height > 0) measuredTopSize.value = height
}

function handleWidthResizeStart(): void {
  widthStartExtent.value = props.extent
  widthCurrentExtent.value = props.extent
  isResizing.value = true
  emit('resize-start', 'width')
}

function handleWidthResize(change: OcResizeHandleChange): void {
  widthCurrentExtent.value = change.value
  emit('update:extent', change.value)
}

function handleWidthResizeEnd(): void {
  const settled = settleCdeOverlayExtent(
    widthCurrentExtent.value,
    widthStartExtent.value,
    geometryConfig.value,
  )
  isResizing.value = false
  emit('update:extent', settled)
  emit('resize-end', 'width')
}

function handleWidthResizeCancel(): void {
  emit('update:extent', widthStartExtent.value)
  isResizing.value = false
  emit('resize-end', 'width')
}

function handleWidthDoubleClick(event: MouseEvent): void {
  event.preventDefault()
  emit('toggle-collapse')
}

function handleSplitResizeStart(): void {
  measureTopSize()
  splitStartValue.value = resolvedTopSize.value
  splitValue.value = splitStartValue.value
  isResizing.value = true
  emit('resize-start', 'split')
}

function handleSplitResize(change: OcResizeHandleChange): void {
  splitValue.value = change.value
  emit('update:top-size', change.value)
}

function handleSplitResizeEnd(): void {
  isResizing.value = false
  emit('resize-end', 'split')
}

function handleSplitResizeCancel(): void {
  splitValue.value = splitStartValue.value
  emit('update:top-size', splitStartValue.value)
  isResizing.value = false
  emit('resize-end', 'split')
}

watch(() => props.topSize, value => {
  if (value !== null) splitValue.value = value
})

watch(resolvedTopSize, value => {
  if (!isResizing.value) splitValue.value = value
}, { flush: 'sync' })

onMounted(() => {
  void nextTick(measureTopSize)
  if (typeof ResizeObserver === 'undefined' || !stackRef.value) return
  resizeObserver = new ResizeObserver(entries => {
    measureTopSize()
    if (props.topSize !== null) {
      const nextTopSize = clamp(props.topSize, props.topMinHeight, splitMaximum.value)
      if (nextTopSize !== props.topSize) emit('update:top-size', nextTopSize)
    }
    const stage = dockRef.value?.parentElement
    const stageEntry = entries.find(entry => entry.target === stage)
    const stageWidth = stageEntry?.contentRect.width ?? 0
    if (
      stageWidth > 0
      && stageWidth < props.responsiveMinStageWidth
      && props.extent > props.collapsedExtent
    ) {
      emit('update:extent', props.collapsedExtent)
    }
  })
  resizeObserver.observe(stackRef.value)
  if (dockRef.value?.parentElement) resizeObserver.observe(dockRef.value.parentElement)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<style scoped>
.cde-overlay-dock {
  position: absolute;
  z-index: var(--oc-z-overlay-toolbar);
  min-width: 0;
  min-height: 0;
  pointer-events: none;
  transition: transform var(--oc-duration-normal) var(--oc-ease);
}

.cde-overlay-dock.is-resizing {
  transition: none;
}

.cde-overlay-dock--left { left: 0; }
.cde-overlay-dock--right { right: 0; }

.cde-overlay-dock__stack {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  gap: 0;
  pointer-events: none;
}

.cde-overlay-dock__panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  pointer-events: auto;
}

.cde-overlay-dock__panel > :deep(*) {
  min-width: 0;
  min-height: 0;
}

.cde-overlay-dock__split-handle {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 2;
  pointer-events: auto;
}

.cde-overlay-dock :deep(.cde-overlay-dock__width-handle) {
  z-index: 3;
}
</style>
