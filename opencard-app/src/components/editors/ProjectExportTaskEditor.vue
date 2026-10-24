<template>
  <div class="project-export-task-editor">
    <div class="project-export-task-editor__group">
      <OcText as="span" size="sm">{{ t('projectExport.documents') }}</OcText>
      <div ref="pickerRef" class="project-export-task-editor__picker">
        <OcFieldInput full-width :value="query" :placeholder="t('projectExport.searchDocuments')"
          autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" :disabled="busy"
          :aria-expanded="menuOpen" :aria-controls="autocompleteId"
          @focus="openMenu" @input="updateQuery" @blur="closeMenu" @keydown="handleKeydown" />
        <OcButton type="button" icon-only variant="soft" icon="mdiPlus"
          :disabled="busy || !candidatePath" :aria-label="t('projectExport.addDocument')"
          :data-tooltip="t('projectExport.addDocument')"
          @click="addCandidate" />

        <OcOverlayMarker
          ref="layer"
          :group="`completion:${autocompleteId}`"
          :anchor="pickerRef"
          :owner="activeInput"
          placement="bottom-start"
          :max-height="220"
          :open="menuOpen"
          @update:open="menuOpen = $event"
          @close="menuOpen = false"
        >
          <OcAutocompleteList :id="autocompleteId" :items="suggestions" :active-key="activePath"
            @select="selectSuggestion" />
        </OcOverlayMarker>
      </div>
      <OcTree v-if="selectedDocuments.length" class="project-export-task-editor__documents"
        :data="documentTreeData" :selected-keys="[]"
        role="listbox" selection-mode="none" activation-mode="none"
        @action="handleDocumentTreeAction" @move="handleDocumentTreeMove" />
      <OcText v-else tone="muted" size="sm">{{ t('projectExport.noDocuments') }}</OcText>
    </div>

    <div class="project-export-task-editor__group project-export-task-editor__grid">
      <label class="project-export-task-editor__field">
        <span>{{ t('projectExport.selection') }}</span>
        <OcSelect v-model="selectionMode" :options="selectionOptions" full-width :disabled="busy" />
      </label>
      <label class="project-export-task-editor__field">
        <span>{{ t('projectExport.layout') }}</span>
        <OcSelect v-model="layoutMode" :options="layoutOptions" full-width :disabled="busy" />
      </label>
    </div>

    <div class="project-export-task-editor__group">
      <OcText as="span" size="sm">{{ t('projectExport.resolution') }}</OcText>
      <div class="project-export-task-editor__resolution-controls">
        <OcEnumStepper :model-value="quality" :options="qualityOptions" :disabled="busy"
          :previous-label="t('projectExport.previousPreset')"
          :next-label="t('projectExport.nextPreset')" @update:model-value="updateQuality" />
        <NumberPropertyField class="project-export-task-editor__scale-field"
          :definition="scaleDefinition" :value="scaleText" @update:value="updateScale" />
      </div>
      <OcText v-if="selectedDocuments.length === 0" tone="muted" size="sm">
        {{ t('projectExport.resolutionHint') }}
      </OcText>
    </div>

    <div class="project-export-task-editor__group">
      <label class="project-export-task-editor__field">
        <span>{{ t('projectExport.outputDirectory') }}</span>
        <OcFieldFrame>
          <OcFieldInput variant="plain" full-width readonly :value="outputDirectory"
            :placeholder="t('projectExport.chooseOutputDirectory')" />
          <template #suffix>
            <OcButton type="button" icon-only variant="ghost" icon="mdiFolderOpenOutline"
              :disabled="busy" :aria-label="t('projectExport.chooseOutputDirectory')"
              :data-tooltip="t('projectExport.chooseOutputDirectory')" @click="chooseOutputDirectory" />
          </template>
        </OcFieldFrame>
      </label>
      <label class="project-export-task-editor__field">
        <span>{{ t('projectExport.conflict') }}</span>
        <OcSelect v-model="conflictMode" :options="conflictOptions" full-width :disabled="busy" />
      </label>
      <label class="project-export-task-editor__field">
        <span>{{ t('projectExport.errorPolicy') }}</span>
        <OcSelect v-model="errorPolicy" :options="errorPolicyOptions" full-width :disabled="busy" />
      </label>
    </div>

    <OcText v-if="showValidation && validationMessage" tone="danger" size="sm" role="alert">
      {{ validationMessage }}
    </OcText>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { open as openDirectory } from '@tauri-apps/plugin-dialog'
