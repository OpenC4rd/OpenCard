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
        <div class="property-editor__rows">
          <template v-for="row in displayRows" :key="row.key">
            <header v-if="row.kind === 'source'" class="property-editor__source-header"
              :style="indentStyle(row.level)">
              <span class="property-editor__icon-slot" aria-hidden="true">
                <OcIcon name="mdiCodeBraces" size="md" tone="muted" />
              </span>
              <OcText class="property-editor__source-title" :truncate="true">{{ row.title }}</OcText>
            </header>

            <header v-else-if="row.kind === 'category' && row.category" class="property-editor__category-header"
              :style="indentStyle(row.level)"
              :tabindex="resolveCategoryActions(row.category).length > 0 ? 0 : undefined"
              @contextmenu="openCategoryContextMenu($event, row.category)"
              @keydown="openCategoryKeyboardMenu($event, row.category)"
              @keydown.esc="dismissContextMenuOnEscape">
              <span class="property-editor__icon-slot" aria-hidden="true">
                <OcIcon :name="row.category.icon" size="md" tone="muted" />
              </span>
              <OcText class="property-editor__category-title" :truncate="true">{{ row.category.title }}</OcText>
              <span class="property-editor__category-actions">
                <OcActionButton v-for="action in resolveCategoryActions(row.category)" :key="action.key"
                  :action="action" size="sm" variant="ghost"
                  @select="handleCategoryAction($event, row.category)" />
              </span>
            </header>

            <div v-else-if="row.kind === 'field' && row.category && row.entry"
              class="property-editor__row"
              :style="indentStyle(row.level)"
              :class="{ 'is-revealed': revealedFieldIdentity === fieldIdentity(row.category.inputKey, row.entry.key) }"
              :data-input-key="row.category.inputKey" :data-field-key="row.entry.key">
              <div class="property-editor__row-label">
                <OcIcon :name="getPropertyFieldIcon(row.entry.definition)" tone="muted" size="md" />
                <OcIcon v-if="fieldWarnings?.has(fieldIdentity(row.category.inputKey, row.entry.key))"
                  name="mdiAlertOutline" tone="warning" size="sm"
                  :data-tooltip="fieldWarnings.get(fieldIdentity(row.category.inputKey, row.entry.key))" />
                <button type="button" class="property-editor__field-key-button"
                  :data-tooltip="t('propertyEditor.actions.copyFieldKeyTooltip', { key: row.entry.key })"
                  :aria-label="t('propertyEditor.actions.copyFieldKey', { key: row.entry.key })"
                  @click.stop="copyFieldKey(row.entry.key)">
                  <OcText class="property-editor__row-label-text" :truncate="true">{{ row.entry.label }}</OcText>
                </button>
              </div>
              <div class="property-editor__value">
                <span v-if="row.entry.readonly" class="property-editor__readonly-value">
                  {{ formatPropertyFieldReadonlyValue(row.entry.definition, row.entry.value) }}
                </span>
                <PropertyFieldRenderer v-else
                  :ref="component => setFieldRendererRef(fieldIdentity(row.category!.inputKey, row.entry!.key), component)"
                  class="entry-control"
                  :definition="row.entry.definition"
                  :value="row.entry.value"
                  :editor-id="resolveFieldEditorState(row.category.inputKey, row.entry).editorId"
                  :capabilities="capabilities"
                  @update:value="handleFieldValueUpdate(row.category.inputKey, row.entry, $event)"
                  @preview:value="emit('preview-property', { key: row.category.inputKey, fieldKey: row.entry.fieldKey, value: $event })"
                  @cancel:value="emit('cancel-property', { key: row.category.inputKey, fieldKey: row.entry.fieldKey })"
                />
                <PropertyFieldActionRail v-if="!row.entry.readonly"
                  :actions="resolveFieldActions(row.category.inputKey, row.entry)"
                  @action="handleFieldAction(row.category.inputKey, row.entry, $event)"
                />
                <span v-if="row.entry.tail" class="property-editor__tail">
                  <template v-for="(part, index) in normalizeNodeTail(row.entry.tail)"
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
          </template>
        </div>
      </OcPanel>
    </template>
    <OcOverlayMarker
      ref="contextMenu"
      group="context-menu"
      :anchor="contextAnchor"
      :owner="contextOwner"
      :open="contextOpen"
      @update:open="contextOpen = $event"
      @close="handleContextMenuClose"
    >
      <OcActionMenu :actions="contextItems" overlay-key="context-menu" :on-select="selectContextAction"
        @close="handleContextMenuClose" />
    </OcOverlayMarker>
  </div>

</template>

