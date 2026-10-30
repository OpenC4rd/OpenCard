<template>
  <span ref="rootRef" class="oc-color-picker" :class="[{ 'is-open': open }, attrs.class]" :style="attrs.style">
    <OcFieldFrame v-if="variant === 'field'" class="oc-color-picker__field"
      size="md" full-width :disabled="disabled" :style="fieldStyle">
      <OcFieldInput
        class="oc-color-picker__field-input"
        variant="plain"
        size="sm"
        :value="mixed && !open && !inlineEditing ? '' : hexDraft"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-label="label"
        style="color: inherit"
        spellcheck="false"
        :maxlength="allowAlpha ? 9 : 7"
        @input="handleHexInput"
        @blur="commitInlineDraft"
        @keydown.enter.prevent="commitInlineDraft"
        @keydown.esc.stop.prevent="restoreInlineDraft"
      />
      <template #suffix>
        <button
          ref="triggerRef"
          v-bind="triggerAttrs"
          type="button"
          class="oc-color-picker__field-trigger"
          :disabled="disabled"
          :aria-label="label"
          :aria-expanded="open"
          aria-haspopup="dialog"
          @click="togglePicker"
          @keydown.esc.stop="closePicker(true)"
        >
          <span class="oc-color-picker__field-dot" />
        </button>
      </template>
    </OcFieldFrame>
    <button
      v-else
      ref="triggerRef"
      :data-tooltip="label"
      v-bind="triggerAttrs"
      type="button"
      class="oc-color-picker__trigger"
      :class="[
        `oc-color-picker__trigger--${variant}`,
      ]"
      :disabled="disabled"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="togglePicker"
      @keydown.esc.stop="closePicker(true)"
    >
      <slot name="trigger" :color="mixed && !open ? 'transparent' : displayColor" :open="open">
        <span class="oc-color-picker__swatch" :style="{ backgroundColor: mixed && !open ? 'transparent' : displayColor }" />
      </slot>
    </button>

    <OcOverlayMarker
      ref="layer"
      :group="pickerKey"
      :anchor="variant === 'field' ? rootRef : triggerRef"
      :owner="rootRef"
      placement="bottom-start"
      :max-height="360"
      :open="open"
      @update:open="open = $event"
    >
      <OcColorPanel
        :label="label"
        :hsva="hsva"
        :input-mode="inputMode"
        :allow-alpha="allowAlpha"
        :display-color="displayColor"
        :presets="presetColors"
        :saturation-cursor-style="saturationCursorStyle"
        :slider-channels="sliderChannels"
        :channel-fields="channelFields"
        :alpha-slider-style="alphaSliderStyle"
        @drag-start="handleDragStart"
        @commit="commitColor"
        @preview-channel="previewSliderChannel"
        @update:input-mode="setInputMode"
        @channel-input="commitChannel"
        @saturation-keydown="handleSaturationKeydown"
        @escape="handlePanelEscape"
      />
    </OcOverlayMarker>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useAttrs, useId, watch, type CSSProperties } from 'vue'
import { clamp } from '../../shared/model/number'
import { useOverlayDismiss } from '../../shared/ui/useOverlayDismiss'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcColorPanel, {
  type ColorChannelField,
  type ColorChannelKey,
  type ColorDragStart,
  type ColorInputMode,
  type ColorSliderField,
  type ColorSliderKey,
} from './OcColorPanel.vue'
import OcOverlayMarker from './OcOverlayMarker.vue'
import {
  getReadableForegroundColor,
  hexToHsva,
  hexToRgba,
  hsvaToHex,
  hsvaToRgba,
  normalizeHexColor,
  rgbaToHex,
  rgbaToHsva,
  type HsvaColor,
} from './colorModel'

defineOptions({ name: 'OcColorPicker', inheritAttrs: false })

const PRESETS: readonly string[] = ['#FFFFFF', '#B8B8B8', '#1F2430', '#000000', '#F14C4C', '#F59E0B', '#3FB950', '#58A6FF', '#7C6CFF', '#A855F7']
/** 半透明色的棋盘格：8px 一格、实显 4px 方块，28px 的字段和 12px 的滑轨都是它的整数倍。 */
const ALPHA_CHECKER = 'repeating-conic-gradient(color-mix(in srgb, var(--oc-fg-default) 14%, transparent) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px'

