<template>
  <section ref="rootRef" class="dictionary-editor" :aria-label="t('dictionaryEditor.title')"
    @keydown="handleGridKeydown">
    <div class="dictionary-editor__content">
      <div v-if="dictionary && missingActiveLanguage" class="dictionary-editor__notice" role="status">
        <OcIcon name="status.warning" tone="warning" />
        <OcText size="sm">{{ t('dictionaryEditor.missingActive', { language: dictionary.active }) }}</OcText>
      </div>
      <section v-if="dictionary" class="dictionary-editor__grid oc-data-grid">
        <div ref="scrollRef" class="dictionary-editor__table-scroll oc-data-grid__scroll">
          <table class="dictionary-editor__table oc-data-grid__table" :style="{ width: `${tableWidth}px` }">
            <colgroup>
              <col :style="{ width: `${getColumnWidth(KEY_COLUMN_KEY)}px` }">
              <col v-for="column in grid.columns" :key="column.key"
                :style="{ width: `${getColumnWidth(column.key)}px` }">
              <col :style="{ width: `${tailColumnWidth}px` }">
            </colgroup>
            <thead>
              <tr>
                <th class="dictionary-editor__key-column oc-data-grid__corner oc-data-grid__sticky-column" scope="col">
                  {{ t('dictionaryEditor.columns.key') }}
                  <OcDataGridColumnResizeHandle :minimum="minimumColumnWidth" :maximum="maximumColumnWidth"
                    :value="getColumnWidth(KEY_COLUMN_KEY)" :label="t('dictionaryEditor.actions.resizeColumn', {
                      title: t('dictionaryEditor.columns.key'),
                    })" @resize-start="beginColumnResize($event, KEY_COLUMN_KEY)"
                    @resize-keydown="handleColumnResizeKeydown($event, KEY_COLUMN_KEY)" />
                </th>
                <th v-for="column in grid.columns" :key="column.key"
                  class="dictionary-editor__data-column" scope="col" tabindex="0"
                  @contextmenu="openColumnContextMenu($event, column)"
                  @keydown="openColumnKeyboardMenu($event, column)">
                  <form v-if="editingLanguage === column.sourceKey" class="dictionary-editor__rename"
                    @submit.prevent="commitLanguageRename(column.sourceKey!)">
                    <OcFieldInput ref="renameInputRef" :value="renameDraft" size="sm" mono full-width
                      :aria-invalid="!canUseLanguageKey(renameDraft, column.sourceKey!)"
                      @input="renameDraft = ($event.target as HTMLInputElement).value"
                      @blur="finishLanguageRename(column.sourceKey!)"
                      @keydown.esc.stop.prevent="cancelRename" />
                  </form>
                  <div v-else class="dictionary-editor__column-heading">
                    <span>{{ column.kind === 'base' ? t('dictionaryEditor.columns.base') : column.sourceKey }}</span>
                    <span class="dictionary-editor__column-actions">
                      <OcButton icon-only size="sm" variant="ghost" icon="action.check"
                        :active="column.active"
                        :data-tooltip="column.kind === 'base'
                          ? t('dictionaryEditor.actions.useBase')
                          : t('dictionaryEditor.actions.setActive')"
                        :aria-label="column.kind === 'base'
                          ? t('dictionaryEditor.actions.useBase')
                          : t('dictionaryEditor.actions.setActive')"
                        @click="setActiveLanguage(column.sourceKey)" />
                      <OcActionButton v-if="column.kind === 'language'" :action="languageAction()"
                        size="sm" variant="ghost" @select="handleLanguageAction(column.sourceKey!, $event.key)" />
                    </span>
                  </div>
                  <OcDataGridColumnResizeHandle :minimum="minimumColumnWidth" :maximum="maximumColumnWidth"
                    :value="getColumnWidth(column.key)" :label="t('dictionaryEditor.actions.resizeColumn', {
                      title: column.sourceKey ?? t('dictionaryEditor.columns.base'),
                    })" @resize-start="beginColumnResize($event, column.key)"
                    @resize-keydown="handleColumnResizeKeydown($event, column.key)" />
                </th>
                <th class="dictionary-editor__add-column oc-data-grid__tail" scope="col">
                  <form v-if="addingLanguage" class="dictionary-editor__inline-create" @submit.prevent="addLanguage">
                    <OcFieldInput ref="languageCreateInputRef" :value="newLanguageKey" size="sm" mono full-width
                      :placeholder="t('dictionaryEditor.placeholders.languageKey')"
                      :aria-label="t('dictionaryEditor.placeholders.languageKey')"
                      :aria-invalid="Boolean(newLanguageKey && !canUseLanguageKey(newLanguageKey))"
                      @input="newLanguageKey = ($event.target as HTMLInputElement).value"
                      @blur="finishLanguageCreate"
                      @keydown.esc.stop.prevent="cancelLanguageCreate" />
                  </form>
                  <OcButton v-else icon-only size="sm" variant="ghost" icon="action.add"
                    :data-tooltip="t('dictionaryEditor.actions.addLanguage')"
                    :aria-label="t('dictionaryEditor.actions.addLanguage')" @click="beginLanguageCreate" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="grid.rows.length === 0" class="dictionary-editor__empty-row">
                <td :colspan="grid.columns.length + 2" class="dictionary-editor__empty">
                  {{ t('dictionaryEditor.empty') }}
                </td>
              </tr>
              <tr v-for="row in grid.rows" :key="row.key">
                <th class="dictionary-editor__key-column oc-data-grid__sticky-column" scope="row" tabindex="0"
                  @contextmenu="openRecordContextMenu($event, row.key)"
                  @keydown="openRecordKeyboardMenu($event, row.key)">
                  <form v-if="editingRecord === row.key" class="dictionary-editor__rename"
                    @submit.prevent="commitRecordRename(row.key)">
                    <OcFieldInput ref="renameInputRef" :value="renameDraft" size="sm" mono full-width
                      :aria-invalid="!canUseRecordKey(renameDraft, row.key)"
                      @input="renameDraft = ($event.target as HTMLInputElement).value"
                      @blur="finishRecordRename(row.key)"
                      @keydown.esc.stop.prevent="cancelRename" />
                  </form>
                  <div v-else class="dictionary-editor__record-heading">
                    <code>{{ row.key }}</code>
                    <OcActionButton :action="recordAction()" size="sm" variant="ghost"
                      @select="handleRecordAction(row.key, $event.key)" />
                  </div>
                </th>
                <td v-for="cell in row.cells" :key="cell.columnKey"
                  class="dictionary-editor__cell oc-data-grid__cell"
                  :class="{ 'is-inherited': cell.inherited }"
                  :data-grid-row="cell.recordKey" :data-grid-column="cell.columnKey"
                  :ref="element => setCellElement(cellIdentity(cell.recordKey, cell.columnKey), element)">
                  <div v-if="shouldMountCell(cellIdentity(cell.recordKey, cell.columnKey))"
                    class="oc-data-grid__cell-editor">
                    <PropertyFieldRenderer appearance="embedded" :definition="cellDefinition"
                      :value="cell.value" editor-id="field"
                      @update:value="updateCell(cell.columnKey, cell.recordKey, String($event ?? ''))" />
                    <span class="dictionary-editor__cell-action-slot">
                      <PropertyFieldActionRail :actions="cell.overridden && cell.columnKey !== DICTIONARY_BASE_COLUMN_KEY
                        ? [resetOverrideAction()]
                        : []" @action="resetOverride(cell.columnKey, cell.recordKey)" />
                      </span>
                  </div>
                  <span v-else class="oc-data-grid__cell-preview">{{ cell.value }}</span>
                </td>
                <td class="oc-data-grid__tail" />
              </tr>
              <tr class="dictionary-editor__add-row">
                <th class="dictionary-editor__key-column oc-data-grid__sticky-column" scope="row">
                  <form v-if="addingRecord" class="dictionary-editor__inline-create" @submit.prevent="addRecord">
                    <OcFieldInput ref="recordCreateInputRef" :value="newRecordKey" size="sm" mono full-width
                      :placeholder="t('dictionaryEditor.placeholders.recordKey')"
                      :aria-label="t('dictionaryEditor.placeholders.recordKey')"
                      :aria-invalid="Boolean(newRecordKey && !canUseRecordKey(newRecordKey))"
                      @input="newRecordKey = ($event.target as HTMLInputElement).value"
                      @blur="finishRecordCreate"
                      @keydown.esc.stop.prevent="cancelRecordCreate" />
                  </form>
                  <OcButton v-else size="sm" variant="ghost" icon="action.add"
                    @click="beginRecordCreate">{{ t('dictionaryEditor.actions.addRecord') }}</OcButton>
                </th>
                <td :colspan="grid.columns.length + 1" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else class="dictionary-editor__repair" role="alert">
        <div class="dictionary-editor__diagnostic">
          <OcIcon name="status.error" tone="danger" />
          <div>
            <strong>{{ t('dictionaryEditor.invalid') }}</strong>
            <OcText tone="muted" size="sm">{{ t('dictionaryEditor.repairHint') }}</OcText>
          </div>
        </div>
        <div class="dictionary-editor__source">
          <MonacoEditor :model-value="modelValue ?? ''" language="json" :theme-id="themeId"
            :theme-overrides="themeOverrides"
            @update:model-value="updateRawSource" @save="save" />
        </div>
      </section>
    </div>
    <DictionaryWorkbookImportDialog :result="pendingWorkbookImport"
      @cancel="pendingWorkbookImport = null" @confirm="confirmWorkbookImport" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifyAppError, notifyError } from '../../features/notifications/titlebarNotices'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { HistoryOperationMeta } from '../../features/editor-runtime/history/history.types'