<script setup lang="ts">
// Vue 基础能力与依赖组件。
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, toRef, type CSSProperties } from 'vue'
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
  PropertyFieldCapabilities,
} from './propertyEditor.types'
import { isPropertyRemovable } from './propertyRemovability'
import {
  usePropertyEditorView,
  type PropertyEditorCategoryView,
  type PropertyEditorEntry,
} from './usePropertyEditorView'
import OcEmpty from '../../../components/base/OcEmpty.vue'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import OcActionMenu from '../../../components/standard/OcActionMenu.vue'
import OcOverlayMarker from '../../../components/standard/OcOverlayMarker.vue'
import type { OcActionDefinition, OcActionMenuEntry } from '../action/action.types'
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
import { useOverlayDismiss } from '../useOverlayDismiss'
import { normalizeNodeTail } from '../node/node.types'

// 输出事件协议。
const emit = defineEmits<{
  (e: 'update-property', payload: PropertyEditorMutation): void
  (e: 'preview-property', payload: PropertyEditorMutation): void
  (e: 'cancel-property', payload: PropertyEditorFieldIntent): void
  (e: 'add-property', payload: PropertyEditorAddMutation): void
  (e: 'reset-property', payload: PropertyEditorFieldIntent): void
  (e: 'delete-property', payload: PropertyEditorFieldIntent): void
}>()

// 组件输入协议。
const props = withDefaults(defineProps<{
  inputs: readonly PropertyEditorInput[]
  categories?: ReadonlyMap<string, PropertyEditorCategoryDefinition>
  sortMode: PropertyEditorSortMode
  bindingInterpreter?: PropertyEditorBindingInterpreter
  /** Global default for field raw-string switching; a field definition may override it. */
  allowRawStringEditor?: boolean
  deleteMode?: boolean
  fieldWarnings?: ReadonlyMap<string, string>
  capabilities?: PropertyFieldCapabilities
}>(), {
  allowRawStringEditor: false,
})

const { t } = useI18n()

const fieldEditorModes = usePropertyFieldEditorModes()

const addFieldActionText = computed(() => t('propertyEditor.actions.addField'))
const resetFieldActionText = computed(() => t('propertyEditor.actions.reset'))
const deleteFieldActionText = computed(() => t('propertyEditor.actions.delete'))
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
    title: t('propertyEditor.categories.uncategorized'),
    icon: 'mdiFileTreeOutline',
  })),
})

/**
 * 拍平后的一行。三层在 DOM 上是同级兄弟行、共用同一个间距容器，
 * 差别只有 `level`（缩进等级）和行的内容，与 OcTree 的可见节点列表一致。
 */
interface PropertyEditorDisplayRow {
  key: string
  kind: 'source' | 'category' | 'field'
  level: 0 | 1 | 2
  title: string
  /** 分类行自身，以及属性行所属的分类。 */
  category: PropertyEditorCategoryView | null
  /** 属性行的字段条目。 */
  entry: PropertyEditorEntry | null
}

const displayRows = computed<PropertyEditorDisplayRow[]>(() => {
  const rows: PropertyEditorDisplayRow[] = []
  for (const source of displaySources.value) {
    rows.push({
      key: `source:${source.key}`,
      kind: 'source',
      level: 0,
      title: source.title,
      category: null,
      entry: null,
    })
    for (const category of source.categories) {
      rows.push({
        key: `category:${source.key}:${category.key}`,
        kind: 'category',
        level: 1,
        title: category.title,
        category,
        entry: null,
      })
      for (const entry of category.entries) {
        rows.push({
          key: `field:${source.key}:${category.key}:${entry.key}`,
          kind: 'field',
          level: 2,
          title: entry.label,
          category,
          entry,
        })
      }
    }
  }
  return rows
})

