<template>
  <div :ref="setAnchor" class="rich-text-string-field">
    <button v-if="!definition.isReadonly" type="button" class="rich-text-string-field__preview"
      :aria-expanded="open" @click="openEditor">
      <RichTextPreview v-if="stringValue" class="rich-text-string-field__content"
        :html="stringValue" :project-icon-catalog="definition.projectIcon?.catalog"
        :package-icon-sources="definition.projectIcon?.sources" />
      <span v-else class="rich-text-string-field__empty">-</span>
    </button>
    <div v-else class="rich-text-string-field__preview rich-text-string-field__preview--readonly">
      <RichTextPreview v-if="stringValue" class="rich-text-string-field__content"
        :html="stringValue" :project-icon-catalog="definition.projectIcon?.catalog"
        :package-icon-sources="definition.projectIcon?.sources" />
      <span v-else class="rich-text-string-field__empty">-</span>
    </div>

  <OcDialog class="rich-text-string-popover" :open="open" :title="definition.title" size="lg"
      :padded="false" :scrollable="false" height-mode="fixed" height="workspace"
      close-on-backdrop @request-close="cancelEditor">
	          <div class="rich-text-string-popover__editor">
            <OcRichTextEditor v-if="editorMode === 'rich'" ref="richTextEditor" :model-value="draftValue"
              :binding-completion="definition.binding?.provider"
		              :project-icon-catalog="definition.projectIcon?.catalog"
              :package-icon-sources="definition.projectIcon?.sources"
              :font-options="definition.fontOptions"
              :base-style="definition.richTextBaseStyle"
              :image-directory-provider="definition.richTextImageDirectoryProvider"
              :image-completion-provider="definition.richTextImageCompletionProvider"
              :resolve-image-source="definition.richTextImageResolver"
              @update:model-value="draftValue = $event" />
            <OcFieldInput v-else ref="sourceEditor" as="textarea" variant="plain" full-width mono
              class="rich-text-string-popover__source" :value="sourceValue"
              resize="none" autocomplete="off" spellcheck="false"
              :aria-label="tr('propertyEditor.richText.htmlSource', 'HTML 源码')"
	              @input="handleSourceInput" />
	          </div>
	          <p v-if="sourceDiagnostics.length" class="rich-text-string-popover__diagnostics" role="alert">
	            {{ sourceDiagnostics[0]?.path }}: {{ sourceDiagnostics[0]?.message }}
	          </p>
      <template #footer>
          <div class="rich-text-string-popover__footer-content">
            <OcOptionGroup :model-value="editorMode" :options="editorModeOptions"
              size="md" icon-only appearance="sliding-outline" :aria-label="tr('propertyEditor.richText.editorView', '编辑视图')"
              @update:model-value="setEditorMode" />
            <span class="rich-text-string-popover__actions">
              <OcButton size="md" icon-only icon="action.close" icon-tone="danger"
                :data-tooltip="tr('propertyEditor.richText.cancel', '取消')" :aria-label="tr('propertyEditor.richText.cancelEdit', '取消富文本编辑')" @click="cancelEditor" />
	              <OcButton size="md" icon-only icon="action.check" icon-tone="success" variant="soft"
	                :disabled="editorMode === 'source' && sourceDiagnostics.length > 0"
                :data-tooltip="tr('propertyEditor.richText.save', '保存')" :aria-label="tr('propertyEditor.richText.saveEdit', '保存富文本编辑')" @click="saveEditor" />
            </span>
          </div>
      </template>
    </OcDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, type ComponentPublicInstance } from 'vue'