import OcButton from '../base/OcButton.vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcAutocompleteList, { type OcAutocompleteItem } from '../standard/OcAutocompleteList.vue'
import OcEnumStepper from '../standard/OcEnumStepper.vue'
import OcOverlayMarker from '../standard/OcOverlayMarker.vue'
import OcSelect, { type OcSelectOption } from '../standard/OcSelect.vue'
import OcTree from '../standard/OcTree.vue'
import NumberPropertyField from '../../shared/ui/property-editor/fields/NumberPropertyField.vue'
import type { PropertyEditorFieldDefinition } from '../../shared/ui/property-editor/propertyEditor.types'
import type { ProjectExportTask } from '../../features/workspace/model/projectMetadata'
import type { ExportTaskValidationIssue } from '../../features/exporting/exportTask'
import type {
  OcNode,
  OcNodeAction,
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeMoveEvent,
} from '../../shared/ui/node/node.types'

export type ExportDocumentCandidate = {
  path: string
  width?: number
  height?: number
}

const props = withDefaults(defineProps<{
  documents: readonly ExportDocumentCandidate[]
  modelValue: ProjectExportTask
  busy?: boolean
  showValidation?: boolean
  preparationIssues?: readonly ExportTaskValidationIssue[]
}>(), {
  busy: false,
  showValidation: false,
  preparationIssues: () => [],
})
const emit = defineEmits<{
  'update:modelValue': [task: ProjectExportTask]
  'update:valid': [valid: boolean]
}>()
const { t } = useI18n()
const busy = computed(() => props.busy)
const showValidation = computed(() => props.showValidation)
const preparationIssues = computed(() => props.preparationIssues)

const pickerRef = ref<HTMLElement | null>(null)
const layer = ref<InstanceType<typeof OcOverlayMarker> | null>(null)
const query = ref('')
const menuOpen = ref(false)
const activePath = ref<string | null>(null)
const selectedDocuments = ref<ExportDocumentCandidate[]>([])
const outputDirectory = ref('')
const selectionMode = ref<ProjectExportTask['selectionMode']>('blueprint-and-instances')
const layoutMode = ref<ProjectExportTask['layoutMode']>('none')
const conflictMode = ref<ProjectExportTask['conflictMode']>('replace')
const errorPolicy = ref<NonNullable<ProjectExportTask['errorPolicy']>>('continue')
const quality = ref<'preview' | 'standard' | 'high' | 'ultra' | 'custom'>('standard')
const scaleText = ref('1')
const autocompleteId = useId()
const activeInput = ref<HTMLInputElement | null>(null)

