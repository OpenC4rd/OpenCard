<!--
  使用说明：
  - 作为通用字段编辑器使用，输入 `inputs` 与 `sortMode`。
  - 字段更新/添加/重置/删除都通过事件上抛，不直接改写传入 record。

  职责边界：
  - 负责 schema 解析、分类展示（含本地化）、field 编辑器分派与“+ 添加字段”交互。
  - 只上抛编辑意图，不承载业务写回策略。

  主要输出事件：
  - `update-property`（字段更新意图）
  - `add-property`（字段新增意图）
  - `reset-property`（字段重置意图）
  - `delete-property`（字段删除意图）
-->
<template>
  <div ref="propertyEditorRoot" class="property-editor" :class="{ 'is-delete-mode': deleteMode }">
    <OcEmpty v-if="inputs.length === 0">{{ t('propertyEditor.emptySelection') }}</OcEmpty>
    <template v-else>
      <OcPanel padding="none" border="none" tone="transparent" gap="none">
        <section v-for="source in displaySources" :key="source.key" class="property-editor__source">
          <header class="property-editor__source-header">
            <span class="property-editor__icon-slot" aria-hidden="true">
              <OcIcon name="data.symbol-class" size="md" tone="muted" />
            </span>
            <OcText class="property-editor__source-title" :truncate="true">{{ source.title }}</OcText>
          </header>

          <section v-for="category in source.categories" :key="`${source.key}:${category.key}`"
            class="property-editor__category">
            <header class="property-editor__category-header"
              :tabindex="resolveCategoryActions(category).length > 0 ? 0 : undefined"
              @contextmenu="openCategoryContextMenu($event, category)"
              @keydown="openCategoryKeyboardMenu($event, category)">
              <span class="property-editor__category-indent" aria-hidden="true" />
              <span class="property-editor__icon-slot" aria-hidden="true">
                <OcIcon :name="category.icon" size="md" tone="muted" />
              </span>
              <OcText class="property-editor__category-title" :truncate="true">{{ category.title }}</OcText>
              <span class="property-editor__category-actions">
                <OcActionButton v-for="action in resolveCategoryActions(category)" :key="action.key"
                  :action="action" size="sm" variant="ghost"
                  @select="handleCategoryAction($event, category)" />
              </span>
            </header>

            <div class="property-editor__fields">
            <div v-for="entry in category.entries" :key="`${source.key}:${category.key}:${entry.key}`"
              class="property-editor__row"
              :class="{ 'is-revealed': revealedFieldIdentity === fieldIdentity(category.inputKey, entry.key) }"
              :data-input-key="category.inputKey" :data-field-key="entry.key">
              <div class="property-editor__row-label">
                <OcIcon :name="getPropertyFieldIcon(entry.definition.fieldType)" tone="muted" size="md" />
                <OcIcon v-if="fieldWarnings?.has(fieldIdentity(category.inputKey, entry.key))"
                  name="status.warning" tone="warning" size="sm"
                  :data-tooltip="fieldWarnings.get(fieldIdentity(category.inputKey, entry.key))" />
                <button type="button" class="property-editor__field-key-button"
                  :data-tooltip="t('propertyEditor.actions.copyFieldKeyTooltip', { key: entry.key })"
                  :aria-label="t('propertyEditor.actions.copyFieldKey', { key: entry.key })"
                  @click.stop="copyFieldKey(entry.key)">
                  <OcText class="property-editor__row-label-text" :truncate="true">{{ entry.label }}</OcText>
                </button>
              </div>
              <div class="property-editor__value">
                <span v-if="entry.readonly" class="property-editor__readonly-value">
                  {{ formatPropertyFieldReadonlyValue(entry.definition, entry.value) }}
                </span>
                <PropertyFieldRenderer v-else
                  :ref="component => setFieldRendererRef(fieldIdentity(category.inputKey, entry.key), component)"
                  class="entry-control"
                  :definition="entry.definition"
                  :value="entry.value"
                  :editor-id="resolveFieldEditorState(category.inputKey, entry).editorId"
                  @update:value="handleFieldValueUpdate(category.inputKey, entry, $event)"
                />
                <PropertyFieldActionRail v-if="!entry.readonly"
                  :actions="resolveFieldActions(category.inputKey, entry)"
                  @action="handleFieldAction(category.inputKey, entry, $event)"
                />
                <span v-if="entry.tail" class="property-editor__tail">
                  <template v-for="(part, index) in normalizeNodeTail(entry.tail)"
                    :key="typeof part === 'string' ? `text:${index}` : `part:${index}`">
                    <OcText v-if="typeof part === 'string'" tone="muted" size="xs">{{ part }}</OcText>
                    <span v-else-if="part.type === 'badge'" class="property-editor__tail-badge" role="img"
                      :aria-label="part.label" :data-tooltip="part.label">
                      <OcIcon :name="part.icon" :tone="part.tone" size="sm" />
                    </span>
                  </template>
                </span>
              </div>
            </div>
            </div>
          </section>
        </section>
      </OcPanel>
    </template>
  </div>

