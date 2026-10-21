<template>
  <div class="anchor-position-field">
    <OcOptionGroup
      class="anchor-grid"
      :options="anchorOptions"
      :model-value="currentValue"
      aria-label="Anchor position"
      :columns="3"
      :disabled="definition.isReadonly"
      square
      fill
      icon-only
      @update:modelValue="emit('update:value', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import OcOptionGroup from '../../../../components/standard/OcOptionGroup.vue'
import type { OcOption } from '../../../../components/standard/OcOptionGroup.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

const anchorOptions: OcOption[] = [
  { value: 'lt', label: 'Left Top', icon: 'mdiArrowTopLeftThin' },
  { value: 'ct', label: 'Center Top', icon: 'mdiArrowUpThin' },
  { value: 'rt', label: 'Right Top', icon: 'mdiArrowTopRightThin' },
  { value: 'lc', label: 'Left Center', icon: 'mdiArrowLeftThin' },
  { value: 'cc', label: 'Center Center', icon: 'mdiCircleMedium' },
  { value: 'rc', label: 'Right Center', icon: 'mdiArrowRightThin' },
  { value: 'lb', label: 'Left Bottom', icon: 'mdiArrowBottomLeftThin' },
  { value: 'cb', label: 'Center Bottom', icon: 'mdiArrowDownThin' },
  { value: 'rb', label: 'Right Bottom', icon: 'mdiArrowBottomRightThin' },
]

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'anchorPosition' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const currentValue = computed(() => {
  const value = typeof props.value === 'string' ? props.value : ''
  return anchorOptions.some((option) => option.value === value) ? value : 'cc'
})
</script>

<style scoped>
.anchor-position-field {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
}

.anchor-grid {
  --anchor-grid-max-size: calc(var(--oc-table-row-height) * 3 - var(--oc-border-width));
  width: var(--anchor-grid-max-size);
  max-width: var(--anchor-grid-max-size);
}

</style>
