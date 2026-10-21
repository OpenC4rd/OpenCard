<template>
  <OcOptionGroup
    :options="alignOptions"
    :model-value="currentValue"
    aria-label="Align position"
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

const alignOptions: OcOption[] = [
  { value: 'start', label: 'Start', icon: 'mdiFormatAlignLeft' },
  { value: 'center', label: 'Center', icon: 'mdiFormatAlignCenter' },
  { value: 'end', label: 'End', icon: 'mdiFormatAlignRight' },
  { value: 'justify', label: 'Justify', icon: 'mdiFormatAlignJustify' },
]

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'alignPosition' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const currentValue = computed(() => {
  const value = typeof props.value === 'string' ? props.value : ''
  return alignOptions.some((option) => option.value === value) ? value : 'start'
})
</script>