import { parseProjectDictionaryText, serializeProjectDictionary, type ProjectDictionary } from '../../features/workspace/model/projectDictionary'
import {
  DICTIONARY_BASE_COLUMN_KEY,
  addDictionaryLanguage,
  addDictionaryRecord,
  canUseDictionaryLanguageKey,
  canUseDictionaryRecordKey,
  deleteDictionaryLanguages,
  deleteDictionaryRecords,
  projectDictionaryGrid,
  renameDictionaryLanguage,
  renameDictionaryRecord,
  resetDictionaryOverride,
  setDictionaryActiveLanguage,
  setDictionaryCellValue,
  type DictionaryGridColumn,
} from '../../features/workspace/model/projectDictionaryGrid'
import { useFloatingMenu } from '../../composables/useFloatingMenu'
import OcDataGridColumnResizeHandle from '../../shared/ui/data-grid/OcDataGridColumnResizeHandle.vue'
import { useDataGridCellMounting } from '../../shared/ui/data-grid/useDataGridCellMounting'
import { useDataGridColumnSizing } from '../../shared/ui/data-grid/useDataGridColumnSizing'
import '../../shared/ui/data-grid/dataGrid.css'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import {
  exportProjectDictionaryWorkbook,
  importProjectDictionaryWorkbook,
  type ProjectDictionaryWorkbookImportResult,
} from '../../features/workspace/model/projectDictionaryWorkbook'
import type { PropertyEditorFieldDefinition } from '../../shared/ui/property-editor/propertyEditor.types'
import PropertyFieldActionRail from '../../shared/ui/property-editor/PropertyFieldActionRail.vue'
import PropertyFieldRenderer from '../../shared/ui/property-editor/PropertyFieldRenderer.vue'
import MonacoEditor from './MonacoEditor.vue'
import DictionaryWorkbookImportDialog from './DictionaryWorkbookImportDialog.vue'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import OcActionButton from '../standard/OcActionButton.vue'
import type { OcActionDefinition, OcActionMenuEntry } from '../../shared/ui/action/action.types'

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const { openContextMenu, openKeyboardContextMenu } = useFloatingMenu()
const dictionary = ref<ProjectDictionary | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const newRecordKey = ref('')
const newLanguageKey = ref('')
const addingRecord = ref(false)
const addingLanguage = ref(false)
const editingRecord = ref<string | null>(null)
const editingLanguage = ref<string | null>(null)
const renameDraft = ref('')
type FieldInputHandle = InstanceType<typeof OcFieldInput>
type FieldInputRef = Ref<FieldInputHandle | FieldInputHandle[] | null>

