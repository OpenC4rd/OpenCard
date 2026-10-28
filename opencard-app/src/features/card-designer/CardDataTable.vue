<template>
  <section ref="rootRef" class="card-data-table oc-data-grid" :aria-label="t('cardDesigner.dataTable.title')">
    <div ref="scrollRef" class="card-data-table__scroll oc-data-grid__scroll">
      <table class="oc-data-grid__table" :style="{ width: `${tableWidth}px` }">
        <colgroup>
          <col :style="{ width: `${getColumnWidth(FIELD_COLUMN_KEY)}px` }">
          <col v-for="column in columns" :key="column.key"
            :style="{ width: `${getColumnWidth(column.key)}px` }">
          <col :style="{ width: `${tailColumnWidth}px` }">
        </colgroup>
        <thead>
          <tr>
            <th class="card-data-table__corner oc-data-grid__corner oc-data-grid__sticky-column" scope="col">
              {{ t('cardDesigner.dataTable.fieldColumn') }}
              <OcDataGridColumnResizeHandle class="card-data-table__column-resize"
                :minimum="minimumColumnWidth" :maximum="maximumColumnWidth"
                :value="getColumnWidth(FIELD_COLUMN_KEY)"
                :label="t('cardDesigner.dataTable.resizeColumn', {
                  title: t('cardDesigner.dataTable.fieldColumn'),
                })"
                @resize-start="beginColumnResize($event, FIELD_COLUMN_KEY)"
                @resize-keydown="handleColumnResizeKeydown($event, FIELD_COLUMN_KEY)" />
            </th>
            <th v-for="column in columns" :key="column.key" class="card-data-table__data-column" scope="col">
              <form v-if="renamingColumnKey === column.key" class="card-data-table__rename"
                @submit.prevent="commitRename(column.key)">
                <OcFieldInput :value="renameDraft" size="sm" full-width autofocus
                  @input="renameDraft = ($event.target as HTMLInputElement).value"
                  @blur="commitRename(column.key)"
                  @keydown.esc.stop.prevent="cancelRename" />
              </form>
              <div v-else class="card-data-table__column-heading" tabindex="0"
                @contextmenu="openColumnContextMenu($event, column)"
                @keydown="openColumnKeyboardMenu($event, column)"
                @keydown.esc="dismissContextMenuOnEscape">
                <OcIcon :name="column.kind === 'blueprint' ? 'mdiViewDashboard' : 'mdiViewDashboardEditOutline'"
                  size="md" tone="muted" />
                <span>{{ column.title }}</span>
                <OcButton
                  v-if="!props.readonly && column.kind === 'instance'"
                  icon-only
                  size="sm"
                  variant="ghost"
                  :icon="column.exported ? 'mdiEyeOutline' : 'mdiEyeOffOutline'"
                  :icon-tone="column.exported ? 'accent' : 'muted'"
                  :data-tooltip="column.exported
                    ? t('cardDesigner.dataTable.excludeInstanceFromExport')
                    : t('cardDesigner.dataTable.includeInstanceInExport')"
                  :aria-label="column.exported
                    ? t('cardDesigner.dataTable.excludeInstanceFromExport')
                    : t('cardDesigner.dataTable.includeInstanceInExport')"
                  @click="emit('set-instance-exported', column.key, !column.exported)" />
                <OcActionButton v-if="!props.readonly" :action="columnAction(column)" size="sm" variant="ghost"
                  @select="handleColumnAction(column, $event.key)" />
              </div>
              <OcDataGridColumnResizeHandle class="card-data-table__column-resize"
                :minimum="minimumColumnWidth" :maximum="maximumColumnWidth"
                :value="getColumnWidth(column.key)"
                :label="t('cardDesigner.dataTable.resizeColumn', { title: column.title })"
                @resize-start="beginColumnResize($event, column.key)"
                @resize-keydown="handleColumnResizeKeydown($event, column.key)" />
            </th>
            <th class="card-data-table__add-column oc-data-grid__tail" scope="col">
              <OcButton v-if="!props.readonly" icon-only size="sm" variant="ghost" icon="mdiPlus"
                :data-tooltip="t('cardDesigner.dataTable.addInstance')"
                :aria-label="t('cardDesigner.dataTable.addInstance')" @click="emit('add-instance')" />
            </th>
          </tr>
        </thead>
        <template v-for="face in faceGroups" :key="face.key">
          <tbody class="card-data-table__face-group">
            <tr class="card-data-table__face-row">
              <th class="oc-data-grid__sticky-column" scope="rowgroup">
                <span class="card-data-table__face-heading"
                  :tabindex="faceCommands(face).length > 0 ? 0 : undefined"
                  @contextmenu="openFaceContextMenu($event, face)"
                  @keydown="openFaceKeyboardMenu($event, face)"
                  @keydown.esc="dismissContextMenuOnEscape">
                  <OcIcon name="mdiCardsOutline" size="md" tone="muted" />
                  <span>{{ face.title }}</span>
                  <OcActionButton v-if="!props.readonly && faceBlockAction(face)" :action="faceBlockAction(face)!"
                    size="sm" variant="ghost" @select="emit('add-block', $event.key)" />
                </span>
              </th>
              <td :colspan="columns.length + 1" />
            </tr>
          </tbody>
          <tbody v-for="block in face.blocks" :key="block.key" class="card-data-table__block-group">
            <tr class="card-data-table__block-row">
              <th class="oc-data-grid__sticky-column" scope="rowgroup">
                <span class="card-data-table__block-heading" tabindex="0"
                  :style="{ paddingInlineStart: 'var(--oc-indent-step)' }"
                  @contextmenu="openBlockContextMenu($event, block)"
                  @keydown="openBlockKeyboardMenu($event, block)"
                  @keydown.esc="dismissContextMenuOnEscape">
                  <OcIcon :name="getBlockPresentation(block.type).icon" size="md"
                    :tone="getBlockPresentation(block.type).iconTone" />
                  <span>{{ block.title }}</span>
                  <OcActionButton v-if="!props.readonly" :action="blockFieldAction(block)" size="sm" variant="ghost"
                    @select="handleBlockAction(block.key, $event.key)" />
                  <OcActionButton v-if="!props.readonly" :action="removeBlockAction()" size="sm" variant="ghost"
                    @select="handleBlockAction(block.key, $event.key)" />
                </span>
              </th>
              <td :colspan="columns.length + 1" />
            </tr>
            <tr v-for="field in block.fields" :key="field.key" class="card-data-table__field-row"
              :class="{ 'is-multiline': isMultilineField(field) }"
              :data-block-id="block.key" :data-field-key="field.key">
              <th class="oc-data-grid__sticky-column" scope="row">
                <span class="card-data-table__field-heading" tabindex="0"
                  :style="{ paddingInlineStart: 'calc(var(--oc-indent-step) * 2)' }"
                  @contextmenu="openFieldContextMenu($event, block, field)"
                  @keydown="openFieldKeyboardMenu($event, block, field)"
                  @keydown.esc="dismissContextMenuOnEscape">
                  <OcIcon :name="getPropertyFieldIcon(field.definition)" size="sm" tone="muted" />
                  <span>{{ field.title }}</span>
                  <OcActionButton v-if="!props.readonly && field.definitionEditable" :action="editFieldDefinitionAction()"
                    size="sm" variant="ghost"
                    @select="handleFieldAction(block.key, field.key, $event.key)" />
                  <OcActionButton v-if="!props.readonly" :action="excludeFieldAction()" size="sm" variant="ghost"
                    @select="handleFieldAction(block.key, field.key, $event.key)" />
                </span>
              </th>
              <td v-for="cell in field.cells" :key="cell.identity"
                class="card-data-table__cell oc-data-grid__cell"
                :class="{ 'is-inherited': cell.inherited, 'is-selected': selectedCellIdentity === cell.identity }"
                :data-card-id="cell.cardId" :ref="element => setCellElement(cell.identity, element)"
                @pointerdown="selectCell(face.key, block.key, field.key, cell)"
                @focusin="selectCell(face.key, block.key, field.key, cell)">
                <template v-if="shouldMountCell(cell.identity)">
                  <span v-if="props.readonly || cell.readonly" class="card-data-table__cell-preview oc-data-grid__cell-preview">
                    {{ formatCellPreview(cell.value) }}
                  </span>
                  <template v-else>
                    <div class="card-data-table__cell-editor oc-data-grid__cell-editor">
                      <PropertyFieldRenderer appearance="embedded"
                        :definition="resolveCellDefinition(block.key, field, cell)"
                        :value="cell.value"
                        :capabilities="capabilities"
                        :editor-id="resolveCellEditorState(block.key, field, cell).editorId"
                        @update:value="handleCellValueUpdate(block.key, field, cell, $event)" />
                      <PropertyFieldActionRail
                        :actions="resolveCellActions(block.key, field, cell)"
                        @action="handleCellAction(block.key, field, cell, $event)" />
                    </div>
                  </template>
                </template>
                <span v-else class="card-data-table__cell-preview oc-data-grid__cell-preview">{{ formatCellPreview(cell.value) }}</span>
              </td>
              <td class="card-data-table__tail-cell oc-data-grid__tail" />
            </tr>
          </tbody>
        </template>
      </table>
    </div>
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
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
} from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../components/base/OcButton.vue'
import OcFieldInput from '../../components/base/OcFieldInput.vue'
import OcIcon from '../../components/base/OcIcon.vue'
import OcActionButton from '../../components/standard/OcActionButton.vue'
import OcActionMenu from '../../components/standard/OcActionMenu.vue'
import OcOverlayMarker from '../../components/standard/OcOverlayMarker.vue'
import type { OcActionDefinition, OcActionMenuEntry } from '../../shared/ui/action/action.types'
import { useOverlayDismiss } from '../../shared/ui/useOverlayDismiss'
import type {
  PropertyEditorBindingInterpreter,
  PropertyEditorFieldDefinition,
  PropertyFieldCapabilities,
} from '../../shared/ui/property-editor/propertyEditor.types'
import PropertyFieldActionRail from '../../shared/ui/property-editor/PropertyFieldActionRail.vue'
import PropertyFieldRenderer from '../../shared/ui/property-editor/PropertyFieldRenderer.vue'
import OcDataGridColumnResizeHandle from '../../shared/ui/data-grid/OcDataGridColumnResizeHandle.vue'
import { useDataGridColumnSizing } from '../../shared/ui/data-grid/useDataGridColumnSizing'
import { useDataGridCellMounting } from '../../shared/ui/data-grid/useDataGridCellMounting'
import '../../shared/ui/data-grid/dataGrid.css'
import {
  createPropertyFieldEditorModeAction,
  usePropertyFieldEditorModes,
} from '../../shared/ui/property-editor/propertyFieldEditorMode'
import { getPropertyFieldIcon } from '../../shared/ui/property-editor/propertyFieldRegistry'
import { getBlockPresentation } from './blockPresentation'
import type {
  CdeDataTableCell,
  CdeDataTableColumn,
  CdeDataTableFaceCatalog,
  CdeDataTableFaceGroup,
  CdeDataTableBlockCatalogEntry,
  CdeDataTableFieldRow,
} from './useCdeDataTableModel'
import type { CdeBlockFieldTarget } from './useCdeBlockFieldCommands'

