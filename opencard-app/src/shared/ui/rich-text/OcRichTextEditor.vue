<!-- Shared 富文本编辑器：保留工具栏与属性区布局，交互和内容由控制器持有。 -->
<template>
  <div class="oc-rich-text-editor" :style="fontVariables" @pointerdown.capture="captureInteraction" @focusin.capture="captureInteraction">
    <div v-if="editor" class="oc-rich-text-editor__toolbar" role="toolbar" aria-label="Text formatting">
      <div class="oc-rich-text-editor__toolbar-row">
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupHistory', '历史')">
          <OcButton size="md" icon-only icon="action.undo" :data-tooltip="tr('app.menu.undo', '撤销')" :aria-label="tr('app.menu.undo', '撤销')"
            :disabled="!editor.can().chain().focus().undo().run()" @mousedown.prevent @click="runCommand('undo')" />
          <OcButton size="md" icon-only icon="action.redo" :data-tooltip="tr('app.menu.redo', '重做')" :aria-label="tr('app.menu.redo', '重做')"
            :disabled="!editor.can().chain().focus().redo().run()" @mousedown.prevent @click="runCommand('redo')" />
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.font', '字体')">
          <ReferenceStringPropertyField class="oc-rich-text-editor__font" :definition="fontFieldDefinition"
            :value="activeFontFamily" @update:value="formatting.apply('fontFamily', $event)" />
          <ReferenceStringPropertyField class="oc-rich-text-editor__font-size" :definition="fontSizeFieldDefinition"
            :value="activeFontSize" @update:value="formatting.apply('fontSize', $event)" />
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupTypography', '文字')">
          <OcButton size="md" icon-only icon="format.font-size-decrease" :data-tooltip="tr('propertyEditor.richText.decreaseFontSize', '减小字号')" :aria-label="tr('propertyEditor.richText.decreaseFontSize', '减小字号')"
            @mousedown.prevent @click="formatting.adjustSize(-1)" />
          <OcButton size="md" icon-only icon="format.font-size-increase" :data-tooltip="tr('propertyEditor.richText.increaseFontSize', '增大字号')" :aria-label="tr('propertyEditor.richText.increaseFontSize', '增大字号')"
            @mousedown.prevent @click="formatting.adjustSize(1)" />
          <OcButton size="md" icon-only icon="format.bold" :active="editor.isActive('bold')"
            :data-tooltip="tr('propertyEditor.richText.bold', '粗体')" :aria-label="tr('propertyEditor.richText.bold', '粗体')" @mousedown.prevent @click="runCommand('bold')" />
          <OcButton size="md" icon-only icon="format.italic" :active="editor.isActive('italic')"
            :data-tooltip="tr('propertyEditor.richText.italic', '斜体')" :aria-label="tr('propertyEditor.richText.italic', '斜体')" @mousedown.prevent @click="runCommand('italic')" />
          <OcButton size="md" icon-only icon="format.underline" :active="editor.isActive('underline')"
            :data-tooltip="tr('propertyEditor.richText.underline', '下划线')" :aria-label="tr('propertyEditor.richText.underline', '下划线')" @mousedown.prevent @click="runCommand('underline')" />
          <OcButton size="md" icon-only icon="format.strikethrough" :active="editor.isActive('strike')"
            :data-tooltip="tr('propertyEditor.richText.strikethrough', '删除线')" :aria-label="tr('propertyEditor.richText.strikethrough', '删除线')" @mousedown.prevent @click="runCommand('strike')" />
        </div>
      </div>

      <div class="oc-rich-text-editor__toolbar-row">
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupDocumentStructure', '文档结构')">
          <OcButton size="md" icon-only icon="data.list-bulleted" :data-tooltip="tr('propertyEditor.richText.bulletList', '无序列表')" :aria-label="tr('propertyEditor.richText.bulletList', '无序列表')"
            :active="editor.isActive('bulletList')" @mousedown.prevent @click="runCommand('bulletList')" />
          <OcButton size="md" icon-only icon="data.list-numbered" :data-tooltip="tr('propertyEditor.richText.orderedList', '有序列表')" :aria-label="tr('propertyEditor.richText.orderedList', '有序列表')"
            :active="editor.isActive('orderedList')" @mousedown.prevent @click="runCommand('orderedList')" />
          <OcButton v-if="!editor.isActive('table')" size="md" icon-only icon="data.table" :data-tooltip="tr('propertyEditor.richText.insertTable', '插入表格')" :aria-label="tr('propertyEditor.richText.insertTable', '插入表格')"
            @mousedown.prevent @click="insertTable" />
          <OcActionButton v-if="editor.isActive('table')" :action="tableAction" size="md" variant="ghost"
            @select="handleTableAction" />
        </div>
        <div v-if="bindingCompletion" class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupDataReference', '数据引用')">
          <OcButton size="md" icon-only icon="format.code-braces" :data-tooltip="tr('propertyEditor.richText.insertBinding', '插入 binding')"
            :aria-label="tr('propertyEditor.richText.insertBinding', '插入 binding')" @mousedown.prevent @click="insertBinding" />
        </div>
        <div v-if="hasProjectIconSources" class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupProjectIcon', '项目图标')">
          <OcActionButton :action="projectIconAction" size="md" variant="ghost"
            @mousedown.prevent @select="handleProjectIconAction" />
          <OcButton v-for="entry in recentProjectIconEntries" :key="projectIconSelectionKey(null, entry)" size="md" icon-only
            class="oc-rich-text-editor__recent-icon" :data-tooltip="`${entry.name} ${entry.seriesKey}`"
            :aria-label="tr('propertyEditor.richText.insertRecentIcon', `插入最近图标：${entry.name}`, { name: entry.name })" @mousedown.prevent @click="insertRecentProjectIcon(entry)">
            <template #icon>
              <span class="oc-rich-text-editor__recent-icon-image oc-project-icon"
                :style="createProjectIconPreviewStyle(entry, readProjectIconSize)" aria-hidden="true" />
            </template>
          </OcButton>
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupColorAndStroke', '颜色与描边')">
          <OcColorPicker :label="tr('propertyEditor.richText.foregroundColor', '前景色')" :model-value="foregroundColor" :mixed="formatting.state.value.foregroundColor.kind === 'mixed'"
            @open-change="colorOpen($event)"
            @preview="formatting.preview('foregroundColor', $event)" @commit="formatting.apply('foregroundColor', $event)" @cancel="interaction.clearPreview">
            <template #trigger="{ color }"><span class="oc-rich-text-editor__color-command">
              <OcIcon name="format.color-fill" size="md" /><span :style="{ backgroundColor: color }" />
            </span></template>
          </OcColorPicker>
          <OcColorPicker :label="tr('propertyEditor.richText.textBackgroundColor', '文字背景色')" :model-value="backgroundColor" :mixed="formatting.state.value.backgroundColor.kind === 'mixed'"
            @open-change="colorOpen($event)"
            @preview="formatting.preview('backgroundColor', $event)" @commit="formatting.apply('backgroundColor', $event)" @cancel="interaction.clearPreview">
            <template #trigger="{ color }"><span class="oc-rich-text-editor__color-command">
              <OcIcon name="format.color-highlight" size="md" /><span :style="{ backgroundColor: color }" />
            </span></template>
          </OcColorPicker>
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupAlignment', '段落对齐')">
          <OcButton v-for="alignment in alignments" :key="alignment.value" size="md" icon-only
            :icon="alignment.icon" :data-tooltip="alignment.title" :aria-label="alignment.title"
            :active="formatting.state.value.textAlign.value === alignment.value"
            @mousedown.prevent @click="runCommand(alignment.value)" />
        </div>
        <div class="oc-rich-text-editor__tool-group oc-rich-text-editor__tool-group--tail" role="group" :aria-label="tr('propertyEditor.richText.groupClearFormatting', '清除格式')">
          <OcButton size="md" icon-only icon="format.clear" :data-tooltip="tr('propertyEditor.richText.clearCharacterFormatting', '清除字符格式')" :aria-label="tr('propertyEditor.richText.clearCharacterFormatting', '清除字符格式')"
            @mousedown.prevent @click="runCommand('clear')" />
        </div>
      </div>
    </div>

    <OcFloatingLayer v-if="selectedNodeAnchor && selectedNodeKind === 'projectIcon'" :open="nodeEditOpen"
      :anchor="selectedNodeAnchor" :owner="editor?.view.dom" placement="top-start">
      <div class="oc-rich-text-editor__node-edit-layer">
        <OcActionButton :action="projectIconAction"
          size="sm" variant="ghost" @mousedown.prevent @select="handleProjectIconAction" />
      </div>
    </OcFloatingLayer>

    <EditorContent :editor="editor" class="oc-rich-text-editor__surface" :style="baseStyle" />
  </div>