const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  disabled?: boolean
  variant?: 'default' | 'field'
  allowAlpha?: boolean
  /** Values differ across the current selection; no single swatch is implied. */
  mixed?: boolean
  /** Text shown in the field when the selection has no single value. */
  placeholder?: string
}>(), {
  modelValue: '#000000',
  label: 'Choose color',
  disabled: false,
  variant: 'default',
  allowAlpha: true,
  mixed: false,
  placeholder: '',
})

const emit = defineEmits<{
  preview: [value: string]
  commit: [value: string]
  cancel: []
  'open-change': [open: boolean]
}>()

const attrs = useAttrs()
const layer = ref<InstanceType<typeof OcOverlayMarker> | null>(null)
// 每实例一个组：picker 是「点击打开 + 外部点击关闭」，点另一个 picker 时
// dismiss 的 pointerdown 会先把旧的关掉，共享组只会变成「先关后开」，滑不起来。
const pickerKey = `color-picker:${useId()}`
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const initialColor = normalizePickerColor(props.modelValue) ?? '#000000'
const hsva = ref<HsvaColor>(hexToHsva(initialColor) ?? { hue: 0, saturation: 0, value: 0, alpha: 1 })
const hexDraft = ref(initialColor)
const committedValue = ref(hexDraft.value)
const inlineEditing = ref(false)
const inputMode = ref<ColorInputMode>('hex')
let dragKind: 'saturation' | null = null
let dragPointerId: number | null = null
let dragElement: HTMLElement | null = null
/** 触发按钮关闭时保留当前预览；只有宿主关层才撤销未提交的预览。 */

/** 由宿主同步出来的打开状态：它既是渲染输入（aria），也是 marker 的打开意图。 */
const open = ref(false)

const triggerAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

useOverlayDismiss(() => open.value, () => rootRef.value, () => closePicker(false))

const normalizedDraft = computed(() => normalizePickerColor(hexDraft.value))
// 面板的当前色只由 hsva 决定；hexDraft 是输入框的编辑缓冲，不能反过来盖住面板。
const displayColor = computed(() => hsvaToHex(hsva.value))
const opaqueColor = computed(() => hsvaToHex({ ...hsva.value, alpha: 1 }))
const rgba = computed(() => hsvaToRgba(hsva.value))
const presetColors = PRESETS
  .map(color => normalizePickerColor(color))
  .filter((color): color is string => Boolean(color))