const recordCreateInputRef = ref<FieldInputHandle | null>(null)
const languageCreateInputRef = ref<FieldInputHandle | null>(null)
const renameInputRef = ref<FieldInputHandle | FieldInputHandle[] | null>(null)
const dictionaryWorkbookBusy = ref(false)
const pendingWorkbookImport = shallowRef<ProjectDictionaryWorkbookImportResult | null>(null)
const KEY_COLUMN_KEY = '$key'
const NEW_LANGUAGE_COLUMN_KEY = '$new-language'

const themeId = computed(() => props.themeId ?? 'dark')
const themeOverrides = computed(() => props.themeOverrides ?? {})
const grid = computed(() => projectDictionaryGrid(dictionary.value ?? {}))
const columnKeys = computed(() => grid.value.columns.map(column => column.key))
const missingActiveLanguage = computed(() => Boolean(
  dictionary.value?.active
  && !grid.value.columns.some(column => column.kind === 'language' && column.active),
))
const canExportDictionaryWorkbook = computed(() => Boolean(
  dictionary.value && Object.keys(dictionary.value.base ?? {}).length,
))
const cellDefinition = computed<PropertyEditorFieldDefinition>(() => ({
  title: t('dictionaryEditor.columns.value'),
  fieldType: 'string',
}))

