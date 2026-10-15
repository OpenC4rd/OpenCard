<template>
  <div :ref="setAnchor" class="rich-text-string-field">
    <OcFieldFrame full-width :readonly="definition.isReadonly">
      <button v-if="!definition.isReadonly" type="button" class="rich-text-string-field__preview"
        :aria-expanded="open" @click="openEditor">
        <RichTextPreview v-if="stringValue" class="rich-text-string-field__content"
          :html="stringValue" :project-icon-catalog="definition.projectIcon?.catalog"
          :package-icon-sources="definition.projectIcon?.sources" :font-options="definition.fontOptions"
          :resolve-image-source="definition.richTextImageResolver" />
        <span v-else class="rich-text-string-field__empty">-</span>
      </button>
      <div v-else class="rich-text-string-field__preview rich-text-string-field__preview--readonly">
        <RichTextPreview v-if="stringValue" class="rich-text-string-field__content"
          :html="stringValue" :project-icon-catalog="definition.projectIcon?.catalog"
          :package-icon-sources="definition.projectIcon?.sources" :font-options="definition.fontOptions"
          :resolve-image-source="definition.richTextImageResolver" />
        <span v-else class="rich-text-string-field__empty">-</span>
      </div>
    </OcFieldFrame>

  <OcDialog class="rich-text-string-popover" :open="open" :title="definition.title" size="xl"
      :sidebar="editorMode === 'rich'" :sidebar-title="tr('propertyEditor.richText.properties', '文字属性')"
      :sidebar-tooltip="tr('propertyEditor.richText.toggleProperties', '拖动或双击收起或展开文字属性')"
      :padded="false" :scrollable="false" height-mode="fixed" height="workspace"
      close-on-backdrop @request-close="cancelEditor">
	          <div class="rich-text-string-popover__editor">
            <OcRichTextEditor v-if="open" v-show="editorMode === 'rich'" ref="richTextEditor" :initial-html="initialHtml"
              :binding-completion="definition.binding?.provider"
		              :project-icon-catalog="definition.projectIcon?.catalog"
              :package-icon-sources="definition.projectIcon?.sources"
              :font-options="definition.fontOptions"
              :base-style="definition.richTextBaseStyle"
              :image-directory-provider="definition.richTextImageDirectoryProvider"
              :image-completion-provider="definition.richTextImageCompletionProvider"
              :resolve-image-source="definition.richTextImageResolver"
              />
            <OcFieldInput v-if="editorMode === 'source'" ref="sourceEditor" as="textarea" variant="plain" full-width mono
              class="rich-text-string-popover__source" :value="sourceValue"
              resize="none" autocomplete="off" spellcheck="false"
              :aria-label="tr('propertyEditor.richText.htmlSource', 'HTML 源码')"
	              @input="handleSourceInput" />
	          </div>
	          <p v-if="sourceDiagnostics.length" class="rich-text-string-popover__diagnostics" role="alert">
	            {{ sourceDiagnostics[0]?.path }}: {{ sourceDiagnostics[0]?.message }}
	          </p>
      <template #footer-start>
        <OcOptionGroup :model-value="editorMode" :options="editorModeOptions"
          size="md" icon-only appearance="sliding-outline" :aria-label="tr('propertyEditor.richText.editorView', '编辑视图')"
          @update:model-value="setEditorMode" />
      </template>
      <template #footer>
        <OcButton size="md" icon-only icon="action.close" icon-tone="danger"
          :data-tooltip="tr('propertyEditor.richText.cancel', '取消')" :aria-label="tr('propertyEditor.richText.cancelEdit', '取消富文本编辑')" @click="cancelEditor" />
        <OcButton size="md" icon-only icon="action.check" icon-tone="success" variant="soft" :disabled="saveBlocked"
          :data-tooltip="tr('propertyEditor.richText.save', '保存')" :aria-label="tr('propertyEditor.richText.saveEdit', '保存富文本编辑')" @click="saveEditor" />
      </template>
      <template #sidebar>
        <div v-if="richTextEditor" class="oc-rich-text-editor__properties"
          @pointerdown.capture="richTextEditor.properties.capture" @focusin.capture="richTextEditor.properties.capture">
          <PropertyEditor :inputs="richTextEditor.properties.inputs" :categories="richTextEditor.properties.categories"
            sort-mode="category" @update-property="richTextEditor.properties.update"
            @preview-property="richTextEditor.properties.preview" @cancel-property="richTextEditor.properties.cancel" />
        </div>
      </template>
    </OcDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, type ComponentPublicInstance } from 'vue'