const saturationCursorStyle = computed<CSSProperties>(() => ({
  left: `${hsva.value.saturation * 100}%`,
  top: `${(1 - hsva.value.value) * 100}%`,
}))
const sliderChannels = computed<ColorSliderField[]>(() => {
  if (inputMode.value === 'rgb') {
    return [
      colorSlider('red', 'R', 'Red', rgba.value.red, 255, rgbChannelGradient('red')),
      colorSlider('green', 'G', 'Green', rgba.value.green, 255, rgbChannelGradient('green')),
      colorSlider('blue', 'B', 'Blue', rgba.value.blue, 255, rgbChannelGradient('blue')),
    ]
  }
  if (inputMode.value === 'hsv') {
    return [
      colorSlider('hue', 'H', 'Hue', Math.round(hsva.value.hue), 359, hueGradient()),
      colorSlider('saturation', 'S', 'Saturation', Math.round(hsva.value.saturation * 100), 100, saturationGradient()),
      colorSlider('value', 'V', 'Value', Math.round(hsva.value.value * 100), 100, valueGradient()),
    ]
  }
  return [colorSlider('hue', 'H', 'Hue', Math.round(hsva.value.hue), 359, hueGradient())]
})
/* Alpha 滑轨：颜色渐变叠在棋盘格上，透明端才看得出「这里没有颜色」。 */
const alphaSliderStyle = computed<CSSProperties>(() => colorSliderStyle(
  `linear-gradient(to right, transparent, ${opaqueColor.value}), ${ALPHA_CHECKER}`,
))
const channelFields = computed<ColorChannelField[]>(() => {
  const alphaField: ColorChannelField = {
    key: 'alpha',
    label: 'A',
    ariaLabel: 'Alpha',
    type: 'number',
    value: Math.round(hsva.value.alpha * 100),
    min: 0,
    max: 100,
    step: 1,
  }
  if (inputMode.value === 'rgb') {
    const fields = [
      numericChannel('red', 'R', 'Red', rgba.value.red, 255),
      numericChannel('green', 'G', 'Green', rgba.value.green, 255),
      numericChannel('blue', 'B', 'Blue', rgba.value.blue, 255),
    ]
    return props.allowAlpha ? [...fields, alphaField] : fields
  }
  if (inputMode.value === 'hsv') {
    const fields = [
      numericChannel('hue', 'H', 'Hue', Math.round(hsva.value.hue), 359),
      numericChannel('saturation', 'S', 'Saturation', Math.round(hsva.value.saturation * 100), 100),
      numericChannel('value', 'V', 'Value', Math.round(hsva.value.value * 100), 100),
    ]
    return props.allowAlpha ? [...fields, alphaField] : fields
  }
  const fields: ColorChannelField[] = [{
    key: 'hex', label: '#', ariaLabel: 'HEX', type: 'text', value: opaqueColor.value,
    maxLength: 7,
  }]
  return props.allowAlpha ? [...fields, alphaField] : fields
})
/**
 * 字段底色：跟 hexDraft（输入框里显示的、用户眼下看到的颜色）。
 * 拖拽和滑条也会把即时值写回 hexDraft，所以底色始终等于当前呈现值；
 * 输入到一半非法时退回上一次提交的颜色。
 */
const fieldBackground = computed(() => normalizedDraft.value ?? committedValue.value)
const fieldStyle = computed<CSSProperties>(() => {
  if (props.mixed && !open.value && !inlineEditing.value) return {}
  return {
    ...alphaPreviewStyle(fieldBackground.value),
    color: getReadableForegroundColor(fieldBackground.value.slice(0, 7)),
  }
})

/**
 * 半透明色垫棋盘格：颜色铺在上层、格子在下一层，才看得出「这里真的透明」。
 * 不透明色走普通底色，省掉两层背景图。下层沿用字段自身的表面色，不新增 token。
 */
function alphaPreviewStyle(color: string): CSSProperties {
  if ((hexToRgba(color)?.alpha ?? 1) >= 1) return { backgroundColor: color }
  return {
    background: `linear-gradient(${color}, ${color}), ${ALPHA_CHECKER} var(--oc-field-surface-background, var(--oc-bg-input))`,
  }
}

watch(() => props.modelValue, value => {
  if (open.value || dragKind) return
  syncColor(value)
})
watch(open, isOpen => {
  emit('open-change', isOpen)
  if (isOpen) return
  // 关闭一律走这里：主动关和被别的 picker 抢占都可能是「拖到一半」。
  stopDragListeners()
  cancelUncommittedPreview()
})

onBeforeUnmount(() => {
  stopDragListeners()
  layer.value?.close()
})

function syncColor(value: string): void {
  const normalized = normalizePickerColor(value) ?? '#000000'
  const nextHsva = hexToHsva(normalized)
  if (!nextHsva) return
  committedValue.value = normalized
  hexDraft.value = normalized
  hsva.value = preserveAchromaticAxes(nextHsva, hsva.value)
}

function togglePicker(): void {
  if (props.disabled) return
  if (open.value) closePicker(false)
  else {
    if (props.variant !== 'field') syncColor(props.modelValue)
    open.value = true
  }
}

function closePicker(restoreFocus: boolean): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function cancelUncommittedPreview(): void {
  if (displayColor.value === committedValue.value) return
  syncDraft(committedValue.value, true)
  emit('cancel')
}

function handlePanelEscape(): void {
  closePicker(true)
}

function setInputMode(mode: ColorInputMode): void {
  inputMode.value = mode
}

function syncDraft(value: string, preview: boolean): void {
  const normalized = normalizePickerColor(value)
  const nextHsva = normalized ? hexToHsva(normalized) : null
  if (!normalized || !nextHsva) return
  hexDraft.value = normalized
  hsva.value = preserveAchromaticAxes(nextHsva, hsva.value)
  if (preview) emit('preview', normalized)
}