const columnSizing = useDataGridColumnSizing({
  root: rootRef,
  defaultWidthToken: key => key === KEY_COLUMN_KEY
    ? '--oc-data-grid-key-column-width'
    : '--oc-data-grid-column-width',
})
const { getColumnWidth, beginColumnResize, handleColumnResizeKeydown, finishColumnResize } = columnSizing
const minimumColumnWidth = computed(columnSizing.minimumWidth)
const maximumColumnWidth = computed(columnSizing.maximumWidth)
const tailColumnWidth = computed(() => addingLanguage.value
  ? getColumnWidth(NEW_LANGUAGE_COLUMN_KEY)
  : columnSizing.tailColumnWidth())
const tableWidth = computed(() => getColumnWidth(KEY_COLUMN_KEY) + tailColumnWidth.value
  + columnKeys.value.reduce((width, key) => width + getColumnWidth(key), 0))

const { setCellElement, shouldMountCell } = useDataGridCellMounting({ scrollRoot: scrollRef })

watch(() => props.modelValue, content => {
  dictionary.value = parseProjectDictionaryText(content ?? '')
}, { immediate: true })

function canUseRecordKey(candidate: string, current?: string) {
  return dictionary.value
    ? canUseDictionaryRecordKey(dictionary.value, candidate, current)
    : false
}

function canUseLanguageKey(candidate: string, current?: string) {
  return dictionary.value
    ? canUseDictionaryLanguageKey(dictionary.value, candidate, current)
    : false
}

function commit(next: ProjectDictionary, history: HistoryOperationMeta = { mode: 'immediate' }) {
  dictionary.value = next
  emit('update:modelValue', serializeProjectDictionary(next), history)
}

function updateRawSource(content: string, history?: HistoryOperationMeta): void {
  emit('update:modelValue', content, history)
}

function beginRecordCreate(): void {
  cancelRename()
  addingRecord.value = true
  addingLanguage.value = false
  void focusInlineInput(recordCreateInputRef)
}

function cancelRecordCreate(): void {
  addingRecord.value = false
  newRecordKey.value = ''
}

function addRecord() {
  if (!dictionary.value || !canUseRecordKey(newRecordKey.value)) return
  commit(addDictionaryRecord(dictionary.value, newRecordKey.value))
  cancelRecordCreate()
}

function finishRecordCreate(): void {
  if (!addingRecord.value) return
  if (canUseRecordKey(newRecordKey.value)) addRecord()
  else cancelRecordCreate()
}

function beginLanguageCreate(): void {
  cancelRename()
  addingLanguage.value = true
  addingRecord.value = false
  void focusInlineInput(languageCreateInputRef)
}

function cancelLanguageCreate(): void {
  addingLanguage.value = false
  newLanguageKey.value = ''
}

function addLanguage() {
  if (!dictionary.value || !canUseLanguageKey(newLanguageKey.value)) return
  commit(addDictionaryLanguage(dictionary.value, newLanguageKey.value))
  cancelLanguageCreate()
}

function finishLanguageCreate(): void {
  if (!addingLanguage.value) return
  if (canUseLanguageKey(newLanguageKey.value)) addLanguage()
  else cancelLanguageCreate()
}

