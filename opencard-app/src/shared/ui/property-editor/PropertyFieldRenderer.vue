<!-- 纯字段 Renderer：按上级指定的 editorId 渲染编辑器，不拥有模式或 Action。 -->
<template>
  <div class="property-field-renderer" :class="`property-field-renderer--${appearance}`">
    <ReferenceStringPropertyField
      v-if="editorId === 'raw-string'"
      ref="fieldComponent"
      :definition="rawStringDefinition"
      :value="value"
      @update:value="handleCommit"
      @preview:value="emit('preview:value', $event)"
      @cancel:value="emit('cancel:value')"
    />
    <ArrayPropertyField
      v-else-if="isArrayPropertyFieldType(definition.fieldType) && !(definition.fieldType === 'string[]' && definition.listSeparator)"
      ref="fieldComponent"
      :definition="definition"
      :element-component="getArrayPropertyElementComponent(definition.fieldType)"
      :element-definition="toArrayPropertyElementDefinition(definition)"
      :value="value"
      @update:value="handleCommit"
      @preview:value="emit('preview:value', $event)"
      @cancel:value="emit('cancel:value')"
    />
    <component
      v-else
      ref="fieldComponent"
      :is="getPropertyFieldComponent(definition)"
      :definition="definition"
      :value="value"
      @update:value="handleCommit"
      @preview:value="emit('preview:value', $event)"
      @cancel:value="emit('cancel:value')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PropertyEditorFieldDefinition } from './propertyEditor.types'
import { isArrayPropertyFieldType } from './propertyEditor.types'
import type { PropertyFieldEditorId } from './propertyFieldEditorMode'
import ArrayPropertyField from './fields/ArrayPropertyField.vue'
import ReferenceStringPropertyField from './fields/ReferenceStringPropertyField.vue'
import {
  getArrayPropertyElementComponent,
  getPropertyFieldComponent,
  toArrayPropertyElementDefinition,
} from './propertyFieldRegistry'

defineOptions({ name: 'PropertyFieldRenderer' })

const props = defineProps<{
  definition: PropertyEditorFieldDefinition
  value: unknown
  editorId: PropertyFieldEditorId
  appearance?: 'default' | 'embedded'
}>()

const emit = defineEmits<{
  'update:value': [value: unknown]
  'preview:value': [value: unknown]
  'commit:value': [value: unknown]
  'cancel:value': []
}>()

function handleCommit(value: unknown): void {
  emit('update:value', value)
  emit('commit:value', value)
}

type ActivatablePropertyField = {
  activate?: () => void | Promise<void>
}

const fieldComponent = ref<ActivatablePropertyField | null>(null)
let activationPending = false

async function activate(): Promise<boolean> {
  const component = fieldComponent.value
  if (!component) {
    activationPending = true
    return true
  }
  if (!component.activate) return false
  await component.activate()
  return true
}

watch(fieldComponent, async (component) => {
  if (!activationPending || !component) return
  activationPending = false
  await component.activate?.()
})

defineExpose({ activate })

const appearance = computed(() => props.appearance ?? 'default')
const rawStringDefinition = computed(() => {
  const { options: _options, presentation: _presentation, ...baseDefinition } = props.definition as PropertyEditorFieldDefinition & {
    options?: readonly string[]
    presentation?: string
  }
  return { ...baseDefinition, fieldType: 'string' as const }
})
</script>

<style scoped>
.property-field-renderer {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: stretch;
  /* 属性行里的控件没有上下内边距：文字由控件自身居中，高度由行高决定。 */
  --oc-field-content-padding: 0 var(--oc-space-xs);
}

.property-field-renderer > * {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.property-field-renderer--embedded {
  --oc-field-surface-background: transparent;
  --oc-field-surface-border-width: 0;
  --oc-field-surface-border-color: transparent;
  --oc-field-surface-border-radius: 0;
  --oc-field-surface-hover-border-color: transparent;
  --oc-field-surface-focus-border-color: transparent;
  --oc-field-surface-focus-shadow: none;
  --oc-field-invalid-border-color: transparent;
  --oc-field-readonly-background: transparent;
  --oc-field-content-padding: 0;
  --oc-control-border-radius: 0;
  --oc-control-icon-border-radius: 0;
  --oc-control-focus-shadow: none;

  height: 100%;
  align-items: stretch;
}
</style>
