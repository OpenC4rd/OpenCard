<template>
  <section class="page-property-editor">
    <slot name="before" />
    <div class="page-property-editor__items">
      <PagePropertyEditorItem
        v-for="item in items"
        :key="item.key"
        :item="item"
        :parent-path="[]"
        :depth="0"
        @editor-preview="emit('editor-preview', $event)"
        @editor-commit="emit('editor-commit', $event)"
        @editor-cancel="emit('editor-cancel', $event)"
        @action="emit('action', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import PagePropertyEditorItem from './PagePropertyEditorItem.vue'
import type {
  EditorItem,
  EditorItemActionIntent,
  EditorItemCancelIntent,
  EditorItemValueIntent,
} from './propertyEditor.types'

defineProps<{
  items: readonly EditorItem[]
}>()

const emit = defineEmits<{
  'editor-preview': [intent: EditorItemValueIntent]
  'editor-commit': [intent: EditorItemValueIntent]
  'editor-cancel': [intent: EditorItemCancelIntent]
  action: [intent: EditorItemActionIntent]
}>()
</script>

<style scoped>
.page-property-editor,
.page-property-editor__items {
  display: grid;
  width: 100%;
  min-width: 0;
}

/* 行距归容器：行自己的 min-height 之外不再有上下留白。 */
.page-property-editor__items {
  gap: var(--oc-space-2xs);
}
</style>
