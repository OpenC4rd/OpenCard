<template>
  <span ref="rootRef" class="oc-color-picker" :class="[{ 'is-open': open }, attrs.class]" :style="attrs.style">
    <OcFieldFrame v-if="variant === 'field'" class="oc-color-picker__field"
      size="md" full-width :disabled="disabled" :style="fieldStyle">
      <template #prefix>
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
          @keydown.esc.stop="closePicker(true, true)"
        >
          <span class="oc-color-picker__field-dot" />
        </button>
      </template>
      <OcFieldInput
        class="oc-color-picker__field-input"
        variant="plain"
        size="sm"
        :value="hexDraft"
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
    </OcFieldFrame>
    <button
      v-else
      ref="triggerRef"
      :data-tooltip="label"
      v-bind="triggerAttrs"
      type="button"
      class="oc-color-picker__trigger"
      :class="[
        `oc-color-picker__trigger--${size}`,
        `oc-color-picker__trigger--${variant}`,
        { 'is-embedded': embedded },
      ]"
      :disabled="disabled"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="togglePicker"
      @keydown.esc.stop="closePicker(true, true)"
    >
      <slot name="trigger" :color="displayColor" :open="open">
        <span class="oc-color-picker__swatch" :style="{ backgroundColor: displayColor }" />
      </slot>
    </button>

    <OcFloatingLayer
      :open="open"
      :anchor="triggerRef"
      placement="bottom-start"
      :max-height="360"
      :z-index="zIndex"
      class="oc-color-picker__floating oc-floating-layer--surface"
      :data-oc-color-owner="pickerId"
    >
      <div class="oc-color-picker__panel" role="dialog" :aria-label="label" @keydown.esc.stop.prevent="closePicker(true, true)">
        <div
          v-if="inputMode === 'hex'"
          ref="saturationRef"
          class="oc-color-picker__saturation"
          :style="{ backgroundColor: `hsl(${hsva.hue} 100% 50%)` }"
          role="slider"
          tabindex="0"
          aria-label="Saturation and brightness"
          :aria-valuetext="`${Math.round(hsva.saturation * 100)}%, ${Math.round(hsva.value * 100)}%`"
          @pointerdown="startDrag('saturation', $event)"
          @keydown="handleSaturationKeydown"
        >
          <span class="oc-color-picker__cursor" :style="saturationCursorStyle" />
        </div>

        <div class="oc-color-picker__channel-sliders">
          <label v-for="slider in sliderChannels" :key="slider.key"
            class="oc-color-picker__slider-row">
            <span>{{ slider.label }}</span>
            <OcSlider class="oc-color-picker__channel-slider"
              :model-value="slider.value" :min="slider.min" :max="slider.max" :step="slider.step"
              :aria-label="slider.ariaLabel" :style="slider.style"
              @preview="previewSliderChannel(slider.key, $event)" @commit="commitColor()" />
          </label>
        </div>

        <label v-if="allowAlpha" class="oc-color-picker__slider-row">
          <span>A</span>
          <OcSlider class="oc-color-picker__channel-slider"
            :model-value="Math.round(hsva.alpha * 100)" :min="0" :max="100" :step="1"
            aria-label="Alpha" :style="alphaSliderStyle"
            @preview="previewSliderChannel('alpha', $event)" @commit="commitColor()" />
        </label>

        <div class="oc-color-picker__mode-row">
          <span class="oc-color-picker__preview" :style="{ backgroundColor: displayColor }" />
          <OcOptionGroup v-model="inputMode" class="oc-color-picker__mode"
            :options="inputModeOptions" appearance="sliding-outline" size="sm" fill />
        </div>

        <div class="oc-color-picker__channels" :style="channelGridStyle(channelFields.length)">
          <OcFieldFrame v-for="channel in channelFields" :key="channel.key" size="sm"
            full-width
          >
            <template #prefix>
              <span class="oc-color-picker__channel-label">{{ channel.label }}</span>
            </template>
            <OcFieldInput
              class="oc-color-picker__channel-input"
              variant="plain"
              size="sm"
              :type="channel.type"
              :value="channel.value"
              :min="channel.min"
              :max="channel.max"
              :step="channel.step"
              :maxlength="channel.maxLength"
              :aria-label="channel.ariaLabel"
              spellcheck="false"
              @blur="commitChannel(channel.key, $event)"
              @keydown.enter.prevent="commitChannel(channel.key, $event)"
            />
          </OcFieldFrame>
        </div>

        <div class="oc-color-picker__presets" aria-label="Preset colors">
          <button
            v-for="preset in presetColors"
            :key="preset"
            type="button"
            class="oc-color-picker__preset"
            :class="{ 'is-selected': preset === displayColor }"
            :style="{ backgroundColor: preset }"
            :aria-label="preset"
            :data-tooltip="preset"
            @click="commitColor(preset)"
          />
        </div>
      </div>
    </OcFloatingLayer>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, useId, watch, type CSSProperties } from 'vue'
