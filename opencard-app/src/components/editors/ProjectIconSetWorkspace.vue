<template>
  <OcEmpty v-if="series.icons.length === 0" tone="muted" icon="mdiFileImageOutline" fill>
    {{ t('projectConfig.icons.emptyIconList') }}
  </OcEmpty>
  <OcAlbum v-else-if="filteredIconIndexes.length" layout="tile" fill
    :style="{ '--oc-album-tile-min-width': `${tileSize}px` }"
    :data="iconAlbumData" :selected-keys="selectedIconKeys"
    selection-mode="multiple" @selection-change="handleSelectionChange" @action="handleNodeAction" />
  <OcEmpty v-else tone="muted" fill>{{ t('projectConfig.icons.noMatchingIcons') }}</OcEmpty>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  duplicateProjectIcon,
  type ProjectIconSeries,
} from '../../features/workspace/model/projectIcons'
import {
  createProjectIconPreviewStyle,
  projectIconIdentity,
  type ProjectIconCatalogEntry,
} from '../../features/workspace/services/projectIconCatalog'
import { readProjectIconSize } from '../../features/workspace/services/projectIconDimensionResolver'
import type {
  OcNode,
  OcNodeAction,
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'
import OcAlbum from '../standard/OcAlbum.vue'
import OcEmpty from '../base/OcEmpty.vue'

const props = withDefaults(defineProps<{
  series: ProjectIconSeries
  entries: readonly ProjectIconCatalogEntry[]
  selectedIconIndexes: readonly number[]
  /** 按名称或引用 Key 筛选；筛选框归工作台头部所有。 */
  filterQuery?: string
  /** 图标格的最小边长，由舞台控制条调节。 */
  tileSize?: number
}>(), { filterQuery: '', tileSize: 96 })
const emit = defineEmits<{
  'update:series': [series: ProjectIconSeries]
  'update:selectedIconIndexes': [indexes: number[]]
}>()
const { t } = useI18n()

const selectedIconIndexes = computed(() => props.selectedIconIndexes.filter(index => (
  Number.isInteger(index) && index >= 0 && index < props.series.icons.length
)))

/** Boundary moves are disabled on the icon that cannot move further, with the reason the command surfaces. */
function iconActions(index: number): readonly OcNodeAction[] {
  const atTop = index === 0
  const atBottom = index === props.series.icons.length - 1
  const boundary = (blocked: boolean, reason: string): Partial<OcNodeAction> => (
    blocked ? { disabled: true, disabledReason: t(reason) } : {}
  )
  const duplicate: OcNodeAction = { key: 'duplicate', title: t('projectConfig.icons.duplicateIcon'), icon: 'mdiContentCopy' }
  const moveTop: OcNodeAction = {
    key: 'move-top', title: t('projectConfig.icons.moveToTop'), icon: 'mdiFormatVerticalAlignTop',
    ...boundary(atTop, 'projectConfig.icons.alreadyAtTop'),
  }
  const moveUp: OcNodeAction = {
    key: 'move-up', title: t('propertyEditor.arrays.moveUp'), icon: 'mdiArrowUp',
    ...boundary(atTop, 'projectConfig.icons.alreadyAtTop'),
  }
  const moveDown: OcNodeAction = {
    key: 'move-down', title: t('propertyEditor.arrays.moveDown'), icon: 'mdiArrowDown',
    ...boundary(atBottom, 'projectConfig.icons.alreadyAtBottom'),
  }
  const moveBottom: OcNodeAction = {
    key: 'move-bottom', title: t('projectConfig.icons.moveToBottom'), icon: 'mdiFormatVerticalAlignBottom',
    ...boundary(atBottom, 'projectConfig.icons.alreadyAtBottom'),
  }
  const remove: OcNodeAction = {
    key: 'delete', title: t('projectConfig.icons.removeIcon'), icon: 'mdiTrashCanOutline', iconTone: 'danger',
  }
  return [{
    key: 'more', title: t('projectConfig.icons.iconActions'), icon: 'mdiDotsHorizontal',
    children: [duplicate, moveTop, moveUp, moveDown, moveBottom, remove],
  }]
}

const entriesByIdentity = computed(() => new Map(props.entries.map(entry => (
  [projectIconIdentity(entry.seriesKey, entry.iconKey), entry]
))))

/** The catalog already reports every icon whose file failed to load. */
function catalogEntry(index: number): ProjectIconCatalogEntry | null {
  const icon = props.series.icons[index]
  if (!icon) return null
  return entriesByIdentity.value.get(projectIconIdentity(props.series.key, icon.iconKey)) ?? null
}

const filteredIconIndexes = computed(() => {
  const query = props.filterQuery.trim().toLocaleLowerCase()
  if (!query) return props.series.icons.map((_, index) => index)
  return props.series.icons.flatMap((icon, index) => (
    icon.name.toLocaleLowerCase().includes(query) || icon.iconKey.toLocaleLowerCase().includes(query)
      ? [index]
      : []
  ))
})
const iconAlbumData = computed<OcNodeCollection>(() => ({
  rootKeys: filteredIconIndexes.value.map(index => `icon:${index}`),
  items: new Map(filteredIconIndexes.value.map((index): [string, OcNode] => {
    const key = `icon:${index}`
    const icon = props.series.icons[index]!
    const entry = catalogEntry(index)
    return [key, {
      label: icon.name,
      // 方格正面就是这个图标本身。字号用封面框的尺寸表达（媒体盒是尺寸容器），按自身比例缩放。
      cover: entry
        ? {
            type: 'style' as const,
            style: {
              ...createProjectIconPreviewStyle(entry, readProjectIconSize),
              fontSize: 'min(100cqw, 100cqh)',
            },
            label: icon.name,
          }
        : { type: 'icon' as const, icon: 'mdiFileImageOutline' },
      tail: iconActions(index),
    }]
  })),
  children: new Map(),
}))
const selectedIconKeys = computed(() => selectedIconIndexes.value.map(index => `icon:${index}`))

function albumIndex(key: string | null): number | null {
  if (!key?.startsWith('icon:')) return null
  const index = Number(key.slice('icon:'.length))
  return Number.isInteger(index) ? index : null
}

function handleSelectionChange(event: OcNodeSelectionEvent): void {
  emit('update:selectedIconIndexes', event.selectedKeys
    .map(key => albumIndex(key))
    .filter((index): index is number => index !== null))
}

/** A card command applies to the whole selection only when the card itself is part of it. */
function actionTargets(index: number): number[] {
  return selectedIconIndexes.value.includes(index) ? selectedIconIndexes.value : [index]
}

function handleNodeAction(event: OcNodeActionEvent): void {
  const index = albumIndex(event.key)
  if (index === null) return
  if (event.actionKey === 'duplicate') duplicateIcon(index)
  else if (event.actionKey === 'delete') removeIcons(actionTargets(index))
  else if (event.actionKey === 'move-top') moveIcons(actionTargets(index), 'top')
  else if (event.actionKey === 'move-up') moveIcons(actionTargets(index), 'up')
  else if (event.actionKey === 'move-down') moveIcons(actionTargets(index), 'down')
  else if (event.actionKey === 'move-bottom') moveIcons(actionTargets(index), 'bottom')
}

function removeIcons(indexes: readonly number[]): void {
  const selected = [...new Set(indexes)].filter(index => index >= 0 && index < props.series.icons.length).sort((a, b) => a - b)
  if (selected.length === 0) return
  const selectedSet = new Set(selected)
  const icons = props.series.icons.filter((_, index) => !selectedSet.has(index))
  emit('update:selectedIconIndexes', icons.length ? [Math.min(selected[0]!, icons.length - 1)] : [])
  emit('update:series', { ...props.series, icons })
}

function duplicateIcon(index: number): void {
  const duplicated = duplicateProjectIcon(props.series, index)
  if (duplicated === props.series) return
  emit('update:series', duplicated)
  emit('update:selectedIconIndexes', [index + 1])
}

function moveIcons(indexes: readonly number[], direction: 'top' | 'up' | 'down' | 'bottom'): void {
  const selected = [...new Set(indexes)].filter(index => index >= 0 && index < props.series.icons.length).sort((a, b) => a - b)
  if (selected.length === 0) return
  const selectedSet = new Set(selected)
  const icons = [...props.series.icons]
  const nextIndexes = new Set(selected)

  if (direction === 'top' || direction === 'bottom') {
    const selectedIcons = selected.map(index => icons[index]!)
    const remainingIcons = icons.filter((_, index) => !selectedSet.has(index))
    const nextIcons = direction === 'top'
      ? [...selectedIcons, ...remainingIcons]
      : [...remainingIcons, ...selectedIcons]
    const start = direction === 'top' ? 0 : remainingIcons.length
    emit('update:selectedIconIndexes', selected.map((_, index) => start + index))
    emit('update:series', { ...props.series, icons: nextIcons })
    return
  }

  if (direction === 'up') {
    for (let index = 1; index < icons.length; index += 1) {
      if (!selectedSet.has(index) || selectedSet.has(index - 1)) continue
      ;[icons[index - 1], icons[index]] = [icons[index]!, icons[index - 1]!]
      nextIndexes.delete(index)
      nextIndexes.add(index - 1)
      selectedSet.delete(index)
      selectedSet.add(index - 1)
    }
  } else {
    for (let index = icons.length - 2; index >= 0; index -= 1) {
      if (!selectedSet.has(index) || selectedSet.has(index + 1)) continue
      ;[icons[index], icons[index + 1]] = [icons[index + 1]!, icons[index]!]
      nextIndexes.delete(index)
      nextIndexes.add(index + 1)
      selectedSet.delete(index)
      selectedSet.add(index + 1)
    }
  }

  const nextSelected = [...nextIndexes].sort((a, b) => a - b)
  if (nextSelected.every((index, position) => index === selected[position])) return
  emit('update:selectedIconIndexes', nextSelected)
  emit('update:series', { ...props.series, icons })
}
</script>
