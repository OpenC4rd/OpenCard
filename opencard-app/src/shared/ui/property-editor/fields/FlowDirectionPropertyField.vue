<template>
  <OcOptionGroup
    :options="directionOptions"
    :model-value="currentValue"
    aria-label="Flow direction"
    :columns="4"
    fill
    icon-only
    :disabled="definition.isReadonly"
    @update:modelValue="emit('update:value', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import OcOptionGroup from '../../../../components/standard/OcOptionGroup.vue'
import type { OcOption } from '../../../../components/standard/OcOptionGroup.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

const directionOptions: OcOption[] = [
  { value: 'lr', label: 'Left to Right', icon: 'mdiArrowRight' },
  { value: 'rl', label: 'Right to Left', icon: 'mdiArrowLeft' },
  { value: 'tb', label: 'Top to Bottom', icon: 'mdiArrowDown' },
  { value: 'bt', label: 'Bottom to Top', icon: 'mdiArrowUp' },
]

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'flowDirection' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const currentValue = computed(() => {
  const value = typeof props.value === 'string' ? props.value : ''
  return directionOptions.some((option) => option.value === value) ? value : 'lr'
})
</script>
