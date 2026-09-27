<template>
  <div class="project-icon-registry-workbench">
    <section class="project-icon-registry-workbench__sets">
      <OcTree v-if="series.length" class="project-icon-registry-workbench__sets-tree" fill
        role="listbox" :data="seriesTreeData" :selected-keys="selectedSeriesKey ? [selectedSeriesKey] : []"
        selection-mode="single" scroll-to-selection
        :action-overflow-title="t('projectConfig.icons.iconSetActions')"
        @selection-change="handleSeriesSelection" @action="handleSeriesAction" />
      <OcEmpty v-else tone="muted">{{ t('projectConfig.icons.empty') }}</OcEmpty>
    </section>

    <section class="project-icon-registry-workbench__icons">
      <ProjectIconSetWorkspace v-if="selectedSeries"
        :series="selectedSeries" :entries="selectedSeriesEntries"
        :selected-icon-indexes="selectedIconIndexesForSeries"
        @update:series="updateSelectedSeries" @update:selected-icon-indexes="setSelectedIconIndexes" />
      <div v-else class="project-icon-registry-workbench__placeholder">
        <OcIcon name="file.project-icon" size="lg" tone="muted" />
        <OcEmpty tone="muted" inset="none">{{ t('projectConfig.icons.noSeriesSelected') }}</OcEmpty>
      </div>
    </section>

    <section class="project-icon-registry-workbench__inspector">
      <div v-if="selectedIconIndexesForSeries.length > 1"
        class="project-icon-registry-workbench__placeholder">
        <OcIcon name="file.project-icon" size="lg" tone="muted" />
        <OcText tone="muted">
          {{ t('projectConfig.icons.multiSelectionNote', { count: selectedIconIndexesForSeries.length }) }}
        </OcText>
      </div>
      <template v-else-if="selectedIcon && selectedCatalogEntry">
        <ProjectIconPreview :entry="selectedCatalogEntry" />
        <div class="project-icon-registry-workbench__property-content">
          <PropertyEditor ref="propertyEditorRef" :inputs="iconPropertyInputs"
            :categories="iconPropertyCategories" sort-mode="category" @update-property="updateIconProperty" />
        </div>
      </template>
      <div v-else class="project-icon-registry-workbench__placeholder">
        <OcIcon name="file.project-icon" size="lg" tone="muted" />
        <OcEmpty tone="muted" inset="none">{{ t('projectConfig.icons.noIconSelected') }}</OcEmpty>
      </div>
    </section>

    <ProjectIconSetSettingsDialog :open="settingsSeriesIndex !== null" :name="settingsSeries?.name"
      :series-key="settingsSeries?.key" :busy="settingsBusy"
      :existing-keys="series.map(candidate => candidate.key)"
      @close="settingsSeriesIndex = null" @submit="saveIconSetSettings" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  findProjectIconKeyConflicts,
  isRasterProjectIconSource,
  PROJECT_ICON_ROTATIONS,
  PROJECT_ICON_TINTS,
  type ProjectIcon,
  type ProjectIconKeyConflict,
  type ProjectIconRotation,
  type ProjectIconSeries,
} from '../../features/workspace/model/projectIcons'
import {
  buildProjectIconCatalog,
  findProjectIcon,
  findProjectIconSeries,
  type ProjectIconCatalog,
  type ProjectIconCatalogEntry,
} from '../../features/workspace/services/projectIconCatalog'
import type {
  PropertyEditorCategoryDefinition,
  PropertyEditorInput,
  PropertyEditorMutation,
} from '../../shared/ui/property-editor/propertyEditor.types'
import PropertyEditor from '../../shared/ui/property-editor/PropertyEditor.vue'
import type { OcNode, OcNodeAction, OcNodeActionEvent, OcNodeCollection, OcNodeSelectionEvent } from '../../shared/ui/node/node.types'
import OcEmpty from '../base/OcEmpty.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import OcTree from '../standard/OcTree.vue'
import ProjectIconPreview from './ProjectIconPreview.vue'
import ProjectIconSetSettingsDialog, { type ProjectIconSetSettingsRequest } from './ProjectIconSetSettingsDialog.vue'
import ProjectIconSetWorkspace from './ProjectIconSetWorkspace.vue'

