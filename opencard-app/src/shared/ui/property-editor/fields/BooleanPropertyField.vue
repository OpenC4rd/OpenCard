<template>
  <div class="boolean-field">
    <OcSwitch
      :checked="definition.valueState !== 'mixed' && value === 'true'"
      :disabled="definition.isReadonly"
      @update:checked="emit('update:value', String($event))"
    />
    <!-- 多个对象的取值不一致：开关不表态，旁边写明，拨动后统一成同一个值。 -->
    <OcText v-if="definition.valueState === 'mixed'" tone="muted" size="sm">{{ mixedLabel }}</OcText>
  </div>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import OcSwitch from '../../../../components/base/OcSwitch.vue'
import OcText from '../../../../components/base/OcText.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'boolean' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()
const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string) => string)
  | undefined
const mixedLabel = translate?.('propertyEditor.richText.mixed') ?? '混合'
</script>

<style scoped>
.boolean-field {
  display: flex;
  align-items: center;
  gap: var(--oc-space-xs);
  width: 100%;
  min-height: var(--oc-field-control-height, var(--oc-size-md));
}
</style>