import OcButton from '../../../../components/base/OcButton.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import OcDialog from '../../../../components/standard/OcDialog.vue'
import OcOptionGroup, { type OcOption } from '../../../../components/standard/OcOptionGroup.vue'
import { formatRichTextHtmlSource, parseRichTextHtml } from '../../../rich-text/richTextHtml'
import OcRichTextEditor from '../../rich-text/OcRichTextEditor.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'
import RichTextPreview from '../../rich-text/RichTextPreview.vue'

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
const richTextEditor = ref<{ focus: () => void } | null>(null)
const sourceEditor = ref<{ focus: () => void } | null>(null)
const open = ref(false)
const editorMode = ref<'rich' | 'source'>('rich')
const stringValue = computed(() => (props.value == null ? '' : String(props.value)))
const draftValue = ref('')
const sourceValue = ref('')
const sourceDiagnostics = computed(() => editorMode.value === 'source'
  ? parseRichTextHtml(sourceValue.value).diagnostics
  : [])
const editorModeOptions = computed<readonly OcOption[]>(() => [
  { value: 'rich', label: tr('propertyEditor.richText.richTextMode', '富文本'), icon: 'format.text-variant-outline' },
  { value: 'source', label: tr('propertyEditor.richText.htmlSource', 'HTML 源码'), icon: 'format.xml' },
])

async function openEditor(): Promise<void> {
  draftValue.value = stringValue.value
  sourceValue.value = stringValue.value
  editorMode.value = parseRichTextHtml(stringValue.value).canEnterVisualMode
    ? 'rich'
    : 'source'
  open.value = true
  await nextTick()
  if (editorMode.value === 'rich') richTextEditor.value?.focus()
  else sourceEditor.value?.focus()
}

async function setEditorMode(mode: string): Promise<void> {
  if (mode !== 'rich' && mode !== 'source') return
  if (mode === editorMode.value) return
  if (mode === 'rich') {
    const parsed = parseRichTextHtml(sourceValue.value)
    if (!parsed.canEnterVisualMode) return
    draftValue.value = sourceValue.value
  }
  else sourceValue.value = formatRichTextHtmlSource(draftValue.value)
  editorMode.value = mode
  await nextTick()
  if (mode === 'rich') richTextEditor.value?.focus()
  else sourceEditor.value?.focus()
}

function handleSourceInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLTextAreaElement) sourceValue.value = target.value
}

function finishEditing(): void {
  open.value = false
  anchor.value?.querySelector<HTMLButtonElement>('.rich-text-string-field__preview')?.focus()
}

function cancelEditor(): void {
  finishEditing()
}

function saveEditor(): void {
  if (editorMode.value === 'source' && sourceDiagnostics.value.length > 0) return
  const normalizedValue = editorMode.value === 'source'
    ? sourceValue.value
    : draftValue.value
  if (normalizedValue !== stringValue.value) {
    emit('update:value', normalizedValue)
  }
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
  width: 100%;
  height: var(--oc-field-control-height, var(--oc-property-row-height));
  min-width: 0;
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  overflow: hidden;
  border: var(--oc-field-surface-border-width, 1px) solid var(--oc-field-surface-border-color, var(--oc-border-default));
  border-radius: var(--oc-field-surface-border-radius, var(--oc-radius-sm));
  background: var(--oc-field-surface-background, var(--oc-bg-input));
  color: var(--oc-fg-default);
  text-align: start;
  white-space: nowrap;
  cursor: text;
}

.rich-text-string-field__preview:not(.rich-text-string-field__preview--readonly):hover {
  border-color: var(--oc-field-surface-hover-border-color, var(--oc-border-strong));
}

.rich-text-string-field__preview:focus-visible {
  border-color: var(--oc-field-surface-focus-border-color, var(--oc-border-strong));
  outline: none;
  box-shadow: var(--oc-field-surface-focus-shadow, var(--oc-focus-ring));
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
  padding: var(--oc-space-4);
  overflow: auto;
  background: var(--oc-bg-input);
  color: var(--oc-fg-default);
  line-height: 1.55;
}

.rich-text-string-popover__diagnostics {
  flex: 0 0 auto;
  margin: 0;
  padding: var(--oc-space-2) var(--oc-space-4);
  border-top: var(--oc-border-width) solid var(--oc-fg-danger);
  background: var(--oc-bg-danger-subtle);
  color: var(--oc-fg-danger);
}

.rich-text-string-popover__footer-content {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-1);
}

.rich-text-string-popover__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--oc-space-1);
}
</style>
