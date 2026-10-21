<template>
  <OcOptionGroup
    :options="verticalAlignOptions"
    :model-value="currentValue"
    aria-label="Vertical align position"
    :columns="3"
    fill
    icon-only
    :disabled="definition.isReadonly"
    @update:modelValue="emit('update:value', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'
import OcOptionGroup, { type OcOption } from '../../../../components/standard/OcOptionGroup.vue'

const verticalAlignOptions: OcOption[] = [
  { value: 'top', label: 'Top', icon: 'mdiFormatVerticalAlignTop' },
  { value: 'center', label: 'Center', icon: 'mdiFormatVerticalAlignCenter' },
  { value: 'bottom', label: 'Bottom', icon: 'mdiFormatVerticalAlignBottom' },
]

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'verticalAlignPosition' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const currentValue = computed(() => {
  const value = typeof props.value === 'string' ? props.value : ''
  return verticalAlignOptions.some((option) => option.value === value) ? value : 'top'
})
</script>
