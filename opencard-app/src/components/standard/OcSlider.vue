<!-- Standard 滑块：拖动或键盘设定数值，追加内容（例如可编辑数值）与滑轨排在同一个控件内。 -->
<template>
  <div
    class="oc-slider"
    :class="[{ 'is-disabled': disabled, 'is-dragging': dragging }, attrs.class]"
    :style="attrs.style"
  >
    <div
      ref="trackRef"
      class="oc-slider__track"
      role="slider"
      :tabindex="disabled ? -1 : 0"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="draftValue"
      :aria-valuetext="valueText || undefined"
      :aria-disabled="disabled || undefined"
      v-bind="controlAttrs"
      @pointerdown="startDrag"
      @keydown="handleKeydown"
    >
      <span class="oc-slider__rail">
        <span class="oc-slider__fill" :style="{ width: `${percentage}%` }" />
        <span v-if="tickMarks.length" class="oc-slider__ticks" aria-hidden="true">
          <span
            v-for="tick in tickMarks"
            :key="tick.value"
            class="oc-slider__tick"
            :class="{ 'is-filled': tick.percentage <= percentage }"
            :style="tickStyle(tick)"
          />
        </span>
      </span>
      <span class="oc-slider__thumb" :style="{ left: anchorLeft }" />
    </div>
    <span v-if="hasValueDisplay" class="oc-slider__readout" :style="{ left: anchorLeft }">
      {{ valueText }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch, type CSSProperties } from 'vue'

/** 把长度吸到设备像素网格上：圆点和刻度落在整格上，边缘才不会一半清楚一半糊。 */
function snapToDevicePixel(value: number, ratio: number): number {
  return Math.round(value * ratio) / ratio
}

/** 一根一个设备像素宽的线以中心定位时，中心要落在半格上，两侧才各占满一格。 */
function snapHairlineCenter(value: number, ratio: number): number {
  return (Math.round(value * ratio - 0.5) + 0.5) / ratio
}

defineOptions({ name: 'OcSlider', inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  ticks?: readonly number[]
  disabled?: boolean
  valueText?: string
}>(), {
  min: 0,
  max: 100,
  step: 1,
  ticks: () => [],
  disabled: false,
  valueText: '',
})

const emit = defineEmits<{
  preview: [value: number]
  'update:modelValue': [value: number]
  commit: [value: number]
}>()

const attrs = useAttrs()
/** 悬停、拖动或键盘聚焦时在拇指上方显示当前值；平时不占位、不参与布局。 */
const hasValueDisplay = computed(() => Boolean(props.valueText))
const trackRef = ref<HTMLElement | null>(null)
/** 滑轨实测宽度与显示缩放：把圆点放到设备像素上要用它们，量不到时退回百分比。 */
const trackWidth = ref(0)
const pixelRatio = ref(1)
const draftValue = ref(normalizeValue(props.modelValue))
const dragging = ref(false)
let pointerId: number | null = null
let trackResizeObserver: ResizeObserver | null = null

const controlAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const validTicks = computed(() => [...new Set(props.ticks.filter(value => (
  Number.isFinite(value) && value >= props.min && value <= props.max
)))].sort((left, right) => left - right))
const percentage = computed(() => {
  if (validTicks.value.length > 1) {
    const nearestIndex = validTicks.value.reduce((closest, value, index) => (
      Math.abs(value - draftValue.value) < Math.abs(validTicks.value[closest]! - draftValue.value)
        ? index
        : closest
    ), 0)
    return nearestIndex / (validTicks.value.length - 1) * 100
  }
  const range = props.max - props.min
  return range <= 0 ? 0 : ((draftValue.value - props.min) / range) * 100
})
/** 只画中间的刻度：两端刻度正好落在滑轨的圆角端点上，画出来会被圆角裁成半条。 */
const tickMarks = computed(() => {
  if (validTicks.value.length <= 1) return []
  const span = validTicks.value.length - 1
  return validTicks.value.slice(1, -1).map((value, index) => ({
    value,
    percentage: (index + 1) / span * 100,
  }))
})

/** 圆点与数值读数的水平锚点：吸到设备像素上，半个像素的落点会把小圆的边糊掉。 */
const anchorLeft = computed(() => (trackWidth.value > 0
  ? `${snapToDevicePixel(percentage.value / 100 * trackWidth.value, pixelRatio.value)}px`
  : `${percentage.value}%`))

/** 刻度的横向落点与线宽：整根线正好一个设备像素，并且每根都落在同一套半像素相位上。 */
function tickStyle(mark: { percentage: number }): CSSProperties {
  if (trackWidth.value <= 0) return { left: `${mark.percentage}%` }
  const ratio = pixelRatio.value
  return {
    left: `${snapHairlineCenter(mark.percentage / 100 * trackWidth.value, ratio)}px`,
    width: `${1 / ratio}px`,
  }
}

watch(() => props.modelValue, value => {
  if (!dragging.value) draftValue.value = normalizeValue(value)
})

onMounted(() => {
  const track = trackRef.value
  if (!track || typeof ResizeObserver === 'undefined') return
  trackResizeObserver = new ResizeObserver(entries => {
    trackWidth.value = entries[0]?.contentRect.width ?? track.clientWidth
    pixelRatio.value = window.devicePixelRatio || 1
  })
  trackResizeObserver.observe(track)
})

onBeforeUnmount(() => {
  stopDrag()
  trackResizeObserver?.disconnect()
  trackResizeObserver = null
})