const qualityScales = { preview: 0.5, standard: 1, high: 2, ultra: 5 } as const
const REMOVE_DOCUMENT_ACTION_KEY = 'remove-document'
const qualityOptions = computed(() => [
  { value: 'preview', label: t('projectExport.qualityPreview') },
  { value: 'standard', label: t('projectExport.qualityStandard') },
  { value: 'high', label: t('projectExport.qualityHigh') },
  { value: 'ultra', label: t('projectExport.qualityUltra') },
  { value: 'custom', label: t('projectExport.qualityCustom') },
])
const scaleDefinition = computed<Extract<PropertyEditorFieldDefinition, { fieldType: 'number' }>>(() => ({
  title: t('projectExport.scale'),
  fieldType: 'number',
  min: 0.1,
  step: 0.1,
  isReadonly: busy.value,
}))
const selectionOptions = computed<OcSelectOption[]>(() => [
  { value: 'blueprint-and-instances', label: t('projectExport.selectionAll') },
  { value: 'instances', label: t('projectExport.selectionInstances') },
  { value: 'blueprint', label: t('projectExport.selectionBlueprint') },
])
const layoutOptions = computed<OcSelectOption[]>(() => [
  { value: 'none', label: t('projectExport.layoutNone') },
  { value: 'layout', label: t('projectExport.layoutArrange'), disabled: true },
])
const conflictOptions = computed<OcSelectOption[]>(() => [
  { value: 'replace', label: t('projectExport.conflictReplace') },
  { value: 'skip', label: t('projectExport.conflictSkip') },
])
const errorPolicyOptions = computed<OcSelectOption[]>(() => [
  { value: 'continue', label: t('projectExport.errorContinue') },
  { value: 'stop', label: t('projectExport.errorStop') },
])
const suggestions = computed<OcAutocompleteItem[]>(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  return props.documents
    .filter(document => !selectedDocuments.value.some(selected => selected.path === document.path))
    .filter(document => !normalizedQuery || document.path.toLocaleLowerCase().includes(normalizedQuery))
    .map(document => ({ key: document.path, label: document.path, detail: '.ocdocument', icon: 'mdiCardsOutline' }))
})
const documentTreeData = computed<OcNodeCollection>(() => {
  const removeDocumentActions: readonly OcNodeAction[] = [{
    key: REMOVE_DOCUMENT_ACTION_KEY,
    title: t('projectExport.removeDocument'),
    icon: 'mdiTrashCanOutline',
    iconTone: 'danger',
  }]
  return {
    rootKeys: selectedDocuments.value.map(document => document.path),
    items: new Map(selectedDocuments.value.map((document): [string, OcNode] => [document.path, {
      label: document.path,
      tail: [targetResolution(document), ...(busy.value ? [] : removeDocumentActions)],
      visual: { type: 'icon', icon: 'mdiCardsOutline' },
      draggable: !busy.value,
    }])),
    children: new Map(),
  }
})
const candidatePath = computed(() => activePath.value && suggestions.value.some(item => item.key === activePath.value)
  ? activePath.value : null)

// 卸载时关掉自己那一层：组宿主活在别处，不留空面板。
onBeforeUnmount(() => { layer.value?.close() })

const scale = computed(() => Number(scaleText.value))
const canSubmit = computed(() => selectedDocuments.value.length > 0
  && outputDirectory.value.trim().length > 0
  && Number.isFinite(scale.value) && scale.value >= 0.1
  && layoutMode.value === 'none')
watch(canSubmit, valid => emit('update:valid', valid), { immediate: true })
const validationMessage = computed(() => {
  const preparationIssue = preparationIssues.value[0]
  if (preparationIssue) return t(`projectExport.validation.${preparationIssue.code}`, {
    path: preparationIssue.path ?? '',
  })
  if (selectedDocuments.value.length === 0) return t('projectExport.validation.documents-required')
  if (!outputDirectory.value.trim()) return t('projectExport.validation.output-required')
  if (!Number.isFinite(scale.value) || scale.value < 0.1) return t('projectExport.validation.invalid-scale')
  return ''
})

let syncingFromProps = false
watch([() => props.modelValue, () => props.documents], ([task]) => {
  syncingFromProps = true
  selectedDocuments.value = task.documentPaths
    .map(path => props.documents.find(document => document.path === path) ?? { path })
  query.value = ''
  outputDirectory.value = task.outputDirectory
  quality.value = resolveQuality(task.scale)
  scaleText.value = String(task.scale)
  selectionMode.value = task.selectionMode
  layoutMode.value = task.layoutMode
  conflictMode.value = task.conflictMode
  errorPolicy.value = task.errorPolicy ?? 'continue'
  refreshActiveSuggestion()
  void nextTick(() => { syncingFromProps = false })
}, { immediate: true })

watch([
  selectedDocuments, scaleText, selectionMode, layoutMode, outputDirectory, conflictMode, errorPolicy,
], () => {
  if (syncingFromProps || !Number.isFinite(scale.value) || scale.value < 0.1) return
  emit('update:modelValue', buildTask())
}, { deep: true })