</template>

<script setup lang="ts">
// Vue 基础能力与依赖组件。
import { computed, nextTick, onBeforeUnmount, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifyAppError } from '../../../features/notifications/titlebarNotices'
import type {
  PropertyEditorBindingInterpreter,
  PropertyEditorCategoryDefinition,
  PropertyEditorFieldIntent,
  PropertyEditorInput,
  PropertyEditorAddMutation,
  PropertyEditorMutation,
  PropertyEditorSortMode,
} from './propertyEditor.types'
import {
  usePropertyEditorView,
  type PropertyEditorCategoryView,
  type PropertyEditorEntry,
} from './usePropertyEditorView'
import OcEmpty from '../../../components/base/OcEmpty.vue'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import type { OcActionDefinition } from '../action/action.types'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcText from '../../../components/base/OcText.vue'
import OcPanel from '../../../components/base/OcPanel.vue'
import PropertyFieldActionRail from './PropertyFieldActionRail.vue'
import PropertyFieldRenderer from './PropertyFieldRenderer.vue'
import {
  createPropertyFieldEditorModeAction,
  usePropertyFieldEditorModes,
} from './propertyFieldEditorMode'
import { getPropertyFieldIcon } from './propertyFieldRegistry'
import { formatPropertyFieldReadonlyValue } from './propertyFieldRegistry'
import { useFloatingMenu } from '../../../composables/useFloatingMenu'
import { normalizeNodeTail } from '../node/node.types'

// 输出事件协议。
const emit = defineEmits<{
  (e: 'update-property', payload: PropertyEditorMutation): void
  (e: 'add-property', payload: PropertyEditorAddMutation): void
  (e: 'reset-property', payload: PropertyEditorFieldIntent): void
  (e: 'delete-property', payload: PropertyEditorFieldIntent): void
}>()

// 组件输入协议。
const props = defineProps<{
  inputs: readonly PropertyEditorInput[]
  categories?: ReadonlyMap<string, PropertyEditorCategoryDefinition>
  sortMode: PropertyEditorSortMode
  bindingInterpreter?: PropertyEditorBindingInterpreter
  deleteMode?: boolean
  fieldWarnings?: ReadonlyMap<string, string>
}>()

const { t, te } = useI18n()
const { openContextMenu } = useFloatingMenu()
const fieldEditorModes = usePropertyFieldEditorModes()

function resolveLocalizedText(messageKey: string, fallback: string): string {
  if (te(messageKey)) {
    return t(messageKey)
  }

  return fallback
}