import { clamp } from '../../shared/model/number'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcFloatingLayer from './OcFloatingLayer.vue'
import OcOptionGroup, { type OcOption } from './OcOptionGroup.vue'
import OcSlider from './OcSlider.vue'
import {
  getReadableForegroundColor,
  hexToHsva,
  hsvaToHex,
  hsvaToRgba,
  normalizeHexColor,
  rgbaToHex,
  rgbaToHsva,
  type HsvaColor,
} from './colorModel'

type ColorInputMode = 'hex' | 'rgb' | 'hsv'
type ColorChannelKey = 'hex' | 'red' | 'green' | 'blue' | 'hue' | 'saturation' | 'value' | 'alpha'

interface ColorChannelField {
  key: ColorChannelKey
  label: string
  ariaLabel: string
  type: 'text' | 'number'
  value: string | number
  min?: number
  max?: number
  step?: number
  maxLength?: number
}

interface ColorSliderField {
  key: Exclude<ColorChannelKey, 'hex'>
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  style: CSSProperties
}

defineOptions({ name: 'OcColorPicker', inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  disabled?: boolean
  embedded?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'field'
  zIndex?: number
  presets?: readonly string[]
  allowAlpha?: boolean
}>(), {
  modelValue: '#000000',
  label: 'Choose color',
  disabled: false,
  embedded: false,
  size: 'md',
  variant: 'default',
  zIndex: 2000,
  presets: () => ['#FFFFFF', '#B8B8B8', '#1F2430', '#000000', '#F14C4C', '#F59E0B', '#3FB950', '#58A6FF', '#7C6CFF', '#A855F7'],
  allowAlpha: true,
})

const emit = defineEmits<{
  preview: [value: string]
  commit: [value: string]
  cancel: []
  'update:modelValue': [value: string]
  'open-change': [open: boolean]
}>()

const attrs = useAttrs()
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const saturationRef = ref<HTMLElement | null>(null)
const open = ref(false)
const initialColor = normalizePickerColor(props.modelValue) ?? '#000000'
const hsva = ref<HsvaColor>(hexToHsva(initialColor) ?? { hue: 0, saturation: 0, value: 0, alpha: 1 })
const hexDraft = ref(initialColor)
const committedValue = ref(hexDraft.value)
const inputMode = ref<ColorInputMode>('hex')
const pickerId = `oc-color-${useId().replace(/:/g, '')}`
let dragKind: 'saturation' | null = null
let dragPointerId: number | null = null

const inputModeOptions: readonly OcOption[] = [
  { value: 'hex', label: 'HEX' },
  { value: 'rgb', label: 'RGB' },
  { value: 'hsv', label: 'HSV' },
]

const triggerAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const normalizedDraft = computed(() => normalizePickerColor(hexDraft.value))
const displayColor = computed(() => normalizedDraft.value ?? hsvaToHex(hsva.value))
const opaqueColor = computed(() => hsvaToHex({ ...hsva.value, alpha: 1 }))
const rgba = computed(() => hsvaToRgba(hsva.value))
const presetColors = computed(() => props.presets
  .map(color => normalizePickerColor(color))
  .filter((color): color is string => Boolean(color)))
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
const alphaSliderStyle = computed<CSSProperties>(() => colorSliderStyle(
  `linear-gradient(to right, transparent, ${opaqueColor.value})`,
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
const fieldStyle = computed<CSSProperties>(() => {
  return {
    backgroundColor: displayColor.value,
    color: getReadableForegroundColor(opaqueColor.value),
  }
})

watch(() => props.modelValue, value => {
  if (open.value || dragKind) return
  syncColor(value)
})

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown, true))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  stopDragListeners()
})

