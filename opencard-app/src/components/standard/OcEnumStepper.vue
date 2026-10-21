<template>
  <OcFieldFrame full-width readonly :disabled="disabled">
    <template #prefix>
      <OcButton type="button" icon-only variant="ghost" icon="mdiArrowLeft"
        :disabled="disabled || currentIndex <= 0" :aria-label="previousLabel" :data-tooltip="previousLabel"
        @click="step(-1)" />
    </template>
    <OcFieldInput variant="plain" full-width readonly :value="currentLabel"
      @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)" />
    <template #suffix>
      <OcButton type="button" icon-only variant="ghost" icon="mdiArrowRight"
        :disabled="disabled || currentIndex >= options.length - 1"
        :aria-label="nextLabel" :data-tooltip="nextLabel" @click="step(1)" />
    </template>
  </OcFieldFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import OcButton from '../base/OcButton.vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'

export type OcEnumStepperOption = {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: readonly OcEnumStepperOption[]
  disabled?: boolean
  previousLabel?: string
  nextLabel?: string
}>(), {
  disabled: false,
  previousLabel: 'Previous option',
  nextLabel: 'Next option',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const currentIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue))
/** 值不在选项里时显示原值：用户仍看得到当前存的是什么，也能用“下一个”进入列表。 */
const currentLabel = computed(() => props.options[currentIndex.value]?.label ?? props.modelValue)

function step(direction: -1 | 1): void {
  if (props.disabled) return
  const option = props.options[currentIndex.value + direction]
  if (option) emit('update:modelValue', option.value)
}
</script>
