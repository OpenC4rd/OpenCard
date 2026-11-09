<template>
  <OcJsonEditor
    class="object-property-field"
    :model-value="normalizedValue"
    :readonly="definition.isReadonly"
    @update:model-value="emit('update:value', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'
import OcJsonEditor from '../../../../components/standard/OcJsonEditor.vue'

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'object' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: unknown): void
}>()

const normalizedValue = computed(() => {
  if (props.value !== undefined) {
    return props.value
  }
  return {}
})
</script>

<style scoped>
.object-property-field {
  width: 100%;
}
</style>