function syncColor(value: string): void {
  const normalized = normalizePickerColor(value) ?? '#000000'
  const nextHsva = hexToHsva(normalized)
  if (!nextHsva) return
  committedValue.value = normalized
  hexDraft.value = normalized
  hsva.value = preserveAchromaticAxes(nextHsva, hsva.value)
}

function setOpen(next: boolean): void {
  if (open.value === next) return
  open.value = next
  emit('open-change', next)
}

function togglePicker(): void {
  if (props.disabled) return
  if (open.value) closePicker(false, false)
  else {
    if (props.variant !== 'field') syncColor(props.modelValue)
    setOpen(true)
  }
}

function closePicker(restoreFocus: boolean, cancelDraft: boolean): void {
  const hasUncommittedPreview = cancelDraft && displayColor.value !== committedValue.value
  if (hasUncommittedPreview) {
    syncDraft(committedValue.value, true)
    emit('cancel')
  }
  setOpen(false)
  stopDragListeners()
  if (restoreFocus) triggerRef.value?.focus()
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
  hexDraft.value = hsvaToHex(next)
  emit('preview', hexDraft.value)
}

function commitColor(value = displayColor.value): void {
  const normalized = normalizePickerColor(value)
  if (!normalized) return
  syncDraft(normalized, true)
  committedValue.value = normalized
  emit('update:modelValue', normalized)
  emit('commit', normalized)
}

function startDrag(kind: 'saturation', event: PointerEvent): void {
  if (event.button !== 0) return
  event.preventDefault()
  dragKind = kind
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
  document.removeEventListener('pointermove', handlePointerMove)
  document.removeEventListener('pointerup', handlePointerUp)
  document.removeEventListener('pointercancel', handlePointerUp)
}

function updateFromPointer(event: PointerEvent): void {
  const target = saturationRef.value
  if (!target || !dragKind) return
  const rect = target.getBoundingClientRect()
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
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  hexDraft.value = target.value
  const normalized = normalizePickerColor(target.value)
  if (normalized) syncDraft(normalized, true)
}

function commitInlineDraft(): void {
  if (normalizedDraft.value) commitColor(normalizedDraft.value)
  else restoreInlineDraft()
}

