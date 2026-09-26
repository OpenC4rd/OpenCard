<template>
  <div
    ref="handleRef"
    class="oc-resize-handle"
    :class="[
      `oc-resize-handle--${props.orientation}`,
      { 'is-resizing': isResizing, 'is-disabled': props.disabled },
      attrs.class,
    ]"
    :style="attrs.style"
    role="separator"
    :tabindex="props.disabled ? -1 : 0"
    :aria-orientation="props.orientation"
    :aria-valuemin="props.minimum"
    :aria-valuemax="props.maximum"
    :aria-valuenow="currentValue"
    :aria-label="props.label"
    :aria-disabled="props.disabled || undefined"
    :data-tooltip="props.tooltip ?? props.label"
    :data-tooltip-placement="tooltipPlacement"
    v-bind="forwardedAttrs"
    @pointerdown="startResize"
    @pointermove="continueResize"
    @pointerup="finishResize"
    @pointercancel="cancelResize"
    @keydown="handleKeydown"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useAttrs, watch } from 'vue'
import { clamp } from '../../shared/model/number'

defineOptions({ name: 'OcResizeHandle', inheritAttrs: false })

type ResizeOrientation = 'horizontal' | 'vertical'
type ResizeDirection = 'normal' | 'reverse'

export interface OcResizeHandleChange {
  value: number
  delta: number
  event: PointerEvent | KeyboardEvent
}

const KEYBOARD_STEP = 16

const props = withDefaults(defineProps<{
  minimum: number
  maximum: number
  value: number
  label: string
  tooltip?: string
  orientation?: ResizeOrientation
  direction?: ResizeDirection
  step?: number
  disabled?: boolean
}>(), {
  orientation: 'horizontal',
  direction: 'normal',
  tooltip: undefined,
  step: KEYBOARD_STEP,
  disabled: false,
})

const emit = defineEmits<{
  'update:value': [value: number]
  resize: [change: OcResizeHandleChange]
  'resize-start': [event: PointerEvent]
  'resize-end': [event: PointerEvent]
  'resize-cancel': [event: PointerEvent | KeyboardEvent]
}>()

const attrs = useAttrs()
const handleRef = ref<HTMLElement | null>(null)
const isResizing = ref(false)

/**
 * The hint never sits on the drag axis: a vertical handle grows in width, so its hint stays beside
 * the handle; a horizontal handle grows in height, so its hint stays above it.
 */
const tooltipPlacement = computed(() => (props.orientation === 'vertical' ? 'right' : 'top'))
const currentValue = ref(normalizeValue(props.value))
const resizeState = ref<{
  pointerId: number
  startCoordinate: number
  startValue: number
} | null>(null)
let previousBodyCursor = ''
let previousBodyUserSelect = ''

const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

watch(() => props.value, value => {
  if (!resizeState.value) currentValue.value = normalizeValue(value)
})

function normalizeValue(value: number): number {
  const minimum = Math.min(props.minimum, props.maximum)
  const maximum = Math.max(props.minimum, props.maximum)
  return clamp(value, minimum, maximum)
}

function getCoordinate(event: PointerEvent): number {
  return props.orientation === 'horizontal' ? event.clientY : event.clientX
}

function getDirectionSign(): number {
  return props.direction === 'reverse' ? -1 : 1
}

function startResize(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return
  const startValue = normalizeValue(props.value)
  resizeState.value = {
    pointerId: event.pointerId,
    startCoordinate: getCoordinate(event),
    startValue,
  }
  currentValue.value = startValue
  isResizing.value = true
  handleRef.value?.focus({ preventScroll: true })
  handleRef.value?.setPointerCapture?.(event.pointerId)
  previousBodyCursor = document.body.style.cursor
  previousBodyUserSelect = document.body.style.userSelect
  document.body.style.cursor = props.orientation === 'horizontal' ? 'row-resize' : 'col-resize'
  document.body.style.userSelect = 'none'
  emit('resize-start', event)
  event.preventDefault()
}

function continueResize(event: PointerEvent): void {
  const state = resizeState.value
  if (!state || state.pointerId !== event.pointerId) return
  const coordinateDelta = getCoordinate(event) - state.startCoordinate
  const value = normalizeValue(state.startValue + coordinateDelta * getDirectionSign())
  updateValue(value, event, value - state.startValue)
  event.preventDefault()
}