function updateCell(columnKey: string, recordKey: string, value: string) {
  if (!dictionary.value) return
  commit(setDictionaryCellValue(dictionary.value, columnKey, recordKey, value), {
    mode: 'debounced',
    merge: { family: 'dictionary-cell', target: `${columnKey}\u0000${recordKey}` },
  })
}

function resetOverride(language: string, recordKey: string) {
  if (!dictionary.value) return
  commit(resetDictionaryOverride(dictionary.value, language, recordKey))
}

function resetOverrideAction(): OcActionDefinition {
  return { key: 'reset-override', icon: 'action.undo', title: t('dictionaryEditor.actions.resetOverride') }
}

function setActiveLanguage(language: string | undefined) {
  if (!dictionary.value) return
  commit(setDictionaryActiveLanguage(dictionary.value, language))
}

function beginRecordRename(recordKey: string) {
  cancelRecordCreate()
  cancelLanguageCreate()
  editingLanguage.value = null
  editingRecord.value = recordKey
  renameDraft.value = recordKey
  void focusInlineInput(renameInputRef, true)
}

function beginLanguageRename(language: string) {
  cancelRecordCreate()
  cancelLanguageCreate()
  editingRecord.value = null
  editingLanguage.value = language
  renameDraft.value = language
  void focusInlineInput(renameInputRef, true)
}

function cancelRename() {
  editingRecord.value = null
  editingLanguage.value = null
  renameDraft.value = ''
}

function commitRecordRename(recordKey: string) {
  if (editingRecord.value !== recordKey) return
  if (!canUseRecordKey(renameDraft.value, recordKey)) return
  commit(renameDictionaryRecord(dictionary.value!, recordKey, renameDraft.value))
  cancelRename()
}

function commitLanguageRename(language: string) {
  if (editingLanguage.value !== language) return
  if (!canUseLanguageKey(renameDraft.value, language)) return
  commit(renameDictionaryLanguage(dictionary.value!, language, renameDraft.value))
  cancelRename()
}

function finishRecordRename(recordKey: string): void {
  if (editingRecord.value !== recordKey) return
  if (canUseRecordKey(renameDraft.value, recordKey)) commitRecordRename(recordKey)
  else cancelRename()
}

function finishLanguageRename(language: string): void {
  if (editingLanguage.value !== language) return
  if (canUseLanguageKey(renameDraft.value, language)) commitLanguageRename(language)
  else cancelRename()
}

async function focusInlineInput(
  input: FieldInputRef,
  select = false,
): Promise<void> {
  await nextTick()
  const field = Array.isArray(input.value) ? input.value[input.value.length - 1] : input.value
  field?.focus()
  if (select) field?.select()
}

async function copyDictionaryKey(key: string, kind: 'record' | 'language'): Promise<void> {
  try {
    await navigator.clipboard.writeText(key)
  } catch (error) {
    notifyAppError('OC-E1002', { source: `dictionary-${kind}-key`, key, error })
  }
}

function recordCommands(): OcActionMenuEntry[] {
  return [
    { key: 'copy', icon: 'action.copy', title: t('dictionaryEditor.actions.copyRecordKey') },
    { key: 'rename', icon: 'action.edit', title: t('dictionaryEditor.actions.renameRecord') },
    { type: 'divider', key: 'record-delete-divider' },
    {
      key: 'delete',
      icon: 'action.delete',
      iconTone: 'danger',
      title: t('dictionaryEditor.actions.deleteRecords', { count: 1 }),
      children: [{
        key: 'confirm-delete',
        icon: 'action.delete',
        iconTone: 'danger',
        title: t('dictionaryEditor.actions.confirmDeleteRecords', { count: 1 }),
      }],
    },
  ]
}

function recordAction(): OcActionDefinition {
  return {
    key: 'more',
    icon: 'nav.more',
    title: t('dictionaryEditor.actions.recordActions'),
    children: recordCommands(),
  }
}

function handleRecordAction(recordKey: string, actionKey: string): void {
  if (actionKey === 'copy') void copyDictionaryKey(recordKey, 'record')
  else if (actionKey === 'rename') beginRecordRename(recordKey)
  else if (actionKey === 'confirm-delete' && dictionary.value) {
    commit(deleteDictionaryRecords(dictionary.value, [recordKey]))
  }
}