export type CdeDataTableCellSelection = CdeBlockFieldTarget & {
  faceKey: CdeDataTableFaceGroup['key']
}

defineOptions({ name: 'CardDataTable' })

const props = defineProps<{
  columns: readonly CdeDataTableColumn[]
  catalogFaceGroups: readonly CdeDataTableFaceCatalog[]
  faceGroups: readonly CdeDataTableFaceGroup[]
  bindingInterpreter?: PropertyEditorBindingInterpreter
  capabilities?: PropertyFieldCapabilities
  getCellDefinition?: (
    blockId: string,
    field: CdeDataTableFieldRow,
    cell: CdeDataTableCell,
  ) => PropertyEditorFieldDefinition
  readonly?: boolean
}>()

const emit = defineEmits<{
  'add-instance': []
  'rename-instance': [cardId: string, name: string]
  'duplicate-card': [cardId: string]
  'delete-instance': [cardId: string]
  'set-instance-exported': [cardId: string, exported: boolean]
  'add-block': [blockId: string]
  'remove-block': [blockId: string]
  'include-field': [blockId: string, fieldKey: string]
  'exclude-field': [blockId: string, fieldKey: string]
  'create-field': [blockId: string]
  'reset-field': [blockId: string, fieldKey: string]
  'edit-field-definition': [blockId: string, fieldKey: string]
  'update-cell': [payload: CdeBlockFieldTarget & { value: unknown }]
  'reset-cell': [payload: CdeBlockFieldTarget]
  'cell-select': [payload: CdeDataTableCellSelection]
}>()