</template>

<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { computed } from 'vue'
import OcButton from '../../../components/base/OcButton.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcColorPicker from '../../../components/standard/OcColorPicker.vue'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import ReferenceStringPropertyField from '../property-editor/fields/ReferenceStringPropertyField.vue'
import OcFloatingLayer from '../../../components/standard/OcFloatingLayer.vue'
import { useRichTextEditor, type RichTextEditorProps } from './useRichTextEditor'
const props = defineProps<RichTextEditorProps>()
const emit = defineEmits<{ change: [] }>()
const {
  editor, focus, getHtml, applyHtml, flushPendingInput, endInteraction,
  fontVariables, captureInteraction, colorOpen, formatting, interaction,
  fontFieldDefinition, fontSizeFieldDefinition, activeFontFamily, activeFontSize,
  runCommand, insertTable, tableAction, handleTableAction, insertBinding,
  hasProjectIconSources, projectIconAction, handleProjectIconAction,
  recentProjectIconEntries, projectIconSelectionKey, insertRecentProjectIcon,
  createProjectIconPreviewStyle, readProjectIconSize,
  foregroundColor, backgroundColor, alignments, tr,
  selectedNodeAnchor, selectedNodeKind, nodeEditOpen, propertyInputs, propertyCategories,
} = useRichTextEditor(props, () => emit('change'))
const properties = computed(() => ({
  inputs: propertyInputs.value, categories: propertyCategories.value,
  update: formatting.update, reset: formatting.reset, preview: formatting.previewProperty,
  cancel: interaction.clearPreview, capture: interaction.capture,
}))
defineExpose({ editor, focus, getHtml, applyHtml, flushPendingInput, endInteraction, properties })
</script>