const props = withDefaults(defineProps<{
  series?: readonly ProjectIconSeries[]
  resolveAssetSrc: (source: string) => string
  defaultOpenPath?: string
  projectIconCatalog?: ProjectIconCatalog
  /** An icon-pack task owns the global progress bar; pack commands stay disabled until it settles. */
  packBusy?: boolean
}>(), { series: () => [], packBusy: false })
const emit = defineEmits<{
  'update:series': [series: ProjectIconSeries[]]
  'key-conflicts': [conflicts: readonly ProjectIconKeyConflict[]]
  'export-pack': [series: ProjectIconSeries]
  /** Asks the owner to confirm and stage the removal; the workbench never drops a set on its own. */
  'remove-series': [seriesKey: string]
  /** Asks the owner to copy new icons into an existing set. */
  'add-icons': [seriesKey: string]
}>()
const { t } = useI18n()
const selectedSeriesKey = ref<string | null>(null)
const selectedIconIndexes = ref<Record<string, number[]>>({})
const settingsSeriesIndex = ref<number | null>(null)
const settingsBusy = ref(false)
const propertyEditorRef = ref<InstanceType<typeof PropertyEditor> | null>(null)
const localCatalog = ref<ProjectIconCatalog>({ series: [], entries: [] })
let initialized = false

const selectedSeriesIndex = computed(() => {
  if (selectedSeriesKey.value === null) return null
  const index = props.series.findIndex(candidate => candidate.key === selectedSeriesKey.value)
  return index >= 0 ? index : null
})
const selectedSeries = computed(() => selectedSeriesIndex.value === null
  ? null : props.series[selectedSeriesIndex.value] ?? null)
const selectedRuntime = computed(() => selectedSeries.value
  ? findProjectIconSeries(localCatalog.value, selectedSeries.value.key)
    ?? findProjectIconSeries(props.projectIconCatalog, selectedSeries.value.key)
  : null)
const selectedIconIndex = computed(() => {
  const current = selectedSeries.value
  if (!current) return null
  return selectedIconIndexes.value[current.key]?.find(index => current.icons[index]) ?? null
})
const selectedIconIndexesForSeries = computed(() => (
  selectedSeries.value ? selectedIconIndexes.value[selectedSeries.value.key] ?? [] : []
))
const selectedIcon = computed(() => selectedIconIndex.value === null
  ? null : selectedSeries.value?.icons[selectedIconIndex.value] ?? null)
const settingsSeries = computed(() => settingsSeriesIndex.value === null
  ? null : props.series[settingsSeriesIndex.value] ?? null)
const selectedSeriesEntries = computed<readonly ProjectIconCatalogEntry[]>(() => {
  const series = selectedSeries.value
  if (!series) return []
  const local = localCatalog.value.entries.filter(entry => sameIconSeries(entry.seriesKey, series.key))
  if (local.length) return local
  return (props.projectIconCatalog?.entries ?? []).filter(entry => sameIconSeries(entry.seriesKey, series.key))
})
const selectedCatalogEntry = computed<ProjectIconCatalogEntry | null>(() => {
  const series = selectedSeries.value
  const icon = selectedIcon.value
  if (!series || !icon) return null
  return findProjectIcon(localCatalog.value, series.key, icon.iconKey)
    ?? findProjectIcon(props.projectIconCatalog, series.key, icon.iconKey)
})
const conflicts = computed(() => findProjectIconKeyConflicts(props.series))
const iconPropertyCategories = computed<ReadonlyMap<string, PropertyEditorCategoryDefinition>>(() => new Map([
  ['identity', { title: t('projectConfig.icons.identity'), icon: 'data.symbol-class' }],
  ['appearance', { title: t('projectConfig.icons.appearance'), icon: 'file.image' }],
]))
const iconPropertyInputs = computed<PropertyEditorInput[]>(() => {
  const index = selectedIconIndex.value
  const icon = selectedIcon.value
  if (index === null || !icon) return []
  return [{
    key: `icon:${index}`,
    title: icon.name,
    record: {
      iconKey: icon.iconKey,
      name: icon.name,
      tint: icon.tint,
      pixelated: String(icon.pixelated ?? false),
      rotation: `${icon.rotation ?? 0}°`,
    },
    fields: {
      iconKey: { title: t('projectConfig.icons.referenceName'), fieldType: 'string', category: 'identity', order: 1, required: true, commitMode: 'blur' },
      name: { title: t('projectConfig.icons.iconName'), fieldType: 'string', category: 'identity', order: 2, commitMode: 'blur' },
      tint: {
        title: t('projectConfig.icons.tint'), fieldType: 'string', category: 'appearance', order: 1,
        options: [...PROJECT_ICON_TINTS],
        optionLabels: {
          theme: t('projectConfig.icons.tintTheme'),
          original: t('projectConfig.icons.tintOriginal'),
        },
        presentation: 'select',
      },
      // 像素化只对位图有意义：矢量图标缩放到多大都是清晰的，摆一个按不动的开关只会让人猜。
      ...(isRasterProjectIconSource(icon.source)
        ? { pixelated: { title: t('projectConfig.icons.pixelated'), fieldType: 'boolean' as const, category: 'appearance', order: 2 } }
        : {}),
      rotation: {
        title: t('projectConfig.icons.rotation'), fieldType: 'string', category: 'appearance', order: 3,
        options: PROJECT_ICON_ROTATIONS.map(value => `${value}°`), presentation: 'select',
      },
    },
  }]
})
const seriesTreeData = computed<OcNodeCollection>(() => ({
  rootKeys: props.series.map(candidate => candidate.key),
  items: new Map(props.series.map((candidate): [string, OcNode] => [candidate.key, {
    label: candidate.name,
    visual: { type: 'icon' as const, icon: 'file.project-icon' },
    tail: [t('projectConfig.icons.iconCount', { count: candidate.icons.length }), ...seriesActions()],
  }])),
  children: new Map(),
}))

