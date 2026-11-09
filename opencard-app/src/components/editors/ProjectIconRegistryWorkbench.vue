<template>
  <ProjectResourceWorkbench :leading-title="t('projectConfig.icons.iconSets')" :leading-actions="leadingCardActions"
    :inspector-title="t('cardDesigner.panels.preview')" :footer-title="t('cardDesigner.panels.properties')"
    @action="handleCardAction">
    <template #leading>
      <OcTree v-if="series.length" fill role="listbox" :data="seriesTreeData"
        :selected-keys="selectedSeriesKey ? [selectedSeriesKey] : []"
        selection-mode="single" scroll-to-selection
        :action-overflow-title="t('projectConfig.icons.iconSetActions')"
        @selection-change="handleSeriesSelection" @action="handleSeriesAction" />
      <OcEmpty v-else tone="muted" fill>{{ t('projectConfig.icons.empty') }}</OcEmpty>
    </template>

    <template v-if="selectedSeries?.icons.length" #append>
      <OcFieldFrame class="project-icon-registry-workbench__filter">
        <OcFieldInput variant="plain" full-width :value="filterQuery"
          :placeholder="t('projectConfig.icons.filterPlaceholder')"
          :aria-label="t('projectConfig.icons.filterPlaceholder')" @input="updateFilter" />
        <template v-if="filterQuery" #suffix>
          <OcButton icon-only size="sm" icon="mdiClose" variant="ghost"
            :aria-label="t('projectConfig.icons.clearFilter')" @click="filterQuery = ''" />
        </template>
      </OcFieldFrame>
      <OcOptionGroup class="project-icon-registry-workbench__tile-size" :model-value="String(tileSize)"
        :options="tileSizeOptions" appearance="sliding-outline" fill :aria-label="t('projectConfig.icons.tileSize')"
        @update:model-value="tileSize = Number($event)" />
    </template>

    <ProjectIconSetWorkspace v-if="selectedSeries"
      :series="selectedSeries" :entries="selectedSeriesEntries" :filter-query="filterQuery" :tile-size="tileSize"
      :selected-icon-indexes="selectedIconIndexesForSeries"
      @update:series="updateSelectedSeries" @update:selected-icon-indexes="setSelectedIconIndexes" />
    <OcEmpty v-else tone="muted" icon="mdiStickerEmoji" fill>{{ t('projectConfig.icons.noSeriesSelected') }}</OcEmpty>

    <template #inspector>
      <OcEmpty v-if="selectedIconIndexesForSeries.length > 1" tone="muted" icon="mdiStickerEmoji" fill>
        {{ t('projectConfig.icons.multiSelectionNote', { count: selectedIconIndexesForSeries.length }) }}
      </OcEmpty>
      <ProjectIconPreview v-else-if="selectedIcon && selectedCatalogEntry" :entry="selectedCatalogEntry" />
      <OcEmpty v-else tone="muted" icon="mdiStickerEmoji" fill>{{ t('projectConfig.icons.noIconSelected') }}</OcEmpty>
    </template>
    <template v-if="iconPropertyInputs.length" #footer>
      <div class="project-icon-registry-workbench__property-content">
        <PropertyEditor ref="propertyEditorRef" :inputs="iconPropertyInputs"
          :categories="iconPropertyCategories" sort-mode="category" @update-property="updateIconProperty" />
      </div>
    </template>
  </ProjectResourceWorkbench>

  <ProjectIconSetSettingsDialog :open="settingsSeriesIndex !== null" :name="settingsSeries?.name"
    :series-key="settingsSeries?.key" :busy="settingsBusy"
    @close="settingsSeriesIndex = null" @submit="saveIconSetSettings" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  findProjectIconKeyConflicts,
  type ProjectIcon,
  type ProjectIconKeyConflict,
  type ProjectIconSeries,
} from '../../features/workspace/model/projectIcons'
import {
  buildProjectIconCatalog,
  createProjectIconPreviewStyle,
  findProjectIcon,
  findProjectIconSeries,
  type ProjectIconCatalog,
  type ProjectIconCatalogEntry,
} from '../../features/workspace/services/projectIconCatalog'
import { createIconDimensionReader, readProjectIconSize } from '../../features/workspace/services/projectIconDimensionResolver'
import type {
  PropertyEditorCategoryDefinition,
  PropertyEditorInput,
  PropertyEditorMutation,
} from '../../shared/ui/property-editor/propertyEditor.types'
import PropertyEditor from '../../shared/ui/property-editor/PropertyEditor.vue'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import type { OcNode, OcNodeAction, OcNodeActionEvent, OcNodeCollection, OcNodeSelectionEvent } from '../../shared/ui/node/node.types'
import type { OcVisual } from '../../shared/ui/visual/visual.types'
import OcButton from '../base/OcButton.vue'
import OcEmpty from '../base/OcEmpty.vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcOptionGroup, { type OcOption } from '../standard/OcOptionGroup.vue'
import OcTree from '../standard/OcTree.vue'
import ProjectIconPreview from './ProjectIconPreview.vue'
import { applyProjectIconProperty, createProjectIconPropertyInput } from './projectIconProperties'
import ProjectIconSetSettingsDialog, { type ProjectIconSetSettingsRequest } from './ProjectIconSetSettingsDialog.vue'
import ProjectIconSetWorkspace from './ProjectIconSetWorkspace.vue'
import ProjectResourceWorkbench from './ProjectResourceWorkbench.vue'