function refreshActiveSuggestion(): void {
  activePath.value = suggestions.value[0]?.key ?? null
}
function openMenu(event: FocusEvent): void {
  activeInput.value = event.target as HTMLInputElement
  menuOpen.value = suggestions.value.length > 0
  refreshActiveSuggestion()
}
function updateQuery(event: Event): void {
  activeInput.value = event.target as HTMLInputElement
  query.value = activeInput.value.value
  menuOpen.value = suggestions.value.length > 0
  refreshActiveSuggestion()
}
function closeMenu(): void {
  window.setTimeout(() => { menuOpen.value = false }, 0)
}
function selectSuggestion(path: string): void {
  query.value = path
  activePath.value = path
  menuOpen.value = false
  void nextTick(() => activeInput.value?.focus())
}
function addCandidate(): void {
  const path = candidatePath.value
  const document = props.documents.find(candidate => candidate.path === path)
  if (!document) return
  selectedDocuments.value.push(document)
  query.value = ''
  refreshActiveSuggestion()
  void nextTick(() => activeInput.value?.focus())
}
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && candidatePath.value) {
    event.preventDefault()
    addCandidate()
  } else if (event.key === 'Escape') {
    menuOpen.value = false
  }
}
function moveDocument(from: number, to: number): void {
  if (to < 0 || to >= selectedDocuments.value.length) return
  const next = [...selectedDocuments.value]
  const [document] = next.splice(from, 1)
  if (!document) return
  next.splice(to, 0, document)
  selectedDocuments.value = next
}
function removeDocument(index: number): void {
  selectedDocuments.value = selectedDocuments.value.filter((_, candidate) => candidate !== index)
  refreshActiveSuggestion()
}
function handleDocumentTreeAction(event: OcNodeActionEvent): void {
  if (busy.value || event.actionKey !== REMOVE_DOCUMENT_ACTION_KEY) return
  const index = selectedDocuments.value.findIndex(document => document.path === event.key)
  if (index < 0) return
  removeDocument(index)
}
function handleDocumentTreeMove(event: OcNodeMoveEvent): void {
  if (busy.value || !event.targetKey || event.key === event.targetKey) return
  const index = selectedDocuments.value.findIndex(document => document.path === event.key)
  if (index < 0) return
  const targetIndex = selectedDocuments.value.findIndex(document => document.path === event.targetKey)
  if (targetIndex < 0) return
  let nextIndex = targetIndex + (event.position === 'after' ? 1 : 0)
  if (index < nextIndex) nextIndex -= 1
  moveDocument(index, nextIndex)
}
function updateQuality(value: string): void {
  if (!['preview', 'standard', 'high', 'ultra', 'custom'].includes(value)) return
  quality.value = value as typeof quality.value
  if (quality.value !== 'custom') scaleText.value = String(qualityScales[quality.value])
}
function updateScale(value: string): void {
  scaleText.value = value
  quality.value = resolveQuality(Number(value))
}
function resolveQuality(value: number): typeof quality.value {
  const preset = Object.entries(qualityScales).find(([, scale]) => scale === value)?.[0]
  return preset ? preset as typeof quality.value : 'custom'
}
async function chooseOutputDirectory(): Promise<void> {
  const selected = await openDirectory({ directory: true, multiple: false, title: t('projectExport.chooseOutputDirectory') })
  if (typeof selected === 'string') outputDirectory.value = selected
}
function targetResolution(document: ExportDocumentCandidate): string {
  if (!document.width || !document.height || !Number.isFinite(scale.value)) return t('projectExport.resolutionUnknown')
  return `${Math.round(document.width * scale.value)} × ${Math.round(document.height * scale.value)} px`
}
function buildTask(): ProjectExportTask {
  return {
    documentPaths: selectedDocuments.value.map(document => document.path),
    selectionMode: selectionMode.value,
    scale: scale.value,
    layoutMode: layoutMode.value,
    outputDirectory: outputDirectory.value.trim(),
    conflictMode: conflictMode.value,
    errorPolicy: errorPolicy.value,
  }
}
</script>

<style scoped>
.project-export-task-editor { display: grid; gap: var(--oc-space-md); min-width: 0; }
.project-export-task-editor__group { display: grid; gap: var(--oc-space-xs); min-width: 0; }
.project-export-task-editor__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.project-export-task-editor__field { display: grid; gap: var(--oc-space-2xs); min-width: 0; color: var(--oc-fg-muted); font-size: var(--oc-text-sm); }
.project-export-task-editor__picker,
.project-export-task-editor__resolution-controls { display: flex; align-items: stretch; gap: var(--oc-space-xs); min-width: 0; }
.project-export-task-editor__picker > :first-child { flex: 1 1 auto; }
.project-export-task-editor__scale-field { flex: 0 0 var(--oc-size-xl); }
.project-export-task-editor__documents { max-height: var(--oc-list-max-height-sm); overflow-y: auto; }
</style>