function seriesActions(): OcNodeAction[] {
  return [
    {
      key: 'add-icons', title: t('projectConfig.icons.addIcons'), icon: 'action.add',
      disabled: Boolean(props.packBusy),
    },
    { key: 'configure', title: t('projectConfig.icons.configureIconSet'), icon: 'tool.settings' },
    {
      key: 'export-pack', title: t('projectConfig.icons.exportPack'), icon: 'action.export',
      disabled: Boolean(props.packBusy),
    },
    {
      key: 'remove', title: t('projectConfig.icons.removeSeries'), icon: 'action.delete', iconTone: 'danger',
    },
  ]
}

watch(() => props.series, nextSeries => {
  if (!initialized) {
    selectedSeriesKey.value = nextSeries[0]?.key ?? null
    initialized = true
  } else if (selectedSeriesKey.value !== null
    && !nextSeries.some(candidate => candidate.key === selectedSeriesKey.value)) {
    selectedSeriesKey.value = nextSeries[0]?.key ?? null
  }
  const nextSelections: Record<string, number[]> = {}
  for (const candidate of nextSeries) {
    const selected = selectedIconIndexes.value[candidate.key] ?? []
    const valid = selected.filter(index => candidate.icons[index])
    nextSelections[candidate.key] = valid.length ? valid : candidate.icons.length ? [0] : []
  }
  selectedIconIndexes.value = nextSelections
}, { immediate: true })
watch(() => seriesCatalogIdentity(selectedSeries.value),
  identity => {
    if (identity === null || !selectedSeries.value) {
      localCatalog.value = { series: [], entries: [] }
      return
    }
    // Assembling the catalog is pure data: an icon's size is resolved when it is painted.
    localCatalog.value = buildProjectIconCatalog([selectedSeries.value], props.resolveAssetSrc)
  }, { immediate: true })
watch(conflicts, value => emit('key-conflicts', value), { immediate: true })

function sameIconSeries(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase()
}

/** Identity of everything the local catalog reads for the selected set: every icon's own file. */
function seriesCatalogIdentity(series: ProjectIconSeries | null): string | null {
  if (!series) return null
  return `${series.key}\u0000${series.icons.map(icon => `${icon.iconKey}:${icon.source}`).join('\u0001')}`
}