const addFieldActionText = computed(() =>
  resolveLocalizedText('propertyEditor.actions.addField', 'Add Field')
)
const resetFieldActionText = computed(() =>
  resolveLocalizedText('propertyEditor.actions.reset', 'Reset')
)
const deleteFieldActionText = computed(() => resolveLocalizedText('propertyEditor.actions.delete', 'Delete'))
const ADD_PROPERTY_ACTION_KEY = 'add-property'
const ADD_PROPERTY_FIELD_ACTION_PREFIX = 'add-property:'
const propertyEditorRoot = ref<HTMLElement | null>(null)
const revealedFieldIdentity = ref<string | null>(null)
const fieldRendererRefs = new Map<string, { activate: () => boolean | Promise<boolean> }>()
let revealHighlightTimer: ReturnType<typeof setTimeout> | null = null

function setFieldRendererRef(identity: string, component: unknown): void {
  const handle = component as { activate?: () => boolean | Promise<boolean> } | null
  if (handle?.activate) fieldRendererRefs.set(identity, { activate: handle.activate })
  else fieldRendererRefs.delete(identity)
}

async function copyFieldKey(fieldKey: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(fieldKey)
  } catch (error) {
    notifyAppError('OC-E1002', { source: 'property-field-key', fieldKey, error })
  }
}

const { displaySources } = usePropertyEditorView({
  inputs: toRef(props, 'inputs'),
  categories: computed(() => props.categories ?? new Map()),
  sortMode: toRef(props, 'sortMode'),
  otherCategory: computed(() => ({
    title: resolveLocalizedText('propertyEditor.categories.other', 'Other'),
    icon: 'data.list-tree',
  })),
})

function emitPropertyValue(sourceKey: string, fieldKey: string, value: unknown): void {
  emit('update-property', { key: sourceKey, fieldKey, value })
}

function fieldIdentity(inputKey: string, fieldKey: string): string {
  return `${inputKey}\u0000${fieldKey}`
}

function resolveFieldEditorState(inputKey: string, entry: PropertyEditorEntry) {
  return fieldEditorModes.resolve({
    identity: fieldIdentity(inputKey, entry.key),
    definition: entry.definition,
    value: entry.value,
    bindingInterpreter: props.bindingInterpreter,
  })
}

function resolveFieldActions(inputKey: string, entry: PropertyEditorEntry): OcActionDefinition[] {
  const actions: OcActionDefinition[] = []
  const modeAction = createPropertyFieldEditorModeAction(
    resolveFieldEditorState(inputKey, entry),
    entry.definition,
    {
      useFieldEditor: t('propertyEditor.bindings.useFieldEditor'),
      useRawStringEditor: t('propertyEditor.bindings.useRawEditor'),
    },
  )
  if (modeAction) actions.push(modeAction)
  if (entry.definition.resettable) {
    actions.push({ key: 'reset-property', icon: 'action.discard', title: resetFieldActionText.value })
  }
  if (props.deleteMode && entry.definition.deletable) {
    actions.push({
      key: 'delete-property',
      icon: 'action.delete',
      iconTone: 'danger',
      title: deleteFieldActionText.value,
    })
  }
  return actions
}

function handleFieldAction(inputKey: string, entry: PropertyEditorEntry, actionKey: string): void {
  const identity = fieldIdentity(inputKey, entry.key)
  if (fieldEditorModes.select(identity, actionKey)) return
  if (actionKey === 'reset-property') emitResetProperty(inputKey, entry.fieldKey)
  else if (actionKey === 'delete-property') emitDeleteProperty(inputKey, entry.fieldKey)
}

function handleFieldValueUpdate(inputKey: string, entry: PropertyEditorEntry, value: unknown): void {
  const identity = fieldIdentity(inputKey, entry.key)
  if (resolveFieldEditorState(inputKey, entry).editorId === 'raw-string') {
    fieldEditorModes.preserveRawString(identity)
  }
  emitPropertyValue(inputKey, entry.fieldKey, value)
}

