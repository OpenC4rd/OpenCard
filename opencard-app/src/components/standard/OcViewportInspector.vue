<template>
  <section ref="rootRef" class="oc-viewport-inspector"
    :class="{ 'is-expanded': expanded }"
    :style="rootStyle">
    <OcResizeTrack class="oc-viewport-inspector__resizebar"
      :minimum="minimumHeight"
      :maximum="maximumHeight"
      :value="actualHeight"
      :label="resizeLabel"
      orientation="horizontal"
      direction="reverse"
      edge="top"
      placement="outside"
      :disabled="!expanded"
      @resize-start="handleResizeStart"
      @update:value="updateHeight"
      @resize="handleResize"
      @resize-cancel="handleResizeCancel"
      @double-click="toggleExpanded"
    />
    <OcCard fill variant="glass" :title="heading" :actions="cardActions" :collapsed="!expanded"
      @action="handleAction">
      <slot />
    </OcCard>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { clamp } from '../../shared/model/number'
import OcCard, { type OcCardAction } from './OcCard.vue'
import OcResizeTrack from './OcResizeTrack.vue'
import type { OcResizeHandleChange } from './OcResizeHandle.vue'

const TOGGLE_ACTION_KEY = 'viewport-inspector.toggle'

const props = withDefaults(defineProps<{
  heading: string
  actions?: readonly OcCardAction[]
  expanded: boolean
  height: number | null
  expandLabel: string
  collapseLabel: string
  resizeLabel: string
}>(), {
  actions: () => [],
})

const emit = defineEmits<{
  'update:expanded': [expanded: boolean]
  'update:height': [height: number]
  action: [payload: { key: string }]
  'occlusion-change': [height: number]
}>()

const rootRef = ref<HTMLElement | null>(null)
const actualHeight = ref(0)
const minimumHeight = ref(0)
const maximumHeight = ref(0)
const resizeStartHeight = ref(0)
let containerObserver: ResizeObserver | null = null

const rootStyle = computed<CSSProperties>(() => (
  props.expanded && props.height !== null
    ? { '--oc-viewport-inspector-current-height': `${props.height}px` }
    : {}
))
const cardActions = computed<OcCardAction[]>(() => [
  ...props.actions,
  {
    key: TOGGLE_ACTION_KEY,
    icon: props.expanded ? 'nav.chevron-down' : 'nav.chevron-up',
    title: props.expanded ? props.collapseLabel : props.expandLabel,
  },
])

function handleAction(payload: { key: string }): void {
  if (payload.key === TOGGLE_ACTION_KEY) {
    toggleExpanded()
    return
  }
  emit('action', payload)
}

function toggleExpanded(): void {
  emit('update:expanded', !props.expanded)
}

function handleResizeStart(): void {
  measureLimits()
  resizeStartHeight.value = actualHeight.value
}

function handleResize(change: OcResizeHandleChange): void {
  if (!props.expanded) return
  updateHeight(change.value)
}

function handleResizeCancel(): void {
  updateHeight(resizeStartHeight.value)
}

/* OcResizeHandle owns pointer capture, keyboard semantics and document cleanup. */
function updateHeight(value: number): void {
  measureLimits()
  const next = clamp(value, minimumHeight.value, maximumHeight.value)
  actualHeight.value = next
  emit('update:height', next)
  void nextTick(reportOcclusion)
}

function measureLimits(): void {
  const root = rootRef.value
  const container = root?.parentElement
  if (!root || !container) return
  const styles = getComputedStyle(root)
  const configuredMinimum = readCssPixels(styles, '--oc-viewport-inspector-min-height')
  const visibleMinimum = readCssPixels(styles, '--oc-viewport-inspector-visible-min-height')
  const bottomInset = Math.max(0, container.getBoundingClientRect().bottom - root.getBoundingClientRect().bottom)
  maximumHeight.value = Math.max(
    readCssPixels(styles, '--oc-size-lg'),
    container.getBoundingClientRect().height - visibleMinimum - bottomInset,
  )
  minimumHeight.value = Math.min(configuredMinimum, maximumHeight.value)
  actualHeight.value = clamp(root.getBoundingClientRect().height, minimumHeight.value, maximumHeight.value)
}

function reportOcclusion(): void {
  const root = rootRef.value
  const container = root?.parentElement
  if (!root || !container) return
  const rootRect = root.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  actualHeight.value = rootRect.height
  emit('occlusion-change', Math.max(0, containerRect.bottom - rootRect.top))
}

function handleGeometryResize(): void {
  measureLimits()
  if (props.expanded && props.height !== null && props.height > maximumHeight.value) {
    emit('update:height', maximumHeight.value)
  }
  void nextTick(reportOcclusion)
}

function readCssPixels(styles: CSSStyleDeclaration, key: string): number {
  const value = Number.parseFloat(styles.getPropertyValue(key))
  return Number.isFinite(value) ? value : 0
}

watch(() => [props.expanded, props.height], () => void nextTick(() => {
  measureLimits()
  reportOcclusion()
}))

onMounted(() => {
  measureLimits()
  reportOcclusion()
  if (typeof ResizeObserver === 'undefined' || !rootRef.value?.parentElement) return
  containerObserver = new ResizeObserver(handleGeometryResize)
  containerObserver.observe(rootRef.value.parentElement)
  containerObserver.observe(rootRef.value)
})

onBeforeUnmount(() => {
  containerObserver?.disconnect()
  containerObserver = null
})
</script>

<style scoped>
.oc-viewport-inspector {
  position: absolute;
  right: var(--oc-floating-surface-gap);
  bottom: var(--oc-floating-surface-gap);
  left: var(--oc-floating-surface-gap);
  z-index: var(--oc-z-viewport-inspector);
  min-width: 0;
  max-height: calc(100% - var(--oc-viewport-inspector-visible-min-height));
  overflow: visible;
  pointer-events: auto;
}

.oc-viewport-inspector.is-expanded {
  height: var(
    --oc-viewport-inspector-current-height,
    var(--oc-viewport-inspector-default-height)
  );
  min-height: min(
    var(--oc-viewport-inspector-min-height),
    calc(100% - var(--oc-viewport-inspector-visible-min-height))
  );
}

.oc-viewport-inspector__resizebar {
  z-index: 1;
  cursor: row-resize;
  touch-action: none;
  outline: none;
}

.oc-viewport-inspector :deep(.oc-card) {
  min-height: 0;
}
</style>