function languageCommands(): OcActionMenuEntry[] {
  return [
    { key: 'copy', icon: 'action.copy', title: t('dictionaryEditor.actions.copyLanguage') },
    { key: 'set-active', icon: 'action.check', title: t('dictionaryEditor.actions.setActive') },
    { key: 'rename', icon: 'action.edit', title: t('dictionaryEditor.actions.renameLanguage') },
    { type: 'divider', key: 'language-delete-divider' },
    {
      key: 'delete',
      icon: 'action.delete',
      iconTone: 'danger',
      title: t('dictionaryEditor.actions.deleteLanguages', { count: 1 }),
      children: [{
        key: 'confirm-delete',
        icon: 'action.delete',
        iconTone: 'danger',
        title: t('dictionaryEditor.actions.confirmDeleteLanguages', { count: 1 }),
      }],
    },
  ]
}

function languageAction(): OcActionDefinition {
  return {
    key: 'more',
    icon: 'nav.more',
    title: t('dictionaryEditor.actions.languageActions'),
    children: languageCommands(),
  }
}

function handleLanguageAction(language: string, actionKey: string): void {
  if (actionKey === 'copy') void copyDictionaryKey(language, 'language')
  else if (actionKey === 'set-active') setActiveLanguage(language)
  else if (actionKey === 'rename') beginLanguageRename(language)
  else if (actionKey === 'confirm-delete' && dictionary.value) {
    commit(deleteDictionaryLanguages(dictionary.value, [language]))
  }
}

function openRecordContextMenu(event: MouseEvent, recordKey: string): void {
  openContextMenu({
    event,
    items: recordCommands(),
    onSelect: key => handleRecordAction(recordKey, key),
  })
}

function openRecordKeyboardMenu(event: KeyboardEvent, recordKey: string): void {
  openKeyboardContextMenu(event, recordCommands(), key => handleRecordAction(recordKey, key))
}

function openColumnContextMenu(event: MouseEvent, column: DictionaryGridColumn): void {
  if (column.kind !== 'language') return
  openContextMenu({
    event,
    items: languageCommands(),
    onSelect: key => handleLanguageAction(column.sourceKey!, key),
  })
}

function openColumnKeyboardMenu(event: KeyboardEvent, column: DictionaryGridColumn): void {
  if (column.kind !== 'language') return
  openKeyboardContextMenu(
    event,
    languageCommands(),
    key => handleLanguageAction(column.sourceKey!, key),
  )
}

function cellIdentity(recordKey: string, columnKey: string): string {
  return `${recordKey}\u0000${columnKey}`
}

function handleGridKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 's') {
    event.preventDefault()
    save()
    return
  }
}

async function exportDictionaryWorkbook(): Promise<void> {
  if (!dictionary.value || !canExportDictionaryWorkbook.value || dictionaryWorkbookBusy.value) return
  const path = await fileSystemService.pickSavePath({
    defaultPath: `${dictionaryWorkbookFileName()}.xlsx`,
    fileTypeName: 'Excel Workbook',
    extensions: ['xlsx'],
    title: t('dictionaryEditor.workbook.export'),
  })
  if (!path) return
  dictionaryWorkbookBusy.value = true
  try {
    const bytes = await exportProjectDictionaryWorkbook(dictionary.value, {
      key: t('dictionaryEditor.columns.key'),
      base: t('dictionaryEditor.columns.base'),
    })
    await fileSystemService.writeBinaryFile(path, bytes)
  } catch (error) {
    await notifyWorkbookError(error, 'dictionaryEditor.workbook.exportFailed')
  } finally {
    dictionaryWorkbookBusy.value = false
  }
}

async function importDictionaryWorkbook(): Promise<void> {
  if (!dictionary.value || dictionaryWorkbookBusy.value) return
  const path = await fileSystemService.pickFile({
    title: t('dictionaryEditor.workbook.import'),
    fileTypeName: 'Excel Workbook',
    extensions: ['xlsx'],
  })
  if (!path) return
  dictionaryWorkbookBusy.value = true
  try {
    pendingWorkbookImport.value = await importProjectDictionaryWorkbook(
      await fileSystemService.readBinaryFile(path),
      dictionary.value,
    )
  } catch (error) {
    await notifyWorkbookError(error, 'dictionaryEditor.workbook.importFailed')
  } finally {
    dictionaryWorkbookBusy.value = false
  }
}