import OcButton from '../../../../components/base/OcButton.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import OcDialog from '../../../../components/standard/OcDialog.vue'
import OcOptionGroup, { type OcOption } from '../../../../components/standard/OcOptionGroup.vue'
import { parseRichTextHtml } from '../../../rich-text/richTextHtml'
import { useRichTextSession } from '../../rich-text/useRichTextSession'
import OcRichTextEditor from '../../rich-text/OcRichTextEditor.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'
import RichTextPreview from '../../rich-text/RichTextPreview.vue'
import PropertyEditor from '../PropertyEditor.vue'

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'string' }>
  value: unknown
}>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const anchor = ref<HTMLElement | null>(null)
const richTextEditor = ref<InstanceType<typeof OcRichTextEditor> | null>(null)
const sourceEditor = ref<{ focus: () => void } | null>(null)
const stringValue = computed(() => props.value == null ? '' : String(props.value))
const session = useRichTextSession(richTextEditor, sourceEditor,
  () => tr('propertyEditor.richText.sourcePreserved', '内容无法无损转为可视化编辑，请继续编辑源码。'))
const { open, mode: editorMode, initialHtml, source: sourceValue, diagnostics: sourceDiagnostics } = session
const saveBlocked = computed(() => editorMode.value === 'source' && parseRichTextHtml(sourceValue.value).diagnostics.length > 0)
const editorModeOptions = computed<readonly OcOption[]>(() => [
  { value: 'rich', label: tr('propertyEditor.richText.richTextMode', '富文本'), icon: 'format.text-variant-outline' },
  { value: 'source', label: tr('propertyEditor.richText.htmlSource', 'HTML 源码'), icon: 'format.xml' },
])

function openEditor() { if (!props.definition.isReadonly && !open.value) return session.begin(stringValue.value) }
const setEditorMode = session.switchMode
function handleSourceInput(event: Event) {
  if (event.target instanceof HTMLTextAreaElement) session.editSource(event.target.value)
}
function finishEditing() {
  session.finish()
  anchor.value?.querySelector<HTMLButtonElement>('.rich-text-string-field__preview')?.focus()
}
function cancelEditor() { finishEditing() }
function saveEditor() {
  const value = session.readForSave()
  if (value === null) return
  if (value !== stringValue.value) emit('update:value', value)
  finishEditing()
}

function setAnchor(element: Element | ComponentPublicInstance | null): void {
  anchor.value = element instanceof HTMLElement ? element : null
}

defineExpose({ activate: openEditor })

</script>

<style scoped>
.rich-text-string-field__content :deep(.project-inline-icon) {
  display: inline-block;
  background-repeat: no-repeat;
  vertical-align: text-bottom;
}
.rich-text-string-field {
  width: 100%;
  min-width: 0;
}

.rich-text-string-field__preview {
  display: block;
  min-width: 0;
  padding: var(--oc-field-content-padding, var(--oc-space-2xs) var(--oc-space-xs));
  overflow: hidden;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  white-space: nowrap;
  cursor: text;
  outline: none;
}

.rich-text-string-field__content {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}

.rich-text-string-field__content :deep(p),
.rich-text-string-field__content :deep(br) {
  display: inline;
  margin: 0;
}

.rich-text-string-field__content :deep(p + p)::before {
  content: ' ';
}

.rich-text-string-field__empty {
  color: var(--oc-fg-muted);
}
</style>

<style scoped>
.rich-text-string-popover__editor {
  min-height: 0;
  flex: 1 1 auto;
}

.rich-text-string-popover__source {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: var(--oc-space-md);
  overflow: auto;
  background: var(--oc-bg-input);
  color: var(--oc-fg-default);
  line-height: 1.55;
}

.rich-text-string-popover__diagnostics {
  flex: 0 0 auto;
  margin: 0;
  padding: var(--oc-space-xs) var(--oc-space-md);
  border-top: var(--oc-border-width) solid var(--oc-fg-danger);
  background: var(--oc-bg-danger-subtle);
  color: var(--oc-fg-danger);
}

</style>
