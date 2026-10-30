<!-- Shared 富文本编辑器：保留工具栏与属性区布局，交互和内容由控制器持有。 -->
<template>
  <div class="oc-rich-text-editor" :style="fontVariables" @pointerdown.capture="captureInteraction" @focusin.capture="captureInteraction">
    <div v-if="editor" class="oc-rich-text-editor__toolbar" role="toolbar" aria-label="Text formatting">
      <div class="oc-rich-text-editor__toolbar-row">
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupHistory', '历史')">
          <OcButton size="md" icon-only icon="mdiUndoVariant" :data-tooltip="tr('app.menu.undo', '撤销')" :aria-label="tr('app.menu.undo', '撤销')"
            :disabled="!editor.can().chain().focus().undo().run()" @mousedown.prevent @click="runCommand('undo')" />
          <OcButton size="md" icon-only icon="mdiRedoVariant" :data-tooltip="tr('app.menu.redo', '重做')" :aria-label="tr('app.menu.redo', '重做')"
            :disabled="!editor.can().chain().focus().redo().run()" @mousedown.prevent @click="runCommand('redo')" />
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.font', '字体')">
          <FontFamilyPropertyField class="oc-rich-text-editor__font" :definition="fontFieldDefinition"
            :value="activeFontFamily" :capabilities="capabilities" @update:value="formatting.apply('fontFamily', $event)" />
          <StringPropertyField class="oc-rich-text-editor__font-size" :definition="fontSizeFieldDefinition"
            :value="activeFontSize" @update:value="formatting.apply('fontSize', $event)" />
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupTypography', '文字')">
          <OcButton size="md" icon-only icon="mdiFormatFontSizeDecrease" :data-tooltip="tr('propertyEditor.richText.decreaseFontSize', '减小字号')" :aria-label="tr('propertyEditor.richText.decreaseFontSize', '减小字号')"
            @mousedown.prevent @click="formatting.adjustSize(-1)" />
          <OcButton size="md" icon-only icon="mdiFormatFontSizeIncrease" :data-tooltip="tr('propertyEditor.richText.increaseFontSize', '增大字号')" :aria-label="tr('propertyEditor.richText.increaseFontSize', '增大字号')"
            @mousedown.prevent @click="formatting.adjustSize(1)" />
          <OcButton size="md" icon-only icon="mdiFormatBold" :active="editor.isActive('bold')"
            :data-tooltip="tr('propertyEditor.richText.bold', '粗体')" :aria-label="tr('propertyEditor.richText.bold', '粗体')" @mousedown.prevent @click="runCommand('bold')" />
          <OcButton size="md" icon-only icon="mdiFormatItalic" :active="editor.isActive('italic')"
            :data-tooltip="tr('propertyEditor.richText.italic', '斜体')" :aria-label="tr('propertyEditor.richText.italic', '斜体')" @mousedown.prevent @click="runCommand('italic')" />
          <OcButton size="md" icon-only icon="mdiFormatUnderline" :active="editor.isActive('underline')"
            :data-tooltip="tr('propertyEditor.richText.underline', '下划线')" :aria-label="tr('propertyEditor.richText.underline', '下划线')" @mousedown.prevent @click="runCommand('underline')" />
          <OcButton size="md" icon-only icon="mdiFormatStrikethrough" :active="editor.isActive('strike')"
            :data-tooltip="tr('propertyEditor.richText.strikethrough', '删除线')" :aria-label="tr('propertyEditor.richText.strikethrough', '删除线')" @mousedown.prevent @click="runCommand('strike')" />
        </div>
      </div>

      <div class="oc-rich-text-editor__toolbar-row">
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupDocumentStructure', '文档结构')">
          <OcButton size="md" icon-only icon="mdiFormatListBulleted" :data-tooltip="tr('propertyEditor.richText.bulletList', '无序列表')" :aria-label="tr('propertyEditor.richText.bulletList', '无序列表')"
            :active="editor.isActive('bulletList')" @mousedown.prevent @click="runCommand('bulletList')" />
          <OcButton size="md" icon-only icon="mdiFormatListNumbered" :data-tooltip="tr('propertyEditor.richText.orderedList', '有序列表')" :aria-label="tr('propertyEditor.richText.orderedList', '有序列表')"
            :active="editor.isActive('orderedList')" @mousedown.prevent @click="runCommand('orderedList')" />
        </div>
        <div v-if="bindingCompletion" class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupDataReference', '数据引用')">
          <OcButton size="md" icon-only icon="mdiCodeBraces" :data-tooltip="tr('propertyEditor.richText.insertBinding', '插入 binding')"
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
                :style="entry.previewStyle" aria-hidden="true" />
            </template>
          </OcButton>
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupColorAndStroke', '颜色与描边')">
          <OcColorPicker :label="tr('propertyEditor.richText.foregroundColor', '前景色')" :model-value="foregroundColor" :mixed="formatting.state.value.foregroundColor.kind === 'mixed'"
            @open-change="colorOpen($event)"
            @preview="formatting.preview('foregroundColor', $event)" @commit="formatting.apply('foregroundColor', $event)" @cancel="interaction.clearPreview">
            <template #trigger="{ color }"><span class="oc-rich-text-editor__color-command">
              <OcIcon name="mdiFormatColorFill" size="md" /><span :style="{ backgroundColor: color }" />
            </span></template>
          </OcColorPicker>
          <OcColorPicker :label="tr('propertyEditor.richText.textBackgroundColor', '文字背景色')" :model-value="backgroundColor" :mixed="formatting.state.value.backgroundColor.kind === 'mixed'"
            @open-change="colorOpen($event)"
            @preview="formatting.preview('backgroundColor', $event)" @commit="formatting.apply('backgroundColor', $event)" @cancel="interaction.clearPreview">
            <template #trigger="{ color }"><span class="oc-rich-text-editor__color-command">
              <OcIcon name="mdiFormatColorHighlight" size="md" /><span :style="{ backgroundColor: color }" />
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
          <OcButton size="md" icon-only icon="mdiFormatClear" :data-tooltip="tr('propertyEditor.richText.clearCharacterFormatting', '清除字符格式')" :aria-label="tr('propertyEditor.richText.clearCharacterFormatting', '清除字符格式')"
            @mousedown.prevent @click="runCommand('clear')" />
        </div>
      </div>
    </div>

    <EditorContent :editor="editor" class="oc-rich-text-editor__surface" :style="baseStyle" />

    <OcOverlayMarker
      ref="nodeEditLayer"
      group="rich-text-node-edit"
      :anchor="nodeEditAnchor"
      :owner="editor?.view.dom ?? null"
      placement="top-start"
      :open="nodeEditLayerOpen"
      @update:open="nodeEditLayerOpen = $event"
    >
      <RichTextNodeEditLayer :action="projectIconAction" @select="handleProjectIconAction" />
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { computed, ref, watch } from 'vue'
import OcButton from '../../../components/base/OcButton.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcColorPicker from '../../../components/standard/OcColorPicker.vue'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import OcOverlayMarker from '../../../components/standard/OcOverlayMarker.vue'
import FontFamilyPropertyField from '../property-editor/fields/FontFamilyPropertyField.vue'
import StringPropertyField from '../property-editor/fields/StringPropertyField.vue'
import type { OverlayAnchor } from '../../../composables/overlayGroups'
import RichTextNodeEditLayer from './RichTextNodeEditLayer.vue'
import { useRichTextEditor, type RichTextEditorProps } from './useRichTextEditor'

