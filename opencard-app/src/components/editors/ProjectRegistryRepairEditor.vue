<template>
  <section class="project-registry-repair" role="alert">
    <div class="project-registry-repair__message">
      <OcIcon name="mdiAlertCircleOutline" tone="danger" />
      <div>
        <strong>{{ heading }}</strong>
        <OcText tone="muted" size="sm">{{ description }}</OcText>
      </div>
    </div>
    <MonacoEditor language="json" :model-value="modelValue" :theme-id="themeId"
      :theme-overrides="themeOverrides" @update:model-value="updateModelValue"
      @save="emit('save')" />
  </section>
</template>

<script setup lang="ts">
import type { OcThemeColorOverrides, OcThemeId } from '../../shared/ui/foundation'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import MonacoEditor from './MonacoEditor.vue'
import type { HistoryOperationMeta } from '../../features/editor-runtime/history/history.types'

defineProps<{
  modelValue: string
  heading: string
  description: string
  themeId: OcThemeId
  themeOverrides: OcThemeColorOverrides
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string, history?: HistoryOperationMeta]
  save: []
}>()

function updateModelValue(value: string, history?: HistoryOperationMeta): void {
  emit('update:modelValue', value, history)
}
</script>

<style scoped>
.project-registry-repair,
.project-registry-repair__message,
.project-registry-repair__message > div {
  display: grid;
}

.project-registry-repair {
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--oc-space-md);
}

.project-registry-repair__message {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--oc-space-sm);
}

.project-registry-repair__message > div {
  gap: var(--oc-space-2xs);
}
</style>