const { t } = useI18n()

const fieldEditorModes = usePropertyFieldEditorModes()
const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const renamingColumnKey = ref<string | null>(null)
const renameDraft = ref('')
const selectedCellIdentity = ref<string | null>(null)
const FIELD_COLUMN_KEY = '__field-column__'
const INCLUDE_FIELD_PREFIX = 'include-field:'
let revealHighlightTimer: ReturnType<typeof setTimeout> | null = null

const columnSizing = useDataGridColumnSizing({
  root: rootRef,
  defaultWidthToken: key => key === FIELD_COLUMN_KEY
    ? '--oc-data-grid-key-column-width'
    : '--oc-data-grid-column-width',
})
const {
  getColumnWidth,
  beginColumnResize,
  handleColumnResizeKeydown,
  finishColumnResize,
} = columnSizing
const minimumColumnWidth = computed(columnSizing.minimumWidth)
const maximumColumnWidth = computed(columnSizing.maximumWidth)
const tailColumnWidth = computed(columnSizing.tailColumnWidth)
const cellMounting = useDataGridCellMounting({ scrollRoot: scrollRef })
const { setCellElement, shouldMountCell } = cellMounting

const tableWidth = computed(() => (
  getColumnWidth(FIELD_COLUMN_KEY)
  + tailColumnWidth.value
  + props.columns.reduce((width, column) => width + getColumnWidth(column.key), 0)
))