const ADD_ICONS_ACTION_KEY = 'project-icon-workbench.add-icons'

const props = withDefaults(defineProps<{
  series?: readonly ProjectIconSeries[]
  resolveAssetSrc: (source: string) => string
  defaultOpenPath?: string
  projectIconCatalog?: ProjectIconCatalog
  /** An icon import owns the global progress bar; import commands stay disabled until it settles. */
  importBusy?: boolean
  /** 左卡头部由所有者提供的命令，排在「添加图标」之前。 */
  leadingActions?: OcActionDefinition[]
}>(), { series: () => [], importBusy: false, leadingActions: () => [] })
const emit = defineEmits<{
  'update:series': [series: ProjectIconSeries[]]
  'key-conflicts': [conflicts: readonly ProjectIconKeyConflict[]]
  /** Asks the owner to confirm and stage the removal; the workbench never drops a set on its own. */
  'remove-series': [seriesKey: string]
  /** Asks the owner to copy new icons into an existing set. */
  'add-icons': [seriesKey: string]
  /** A card command the owner supplied through `leadingActions`. */
  'leading-action': [actionKey: string]
}>()
const { t } = useI18n()
const selectedSeriesKey = ref<string | null>(null)
const filterQuery = ref('')
/** A few tile sizes to pick from instead of a continuous slider: the grid is browsed, not measured. */
const TILE_SIZES = { small: 72, medium: 104, large: 152 } as const
const tileSize = ref<number>(TILE_SIZES.medium)
const tileSizeOptions = computed<OcOption[]>(() => Object.entries(TILE_SIZES).map(([size, value]) => ({
  value: String(value), label: t(`projectConfig.icons.tileSizes.${size}`),
})))
const leadingCardActions = computed<OcActionDefinition[]>(() => [
  ...props.leadingActions,
  {
    key: ADD_ICONS_ACTION_KEY, icon: 'mdiPlus', title: t('projectConfig.icons.addIcons'),
    disabled: props.importBusy || !selectedSeries.value,
  },
])
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
  ['identity', { title: t('projectConfig.icons.identity'), icon: 'mdiCodeBraces' }],
  ['file', { title: t('projectConfig.icons.file'), icon: 'mdiFileOutline' }],
  ['appearance', { title: t('projectConfig.icons.appearance'), icon: 'mdiFileImageOutline' }],
  ['crop', { title: t('projectConfig.icons.cropTitle'), icon: 'mdiViewGridOutline' }],
]))
const selectedIcons = computed(() => selectedIconIndexesForSeries.value
  .map(index => selectedSeries.value?.icons[index])
  .filter((icon): icon is ProjectIcon => Boolean(icon)))