function finishResize(event: PointerEvent): void {
  const state = resizeState.value
  if (!state || state.pointerId !== event.pointerId) return
  const coordinateDelta = getCoordinate(event) - state.startCoordinate
  const value = normalizeValue(state.startValue + coordinateDelta * getDirectionSign())
  updateValue(value, event, value - state.startValue)
  releasePointer(state.pointerId)
  emit('resize-end', event)
  clearResizeState()
  event.preventDefault()
}

function cancelResize(event: PointerEvent): void {
  const state = resizeState.value
  if (!state || state.pointerId !== event.pointerId) return
  updateValue(state.startValue, event, state.startValue - currentValue.value)
  releasePointer(state.pointerId)
  emit('resize-cancel', event)
  clearResizeState()
  event.preventDefault()
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  const state = resizeState.value
  if (event.key === 'Escape') {
    if (!state) return
    updateValue(state.startValue, event, state.startValue - currentValue.value)
    releasePointer(state.pointerId)
    emit('resize-cancel', event)
    clearResizeState()
    event.preventDefault()
    return
  }

  let delta = 0
  if (props.orientation === 'horizontal') {
    if (event.key === 'ArrowUp') delta = -props.step
    else if (event.key === 'ArrowDown') delta = props.step
  } else if (event.key === 'ArrowLeft') {
    delta = -props.step
  } else if (event.key === 'ArrowRight') {
    delta = props.step
  }

  if (delta === 0 && event.key !== 'Home' && event.key !== 'End') return
  const directionDelta = delta * getDirectionSign()
  const value = event.key === 'Home'
    ? Math.min(props.minimum, props.maximum)
    : event.key === 'End'
      ? Math.max(props.minimum, props.maximum)
      : normalizeValue(currentValue.value + directionDelta)
  const normalized = normalizeValue(value)
  updateValue(normalized, event, normalized - currentValue.value)
  event.preventDefault()
}

function updateValue(value: number, event: PointerEvent | KeyboardEvent, delta: number): void {
  const normalized = normalizeValue(value)
  if (normalized === currentValue.value) return
  currentValue.value = normalized
  emit('update:value', normalized)
  emit('resize', { value: normalized, delta, event })
}

function releasePointer(pointerId: number): void {
  if (handleRef.value?.hasPointerCapture?.(pointerId)) {
    handleRef.value.releasePointerCapture?.(pointerId)
  }
}

function clearResizeState(): void {
  resizeState.value = null
  isResizing.value = false
  document.body.style.cursor = previousBodyCursor
  document.body.style.userSelect = previousBodyUserSelect
  previousBodyCursor = ''
  previousBodyUserSelect = ''
}

onBeforeUnmount(() => {
  const state = resizeState.value
  if (state) releasePointer(state.pointerId)
  clearResizeState()
})
</script>

<style scoped>
.oc-resize-handle {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--oc-border-muted);
  touch-action: none;
  user-select: none;
  outline: none;
}

.oc-resize-handle--horizontal {
  width: 100%;
  height: var(--oc-space-3);
  cursor: row-resize;
}

.oc-resize-handle--vertical {
  width: var(--oc-space-3);
  height: 100%;
  cursor: col-resize;
}

.oc-resize-handle::after {
  display: block;
  flex: 0 0 auto;
  border-radius: var(--oc-radius-full);
  background: currentColor;
  content: '';
  transition: color var(--oc-duration-fast) var(--oc-ease),
    box-shadow var(--oc-duration-fast) var(--oc-ease);
}

.oc-resize-handle--horizontal::after {
  width: var(--oc-size-md);
  height: var(--oc-space-1);
}

.oc-resize-handle--vertical::after {
  width: var(--oc-space-1);
  height: var(--oc-size-md);
}

.oc-resize-handle:hover,
.oc-resize-handle:focus-visible,
.oc-resize-handle.is-resizing {
  color: var(--oc-border-accent);
}

.oc-resize-handle:focus-visible::after {
  box-shadow: var(--oc-control-focus-shadow, var(--oc-focus-ring));
}

.oc-resize-handle.is-disabled {
  cursor: default;
  color: var(--oc-fg-disabled);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .oc-resize-handle::after {
    transition: none;
  }
}
</style>