function formatCellPreview(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isMultilineField(field: CdeDataTableFieldRow): boolean {
  return field.definition.fieldType === 'richText'
    || (field.definition.fieldType === 'string' && Boolean(field.definition.multiline))
}

function resolveCellDefinition(
  blockId: string,
  field: CdeDataTableFieldRow,
  cell: CdeDataTableCell,
): PropertyEditorFieldDefinition {
  return props.getCellDefinition?.(blockId, field, cell) ?? field.definition
}

function resolveCellEditorState(
  blockId: string,
  field: CdeDataTableFieldRow,
  cell: CdeDataTableCell,
) {
  return fieldEditorModes.resolve({
    identity: cell.identity,
    definition: resolveCellDefinition(blockId, field, cell),
    value: cell.value,
    bindingInterpreter: props.bindingInterpreter,
  })
}

function resolveCellActions(
  blockId: string,
  field: CdeDataTableFieldRow,
  cell: CdeDataTableCell,
): OcActionDefinition[] {
  const definition = resolveCellDefinition(blockId, field, cell)
  const modeAction = createPropertyFieldEditorModeAction(
    resolveCellEditorState(blockId, field, cell),
    definition,
    {
      useFieldEditor: t('propertyEditor.bindings.useFieldEditor'),
      useRawStringEditor: t('propertyEditor.bindings.useRawEditor'),
    },
  )
  return [
    ...(props.readonly || !(cell.kind === 'blueprint' && field.resettable) ? [] : [resetFieldAction()]),
    ...(modeAction ? [modeAction] : []),
    ...(cell.overridden ? [resetCellAction()] : []),
  ]
}

function selectCell(
  faceKey: CdeDataTableFaceGroup['key'],
  blockId: string,
  fieldKey: string,
  cell: CdeDataTableCell,
): void {
  if (selectedCellIdentity.value === cell.identity) return
  selectedCellIdentity.value = cell.identity
  emit('cell-select', { faceKey, cardId: cell.cardId, blockId, fieldKey })
}

function handleCellAction(
  blockId: string,
  field: CdeDataTableFieldRow,
  cell: CdeDataTableCell,
  actionKey: string,
): void {
  if (fieldEditorModes.select(cell.identity, actionKey)) return
  if (actionKey === 'reset-field') {
    emit('reset-field', blockId, field.key)
    return
  }
  if (actionKey === 'reset-cell') {
    emit('reset-cell', { cardId: cell.cardId, blockId, fieldKey: field.key })
  }
}

function handleCellValueUpdate(
  blockId: string,
  field: CdeDataTableFieldRow,
  cell: CdeDataTableCell,
  value: unknown,
): void {
  selectedCellIdentity.value = cell.identity
  if (resolveCellEditorState(blockId, field, cell).editorId === 'raw-string') {
    fieldEditorModes.preserveRawString(cell.identity)
  }
  emit('update-cell', { cardId: cell.cardId, blockId, fieldKey: field.key, value })
}

function columnCommands(column: CdeDataTableColumn): OcActionMenuEntry[] {
  if (column.kind === 'blueprint') return [{
    key: 'duplicate',
    icon: 'mdiPlus',
    title: t('cardDesigner.dataTable.duplicateBlueprint'),
  }]
  return [
    { key: 'rename', icon: 'mdiPencilOutline', title: t('cardDesigner.dataTable.renameInstance') },
    { key: 'duplicate', icon: 'mdiContentCopy', title: t('cardDesigner.dataTable.duplicateInstance') },
    { type: 'divider', key: 'column-danger-divider' },
    { key: 'delete', icon: 'mdiTrashCanOutline', iconTone: 'danger', title: t('cardDesigner.dataTable.deleteInstance') },
  ]
}

function columnAction(column: CdeDataTableColumn): OcActionDefinition {
  const commands = columnCommands(column)
  if (column.kind === 'blueprint') return commands[0] as OcActionDefinition
  return {
    key: 'more',
    icon: 'mdiDotsHorizontal',
    title: t('cardDesigner.dataTable.instanceActions'),
    children: commands,
  }
}

function handleColumnAction(column: CdeDataTableColumn, actionKey: string): void {
  if (actionKey === 'rename' && column.kind === 'instance') {
    renamingColumnKey.value = column.key
    renameDraft.value = column.title
  } else if (actionKey === 'duplicate') emit('duplicate-card', column.key)
  else if (actionKey === 'delete' && column.kind === 'instance') emit('delete-instance', column.key)
}

function faceCommands(face: CdeDataTableFaceGroup): OcActionDefinition[] {
  const catalog = props.catalogFaceGroups.find(candidate => candidate.key === face.key)
  if (!catalog) return []
  const selectedBlockIds = new Set(face.blocks.map(block => block.key))
  const availableBlocks = catalog.blocks.filter(block => !selectedBlockIds.has(block.key))
  return availableBlocks.map(block => ({
    key: block.key,
    ...getBlockPresentation(block.type),
    title: block.title,
  }))
}

function faceBlockAction(face: CdeDataTableFaceGroup): OcActionDefinition | null {
  const commands = faceCommands(face)
  if (commands.length === 0) return null
  return {
    key: 'add-block',
    icon: 'mdiPlus',
    title: t('cardDesigner.dataTable.addBlock'),
    children: commands,
  }
}

function blockFieldCommands(block: CdeDataTableBlockCatalogEntry): OcActionMenuEntry[] {
  const selectedFieldKeys = new Set(block.fields.map(field => field.key))
  const catalogBlock = props.catalogFaceGroups
    .flatMap(face => face.blocks)
    .find(candidate => candidate.key === block.key)
  const availableFields = catalogBlock?.fields.filter(field => !selectedFieldKeys.has(field.key)) ?? []
  return [
    ...availableFields.map(field => ({
      key: `${INCLUDE_FIELD_PREFIX}${field.key}`,
      icon: getPropertyFieldIcon(field.definition),
      title: field.title,
    })),
    ...(availableFields.length > 0 ? [{ type: 'divider' as const, key: 'create-field-divider' }] : []),
    {
      key: 'create-field',
      icon: 'mdiPlus',
      title: t('cardDesigner.dataTable.createField'),
    },
  ]
}

function blockFieldAction(block: CdeDataTableBlockCatalogEntry): OcActionDefinition {
  return {
    key: 'manage-fields',
    icon: 'mdiPlus',
    title: t('cardDesigner.dataTable.editBlockFields'),
    children: blockFieldCommands(block),
  }
}

function removeBlockAction(): OcActionDefinition {
  return {
    key: 'remove-block',
    icon: 'mdiClose',
    title: t('cardDesigner.dataTable.stopEditingBlock'),
  }
}

function resetFieldAction(): OcActionDefinition {
  return {
    key: 'reset-field',
    icon: 'mdiUndoVariant',
    title: t('cardDesigner.dataTable.resetBlueprintValue'),
  }
}

function editFieldDefinitionAction(): OcActionDefinition {
  return {
    key: 'edit-field-definition',
    icon: 'mdiPencilOutline',
    title: t('cardDesigner.dataTable.editFieldDefinition'),
  }
}

function excludeFieldAction(): OcActionDefinition {
  return {
    key: 'exclude-field',
    icon: 'mdiClose',
    title: t('cardDesigner.dataTable.stopEditingField'),
  }
}

function resetCellAction(): OcActionDefinition {
  return {
    key: 'reset-cell',
    icon: 'mdiUndoVariant',
    title: t('cardDesigner.dataTable.resetOverride'),
  }
}

function blockContextCommands(block: CdeDataTableBlockCatalogEntry): OcActionMenuEntry[] {
  return [
    blockFieldAction(block),
    { type: 'divider', key: 'block-remove-divider' },
    removeBlockAction(),
  ]
}

function handleBlockAction(blockId: string, actionKey: string): void {
  if (actionKey.startsWith(INCLUDE_FIELD_PREFIX)) {
    emit('include-field', blockId, actionKey.slice(INCLUDE_FIELD_PREFIX.length))
  } else if (actionKey === 'create-field') emit('create-field', blockId)
  else if (actionKey === 'remove-block') emit('remove-block', blockId)
}

function fieldCommands(field: CdeDataTableFieldRow): OcActionMenuEntry[] {
  return [
    ...(field.definitionEditable ? [
      editFieldDefinitionAction(),
      { type: 'divider' as const, key: 'field-definition-divider' },
    ] : []),
    excludeFieldAction(),
  ]
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

// 表格被卸载时它打开的菜单不能留在组里变成空面板。
onBeforeUnmount(() => { contextMenu.value?.close() })

function isContextMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

function openColumnContextMenu(event: MouseEvent, column: CdeDataTableColumn): void {
  const owner = event.currentTarget
  if (!(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(new DOMRect(event.clientX, event.clientY, 0, 0), columnCommands(column),
    key => handleColumnAction(column, key), owner)
}

function openColumnKeyboardMenu(event: KeyboardEvent, column: CdeDataTableColumn): void {
  const owner = event.currentTarget
  if (!isContextMenuKey(event) || !(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(owner, columnCommands(column), key => handleColumnAction(column, key), owner)
}

function openFaceContextMenu(event: MouseEvent, face: CdeDataTableFaceGroup): void {
  const owner = event.currentTarget
  if (!(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(new DOMRect(event.clientX, event.clientY, 0, 0), faceCommands(face),
    key => emit('add-block', key), owner)
}

function openFaceKeyboardMenu(event: KeyboardEvent, face: CdeDataTableFaceGroup): void {
  const owner = event.currentTarget
  if (!isContextMenuKey(event) || !(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(owner, faceCommands(face), key => emit('add-block', key), owner)
}

function openBlockContextMenu(event: MouseEvent, block: CdeDataTableBlockCatalogEntry): void {
  const owner = event.currentTarget
  if (!(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(new DOMRect(event.clientX, event.clientY, 0, 0), blockContextCommands(block),
    key => handleBlockAction(block.key, key), owner)
}

function openBlockKeyboardMenu(event: KeyboardEvent, block: CdeDataTableBlockCatalogEntry): void {
  const owner = event.currentTarget
  if (!isContextMenuKey(event) || !(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(owner, blockContextCommands(block), key => handleBlockAction(block.key, key), owner)
}

function handleFieldAction(blockId: string, fieldKey: string, actionKey: string): void {
  if (actionKey === 'exclude-field') emit('exclude-field', blockId, fieldKey)
  else if (actionKey === 'edit-field-definition') emit('edit-field-definition', blockId, fieldKey)
}

function openFieldContextMenu(
  event: MouseEvent,
  block: CdeDataTableBlockCatalogEntry,
  field: CdeDataTableFieldRow,
): void {
  const owner = event.currentTarget
  if (!(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(new DOMRect(event.clientX, event.clientY, 0, 0), fieldCommands(field),
    key => handleFieldAction(block.key, field.key, key), owner)
}

function openFieldKeyboardMenu(
  event: KeyboardEvent,
  block: CdeDataTableBlockCatalogEntry,
  field: CdeDataTableFieldRow,
): void {
  const owner = event.currentTarget
  if (!isContextMenuKey(event) || !(owner instanceof HTMLElement)) return
  event.preventDefault()
  openMenuAt(owner, fieldCommands(field), key => handleFieldAction(block.key, field.key, key), owner)
}

function commitRename(cardId: string): void {
  if (renamingColumnKey.value !== cardId) return
  const name = renameDraft.value.trim()
  if (!name) return
  emit('rename-instance', cardId, name)
  cancelRename()
}

function cancelRename(): void {
  renamingColumnKey.value = null
  renameDraft.value = ''
}

function toCodeUnitOffset(value: string, characterOffset: number): number {
  return Array.from(value).slice(0, characterOffset).join('').length
}

async function revealCell(
  cardId: string,
  blockId: string,
  fieldKey: string,
  characterOffset?: number,
): Promise<boolean> {
  const rows = rootRef.value?.querySelectorAll<HTMLElement>('[data-block-id][data-field-key]') ?? []
  const row = Array.from(rows).find(candidate =>
    candidate.dataset.blockId === blockId && candidate.dataset.fieldKey === fieldKey
  )
  const cells = row?.querySelectorAll<HTMLElement>('[data-card-id]') ?? []
  const cell = Array.from(cells).find(candidate => candidate.dataset.cardId === cardId)
  if (!cell) return false
  cellMounting.mountCell(`${cardId}\u0000${blockId}\u0000${fieldKey}`)
  await nextTick()
  cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  const control = cell.querySelector<HTMLElement>(
    'input:not([type="hidden"]), textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      // Some non-text input types reject text selection.
    }
  }
  await nextTick()
  cell.classList.add('is-revealed')
  if (revealHighlightTimer) clearTimeout(revealHighlightTimer)
  revealHighlightTimer = setTimeout(() => {
    cell.classList.remove('is-revealed')
    revealHighlightTimer = null
  }, 1600)
  return true
}

defineExpose({ revealCell })

onBeforeUnmount(() => {
  finishColumnResize()
  if (revealHighlightTimer) clearTimeout(revealHighlightTimer)
})
</script>

<style scoped>
.card-data-table__data-column {
  overflow: visible;
}

.card-data-table__column-heading,
.card-data-table__face-heading,
.card-data-table__block-heading,
.card-data-table__field-heading {
  display: flex;
  align-items: center;
  gap: var(--oc-space-xs);
  min-width: 0;
}

.card-data-table__column-heading > span,
.card-data-table__face-heading > span,
.card-data-table__block-heading > span,
.card-data-table__field-heading > span {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-data-table__face-row th,
.card-data-table__face-row td {
  background: var(--oc-bg-surface);
  color: var(--oc-fg-default);
  font-weight: 600;
}

.card-data-table__block-row th,
.card-data-table__block-row td {
  background: var(--oc-bg-block);
}

.card-data-table__field-row th,
.card-data-table__field-row td {
  background: var(--oc-bg-base);
}

.card-data-table__field-row.is-multiline:focus-within {
  --oc-field-control-target-height: var(
    --oc-field-control-expanded-height,
    var(--oc-property-row-expanded-height)
  );
}

.card-data-table__field-row.is-multiline:focus-within .card-data-table__cell-preview {
  align-items: flex-start;
}

.card-data-table__field-heading {
  min-height: var(--oc-field-control-height);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.card-data-table__cell.is-selected,
.card-data-table__cell.is-revealed {
  background-color: var(--oc-bg-selected);
  outline: 2px solid var(--oc-fg-accent);
  outline-offset: -2px;
}

</style>