/** 行只带自己的缩进等级，缩进步进由 CSS 的 --oc-indent-step 决定。 */
function indentStyle(level: PropertyEditorDisplayRow['level']): CSSProperties {
  return { '--property-indent': String(level) } as CSSProperties
}

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
    allowRawStringEditor: props.allowRawStringEditor,
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
    actions.push({ key: 'reset-property', icon: 'mdiUndoVariant', title: resetFieldActionText.value })
  }
  if (props.deleteMode && isPropertyRemovable(entry.definition)) {
    actions.push({
      key: 'delete-property',
      icon: 'mdiTrashCanOutline',
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
      icon: 'mdiPlus',
      title: `${addFieldActionText.value} (${category.addableFields.length})`,
      children: category.addableFields.map((field) => ({
        key: `${ADD_PROPERTY_FIELD_ACTION_PREFIX}${field.key}`,
        icon: getPropertyFieldIcon(field.definition),
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

const contextMenu = ref<{ open: () => void; close: () => void } | null>(null)
const contextOpen = ref(false)
const contextItems = shallowRef<readonly OcActionMenuEntry[]>([])
/** 未打开时的占位：marker 要求锚点非空，openMenuAt 一定先写锚点再 open()。 */
const contextAnchor = shallowRef<HTMLElement | DOMRect>(new DOMRect())
const contextOwner = shallowRef<HTMLElement | null>(null)
const contextHandler = shallowRef<((key: string) => void) | null>(null)

function openMenuAt(
  anchor: HTMLElement | DOMRect,
  items: readonly OcActionMenuEntry[],
  onSelect: (key: string) => void,
  owner: HTMLElement,
): void {
  if (items.length === 0) return
  contextItems.value = items
  contextAnchor.value = anchor
  contextOwner.value = owner
  contextHandler.value = onSelect
  // marker 的 open() 读的是已提交的 props：等这帧把新锚点与归属落到 marker 上再开，
  // 否则换触发元素时会沿用上一次的 anchor / owner。
  void nextTick(() => contextMenu.value?.open())
}

function handleContextMenuClose(): void {
  contextOpen.value = false
  contextHandler.value = null
}

/** Esc：菜单开着时收掉它并阻止上层弹窗把同一个 Esc 当成自己的关闭；没开就保持原义。 */
function dismissContextMenuOnEscape(event: KeyboardEvent): void {
  if (!contextOpen.value) return
  event.preventDefault()
  contextMenu.value?.close()
}

/** 选中一项先收起菜单再执行：动作自己带闭包，不依赖菜单还开着。 */
function selectContextAction(key: string): void {
  const handler = contextHandler.value
  contextMenu.value?.close()
  handler?.(key)
}

useOverlayDismiss(() => contextOpen.value, () => contextOwner.value, () => contextMenu.value?.close())

// 属性面板被卸载时它打开的菜单不能留在组里变成空面板。
onBeforeUnmount(() => { contextMenu.value?.close() })

function openCategoryContextMenu(event: MouseEvent, category: PropertyEditorCategoryView): void {
  const owner = event.currentTarget
  if (!(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(new DOMRect(event.clientX, event.clientY, 0, 0), resolveCategoryActions(category),
    key => handleCategoryAction({ key }, category), owner)
}

function openCategoryKeyboardMenu(event: KeyboardEvent, category: PropertyEditorCategoryView): void {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
  const owner = event.currentTarget
  if (!(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(owner, resolveCategoryActions(category), key => handleCategoryAction({ key }, category), owner)
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

/* 三层行共用的容器：只有一个均匀间距（与树的节点空隙同档），层级不进 DOM 结构。 */
.property-editor__rows {
  display: grid;
  gap: var(--oc-space-2xs);
  min-width: 0;
}

/*
 * 对象栏、分类栏、属性行是同级行：几何一致，只有起始缩进不同，
 * 缩进步进取自 --oc-indent-step（与树、数据表共用）。
 */
.property-editor__source-header,
.property-editor__category-header,
.property-editor__row {
  --property-indent: 0;
  box-sizing: border-box;
  min-height: var(--oc-property-row-height);
  padding-block: 0;
  padding-inline: var(--oc-space-xs);
  padding-inline-start: calc(var(--oc-space-xs) + var(--property-indent) * var(--oc-indent-step));
  border-radius: var(--oc-radius-control);
  transition: background-color var(--oc-duration-quick) var(--oc-ease);
}

.property-editor__source-header,
.property-editor__category-header {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.property-editor__source-header {
  color: var(--oc-fg-default);
  font-weight: 600;
}

.property-editor__category-header {
  color: var(--oc-fg-muted);
}

.property-editor__category-header:hover,
.property-editor__category-header:focus-within {
  background-image: var(--oc-overlay-hover);
}

.property-editor__icon-slot {
  display: inline-flex;
  flex: 0 0 var(--oc-icon-size-md);
  width: var(--oc-icon-size-md);
  align-items: center;
  justify-content: center;
  margin-right: var(--oc-space-xs);
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
  transition: opacity var(--oc-duration-quick) var(--oc-ease);
}

.property-editor__category-header:hover .property-editor__category-actions,
.property-editor__category-header:focus-within .property-editor__category-actions {
  opacity: 1;
}

.property-editor__row {
  display: grid;
  grid-template-columns: minmax(76px, 88px) minmax(0, 1fr);
  align-items: start;
  gap: var(--oc-space-sm);
  width: 100%;
  min-width: 0;
}

/* 行的悬浮高光不再出现：行内本身就是输入控件，靠控件的焦点外观区分即可。 */
.property-editor__row:focus-within {
  background-image: var(--oc-overlay-hover);
}

.property-editor__row.is-revealed {
  background-color: var(--oc-bg-selected);
  box-shadow: inset 2px 0 0 var(--oc-fg-accent);
}

.property-editor__row-label {
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-xs);
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
  transition: color var(--oc-duration-quick) var(--oc-ease);
}

.property-editor__field-key-button:hover,
.property-editor__field-key-button:focus-visible {
  color: var(--oc-fg-default);
}

.property-editor__field-key-button:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}

/* 子编辑器占满整行高度，不再靠上下外边距留白。 */
.entry-control {
  margin: 0;
  width: 100%;
  min-width: 0;
}

.property-editor__value {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--oc-space-2xs);
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
  gap: var(--oc-space-2xs);
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
    gap: var(--oc-space-2xs);
  }
}
</style>
