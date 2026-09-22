<template>
  <OcDialog class="project-font-dialog" :open="open" :title="dialogTitle" as="form"
    close-on-backdrop :dismissible="!busy" @request-close="close" @submit="submit">
    <OcOptionGroup v-if="!editing" v-model="importMode" :options="importModeOptions" :disabled="busy" fill
      appearance="sliding-outline" />

    <section v-if="importMode === 'files'" class="project-font-dialog__summary">
      <template v-if="selectedSourceCount">
        <OcText as="strong">{{ t('projectConfig.fonts.selectedFiles', { count: selectedSourceCount }) }}</OcText>
        <OcText tone="muted" size="sm">{{ draft.name || t('projectConfig.fonts.unnamedFamily') }}</OcText>
      </template>
      <OcText v-else tone="muted" size="sm">{{ t('projectConfig.fonts.chooseFilesHint') }}</OcText>
      <div class="project-font-dialog__summary-actions">
        <OcButton type="button" icon="nav.files" variant="outline" :disabled="busy" @click="pickFiles(true)">
          {{ selectedSourceCount ? t('projectConfig.fonts.chooseAgain') : t('projectConfig.fonts.chooseFiles') }}
        </OcButton>
        <OcButton v-if="selectedSourceCount" type="button" variant="ghost" icon="tool.settings"
          @click="advancedOpen = !advancedOpen">
          {{ advancedOpen ? t('projectConfig.fonts.simpleSettings') : t('projectConfig.fonts.advancedFace') }}
        </OcButton>
      </div>
    </section>

    <template v-if="importMode === 'files' && advancedOpen">
      <label class="project-font-dialog__field"><span>{{ t('projectConfig.fonts.name') }}</span>
        <OcFieldInput full-width :value="draft.name" :aria-invalid="!draft.name.trim()" @input="updateText('name', $event)" />
      </label>
      <label class="project-font-dialog__field"><span>{{ t('projectConfig.fonts.key') }}</span>
        <OcFieldInput full-width mono :value="draft.key" :placeholder="generatedKey"
          :aria-invalid="Boolean(draft.key) && (!validKey || !uniqueKey)" @input="updateText('key', $event)" />
      </label>
      <div class="project-font-dialog__slot-table-wrap oc-data-grid">
        <table class="project-font-dialog__slot-table oc-data-grid__table">
          <thead>
            <tr>
              <th class="project-font-dialog__slot-corner oc-data-grid__corner" scope="col">{{ t('projectConfig.fonts.weight') }}</th>
              <th v-for="style in projectFontStyles" :key="style" scope="col">{{ fontStyleLabel(style) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="weight in projectFontWeights" :key="weight">
              <th class="project-font-dialog__slot-weight" scope="row">{{ fontWeightLabel(weight) }}</th>
              <td v-for="style in projectFontStyles" :key="style" class="project-font-dialog__slot-cell">
                <div class="project-font-dialog__slot-control">
                  <OcButton class="project-font-dialog__slot-source"
                    :class="{ 'project-font-dialog__slot-source--fallback': !slotFor(weight, style) && Boolean(fallbackLabel(slotKey(weight, style))) }"
                    type="button" variant="ghost" block :disabled="busy" @click="pickSlot(slotKey(weight, style))">
                    {{ slotFor(weight, style)
                      ? slotSourceLabel(slotFor(weight, style)!)
                      : fallbackLabel(slotKey(weight, style)) || t('projectConfig.fonts.chooseFiles') }}
                  </OcButton>
                  <OcButton v-if="slotFor(weight, style)" type="button" variant="ghost" icon="action.delete"
                    icon-only :aria-label="t('projectConfig.fonts.removeFace')"
                    :data-tooltip="t('projectConfig.fonts.removeFace')" @click="clearSlot(slotKey(weight, style))" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <OcText v-if="metadataError" tone="danger" size="sm" role="alert">{{ metadataError }}</OcText>
      <OcText v-if="validationMessage" tone="danger" size="sm" role="alert">{{ validationMessage }}</OcText>
    </template>

    <ProjectFontSystemPicker v-else-if="importMode === 'system'" :families="systemFamilies"
      :selected-names="selectedFamilyNames" :loading="systemFontsLoading" :error="systemFontsError"
      @select="selectSystemFamily" @deselect="deselectSystemFamily" />

    <OcText v-if="error" tone="danger" size="sm" role="alert">{{ error }}</OcText>

    <template #footer>
      <OcButton type="button" :disabled="busy" @click="close">{{ t('projectConfig.fonts.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" :disabled="!canSubmit || busy">
        {{ editing ? t('projectConfig.fonts.save') : t('projectConfig.fonts.confirmRegister') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script lang="ts">
export type ProjectFontSlotKey = 'light.upright' | 'light.italic' | 'normal.upright' | 'normal.italic' | 'bold.upright' | 'bold.italic'
export type ProjectFontSlotRequest = {
  originalSource?: string
  sourcePath: string
  collectionIndex?: number
  conflictResolution?: ProjectAssetImportResolution
}
export type ProjectFontFamilyRegistrationRequest = {
  families: Array<{
    originalKey?: string
    key: string
    name: string
    slots: Partial<Record<ProjectFontSlotKey, ProjectFontSlotRequest>>
  }>
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectFontRegistry } from '../../features/workspace/model/projectFontRegistry'
import { projectFontIdPattern, projectFontWeights, projectFontStyles, projectFontWeightValues, type ProjectFontWeight, type ProjectFontStyle } from '../../features/workspace/model/projectFontRegistry'
import type { ProjectAssetImportConflict, ProjectAssetImportResolution } from '../../features/workspace/store/projectStore'
import { DEFAULT_PROJECT_FONT_DIRECTORY } from '../../features/workspace/model/projectFonts'
import { createAvailableKey } from '../../shared/model/keySlug'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { inspectProjectFontSource } from '../../features/workspace/services/projectFontMetadata'
import {
  assignSystemFontSlots,
  readSystemFontCatalog,
  systemFontFaceWeight,
  type SystemFontFamily,
} from '../../features/workspace/services/systemFontCatalog'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'
import OcOptionGroup, { type OcOption } from '../standard/OcOptionGroup.vue'
import ProjectFontSystemPicker from './ProjectFontSystemPicker.vue'
import '../../shared/ui/data-grid/dataGrid.css'

type SlotDraft = ProjectFontSlotRequest & { faceName: string; copyRequired: boolean; conflict?: ProjectAssetImportConflict | null; pending?: boolean }
type FamilyDraft = { originalKey?: string; key: string; name: string; slots: Partial<Record<ProjectFontSlotKey, SlotDraft>> }
/** 添加字体的来源：从文件选取走原来的字体文件流程，从系统导入按字系批量登记。 */
type ProjectFontImportMode = 'files' | 'system'
const props = withDefaults(defineProps<{
  open: boolean; registry?: ProjectFontRegistry; reservedKeys?: readonly string[]; originalKey?: string
  defaultOpenPath?: string; busy?: boolean; error?: string
  getManagedFontSource: (path: string) => string | null
  resolveImportConflict: (sourcePath: string, targetDirectory: string) => Promise<ProjectAssetImportConflict | null>
}>(), { registry: () => ({}), reservedKeys: () => [], busy: false, error: '' })
const emit = defineEmits<{ close: []; submit: [request: ProjectFontFamilyRegistrationRequest] }>()
const { t } = useI18n()
const importMode = ref<ProjectFontImportMode>('files')
const draft = ref<FamilyDraft>({ key: '', name: '', slots: {} })
const advancedOpen = ref(false)
const metadataError = ref('')
const systemFamilies = ref<readonly SystemFontFamily[]>([])
const systemFontsLoading = ref(false)
const systemFontsError = ref('')
const selectedFamilies = ref<readonly SystemFontFamily[]>([])
const editing = computed(() => Boolean(props.originalKey))
const importModeOptions = computed<OcOption[]>(() => [
  { value: 'files', label: t('projectConfig.fonts.importFiles'), icon: 'nav.files' },
  { value: 'system', label: t('projectConfig.fonts.importSystem'), icon: 'action.import' },
])
const selectedSourceCount = computed(() => new Set(Object.values(draft.value.slots).map(slot => slot?.sourcePath)).size)
const generatedKey = computed(() => createAvailableKey(draft.value.name, [...Object.keys(props.registry), ...props.reservedKeys], 'font'))
const effectiveKey = computed(() => draft.value.key || generatedKey.value)
const validKey = computed(() => projectFontIdPattern.test(effectiveKey.value))
const uniqueKey = computed(() => ![...Object.keys(props.registry), ...props.reservedKeys].some(key => key.toLowerCase() === effectiveKey.value.toLowerCase() && key.toLowerCase() !== props.originalKey?.toLowerCase()))
const selectedFamilyNames = computed(() => selectedFamilies.value.map(family => family.name))
/** 勾选的系统字系各自成为一套项目字体，名称与 Key 在注册表范围内自动避让。 */
const systemDrafts = computed<FamilyDraft[]>(() => {
  const usedKeys = [...Object.keys(props.registry), ...props.reservedKeys]
  return selectedFamilies.value.map(family => {
    const key = createAvailableKey(family.name, usedKeys, 'font')
    usedKeys.push(key)
    return { key, name: family.name, slots: systemFamilySlots(family) }
  })
})
const canSubmit = computed(() => importMode.value === 'system'
  ? systemDrafts.value.length > 0
  : Boolean(draft.value.name.trim() && validKey.value && uniqueKey.value && selectedSourceCount.value
    && Object.values(draft.value.slots).every(isSlotReady)))
const validationMessage = computed(() => !selectedSourceCount.value ? t('projectConfig.fonts.faceRequired') : !draft.value.name.trim() ? t('projectConfig.fonts.nameRequired') : !uniqueKey.value ? t('projectConfig.fonts.keyExists') : '')
const dialogTitle = computed(() => editing.value ? t('projectConfig.fonts.configure') : t('projectConfig.fonts.register'))

watch([() => props.open, () => props.originalKey], ([open]) => {
  if (!open) return
  const entry = props.originalKey ? props.registry[props.originalKey] : undefined
  const font = entry?.kind === 'family' ? entry.family : undefined
  const slots: FamilyDraft['slots'] = {}
  if (font) for (const weight of projectFontWeights) for (const style of projectFontStyles) {
    const source = font.files[weight]?.[style]
    if (source) slots[`${weight}.${style}` as ProjectFontSlotKey] = { sourcePath: source, originalSource: source, faceName: projectAssetName(source), copyRequired: false }
  }
  draft.value = { ...(font?.key ? { originalKey: font.key } : {}), key: font?.key ?? '', name: font?.name ?? '', slots }
  importMode.value = 'files'
  advancedOpen.value = editing.value
  metadataError.value = ''
  selectedFamilies.value = []
}, { immediate: true })

watch(importMode, mode => {
  if (mode === 'system') void loadSystemFamilies()
})

async function loadSystemFamilies(): Promise<void> {
  if (systemFamilies.value.length || systemFontsLoading.value) return
  systemFontsLoading.value = true
  systemFontsError.value = ''
  try {
    systemFamilies.value = await readSystemFontCatalog()
  } catch (error) {
    systemFontsError.value = error instanceof Error ? error.message : String(error)
  } finally {
    systemFontsLoading.value = false
  }
}

function selectSystemFamily(family: SystemFontFamily): void {
  if (selectedFamilies.value.some(candidate => candidate.name === family.name)) return
  selectedFamilies.value = [...selectedFamilies.value, family]
}

function deselectSystemFamily(family: SystemFontFamily): void {
  selectedFamilies.value = selectedFamilies.value.filter(candidate => candidate.name !== family.name)
}

/** 一个系统字系的全部字面按字重与斜体归入槽位。 */
function systemFamilySlots(family: SystemFontFamily): FamilyDraft['slots'] {
  const slots: FamilyDraft['slots'] = {}
  for (const { face } of assignSystemFontSlots(family.faces)) {
    slots[`${systemFontFaceWeight(face.weight)}.${face.italic ? 'italic' : 'upright'}` as ProjectFontSlotKey] = {
      sourcePath: face.path,
      ...(isFontCollectionPath(face.path) ? { collectionIndex: face.index } : {}),
      faceName: face.faceName,
      copyRequired: props.getManagedFontSource(face.path) === null,
    }
  }
  return slots
}

/** 文件来源沿用原来的流程：挑选文件后重新识别整套字体，系统来源只按字系批量登记。 */
async function pickFiles(replaceAll = false): Promise<void> {
  const paths = fileSystemService.pickFiles
    ? await fileSystemService.pickFiles({ title: t('projectConfig.fonts.pickTitle'), fileTypeName: t('projectConfig.fonts.fileType'), extensions: ['woff', 'woff2', 'ttf', 'otf', 'ttc', 'otc'], defaultPath: props.defaultOpenPath })
    : [await fileSystemService.pickFile({ title: t('projectConfig.fonts.pickTitle'), fileTypeName: t('projectConfig.fonts.fileType'), extensions: ['woff', 'woff2', 'ttf', 'otf', 'ttc', 'otc'], defaultPath: props.defaultOpenPath })].filter((value): value is string => Boolean(value))
  if (!paths.length) return
  if (replaceAll) {
    draft.value = { key: '', name: '', slots: {} }
    metadataError.value = ''
  }
  for (const path of paths) {
    try {
      const inspected = await inspectProjectFontSource(await fileSystemService.readBinaryFile(path))
      for (const face of inspected) {
        if (!draft.value.name) draft.value.name = face.familyName || fontNameFromPath(path)
        const min = face.weight.min; const max = face.weight.max
        const targets = projectFontWeights.filter(weight => {
          const value = weight === 'light' ? 300 : weight === 'normal' ? 400 : 700
          return min <= value && value <= max
        })
        const weights = targets.length ? targets : [min < 375 ? 'light' : min > 550 ? 'bold' : 'normal'] as const
        const style = face.style.kind === 'italic' || face.style.kind === 'oblique' ? 'italic' : 'upright'
        for (const weight of weights) {
          const key = `${weight}.${style}` as ProjectFontSlotKey
          if (draft.value.slots[key]) continue
          const slot: SlotDraft = { sourcePath: path, ...(face.collectionIndex === undefined ? {} : { collectionIndex: face.collectionIndex }), faceName: face.faceName || projectAssetName(path), copyRequired: props.getManagedFontSource(path) === null }
          draft.value.slots[key] = slot
          await checkConflict(key, slot)
        }
      }
    } catch (error) {
      metadataError.value = error instanceof Error ? error.message : String(error)
    }
  }
}
async function pickSlot(key: ProjectFontSlotKey): Promise<void> {
  const path = await fileSystemService.pickFile({
    title: t('projectConfig.fonts.pickTitle'), fileTypeName: t('projectConfig.fonts.fileType'),
    extensions: ['woff', 'woff2', 'ttf', 'otf', 'ttc', 'otc'], defaultPath: props.defaultOpenPath,
  })
  if (!path) return
  try {
    const inspected = await inspectProjectFontSource(await fileSystemService.readBinaryFile(path))
    const [weight, style] = key.split('.') as [ProjectFontWeight, ProjectFontStyle]
    const target = projectFontWeightValues[weight]
    const preferred = [...inspected].sort((left, right) => {
      const leftStyle = left.style.kind === 'normal' ? 'upright' : 'italic'
      const rightStyle = right.style.kind === 'normal' ? 'upright' : 'italic'
      return Number(leftStyle !== style) - Number(rightStyle !== style)
        || Math.abs((left.weight.min + left.weight.max) / 2 - target) - Math.abs((right.weight.min + right.weight.max) / 2 - target)
    })[0]
    if (!preferred) throw new Error('No font entries found')
    const slot: SlotDraft = {
      sourcePath: path,
      ...(preferred.collectionIndex === undefined ? {} : { collectionIndex: preferred.collectionIndex }),
      faceName: preferred.faceName || projectAssetName(path),
      copyRequired: props.getManagedFontSource(path) === null,
    }
    draft.value.slots[key] = slot
    await checkConflict(key, slot)
  } catch (error) {
    metadataError.value = error instanceof Error ? error.message : String(error)
  }
}
function clearSlot(key: ProjectFontSlotKey): void { delete draft.value.slots[key] }
function isSlotReady(slot: SlotDraft | undefined): boolean {
  return !slot?.pending && (slot?.conflict === undefined || slot.conflict === null || Boolean(slot.conflictResolution))
}
function slotKey(weight: ProjectFontWeight, style: ProjectFontStyle): ProjectFontSlotKey { return `${weight}.${style}` as ProjectFontSlotKey }
function slotFor(weight: ProjectFontWeight, style: ProjectFontStyle): SlotDraft | undefined { return draft.value.slots[slotKey(weight, style)] }
function fontWeightLabel(weight: ProjectFontWeight): string {
  return weight === 'light' ? t('projectConfig.fonts.weightLight') : weight === 'normal' ? t('projectConfig.fonts.weightNormal') : t('projectConfig.fonts.weightBold')
}
function fontStyleLabel(style: ProjectFontStyle): string { return style === 'upright' ? t('projectConfig.fonts.styleNormal') : t('projectConfig.fonts.styleItalic') }
function slotSourceLabel(slot: SlotDraft): string {
  const fileName = projectAssetName(slot.sourcePath)
  const faceName = slot.faceName.trim()
  return faceName && faceName.toLowerCase() !== 'regular' && faceName.toLowerCase() !== fileName.toLowerCase()
    ? `${fileName} (${faceName})`
    : fileName
}
function fallbackLabel(key: ProjectFontSlotKey): string {
  const [weight, style] = key.split('.') as [ProjectFontWeight, ProjectFontStyle]
  for (const posture of [style, style === 'italic' ? 'upright' : 'italic'] as const) {
    const candidates = projectFontWeights.flatMap(candidate => {
      const slot = draft.value.slots[`${candidate}.${posture}` as ProjectFontSlotKey]
      return slot ? [{ source: slotSourceLabel(slot), distance: Math.abs(projectFontWeightValues[candidate] - projectFontWeightValues[weight]) }] : []
    }).sort((a, b) => a.distance - b.distance)
    if (candidates[0]) return candidates[0].source
  }
  return ''
}
async function checkConflict(key: ProjectFontSlotKey, slot: SlotDraft): Promise<void> {
  if (!slot.copyRequired) return
  const reactiveSlot = draft.value.slots[key] ?? slot
  reactiveSlot.pending = true
  try {
    reactiveSlot.conflict = await props.resolveImportConflict(reactiveSlot.sourcePath, DEFAULT_PROJECT_FONT_DIRECTORY)
    reactiveSlot.conflictResolution = reactiveSlot.conflict ? 'rename-copy' : undefined
  } catch (error) {
    metadataError.value = t('projectConfig.fonts.importCheckFailed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
  finally { reactiveSlot.pending = false }
}
function updateText(field: 'key' | 'name', event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  if (field === 'key') draft.value.key = event.target.value
  else draft.value.name = event.target.value
}
function slotRequests(slots: FamilyDraft['slots']): Partial<Record<ProjectFontSlotKey, ProjectFontSlotRequest>> {
  return Object.fromEntries(Object.entries(slots).map(([key, slot]) => [key, {
    originalSource: slot!.originalSource, sourcePath: slot!.sourcePath, ...(slot!.collectionIndex === undefined ? {} : { collectionIndex: slot!.collectionIndex }), ...(slot!.conflictResolution ? { conflictResolution: slot!.conflictResolution } : {}),
  }])) as Partial<Record<ProjectFontSlotKey, ProjectFontSlotRequest>>
}
function submit(): void {
  if (!canSubmit.value) return
  if (importMode.value === 'system') {
    emit('submit', { families: systemDrafts.value.map(entry => ({
      key: entry.key, name: entry.name, slots: slotRequests(entry.slots),
    })) })
    return
  }
  emit('submit', { families: [{ ...(draft.value.originalKey ? { originalKey: draft.value.originalKey } : {}), key: effectiveKey.value, name: draft.value.name.trim(), slots: slotRequests(draft.value.slots) }] })
}
function close(): void { if (!props.busy) emit('close') }
function isFontCollectionPath(path: string): boolean { return /\.(?:ttc|otc)$/i.test(path) }
function projectAssetName(path: string): string { return path.replace(/\\/g, '/').split('/').pop() ?? path }
function fontNameFromPath(path: string): string { return projectAssetName(path).replace(/\.(?:woff2?|ttf|otf|ttc|otc)$/i, '') }
</script>

<style scoped>
.project-font-dialog__summary-actions { display: flex; gap: var(--oc-space-2); margin-top: var(--oc-space-3); }
.project-font-dialog__field { display: grid; gap: var(--oc-space-1); margin-top: var(--oc-space-3); }
.project-font-dialog__slot-table-wrap { width: 100%; max-width: var(--oc-content-width-md); height: auto; margin-top: var(--oc-space-4); overflow: hidden; }
.project-font-dialog__slot-table { width: 100%; }
.project-font-dialog__slot-table th,
.project-font-dialog__slot-table td { min-width: 0; }
.project-font-dialog__slot-table th { color: var(--oc-fg-default); font-size: var(--oc-text-sm); }
.project-font-dialog__slot-corner,
.project-font-dialog__slot-weight { white-space: nowrap; }
.project-font-dialog__slot-cell { min-width: 0; }
.project-font-dialog__slot-control { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--oc-space-1); min-width: 0; }
.project-font-dialog__slot-source { width: 100%; min-width: 0; height: 100%; padding: 0; border: 0; border-radius: 0; justify-content: flex-start; overflow: hidden; }
.project-font-dialog__slot-source:hover:not(:disabled) { background-color: transparent; }
.project-font-dialog__slot-source--fallback { color: var(--oc-fg-muted); }
:deep(.project-font-dialog__slot-source .oc-button__content) { width: 100%; justify-content: flex-start; overflow: hidden; }
:deep(.project-font-dialog__slot-source .oc-button__label) { display: block; width: 100%; text-align: left; }
</style>