function normalizeValue(value: number): number {
  const lower = Math.min(props.min, props.max)
  const upper = Math.max(props.min, props.max)
  const clamped = Math.min(upper, Math.max(lower, value))
  const step = props.step > 0 ? props.step : 1
  const stepped = props.min + Math.round((clamped - props.min) / step) * step
  const precision = Math.max(decimalPlaces(step), decimalPlaces(props.min))
  return Number(Math.min(upper, Math.max(lower, stepped)).toFixed(precision))
}

function decimalPlaces(value: number): number {
  const text = String(value)
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0
}

function previewValue(value: number): void {
  const normalized = normalizeValue(value)
  if (normalized === draftValue.value) return
  draftValue.value = normalized
  emit('preview', normalized)
}

function commitValue(value = draftValue.value): void {
  const normalized = normalizeValue(value)
  draftValue.value = normalized
  emit('update:modelValue', normalized)
  emit('commit', normalized)
}

function startDrag(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return
  event.preventDefault()
  dragging.value = true
  pointerId = event.pointerId
  updateFromPointer(event)
  document.addEventListener('pointermove', handlePointerMove)
  document.addEventListener('pointerup', handlePointerUp)
  document.addEventListener('pointercancel', handlePointerUp)
  trackRef.value?.focus()
}

function handlePointerMove(event: PointerEvent): void {
  if (event.pointerId === pointerId) updateFromPointer(event)
}

function handlePointerUp(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return
  updateFromPointer(event)
  commitValue()
  stopDrag()
}

function stopDrag(): void {
  dragging.value = false
  pointerId = null
  document.removeEventListener('pointermove', handlePointerMove)
  document.removeEventListener('pointerup', handlePointerUp)
  document.removeEventListener('pointercancel', handlePointerUp)
}

function updateFromPointer(event: PointerEvent): void {
  const rect = trackRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  if (validTicks.value.length > 1) {
    const index = Math.round(ratio * (validTicks.value.length - 1))
    previewValue(validTicks.value[index]!)
    return
  }
  previewValue(props.min + ratio * (props.max - props.min))
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  const keyStep = props.step * (event.shiftKey ? 10 : 1)
  let next: number | null = null
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = draftValue.value - keyStep
  else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = draftValue.value + keyStep
  else if (event.key === 'PageDown') next = draftValue.value - props.step * 10
  else if (event.key === 'PageUp') next = draftValue.value + props.step * 10
  else if (event.key === 'Home') next = props.min
  else if (event.key === 'End') next = props.max
  if (next === null) return
  event.preventDefault()
  previewValue(next)
  commitValue()
}
</script>

<style scoped>
.oc-slider {
  /* 手柄只有一层投影，聚焦时由下面的规则替换：小尺寸的多层描边会让边缘发虚。 */
  --oc-slider-thumb-shadow: var(--oc-shadow-sm);
  --oc-slider-thumb-focus-shadow: 0 0 0 1px var(--oc-bg-surface), var(--oc-focus-ring);

  position: relative;
  display: flex;
  width: 100%;
  min-width: 80px;
  height: var(--oc-size-md);
  align-items: center;
  column-gap: var(--oc-space-2);
}

/* 滑块本身不画表面：所在的行或字段已经提供了外观，追加区域只是同一行里的嵌入内容。 */
.oc-slider__track {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  height: 100%;
  min-width: 0;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.oc-slider.is-disabled .oc-slider__track {
  cursor: not-allowed;
}

/* 数值读数浮在拇指上方：平时隐藏且不接收指针，悬停、拖动或键盘聚焦时持续显示。 */
.oc-slider__readout {
  position: absolute;
  bottom: calc(100% + var(--oc-space-1));
  z-index: 1;
  max-width: 100%;
  padding: 0 var(--oc-space-1);
  border: var(--oc-border-width) solid var(--oc-border-default);
  border-radius: var(--oc-radius-sm);
  background: var(--oc-bg-surface);
  box-shadow: var(--oc-shadow-sm);
  color: var(--oc-fg-default);
  font-size: var(--oc-text-sm);
  line-height: 1.5;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%);
  transition: opacity var(--oc-duration-fast) var(--oc-ease);
}

.oc-slider:hover .oc-slider__readout,
.oc-slider.is-dragging .oc-slider__readout,
.oc-slider__track:focus-visible ~ .oc-slider__readout {
  opacity: 1;
}

.oc-slider__rail {
  position: relative;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: var(--oc-radius-full);
  background: var(--oc-slider-rail-background, var(--oc-border-default));
}

.oc-slider__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--oc-slider-fill-background, var(--oc-accent));
}

/* 刻度排在滑轨内部，由滑轨自己的圆角与 overflow 裁齐：两端不再从滑轨边界探出去。 */
.oc-slider__ticks {
  position: absolute;
  inset-inline: 0;
  top: 50%;
  height: var(--oc-space-2);
  pointer-events: none;
  transform: translateY(-50%);
}

.oc-slider__tick {
  position: absolute;
  top: 50%;
  width: var(--oc-border-width);
  height: 100%;
  background: var(--oc-border-strong);
  transform: translate(-50%, -50%);
}

.oc-slider__tick.is-filled {
  background: var(--oc-accent-fg);
}

/* 单色实心圆，和开关的小圆同一套做法：一条干净的外缘，不加描边。 */
.oc-slider__thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--oc-slider-thumb-background, var(--oc-accent));
  box-shadow: var(--oc-slider-thumb-shadow);
  transform: translate(-50%, -50%);
}

.oc-slider__track:focus-visible {
  outline: none;
}

.oc-slider__track:focus-visible .oc-slider__thumb {
  box-shadow: var(--oc-slider-thumb-focus-shadow);
}

.oc-slider.is-disabled {
  cursor: not-allowed;
  opacity: .5;
}
</style>
