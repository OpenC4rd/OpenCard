<template>
  <div
    class="page-property-editor-item"
    :class="{ 'is-group': !item.content?.length }"
    :data-item-key="item.key"
    :style="rowStyle"
  >
    <div class="page-property-editor-item__label">
      <OcText class="page-property-editor-item__title" as="span" size="sm" :bold="!item.content?.length">
        {{ item.title }}
      </OcText>
      <OcText
        v-if="item.subtitle"
        class="page-property-editor-item__subtitle"
        as="span"
        size="xs"
        tone="muted"
      >
        {{ item.subtitle }}
      </OcText>
    </div>
    <div v-if="item.content?.length" class="page-property-editor-item__content">
      <template v-for="(part, index) in item.content" :key="partKey(part, index)">
        <OcText v-if="typeof part === 'string'" as="span" size="sm">{{ part }}</OcText>
        <OcProgressBar v-else-if="part.type === 'meter'" class="page-property-editor-item__meter"
          :value="part.value" :max="part.max" :text="part.text" />
        <PropertyFieldRenderer
          v-else-if="part.type === 'editor'"
          class="page-property-editor-item__editor"
          :class="{ 'is-compact': part.definition.fieldType === 'boolean' }"
          :definition="part.definition"
          :value="encodeValue(part)"
          editor-id="field"
          @preview:value="handlePreview(part, $event)"
          @commit:value="handleCommit(part, $event)"
          @cancel:value="emit('editor-cancel', { itemPath: currentPath, editorKey: part.key })"
        />
        <OcActionButton
          v-else-if="part.iconOnly"
          :action="part"
          :variant="part.variant"
          :size="part.size ?? 'sm'"
          @select="emit('action', { itemPath: currentPath, actionKey: $event.key })"
        />
        <OcButton
          v-else
          :icon="part.icon"
          :variant="part.variant"
          :size="part.size ?? 'sm'"
          :disabled="part.disabled"
          @click="emit('action', { itemPath: currentPath, actionKey: part.key })"
        >
          {{ part.title ?? part.key }}
        </OcButton>
      </template>
    </div>
  </div>
  <PagePropertyEditorItem
    v-for="child in item.children"
    :key="child.key"
    :item="child"
    :parent-path="currentPath"
    :depth="depth + 1"
    @editor-preview="emit('editor-preview', $event)"
    @editor-commit="emit('editor-commit', $event)"
    @editor-cancel="emit('editor-cancel', $event)"
    @action="emit('action', $event)"
  />
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import OcButton from '../../../components/base/OcButton.vue'
import OcProgressBar from '../../../components/standard/OcProgressBar.vue'
import OcText from '../../../components/base/OcText.vue'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import PropertyFieldRenderer from './PropertyFieldRenderer.vue'
import type {
  EditorItem,
  EditorItemActionIntent,
  EditorItemCancelIntent,
  EditorItemEditorPart,
  EditorItemPart,
  EditorItemValueIntent,
} from './propertyEditor.types'

defineOptions({ name: 'PagePropertyEditorItem' })

const props = defineProps<{
  item: EditorItem
  parentPath: readonly string[]
  depth: number
}>()

const emit = defineEmits<{
  'editor-preview': [intent: EditorItemValueIntent]
  'editor-commit': [intent: EditorItemValueIntent]
  'editor-cancel': [intent: EditorItemCancelIntent]
  action: [intent: EditorItemActionIntent]
}>()

const currentPath = computed(() => [...props.parentPath, props.item.key])
const rowStyle = computed<CSSProperties>(() => ({
  paddingInlineStart: `calc(var(--oc-indent-step) * ${props.depth})`,
}))

function partKey(part: EditorItemPart, index: number): string {
  return typeof part === 'string' ? `text:${index}` : `${part.type}:${part.key}`
}

function encodeValue(part: EditorItemEditorPart): unknown {
  if (part.definition.fieldType === 'boolean') return String(part.value === true)
  if (part.definition.fieldType === 'number') return typeof part.value === 'number' ? String(part.value) : part.value
  return part.value
}

function decodeValue(part: EditorItemEditorPart, value: unknown): unknown | undefined {
  if (part.definition.fieldType === 'boolean') return value === true || value === 'true'
  if (part.definition.fieldType === 'number') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : undefined
  }
  return value
}

function handlePreview(part: EditorItemEditorPart, value: unknown): void {
  const decoded = decodeValue(part, value)
  if (decoded !== undefined) emit('editor-preview', { itemPath: currentPath.value, editorKey: part.key, value: decoded })
}

function handleCommit(part: EditorItemEditorPart, value: unknown): void {
  const decoded = decodeValue(part, value)
  if (decoded !== undefined) emit('editor-commit', { itemPath: currentPath.value, editorKey: part.key, value: decoded })
}
</script>

<style scoped>
/* 行即节点（与 OcTree 一致）：本行和子项的行在 DOM 上是同一层的兄弟，层级只由 rowStyle 的缩进表达。
   行只负责自己的尺寸（min-height），行距由上级 `.page-property-editor__items` 的 gap 给出，不用分隔线。 */
.page-property-editor-item {
  box-sizing: border-box;
  display: grid;
  min-height: var(--oc-page-editor-row-min-height);
  grid-template-columns: minmax(var(--oc-page-editor-title-min-width), 1fr)
    minmax(var(--oc-page-editor-content-min-width), 1fr);
  align-items: center;
  gap: var(--oc-space-lg);
}

.page-property-editor-item.is-group {
  grid-template-columns: minmax(0, 1fr);
}

.page-property-editor-item__label {
  display: grid;
  min-width: 0;
  gap: var(--oc-space-2xs);
}

.page-property-editor-item__title {
  min-width: 0;
}

.page-property-editor-item__subtitle {
  min-width: 0;
  line-height: 1.4;
}

.page-property-editor-item__content {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  justify-self: end;
  gap: var(--oc-space-xs);
}

/* 只读用量条：撑满值区，宽度上限与其他编辑器一致。 */
.page-property-editor-item__meter {
  flex: 1 1 0;
  max-width: var(--oc-page-editor-value-width);
}

/* 所有编辑器统一占满同一个宽度：值区宽度由 --oc-page-editor-value-width 决定，
   不再按字段类型各撑各的（枚举贴标签、滑块占满整列）。同一行里的操作按钮优先占位。 */
.page-property-editor-item__editor {
  min-width: 0;
  flex: 1 1 0;
  max-width: var(--oc-page-editor-value-width);
}

/* 开关没有"宽度"可言：保持自身尺寸，靠值区的右对齐贴着行的右边。 */
.page-property-editor-item__editor.is-compact {
  width: max-content;
  max-width: 100%;
  flex: 0 0 auto;
}

.page-property-editor-item__editor.is-compact :deep(> *) {
  width: max-content;
  flex: 0 1 auto;
}

@media (max-width: 680px) {
  .page-property-editor-item:not(.is-group) {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: var(--oc-space-xs);
  }

  .page-property-editor-item__content {
    width: 100%;
    justify-content: flex-start;
    justify-self: stretch;
  }
}

</style>