function restoreInlineDraft(): void {
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

function previewSliderChannel(key: Exclude<ColorChannelKey, 'hex'>, value: number): void {
  applyChannelValue(key, value)
}

function applyChannelValue(key: Exclude<ColorChannelKey, 'hex'>, value: number): void {
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
  key: Exclude<ColorChannelKey, 'hex'>,
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

function channelGridStyle(count: number): CSSProperties {
  return { '--oc-color-channel-count': count }
}

function normalizePickerColor(value: string): string | null {
  const normalized = normalizeHexColor(value)
  if (!normalized) return null
  if (!props.allowAlpha && normalized.length === 9) return normalized.slice(0, 7)
  return normalized
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const path = event.composedPath()
  if (rootRef.value && path.includes(rootRef.value)) return
  const insideFloating = path.some(target => (
    target instanceof HTMLElement && target.dataset.ocColorOwner === pickerId
  ))
  if (!insideFloating) closePicker(false, true)
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
  border-radius: var(--oc-radius-sm);
  background: var(--oc-bg-input);
  color: var(--oc-fg-default);
  cursor: pointer;
}

.oc-color-picker__trigger--sm {
  width: var(--oc-size-sm);
  height: var(--oc-size-sm);
  padding: 3px;
}

.oc-color-picker__trigger--lg {
  width: var(--oc-size-lg);
  height: var(--oc-size-lg);
}

.oc-color-picker__field {
  width: 100%;
}

.oc-color-picker__field-trigger {
  box-sizing: border-box;
  display: grid;
  flex: 0 0 var(--oc-size-sm);
  width: var(--oc-size-sm);
  height: 100%;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.oc-color-picker__field-dot {
  width: 10px;
  height: 10px;
  border: var(--oc-border-width) solid currentColor;
  border-radius: var(--oc-radius-full);
  background: transparent;
}

.oc-color-picker__field-input {
  height: 100%;
  padding: 0 var(--oc-space-2) 0 0;
  font-size: var(--oc-text-xs);
  text-align: right;
  text-transform: uppercase;
}

.oc-color-picker__field-trigger:disabled,
.oc-color-picker__field-input:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.oc-color-picker__trigger.is-embedded {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
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

<style>
.oc-color-picker__floating {
  width: 220px;
  overflow: hidden;
}

.oc-color-picker__panel {
  display: grid;
  gap: var(--oc-space-2);
  padding: var(--oc-space-3);
}

.oc-color-picker__saturation {
  position: relative;
  height: var(--oc-color-picker-plane-height);
  overflow: hidden;
  border-radius: var(--oc-radius-sm);
  background-image:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent);
  cursor: crosshair;
  touch-action: none;
}

.oc-color-picker__cursor {
  position: absolute;
  pointer-events: none;
  transform: translate(-50%, -50%);
  border: var(--oc-color-channel-handle-border-width) solid var(--oc-color-channel-handle-border-color);
  border-radius: 50%;
  box-shadow: var(--oc-color-channel-handle-shadow);
}

.oc-color-picker__cursor {
  width: 10px;
  height: 10px;
}

.oc-color-picker__saturation:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}

.oc-color-picker__channel-sliders {
  display: grid;
  gap: var(--oc-space-1);
}

.oc-color-picker__slider-row {
  display: grid;
  grid-template-columns: var(--oc-size-sm) minmax(0, 1fr);
  align-items: center;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
}

.oc-color-picker__channel-slider {
  min-width: 0;
  height: var(--oc-color-channel-handle-height);
}

.oc-color-picker__channel-slider .oc-slider__rail {
  height: var(--oc-color-channel-track-height);
}

.oc-color-picker__channel-slider .oc-slider__thumb {
  width: var(--oc-color-channel-handle-width);
  height: var(--oc-color-channel-handle-height);
  border: var(--oc-color-channel-handle-border-width) solid var(--oc-color-channel-handle-border-color);
  border-radius: var(--oc-radius-full);
  background: transparent;
  box-shadow: var(--oc-color-channel-handle-shadow);
  transition: none;
}

.oc-color-picker__mode-row {
  display: grid;
  grid-template-columns: var(--oc-size-md) minmax(0, 1fr);
  gap: var(--oc-space-2);
  align-items: center;
}

.oc-color-picker__mode {
  width: 100%;
}

.oc-color-picker__preview {
  width: var(--oc-size-md);
  height: var(--oc-size-md);
  border-radius: var(--oc-radius-sm);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--oc-border-strong) 55%, transparent);
}

.oc-color-picker__channels {
  display: grid;
  grid-template-columns: repeat(var(--oc-color-channel-count), minmax(0, 1fr));
  gap: var(--oc-space-1);
}

.oc-color-picker__channel-label {
  display: inline-flex;
  align-items: center;
  padding-inline-start: var(--oc-space-1);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
}

.oc-color-picker__channel-input {
  padding-inline: var(--oc-space-1);
  text-align: right;
}

.oc-color-picker__channel-input[type='number'] {
  appearance: textfield;
}

.oc-color-picker__channel-input::-webkit-inner-spin-button,
.oc-color-picker__channel-input::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.oc-color-picker__presets {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 3px;
}

.oc-color-picker__preset {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 1px solid var(--oc-border-default);
  border-radius: 2px;
  cursor: pointer;
}

.oc-color-picker__preset.is-selected {
  box-shadow: 0 0 0 1px var(--oc-bg-surface), 0 0 0 2px var(--oc-accent);
}
</style>