const props = defineProps<RichTextEditorProps>()
const emit = defineEmits<{ change: [] }>()
const {
  editor, focus, getHtml, applyHtml, getContent, setContent, flushPendingInput, endInteraction,
  fontVariables, captureInteraction, colorOpen, formatting, interaction,
  fontFieldDefinition, fontSizeFieldDefinition, activeFontFamily, activeFontSize,
  runCommand, insertBinding,
  hasProjectIconSources, projectIconAction, handleProjectIconAction,
  recentProjectIconEntries, projectIconSelectionKey, insertRecentProjectIcon,
  foregroundColor, backgroundColor, alignments, tr,
  selectedNodeAnchor, selectedNodeKind, nodeEditOpen, propertyInputs, propertyCategories,
} = useRichTextEditor(props, () => emit('change'))
const properties = computed(() => ({
  inputs: propertyInputs.value, categories: propertyCategories.value,
  update: formatting.update, reset: formatting.reset, preview: formatting.previewProperty,
  cancel: interaction.clearPreview, capture: interaction.capture,
}))
/** 选中项目图标时浮出替换按钮：层的开关只跟选择走。 */
const nodeEditLayerOpen = ref(false)
const nodeEditLayer = ref<InstanceType<typeof OcOverlayMarker> | null>(null)
/** 选区一变就换一个锚点函数：组只在换锚点时重新求值，宿主才会挪到新节点上。 */
const nodeEditAnchor = computed<OverlayAnchor>(() => () => selectedNodeAnchor.value)
watch(
  [nodeEditOpen, selectedNodeKind],
  ([open, kind]) => { nodeEditLayerOpen.value = open && kind === 'projectIcon' },
  { flush: 'sync' },
)
// 从一个图标节点换到另一个时这一层一直开着：post-flush 时新锚点已经交给 marker，重开一次宿主才跟过去。
watch(nodeEditAnchor, () => {
  if (nodeEditLayerOpen.value) nodeEditLayer.value?.open()
}, { flush: 'post' })
defineExpose({ editor, focus, getHtml, applyHtml, getContent, setContent, flushPendingInput, endInteraction, properties })
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
  width: 148px;
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
</style>