// 添加字段与重置交互。
function resolveCategoryActions(category: PropertyEditorCategoryView): OcActionDefinition[] {
  const actions: OcActionDefinition[] = []
  if (category.addableFields.length > 0) {
    actions.push({
      key: ADD_PROPERTY_ACTION_KEY,
      icon: 'action.add',
      title: `${addFieldActionText.value} (${category.addableFields.length})`,
      children: category.addableFields.map((field) => ({
        key: `${ADD_PROPERTY_FIELD_ACTION_PREFIX}${field.key}`,
        icon: getPropertyFieldIcon(field.definition.fieldType),
        title: field.label,
      })),
    })
  }
  return actions
}

function handleCategoryAction(payload: { key: string }, category: PropertyEditorCategoryView): void {
  if (!payload.key.startsWith(ADD_PROPERTY_FIELD_ACTION_PREFIX)) {
    return
  }

  const fieldKey = payload.key.slice(ADD_PROPERTY_FIELD_ACTION_PREFIX.length)
  const field = category.addableFields.find((item) => item.key === fieldKey)
  if (!field) {
    return
  }

  emit('add-property', { key: category.inputKey, fieldKey: field.key })
}

function openCategoryContextMenu(event: MouseEvent, category: PropertyEditorCategoryView): void {
  openContextMenu({
    event,
    items: resolveCategoryActions(category),
    onSelect: key => handleCategoryAction({ key }, category),
  })
}

function openCategoryKeyboardMenu(event: KeyboardEvent, category: PropertyEditorCategoryView): void {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
  const actions = resolveCategoryActions(category)
  if (actions.length === 0 || !(event.currentTarget instanceof HTMLElement)) return
  event.preventDefault()
  openContextMenu({
    anchor: event.currentTarget,
    items: actions,
    onSelect: key => handleCategoryAction({ key }, category),
  })
}

function emitDeleteProperty(sourceKey: string, fieldKey: string): void {
  emit('delete-property', { key: sourceKey, fieldKey })
}

function emitResetProperty(key: string, fieldKey: string): void {
  emit('reset-property', { key, fieldKey })
}

// 字段默认值策略。
function findFieldRow(inputKey: string, fieldKey: string): HTMLElement | null {
  const rows = propertyEditorRoot.value?.querySelectorAll<HTMLElement>(
    '.property-editor__row[data-input-key][data-field-key]',
  ) ?? []
  return Array.from(rows).find((row) =>
    row.dataset.inputKey === inputKey && row.dataset.fieldKey === fieldKey
  ) ?? null
}

function toCodeUnitOffset(value: string, characterOffset: number): number {
  return Array.from(value).slice(0, characterOffset).join('').length
}

function focusFieldControl(row: HTMLElement, characterOffset?: number): void {
  const control = row.querySelector<HTMLElement>(
    '.entry-control input:not([type="hidden"]), .entry-control textarea, .entry-control select, '
      + '.entry-control button:not([disabled]), .entry-control [tabindex]:not([tabindex="-1"])',
  )
  control?.focus()
  if (
    characterOffset !== undefined
    && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)
  ) {
    const selectionOffset = toCodeUnitOffset(control.value, characterOffset)
    try {
      control.setSelectionRange(selectionOffset, selectionOffset)
    } catch {
      // Some non-text input types expose setSelectionRange but reject calls.
    }
  }
}

function highlightField(inputKey: string, fieldKey: string): void {
  revealedFieldIdentity.value = fieldIdentity(inputKey, fieldKey)
  if (revealHighlightTimer) clearTimeout(revealHighlightTimer)
  revealHighlightTimer = setTimeout(() => {
    revealedFieldIdentity.value = null
    revealHighlightTimer = null
  }, 1600)
}

async function revealField(
  inputKey: string,
  fieldKey: string,
  characterOffset?: number,
): Promise<boolean> {
  await nextTick()
  const row = findFieldRow(inputKey, fieldKey)
  if (!row) return false

  row.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  focusFieldControl(row, characterOffset)
  highlightField(inputKey, fieldKey)
  return true
}