const iconPropertyInputs = computed<PropertyEditorInput[]>(() => {
  const series = selectedSeries.value
  const input = series && createProjectIconPropertyInput(selectedIcons.value, {
    t,
    readSize: (icon) => {
      const entry = findProjectIcon(localCatalog.value, series.key, icon.iconKey)
      return entry ? readProjectIconSize(entry) : undefined
    },
  })
  return input ? [input] : []
})
const seriesTreeData = computed<OcNodeCollection>(() => ({
  rootKeys: props.series.map(candidate => candidate.key),
  items: new Map(props.series.map((candidate): [string, OcNode] => [candidate.key, {
    label: candidate.name,
    visual: seriesVisual(candidate),
    tail: [t('projectConfig.icons.iconCount', { count: candidate.icons.length }), ...seriesActions()],
  }])),
  children: new Map(),
}))

/** 集合行的图标就是集合里的第一个图标：一眼能认出是哪一套，空集才退回通用图标。 */
function seriesVisual(candidate: ProjectIconSeries): OcVisual {
  const first = candidate.icons[0]
  const entry = first
    ? findProjectIcon(localCatalog.value, candidate.key, first.iconKey)
      ?? findProjectIcon(props.projectIconCatalog, candidate.key, first.iconKey)
    : null
  if (!entry) return { type: 'icon', icon: 'mdiStickerEmoji' }
  return {
    type: 'style',
    style: { ...createProjectIconPreviewStyle(entry, readProjectIconSize), fontSize: 'var(--oc-icon-size-lg)' },
    label: candidate.name,
  }
}

function seriesActions(): OcNodeAction[] {
  return [
    { key: 'configure', title: t('projectConfig.icons.configureIconSet'), icon: 'mdiCogOutline' },
    {
      key: 'remove', title: t('projectConfig.icons.removeSeries'), icon: 'mdiTrashCanOutline', iconTone: 'danger',
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
// Assembling the catalog is pure data and cheap, so it follows every edit: a tint or a crop changes how
// an icon paints just as a new file does. Sizes are measured per file and survive the rebuild.
const iconDimensions = createIconDimensionReader()
watch(() => props.series, (series) => {
  localCatalog.value = buildProjectIconCatalog(series, props.resolveAssetSrc, iconDimensions.read)
}, { immediate: true })
watch(conflicts, value => emit('key-conflicts', value), { immediate: true })

function sameIconSeries(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase()
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
function handleCardAction({ key }: { key: string }): void {
  if (key !== ADD_ICONS_ACTION_KEY) emit('leading-action', key)
  else if (selectedSeries.value) emit('add-icons', selectedSeries.value.key)
}
function handleSeriesAction(event: OcNodeActionEvent): void {
  const index = props.series.findIndex(candidate => candidate.key === event.key)
  if (index < 0) return
  if (event.actionKey === 'configure') openSettingsDialog(index)
  else if (event.actionKey === 'remove') removeSeries(index)
}
function updateFilter(event: Event): void {
  if (event.target instanceof HTMLInputElement) filterQuery.value = event.target.value
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
/** An edit in the panel lands on every selected icon, the way the panel showed them as one. */
function updateIconProperty(mutation: PropertyEditorMutation): void {
  const current = selectedSeries.value
  if (!current) return
  const targets = new Set(selectedIconIndexesForSeries.value)
  const fileSize = (icon: ProjectIcon) => {
    const entry = findProjectIcon(localCatalog.value, current.key, icon.iconKey)
    return entry ? readProjectIconSize(entry) : undefined
  }
  const icons = current.icons.map((icon, index) => (
    targets.has(index) ? applyProjectIconProperty(icon, mutation.fieldKey, mutation.value, fileSize(icon)) : icon
  ))
  if (icons.some((icon, index) => icon !== current.icons[index])) updateSelectedSeries({ ...current, icons })
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
    next[index] = { ...current, name: request.name }
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
.project-icon-registry-workbench__filter {
  flex: 0 1 var(--oc-resource-control-width);
  width: var(--oc-resource-control-width);
  min-width: 0;
}
.project-icon-registry-workbench__tile-size { flex: 0 1 var(--oc-resource-control-width); width: var(--oc-resource-control-width); min-width: 0; }
.project-icon-registry-workbench__property-content { min-width: 0; }
</style>
