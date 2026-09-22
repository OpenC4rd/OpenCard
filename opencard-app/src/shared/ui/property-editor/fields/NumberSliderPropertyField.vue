<!-- 数字滑块字段：数值在悬停、拖动或键盘聚焦时显示在拇指上方，平时把滑轨宽度全部让出来。 -->
<template>
  <OcSlider
    :model-value="sliderValue"
    :min="definition.min"
    :max="definition.max"
    :step="definition.step"
    :ticks="definition.ticks"
    :disabled="definition.isReadonly"
    :value-text="valueText"
    :aria-label="definition.title"
    @preview="handleSliderPreview"
    @commit="handleSliderCommit"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import OcSlider from '../../../../components/standard/OcSlider.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'number' }>
  value: unknown
}>()

const emit = defineEmits<{
  'preview:value': [value: string]
  'update:value': [value: string]
}>()

/** 拖动过程中的即时值：即使上层不响应 preview，读数与手柄也保持一致。 */
const draftValue = ref<number | null>(null)

const numberValue = computed(() => {
  const value = Number(props.value)
  if (Number.isFinite(value)) return value
  return props.definition.min ?? 0
})
const sliderValue = computed(() => draftValue.value ?? numberValue.value)
const valueText = computed(() => `${sliderValue.value}${props.definition.suffix ?? ''}`)

watch(() => props.value, () => {
  draftValue.value = null
})

function handleSliderPreview(value: number): void {
  draftValue.value = value
  emit('preview:value', String(value))
}

function handleSliderCommit(value: number): void {
  draftValue.value = value
  emit('update:value', String(value))
}
</script>