function preserveAchromaticAxes(next: HsvaColor, previous: HsvaColor): HsvaColor {
  if (next.value === 0) {
    return { ...next, hue: previous.hue, saturation: previous.saturation }
  }
  if (next.saturation === 0) return { ...next, hue: previous.hue }
  return next
}

function previewHsva(next: HsvaColor): void {
  hsva.value = next
  // 拖拽/滑条/键盘调整都是同一个「即时值」：面板、字段和触发器要一起走，
  // 只有写回宿主模型才等 commit —— 上层不响应 preview 时控件也不能停在旧颜色上。
  hexDraft.value = hsvaToHex(next)
  emit('preview', hexDraft.value)
}

function commitColor(value = displayColor.value): void {
  const normalized = normalizePickerColor(value)
  if (!normalized) return
  // 提交只发一次确定值；preview 是拖拽中的临时态，不在这里重复。
  syncDraft(normalized, false)
  committedValue.value = normalized
  emit('commit', normalized)
}

function handleDragStart({ event, element }: ColorDragStart): void {
  if (event.button !== 0 || !element) return
  event.preventDefault()
  dragKind = 'saturation'
  dragElement = element
  dragPointerId = event.pointerId
  updateFromPointer(event)
  document.addEventListener('pointermove', handlePointerMove)
  document.addEventListener('pointerup', handlePointerUp)
  document.addEventListener('pointercancel', handlePointerUp)
}

function handlePointerMove(event: PointerEvent): void {
  if (event.pointerId === dragPointerId) updateFromPointer(event)
}

function handlePointerUp(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId) return
  updateFromPointer(event)
  stopDragListeners()
  commitColor()
}

function stopDragListeners(): void {
  dragKind = null
  dragPointerId = null
  dragElement = null
  document.removeEventListener('pointermove', handlePointerMove)
  document.removeEventListener('pointerup', handlePointerUp)
  document.removeEventListener('pointercancel', handlePointerUp)
}

function updateFromPointer(event: PointerEvent): void {
  if (!dragElement || !dragKind) return
  const rect = dragElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const horizontal = clampUnit((event.clientX - rect.left) / rect.width)
  previewHsva({
    ...hsva.value,
    saturation: horizontal,
    value: 1 - clampUnit((event.clientY - rect.top) / rect.height),
  })
}

function handleSaturationKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 0.1 : 0.02
  let next = hsva.value
  if (event.key === 'ArrowLeft') next = { ...next, saturation: clampUnit(next.saturation - step) }
  else if (event.key === 'ArrowRight') next = { ...next, saturation: clampUnit(next.saturation + step) }
  else if (event.key === 'ArrowDown') next = { ...next, value: clampUnit(next.value - step) }
  else if (event.key === 'ArrowUp') next = { ...next, value: clampUnit(next.value + step) }
  else return
  event.preventDefault()
  previewHsva(next)
  commitColor()
}

function handleHexInput(event: Event): void {
  inlineEditing.value = true
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  hexDraft.value = target.value
  const normalized = normalizePickerColor(target.value)
  if (normalized) syncDraft(normalized, true)
}

function commitInlineDraft(): void {
  if (props.mixed && !inlineEditing.value) return
  inlineEditing.value = false
  if (normalizedDraft.value) commitColor(normalizedDraft.value)
  else restoreInlineDraft()
}

function restoreInlineDraft(): void {
  inlineEditing.value = false
  const changed = displayColor.value !== committedValue.value
  syncDraft(committedValue.value, changed)
  if (changed) emit('cancel')
}

function commitChannel(key: ColorChannelKey, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const rawValue = target.value.trim()
  if (key === 'hex') {
    const normalized = normalizeHexColor(rawValue)
    const next = normalized ? hexToHsva(normalized) : null
    if (!next) {
      target.value = opaqueColor.value
      return
    }
    previewHsva(preserveAchromaticAxes({ ...next, alpha: hsva.value.alpha }, hsva.value))
    commitColor()
    return
  }

  const numericValue = Number(rawValue)
  if (!Number.isFinite(numericValue)) {
    const current = channelFields.value.find(channel => channel.key === key)
    if (current) target.value = String(current.value)
    return
  }
  applyChannelValue(key, numericValue)
  commitColor()
}