async function activateField(inputKey: string, fieldKey: string): Promise<boolean> {
  await nextTick()
  const row = findFieldRow(inputKey, fieldKey)
  if (!row) return false

  row.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  highlightField(inputKey, fieldKey)
  const activated = await fieldRendererRefs.get(fieldIdentity(inputKey, fieldKey))?.activate()
  if (!activated) focusFieldControl(row)
  return true
}

defineExpose({ revealField, activateField })

onBeforeUnmount(() => {
  if (revealHighlightTimer) clearTimeout(revealHighlightTimer)
})
</script>

<style scoped>
.property-editor {
  container-type: inline-size;
  min-width: 0;
  padding: 0;
  font-family: var(--oc-font-sans);
  font-size: var(--oc-text-base);
  line-height: 1.4;
}

.property-editor__source {
  min-width: 0;
}

.property-editor__source + .property-editor__source {
  border-top: 1px solid var(--oc-border-muted);
}

.property-editor__source-header,
.property-editor__category-header {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: var(--oc-size-md);
  padding: 0 var(--oc-space-2);
}

.property-editor__source-header {
  color: var(--oc-fg-default);
  font-weight: 600;
}

.property-editor__category-header {
  color: var(--oc-fg-muted);
  transition: background-color var(--oc-duration-fast) var(--oc-ease);
}

.property-editor__category-header:hover,
.property-editor__category-header:focus-within {
  background: var(--oc-bg-hover);
}

.property-editor__category-indent {
  width: 12px;
  flex: 0 0 12px;
}

.property-editor__icon-slot {
  display: inline-flex;
  flex: 0 0 16px;
  width: 16px;
  align-items: center;
  justify-content: center;
  margin-right: var(--oc-space-2);
}

.property-editor__source-title,
.property-editor__category-title {
  min-width: 0;
  flex: 1 1 auto;
}

.property-editor__category-title {
  font-size: var(--oc-text-sm);
}

.property-editor__category-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  opacity: 0;
  transition: opacity var(--oc-duration-fast) var(--oc-ease);
}

.property-editor__category-header:hover .property-editor__category-actions,
.property-editor__category-header:focus-within .property-editor__category-actions {
  opacity: 1;
}

.property-editor__fields {
  min-width: 0;
}

.property-editor__row {
  display: grid;
  grid-template-columns: minmax(76px, 88px) minmax(0, 1fr);
  align-items: start;
  gap: var(--oc-space-3);
  width: 100%;
  min-width: 0;
  min-height: var(--oc-property-row-height);
  padding: 0 var(--oc-space-2) 0 32px;
  box-sizing: border-box;
  transition: background-color var(--oc-duration-fast) var(--oc-ease);
}

.property-editor__row:hover,
.property-editor__row:focus-within {
  background: var(--oc-bg-hover);
}

.property-editor__row.is-revealed {
  background: var(--oc-bg-selected);
  box-shadow: inset 2px 0 0 var(--oc-fg-accent);
}

.property-editor__row-label {
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-2);
  min-width: 0;
  min-height: var(--oc-property-row-height);
  overflow: hidden;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.property-editor__row-label-text {
  min-width: 0;
}

.property-editor__field-key-button {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 1px;
  background: transparent;
  color: inherit;
  font: inherit;
  transition: color var(--oc-duration-fast) var(--oc-ease);
}

.property-editor__field-key-button:hover,
.property-editor__field-key-button:focus-visible {
  color: var(--oc-fg-default);
}

.property-editor__field-key-button:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}

.entry-control {
  margin: var(--oc-space-1) 0;
  width: 100%;
  min-width: 0;
}

.property-editor__value {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--oc-space-1);
  min-width: 0;
}

.property-editor__readonly-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--oc-fg-default);
}

.property-editor__tail {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--oc-space-1);
}

.property-editor__tail-badge { display: inline-flex; align-items: center; }

@media (hover: none) {
  .property-editor__category-actions {
    opacity: 1;
  }
}

@container (max-width: 240px) {
  .property-editor__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--oc-space-1);
  }
}
</style>