function selectSeriesByIndex(index: number): void {
  const candidate = props.series[index]
  if (!candidate) return
  selectedSeriesKey.value = candidate.key
  if (selectedIconIndexes.value[candidate.key] == null && candidate.icons.length) {
    selectedIconIndexes.value[candidate.key] = [0]
  }
}
function handleSeriesSelection(event: OcNodeSelectionEvent): void {
  const key = event.selectedKeys[0]
  const index = key === undefined ? -1 : props.series.findIndex(candidate => candidate.key === key)
  if (index < 0) return
  selectSeriesByIndex(index)
}
function handleSeriesAction(event: OcNodeActionEvent): void {
  const index = props.series.findIndex(candidate => candidate.key === event.key)
  if (index < 0) return
  if (event.actionKey === 'add-icons') emit('add-icons', event.key)
  else if (event.actionKey === 'configure') openSettingsDialog(index)
  else if (event.actionKey === 'export-pack') exportIconPack(index)
  else if (event.actionKey === 'remove') removeSeries(index)
}
function setSelectedIconIndexes(indexes: number[]): void {
  if (selectedSeriesKey.value !== null) selectedIconIndexes.value[selectedSeriesKey.value] = [...indexes]
}
function updateSelectedSeries(nextSeries: ProjectIconSeries): void {
  const index = selectedSeriesIndex.value
  if (index === null) return
  const next = [...props.series]
  next[index] = nextSeries
  emit('update:series', next)
}
function updateIcon(index: number, patch: Partial<ProjectIcon>): void {
  const current = selectedSeries.value
  const icon = current?.icons[index]
  if (!current || !icon) return
  const icons = [...current.icons]
  icons[index] = { ...icon, ...patch }
  updateSelectedSeries({ ...current, icons })
}
function updateIconProperty(mutation: PropertyEditorMutation): void {
  const index = selectedIconIndex.value
  if (index === null) return
  if (mutation.fieldKey === 'iconKey') updateIcon(index, { iconKey: String(mutation.value) })
  else if (mutation.fieldKey === 'name') updateIcon(index, { name: String(mutation.value) })
  else if (mutation.fieldKey === 'tint') {
    updateIcon(index, { tint: mutation.value === 'original' ? 'original' : 'theme' })
  } else if (mutation.fieldKey === 'pixelated') {
    updateIcon(index, { pixelated: mutation.value === true || mutation.value === 'true' })
  } else if (mutation.fieldKey === 'rotation') {
    const value = Number(String(mutation.value).replace('°', ''))
    if ((PROJECT_ICON_ROTATIONS as readonly number[]).includes(value)) {
      updateIcon(index, { rotation: value as ProjectIconRotation })
    }
  }
}
function exportIconPack(index: number): void {
  const candidate = props.series[index]
  if (candidate) emit('export-pack', candidate)
}
function openSettingsDialog(index: number): void {
  if (props.series[index]) settingsSeriesIndex.value = index
}
async function saveIconSetSettings(request: ProjectIconSetSettingsRequest): Promise<void> {
  const index = settingsSeriesIndex.value
  const current = index === null ? null : props.series[index]
  if (index === null || !current) return
  settingsBusy.value = true
  try {
    const next = [...props.series]
    next[index] = { ...current, name: request.name, key: request.key }
    if (selectedSeriesKey.value === current.key) {
      selectedSeriesKey.value = request.key
      selectedIconIndexes.value[request.key] = selectedIconIndexes.value[current.key] ?? []
      delete selectedIconIndexes.value[current.key]
    }
    settingsSeriesIndex.value = null
    emit('update:series', next)
  } finally {
    settingsBusy.value = false
  }
}
function removeSeries(index: number): void {
  const removed = props.series[index]
  if (!removed) return
  emit('remove-series', removed.key)
}
async function selectSeries(seriesKey: string): Promise<boolean> {
  await nextTick()
  const index = props.series.findIndex(candidate => candidate.key === seriesKey)
  if (index < 0) return false
  selectSeriesByIndex(index)
  return true
}
async function navigateToKeyConflict(conflict: ProjectIconKeyConflict): Promise<boolean> {
  const candidate = props.series[conflict.seriesIndex]
  if (!candidate) return false
  selectSeriesByIndex(conflict.seriesIndex)
  if (conflict.kind === 'series') {
    openSettingsDialog(conflict.seriesIndex)
    return true
  }
  if (!candidate.icons[conflict.iconIndex]) return false
  setSelectedIconIndexes([conflict.iconIndex])
  await nextTick()
  await propertyEditorRef.value?.activateField(`icon:${conflict.iconIndex}`, 'iconKey')
  return true
}

defineExpose({ selectSeries, navigateToKeyConflict, selectedRuntime })
</script>

<style scoped>
.project-icon-registry-workbench {
  display: grid;
  grid-template-columns:
    var(--oc-project-icon-sets-width) minmax(0, 1fr) var(--oc-project-icon-inspector-width);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--oc-bg-base);
}
.project-icon-registry-workbench__sets {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: var(--oc-space-2) var(--oc-space-3);
  border-right: var(--oc-border-width) solid var(--oc-border-muted);
}
.project-icon-registry-workbench__sets-tree { min-height: 0; }
.project-icon-registry-workbench__icons {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.project-icon-registry-workbench__inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: var(--oc-border-width) solid var(--oc-border-muted);
}
.project-icon-registry-workbench__property-content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--oc-space-3);
}
.project-icon-registry-workbench__placeholder {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--oc-space-3);
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: var(--oc-space-6);
  text-align: center;
}
</style>