<style scoped>
.oc-rich-text-editor {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  background: var(--oc-bg-input);
}

.oc-rich-text-editor__toolbar {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: stretch;
  gap: var(--oc-space-2xs);
  padding: var(--oc-space-2xs);
  border-bottom: var(--oc-border-width) solid var(--oc-border-default);
  background: var(--oc-bg-raised);
}

.oc-rich-text-editor__toolbar-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  row-gap: var(--oc-space-2xs);
}

.oc-rich-text-editor__tool-group {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--oc-space-2xs);
  padding-inline: var(--oc-space-xs);
  border-inline-start: 1px solid var(--oc-border-muted);
}

.oc-rich-text-editor__tool-group:first-child {
  padding-inline-start: 0;
  border-inline-start: 0;
}

.oc-rich-text-editor__tool-group--tail {
  margin-inline-start: auto;
}

.oc-rich-text-editor__recent-icon {
  width: var(--oc-size-md);
  flex: 0 0 var(--oc-size-md);
}

.oc-rich-text-editor__recent-icon-image {
  display: inline-block;
  flex: none;
  font-size: var(--oc-icon-size-md);
  background-repeat: no-repeat;
  vertical-align: text-bottom;
}

.oc-rich-text-editor__font {
  width: 124px;
}

.oc-rich-text-editor__font-size {
  width: 82px;
}

.oc-rich-text-editor__color-command {
  position: relative;
  display: grid;
  width: 16px;
  height: 18px;
  place-items: center;
  font-weight: 700;
  line-height: 1;
}

.oc-rich-text-editor__color-command > span {
  position: absolute;
  right: 1px;
  bottom: 0;
  left: 1px;
  height: 3px;
  border-radius: 1px;
}

.oc-rich-text-editor__surface {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
}

.oc-rich-text-editor__surface :deep(.oc-rich-text-editor__content) {
  min-height: 100%;
  padding: var(--oc-space-md);
  outline: none;
  color: var(--oc-fg-default);
  overflow-wrap: anywhere;
  paint-order: stroke fill;
  white-space: break-spaces;
}

.oc-rich-text-editor__surface :deep(p) {
  margin: 0;
}

.oc-rich-text-editor__surface :deep(p + p) {
  margin-top: 0.35em;
}

.oc-rich-text-editor__surface :deep(ul),
.oc-rich-text-editor__surface :deep(ol) {
  margin-block: var(--oc-space-xs);
  padding-inline-start: var(--oc-space-lg);
}

.oc-rich-text-editor__surface :deep(table) {
  width: 100%;
  margin-block: var(--oc-space-xs);
  border-collapse: collapse;
  table-layout: fixed;
}

.oc-rich-text-editor__surface :deep(th),
.oc-rich-text-editor__surface :deep(td) {
  position: relative;
  min-width: var(--oc-size-lg);
  padding: var(--oc-space-2xs) var(--oc-space-xs);
  border: var(--oc-border-width) solid var(--oc-border-strong);
  vertical-align: top;
}

.oc-rich-text-editor__surface :deep([class~="tableWrapper"]) {
  overflow-x: auto;
}

.oc-rich-text-editor__surface :deep(th) {
  background: var(--oc-bg-raised);
}

.oc-rich-text-editor__surface :deep(.column-resize-handle) {
  position: absolute;
  inset-block: 0;
  right: 0;
  width: var(--oc-space-2xs);
  background: var(--oc-border-strong);
  pointer-events: none;
}

.oc-rich-text-editor__surface :deep(.resize-cursor) {
  cursor: col-resize;
}

.oc-rich-text-editor__surface :deep([class~="selectedCell"]) {
  background-color: var(--oc-bg-selected);
}

.oc-rich-text-editor__node-edit-layer {
  display: grid;
  max-width: var(--oc-dialog-width-md);
  max-height: inherit;
  gap: var(--oc-space-xs);
  padding: var(--oc-floating-surface-padding);
  overflow: auto;
}

</style>
