<!-- 颜色面板：只读父层传入的渲染状态，所有交互以事件交回 OcColorPicker。 -->
<template>
  <div class="oc-color-picker__panel" role="dialog" :aria-label="label" @keydown.esc.stop.prevent="emit('escape')">
    <div
      v-if="inputMode === 'hex'"
      ref="saturationRef"
      class="oc-color-picker__saturation"
      :style="{ backgroundColor: `hsl(${hsva.hue} 100% 50%)` }"
      role="slider"
      tabindex="0"
      aria-label="Saturation and brightness"
      :aria-valuetext="`${Math.round(hsva.saturation * 100)}%, ${Math.round(hsva.value * 100)}%`"
      @pointerdown="startDrag"
      @keydown="emit('saturation-keydown', $event)"
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
          @preview="emit('preview-channel', slider.key, $event)" @commit="emit('commit')" />
      </label>
    </div>

    <label v-if="allowAlpha" class="oc-color-picker__slider-row">
      <span>A</span>
      <OcSlider class="oc-color-picker__channel-slider"
        :model-value="Math.round(hsva.alpha * 100)" :min="0" :max="100" :step="1"
        aria-label="Alpha" :style="alphaSliderStyle"
        @preview="emit('preview-channel', 'alpha', $event)" @commit="emit('commit')" />
    </label>

    <div class="oc-color-picker__mode-row">
      <span class="oc-color-picker__preview" :style="{ backgroundColor: displayColor }" />
      <OcOptionGroup :model-value="inputMode" class="oc-color-picker__mode"
        :options="inputModeOptions" appearance="sliding-outline" size="sm" fill
        @update:model-value="selectInputMode" />
    </div>

    <div class="oc-color-picker__channels" :style="channelGridStyle">
      <OcFieldFrame v-for="channel in channelFields" :key="channel.key" size="md"
        full-width
      >
        <template #prefix>
          <span class="oc-color-picker__channel-label">{{ channel.label }}</span>
        </template>
        <OcFieldInput
          class="oc-color-picker__channel-input"
          variant="plain"
          size="md"
          :type="channel.type"
          :value="channel.value"
          :min="channel.min"
          :max="channel.max"
          :step="channel.step"
          :maxlength="channel.maxLength"
          :aria-label="channel.ariaLabel"
          spellcheck="false"
          @blur="emit('channel-input', channel.key, $event)"
          @keydown.enter.prevent="emit('channel-input', channel.key, $event)"
        />
      </OcFieldFrame>
    </div>

    <div class="oc-color-picker__presets" aria-label="Preset colors">
      <button
        v-for="preset in presets"
        :key="preset"
        type="button"
        class="oc-color-picker__preset"
        :class="{ 'is-selected': preset === displayColor }"
        :style="{ backgroundColor: preset }"
        :aria-label="preset"
        :data-tooltip="preset"
        @click="emit('commit', preset)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import type { CSSProperties } from 'vue'
import type { HsvaColor } from './colorModel'

export type ColorInputMode = 'hex' | 'rgb' | 'hsv'
export type ColorChannelKey = 'hex' | 'red' | 'green' | 'blue' | 'hue' | 'saturation' | 'value' | 'alpha'
export type ColorSliderKey = Exclude<ColorChannelKey, 'hex'>

export interface ColorChannelField {
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

export interface ColorSliderField {
  key: ColorSliderKey
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  style: CSSProperties
}

/** 饱和度拖拽把发生地的元素一并交给父层：坐标换算仍由父层负责。 */
export interface ColorDragStart {
  event: PointerEvent
  element: HTMLElement | null
}

/** 面板渲染所需的全部状态都由父层提供。 */
interface ColorPanelProps {
  label?: string
  hsva: HsvaColor
  inputMode: ColorInputMode
  allowAlpha: boolean
  displayColor: string
  presets: readonly string[]
  saturationCursorStyle: CSSProperties
  sliderChannels: readonly ColorSliderField[]
  channelFields: readonly ColorChannelField[]
  alphaSliderStyle: CSSProperties
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcOptionGroup, { type OcOption } from './OcOptionGroup.vue'
import OcSlider from './OcSlider.vue'

defineOptions({ name: 'OcColorPanel', inheritAttrs: false })

const props = withDefaults(defineProps<ColorPanelProps>(), {
  label: 'Choose color',
})

const emit = defineEmits<{
  'drag-start': [payload: ColorDragStart]
  'saturation-keydown': [event: KeyboardEvent]
  commit: [value?: string]
  'preview-channel': [key: ColorSliderKey, value: number]
  'update:inputMode': [mode: ColorInputMode]
  'channel-input': [key: ColorChannelKey, event: Event]
  escape: []
}>()

const inputModeOptions: readonly OcOption[] = [
  { value: 'hex', label: 'HEX' },
  { value: 'rgb', label: 'RGB' },
  { value: 'hsv', label: 'HSV' },
]

const saturationRef = ref<HTMLElement | null>(null)
const channelGridStyle = computed<CSSProperties>(() => ({
  '--oc-color-channel-count': props.channelFields.length,
}))

function startDrag(event: PointerEvent): void {
  emit('drag-start', { event, element: saturationRef.value })
}

function selectInputMode(mode: string): void {
  emit('update:inputMode', mode as ColorInputMode)
}
</script>

<style>
.oc-color-picker__panel {
  box-sizing: border-box;
  display: grid;
  gap: var(--oc-space-xs);
  /* 一行要放下 4 个「前缀标签 + 三位数」的 md 字段：220px 会把 255 的末位裁掉。 */
  width: 264px;
  max-height: inherit;
  padding: var(--oc-space-sm);
  overflow-y: auto;
}

.oc-color-picker__saturation {
  position: relative;
  height: var(--oc-color-picker-plane-height);
  overflow: hidden;
  border-radius: var(--oc-radius-control);
  background-image:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent);
  cursor: crosshair;
  touch-action: none;
}

.oc-color-picker__cursor {
  position: absolute;
  width: 10px;
  height: 10px;
  pointer-events: none;
  transform: translate(-50%, -50%);
  border: var(--oc-color-channel-handle-border-width) solid var(--oc-color-channel-handle-border-color);
  border-radius: 50%;
  box-shadow: var(--oc-color-channel-handle-shadow);
}

.oc-color-picker__saturation:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}

.oc-color-picker__channel-sliders {
  display: grid;
  gap: var(--oc-space-2xs);
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
  border-radius: var(--oc-radius-pill);
  background: transparent;
  box-shadow: var(--oc-color-channel-handle-shadow);
  transition: none;
}

.oc-color-picker__mode-row {
  display: grid;
  grid-template-columns: var(--oc-size-md) minmax(0, 1fr);
  gap: var(--oc-space-xs);
  align-items: center;
}

.oc-color-picker__mode {
  width: 100%;
}

.oc-color-picker__preview {
  width: var(--oc-size-md);
  height: var(--oc-size-md);
  border-radius: var(--oc-radius-control);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--oc-border-strong) 55%, transparent);
}

.oc-color-picker__channels {
  display: grid;
  grid-template-columns: repeat(var(--oc-color-channel-count), minmax(0, 1fr));
  gap: var(--oc-space-2xs);
}

.oc-color-picker__channel-label {
  display: inline-flex;
  align-items: center;
  padding-inline-start: var(--oc-space-2xs);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
}

.oc-color-picker__channel-input {
  padding-inline: var(--oc-space-2xs);
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
  gap: var(--oc-space-2xs);
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