function confirmWorkbookImport(): void {
  if (!pendingWorkbookImport.value) return
  commit(pendingWorkbookImport.value.dictionary)
  pendingWorkbookImport.value = null
}

function dictionaryWorkbookFileName(): string {
  const source = (props.fileName || props.filePath.split(/[\\/]/).pop() || '')
    .replace(/\.json$/i, '')
  const normalized = source.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()
  return normalized || 'OpenCard Dictionary'
}

async function notifyWorkbookError(error: unknown, fallbackKey: string): Promise<void> {
  notifyError(error instanceof Error && error.message ? error.message : t(fallbackKey))
}

function save() {
  if (dictionary.value) emit('save')
}

onBeforeUnmount(finishColumnResize)

const presentation = computed<EditorPresentation>(() => ({
  title: t('dictionaryEditor.title'),
  description: t('dictionaryEditor.description'),
  icon: 'file.dictionary',
}))

defineExpose({
  save,
  presentation,
  importDataTableWorkbook: importDictionaryWorkbook,
  exportDataTableWorkbook: exportDictionaryWorkbook,
  dataTableWorkbookBusy: dictionaryWorkbookBusy,
  canExportDataTableWorkbook: canExportDictionaryWorkbook,
})
</script>

<style scoped>
.dictionary-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--oc-bg-base);
  color: var(--oc-fg-default);
}

.dictionary-editor__content {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.dictionary-editor__column-heading,
.dictionary-editor__column-actions,
.dictionary-editor__record-heading,
.dictionary-editor__notice,
.dictionary-editor__diagnostic {
  display: flex;
  align-items: center;
}

.dictionary-editor h1 {
  margin: 0;
  font-size: var(--oc-text-lg);
  font-weight: var(--font-weight-ui-title);
  letter-spacing: 0;
}

.dictionary-editor__grid {
  flex: 1 1 auto;
  min-height: 0;
}

.dictionary-editor__notice {
  gap: var(--oc-space-2);
  padding: var(--oc-space-2) var(--oc-space-6);
  color: var(--oc-icon-warning);
}

.dictionary-editor__table thead th,
.dictionary-editor__key-column {
  font-size: var(--oc-text-sm);
}

.dictionary-editor__data-column {
  overflow: visible;
}

.dictionary-editor__column-heading,
.dictionary-editor__record-heading {
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-2);
  min-width: 0;
}

.dictionary-editor__column-heading > span,
.dictionary-editor__record-heading > code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dictionary-editor__column-actions {
  flex: 0 0 auto;
  gap: var(--oc-space-1);
}

.dictionary-editor__cell-action-slot {
  display: inline-flex;
  width: var(--oc-size-sm);
  flex: 0 0 var(--oc-size-sm);
  align-items: center;
}

.dictionary-editor__cell.is-inherited :deep(input) {
  color: var(--oc-fg-muted);
  font-style: italic;
}

.dictionary-editor__inline-create,
.dictionary-editor__rename {
  width: 100%;
}

.dictionary-editor__empty {
  color: var(--oc-fg-muted);
  text-align: center !important;
}

.dictionary-editor__add-row th,
.dictionary-editor__add-row td {
  background: var(--oc-bg-block);
}

.dictionary-editor__repair {
  flex: 1 1 auto;
  display: grid;
  grid-template-rows: auto minmax(var(--oc-list-max-height-lg), 1fr);
  gap: var(--oc-space-4);
  min-height: 0;
  padding-top: var(--oc-space-5);
}

.dictionary-editor__diagnostic {
  align-items: flex-start;
  gap: var(--oc-space-3);
}

.dictionary-editor__diagnostic div {
  display: grid;
  gap: var(--oc-space-1);
}

.dictionary-editor__source {
  min-height: var(--oc-list-max-height-lg);
  overflow: hidden;
  border: var(--oc-border-width) solid var(--oc-border-muted);
}
</style>
