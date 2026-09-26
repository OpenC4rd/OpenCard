<!-- 属性颜色字段：把值与只读协议适配到标准颜色字段。 -->
<template>
  <OcColorPicker variant="field" :model-value="stringValue" :label="definition.title"
    :disabled="definition.isReadonly" :allow-alpha="definition.allowAlpha ?? true"
    @preview="emit('preview:value', $event)" @cancel="emit('cancel:value')"
    @update:model-value="emit('update:value', $event)" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'
import OcColorPicker from '../../../../components/standard/OcColorPicker.vue'

interface ColorPropertyFieldProps {
  /** 当前字段值。 */
  value: unknown
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'color' }>
}

interface ColorPropertyFieldEmits {
  (e: 'preview:value', value: string): void
  (e: 'cancel:value'): void
  /** 颜色变化时输出当前颜色字符串。 */
  (e: 'update:value', value: string): void
}

defineOptions({
  name: 'ColorPropertyField',
  inheritAttrs: false,
})

const props = defineProps<ColorPropertyFieldProps>()

const emit = defineEmits<ColorPropertyFieldEmits>()

const stringValue = computed(() => (props.value == null ? '' : String(props.value)))
</script>