function previewSliderChannel(key: ColorSliderKey, value: number): void {
  applyChannelValue(key, value)
}

function applyChannelValue(key: ColorSliderKey, value: number): void {
  if (key === 'alpha') {
    previewHsva({ ...hsva.value, alpha: clamp(value, 0, 100) / 100 })
  } else if (key === 'hue') {
    previewHsva({ ...hsva.value, hue: clamp(value, 0, 359) })
  } else if (key === 'saturation' || key === 'value') {
    previewHsva({ ...hsva.value, [key]: clamp(value, 0, 100) / 100 })
  } else {
    const nextRgba = { ...rgba.value, [key]: clamp(value, 0, 255) }
    previewHsva(preserveAchromaticAxes(rgbaToHsva(nextRgba), hsva.value))
  }
}

function numericChannel(
  key: ColorChannelKey,
  label: string,
  ariaLabel: string,
  value: number,
  max: number,
): ColorChannelField {
  return { key, label, ariaLabel, type: 'number', value, min: 0, max, step: 1 }
}

function colorSlider(
  key: ColorSliderKey,
  label: string,
  ariaLabel: string,
  value: number,
  max: number,
  gradient: string,
): ColorSliderField {
  return { key, label, ariaLabel, value, min: 0, max, step: 1, style: colorSliderStyle(gradient) }
}

function colorSliderStyle(gradient: string): CSSProperties {
  return {
    '--oc-slider-rail-background': gradient,
    '--oc-slider-fill-background': 'transparent',
  }
}

function rgbChannelGradient(channel: 'red' | 'green' | 'blue'): string {
  const start = rgbaToHex({ ...rgba.value, [channel]: 0, alpha: 1 })
  const end = rgbaToHex({ ...rgba.value, [channel]: 255, alpha: 1 })
  return `linear-gradient(to right, ${start}, ${end})`
}

function hueGradient(): string {
  return 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
}

function saturationGradient(): string {
  const start = hsvaToHex({ ...hsva.value, saturation: 0, alpha: 1 })
  const end = hsvaToHex({ ...hsva.value, saturation: 1, alpha: 1 })
  return `linear-gradient(to right, ${start}, ${end})`
}

function valueGradient(): string {
  const end = hsvaToHex({ ...hsva.value, value: 1, alpha: 1 })
  return `linear-gradient(to right, #000000, ${end})`
}

function normalizePickerColor(value: string): string | null {
  const normalized = normalizeHexColor(value)
  if (!normalized) return null
  if (!props.allowAlpha && normalized.length === 9) return normalized.slice(0, 7)
  return normalized
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}
</script>

<style scoped>
.oc-color-picker {
  display: inline-flex;
  min-width: 0;
}

.oc-color-picker__trigger {
  display: inline-grid;
  width: var(--oc-size-md);
  height: var(--oc-size-md);
  padding: 4px;
  place-items: center;
  border: 1px solid var(--oc-border-default);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-input);
  color: var(--oc-fg-default);
  cursor: pointer;
}

.oc-color-picker__field {
  width: 100%;
}

.oc-color-picker__field-trigger {
  box-sizing: border-box;
  display: grid;
  flex: 0 0 var(--oc-size-sm);
  width: var(--oc-size-sm);
  height: var(--oc-size-sm);
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.oc-color-picker__field-dot {
  width: 10px;
  height: 10px;
  border: var(--oc-border-width) solid currentColor;
  border-radius: var(--oc-radius-pill);
  background: transparent;
}

.oc-color-picker__field-input {
  height: 100%;
  padding: 0 0 0 var(--oc-space-xs);
  font-size: var(--oc-text-xs);
  text-align: left;
  text-transform: uppercase;
}

.oc-color-picker__field-trigger:disabled,
.oc-color-picker__field-input:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.oc-color-picker__trigger:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}

.oc-color-picker__trigger:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.oc-color-picker__swatch {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--oc-border-strong) 55%, transparent);
}
</style>
