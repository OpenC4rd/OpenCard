<template>
  <div class="project-icon-set-workspace" :class="{ 'is-empty': series.icons.length === 0 }">
    <div v-if="series.icons.length === 0" class="project-icon-set-workspace__empty">
      <OcIcon name="file.image" size="lg" tone="muted" />
      <OcText as="strong">{{ t('projectConfig.icons.emptyIconList') }}</OcText>
    </div>
    <div v-else class="project-icon-set-workspace__grid-pane">
      <OcFieldFrame class="project-icon-set-workspace__filter" full-width>
        <OcFieldInput variant="plain" full-width :value="filterQuery"
          :placeholder="t('projectConfig.icons.filterPlaceholder')"
          :aria-label="t('projectConfig.icons.filterPlaceholder')" @input="updateFilter" />
        <template v-if="filterQuery" #suffix>
          <OcButton icon-only size="sm" icon="action.close" variant="ghost"
            :aria-label="t('projectConfig.icons.clearFilter')" @click="filterQuery = ''" />
        </template>
      </OcFieldFrame>
      <OcAlbum v-if="filteredIconIndexes.length" class="project-icon-set-workspace__icon-album" fill
        :data="iconAlbumData" :selected-keys="selectedIconKeys"
        selection-mode="multiple" @selection-change="handleSelectionChange" @action="handleNodeAction" />
      <OcEmpty v-else tone="muted">{{ t('projectConfig.icons.noMatchingIcons') }}</OcEmpty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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
import OcButton from '../base/OcButton.vue'
import OcEmpty from '../base/OcEmpty.vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'

const props = defineProps<{
  series: ProjectIconSeries
  entries: readonly ProjectIconCatalogEntry[]
  selectedIconIndexes: readonly number[]
}>()
const emit = defineEmits<{
  'update:series': [series: ProjectIconSeries]
  'update:selectedIconIndexes': [indexes: number[]]
}>()
const { t } = useI18n()
const filterQuery = ref('')

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
  const duplicate: OcNodeAction = { key: 'duplicate', title: t('projectConfig.icons.duplicateIcon'), icon: 'action.copy' }
  const moveTop: OcNodeAction = {
    key: 'move-top', title: t('projectConfig.icons.moveToTop'), icon: 'format.vertical-top',
    ...boundary(atTop, 'projectConfig.icons.alreadyAtTop'),
  }
  const moveUp: OcNodeAction = {
    key: 'move-up', title: t('propertyEditor.arrays.moveUp'), icon: 'nav.arrow-up',
    ...boundary(atTop, 'projectConfig.icons.alreadyAtTop'),
  }
  const moveDown: OcNodeAction = {
    key: 'move-down', title: t('propertyEditor.arrays.moveDown'), icon: 'nav.arrow-down',
    ...boundary(atBottom, 'projectConfig.icons.alreadyAtBottom'),
  }
  const moveBottom: OcNodeAction = {
    key: 'move-bottom', title: t('projectConfig.icons.moveToBottom'), icon: 'format.vertical-bottom',
    ...boundary(atBottom, 'projectConfig.icons.alreadyAtBottom'),
  }
  const remove: OcNodeAction = {
    key: 'delete', title: t('projectConfig.icons.removeIcon'), icon: 'action.delete', iconTone: 'danger',
  }
  return [duplicate, moveTop, moveUp, moveDown, moveBottom, remove]
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
  const query = filterQuery.value.trim().toLocaleLowerCase()
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
      // 卡片正面就是这个图标本身。字号用封面框的尺寸表达（媒体盒是尺寸容器），按自身比例缩放，
      // 于是图标铺满封面框、信息条压在它的下半部分上——和图片封面卡同一种结构。
      cover: entry
        ? {
            type: 'style' as const,
            style: {
              ...createProjectIconPreviewStyle(entry, readProjectIconSize),
              fontSize: 'min(100cqw, 100cqh)',
            },
            label: icon.name,
          }
        : { type: 'icon' as const, icon: 'file.image' },
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

function updateFilter(event: Event): void {
  if (event.target instanceof HTMLInputElement) filterQuery.value = event.target.value
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

<style scoped>
.project-icon-set-workspace {
  display: grid;
  /* 一格有界的行：高度由调用方给定，图标网格再高也只在相册里滚动，不会把整页撑破。 */
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.project-icon-set-workspace.is-empty { border: var(--oc-border-width) dashed var(--oc-border-muted); border-radius: var(--oc-radius-md); }

.project-icon-set-workspace__empty {
  display: grid;
  min-width: 0;
  place-content: center;
  justify-items: center;
  gap: var(--oc-space-2);
  padding: var(--oc-space-6);
  text-align: center;
}

.project-icon-set-workspace__grid-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.project-icon-set-workspace__filter {
  margin: var(--oc-space-2);
  width: auto;
}

/*
 * 图标格是固定高的：卡片的高度不再由宽度按封面比例推出（那个竖版比例是给书封式封面卡用的），
 * 于是同一屏的节奏稳定。这个固定值是相册的公开旋钮，不是页面去改它的内部规则。
 */
.project-icon-set-workspace__icon-album {
  --oc-album-cell-block-size: var(--oc-album-card-min-width);
}
</style>
