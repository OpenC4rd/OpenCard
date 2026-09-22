<!-- Standard album view: consumes one key-only node level and emits narrow node events. -->
<template>
  <div
    ref="albumRootElement"
    class="oc-album"
    :class="{
      'is-fill': props.fill,
      'is-empty': entries.length === 0,
    }"
    :role="props.selectionMode === 'none' ? 'list' : 'listbox'"
    :aria-multiselectable="props.selectionMode === 'multiple' ? 'true' : undefined"
  >
    <OcText
      v-if="entries.length === 0 && props.placeholder"
      class="oc-album__placeholder"
      tone="muted"
      size="sm"
    >
      {{ props.placeholder }}
    </OcText>
    <div v-else class="oc-album__grid">
      <div
        v-for="entry in entries"
        :key="entry.key"
        class="oc-album__node"
        :data-oc-album-key="entry.key"
      >
        <div
          class="oc-album__card"
          :ref="setCardRef(entry.key)"
          :class="{ 'is-selected': isSelected(entry.key), 'is-disabled': entry.item.disabled }"
          :role="props.selectionMode === 'none' ? 'listitem' : 'option'"
          :aria-selected="props.selectionMode === 'none' ? undefined : isSelected(entry.key)"
          :aria-disabled="entry.item.disabled || undefined"
          :tabindex="activeKey === entry.key && !entry.item.disabled ? 0 : -1"
          :data-tooltip="entry.item.disabledReason"
          @click="handleCardClick($event, entry.key)"
          @auxclick="handleCardAuxClick($event, entry.key)"
          @dblclick="handleCardDoubleClick($event, entry.key)"
          @keydown="handleCardKeydown($event, entry.key)"
          @focus="activeKey = entry.key"
        >
          <span class="oc-album__media">
            <OcCover :visual="entry.item.cover ?? null" :label="entry.item.label" />
          </span>

          <span class="oc-album__info">
            <span class="oc-album__title">
              <OcVisual
                v-if="entry.item.visual"
                :visual="entry.item.visual"
                :label="entry.item.label"
                size="md"
              />
              <OcText
                class="oc-album__label"
                :style="entry.item.labelFont ? { fontFamily: entry.item.labelFont } : undefined"
                :tone="entry.item.tone"
                :truncate="true"
                :tooltip-on-overflow="entry.item.label"
              >
                {{ entry.item.label }}
              </OcText>
            </span>
            <span class="oc-album__meta">
              <OcNodeTail
                v-if="entry.item.tail"
                class="oc-album__tail"
                :tail="entry.item.tail"
                :action-visibility="props.actionVisibility"
                @action="emitActionIntent(entry.key, $event.key)"
              />
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import OcCover from './OcCover.vue'
import OcNodeTail from './OcNodeTail.vue'
import OcText from '../base/OcText.vue'
import OcVisual from '../base/OcVisual.vue'
import type {
  OcNode,
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeKey,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'

type OcAlbumSelectionMode = 'none' | 'single' | 'multiple'
type OcAlbumActivationMode = 'none' | 'single-click' | 'double-click'

interface OcAlbumProps {
  data: OcNodeCollection
  selectedKeys?: readonly OcNodeKey[]
  selectionMode?: OcAlbumSelectionMode
  activationMode?: OcAlbumActivationMode
  /** Card actions stay hidden until the card is hovered or focused unless set to `always`. */
  actionVisibility?: 'on-interaction' | 'always'
  fill?: boolean
  placeholder?: string
}

type AlbumEntry = {
  key: OcNodeKey
  item: OcNode
}

defineOptions({ name: 'OcAlbum' })

const props = withDefaults(defineProps<OcAlbumProps>(), {
  selectedKeys: () => [],
  selectionMode: 'single',
  activationMode: 'double-click',
  actionVisibility: 'on-interaction',
  fill: false,
  placeholder: '',
})

const emit = defineEmits<{
  'selection-change': [event: OcNodeSelectionEvent]
  'node-activate': [event: OcNodeActivateEvent]
  action: [event: OcNodeActionEvent]
}>()

const albumRootElement = ref<HTMLElement | null>(null)
const cardRefs = new Map<OcNodeKey, HTMLElement>()
const activeKey = ref<OcNodeKey | null>(null)
const selectionAnchorKey = ref<OcNodeKey | null>(null)

const selectedKeySet = computed(() => new Set(props.selectedKeys))

/**
 * The album renders exactly the level it is given: `rootKeys` in order.
 * Nesting, rename, drag, and context menus stay with OcTree; cards show their actions inline.
 */
const entries = computed<AlbumEntry[]>(() => props.data.rootKeys.flatMap((key) => {
  const item = props.data.items.get(key)
  return item ? [{ key, item }] : []
}))

function isSelected(key: OcNodeKey): boolean {
  return selectedKeySet.value.has(key)
}

function setCardRef(key: OcNodeKey): (element: Element | ComponentPublicInstance | null) => void {
  return (element) => {
    if (element instanceof HTMLElement) cardRefs.set(key, element)
    else cardRefs.delete(key)
  }
}

watch(entries, async (nextEntries) => {
  if (activeKey.value && nextEntries.some(entry => entry.key === activeKey.value)) return
  activeKey.value = nextEntries.find(entry => !entry.item.disabled)?.key ?? null
  await nextTick()
}, { immediate: true })

function focusCardFromPointer(key: OcNodeKey): void {
  activeKey.value = key
  cardRefs.get(key)?.focus({ preventScroll: true })
}

function handleCardClick(event: MouseEvent, key: OcNodeKey): void {
  if (props.data.items.get(key)?.disabled) return
  focusCardFromPointer(key)
  emitSelectionIntent(key, event.ctrlKey || event.metaKey, event.shiftKey)
  if (props.activationMode === 'single-click') emit('node-activate', { key })
}

function handleCardAuxClick(event: MouseEvent, key: OcNodeKey): void {
  if (event.button !== 1 || props.data.items.get(key)?.disabled) return
  event.preventDefault()
  emitSelectionIntent(key, event.ctrlKey || event.metaKey, event.shiftKey)
}

function handleCardDoubleClick(event: MouseEvent, key: OcNodeKey): void {
  if (props.data.items.get(key)?.disabled) return
  event.preventDefault()
  if (props.activationMode === 'double-click') emit('node-activate', { key })
}

function emitSelectionIntent(key: OcNodeKey, toggle: boolean, range: boolean): void {
  if (props.selectionMode === 'none') return
  const canRangeSelect = props.selectionMode === 'multiple' && range
  const mode = canRangeSelect
    ? 'range'
    : props.selectionMode === 'multiple' && toggle ? 'toggle' : 'replace'
  let selectedKeys: OcNodeKey[]

  if (mode === 'range') {
    const anchorKey = selectionAnchorKey.value
      && entries.value.some(entry => entry.key === selectionAnchorKey.value)
      ? selectionAnchorKey.value
      : props.selectedKeys[0] ?? key
    const anchorIndex = entries.value.findIndex(entry => entry.key === anchorKey)
    const targetIndex = entries.value.findIndex(entry => entry.key === key)
    const rangeKeys = anchorIndex < 0 || targetIndex < 0
      ? [key]
      : entries.value
        .slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
        .map(entry => entry.key)
    const selectedSet = new Set(toggle ? [...props.selectedKeys, ...rangeKeys] : rangeKeys)
    selectedKeys = entries.value.filter(entry => selectedSet.has(entry.key)).map(entry => entry.key)
  } else if (mode === 'toggle') {
    selectedKeys = [...props.selectedKeys]
    const index = selectedKeys.indexOf(key)
    if (index >= 0) selectedKeys.splice(index, 1)
    else selectedKeys.push(key)
  } else {
    selectedKeys = [key]
  }

  if (mode !== 'range') selectionAnchorKey.value = key
  emit('selection-change', { triggerKey: key, selectedKeys })
}

function moveActiveCard(key: OcNodeKey, step: number): void {
  const keys = entries.value.filter(entry => !entry.item.disabled).map(entry => entry.key)
  const index = keys.indexOf(key)
  if (index < 0) return
  const nextKey = keys[Math.min(keys.length - 1, Math.max(0, index + step))]
  if (!nextKey) return
  activeKey.value = nextKey
  cardRefs.get(nextKey)?.focus({ preventScroll: true })
}

function handleCardKeydown(event: KeyboardEvent, key: OcNodeKey): void {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveActiveCard(key, 1)
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActiveCard(key, -1)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emitSelectionIntent(key, event.ctrlKey || event.metaKey, event.shiftKey)
    emit('node-activate', { key })
  }
}

function emitActionIntent(key: OcNodeKey, actionKey: string): void {
  emit('action', { key, actionKey, source: 'inline' })
}
</script>

<style scoped>
.oc-album {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--oc-space-3);
}

.oc-album.is-fill {
  height: 100%;
}

.oc-album__placeholder {
  display: block;
  padding: var(--oc-space-4);
  text-align: center;
}

.oc-album__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--oc-album-card-min-width), 1fr));
  gap: var(--oc-space-3);
}

.oc-album__node {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.oc-album__card {
  position: relative;
  display: block;
  min-width: 0;
  aspect-ratio: var(--oc-album-card-aspect-ratio);
  overflow: hidden;
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-md);
  background: var(--oc-bg-block);
  cursor: pointer;
  transition:
    border-color var(--oc-duration-fast) var(--oc-ease),
    background-color var(--oc-duration-fast) var(--oc-ease);
}

.oc-album__card:hover {
  border-color: var(--oc-border-strong);
}

.oc-album__card:focus-visible {
  outline: none;
  border-color: var(--oc-border-accent);
}

.oc-album__card.is-selected {
  border-color: var(--oc-border-accent);
}

.oc-album__card.is-selected .oc-album__info {
  background: var(--oc-bg-selected);
}

.oc-album__card.is-disabled {
  opacity: var(--oc-opacity-disabled);
  cursor: default;
}

.oc-album__media {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.oc-album__info {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-1);
  min-width: 0;
  padding: var(--oc-space-1) var(--oc-space-3);
  /* The strip sits on the card's inner bottom corners, so it must round itself: a composited
     backdrop-filter layer can escape the ancestor's overflow clip and paint square corners. */
  border-end-start-radius: calc(var(--oc-radius-md) - var(--oc-border-width));
  border-end-end-radius: calc(var(--oc-radius-md) - var(--oc-border-width));
  background: var(--oc-bg-glass);
  -webkit-backdrop-filter: blur(var(--oc-bg-glass-blur)) saturate(var(--oc-bg-glass-saturate));
  backdrop-filter: blur(var(--oc-bg-glass-blur)) saturate(var(--oc-bg-glass-saturate));
}

.oc-album__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--oc-space-1);
}

.oc-album__label {
  min-width: 0;
}

.oc-album__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--oc-space-1);
  /* Reserve the command height so revealing a command on hover never reflows the card. */
  min-height: var(--oc-size-sm);
}

/* 尾部行由 OcNodeTail 渲染，卡片只给它自己的行几何。 */
.oc-album__tail {
  display: inline-flex;
  flex: 0 1 auto;
  min-width: 0;
  align-items: center;
  gap: var(--oc-space-1);
}

/*
 * 命令平时不显示：卡片被交互时由变量揭示，常显由 OcNodeTail 的 actionVisibility 负责。
 * 变量按继承生效，所以这一条只需写在卡片上。
 */
.oc-album__node:hover,
.oc-album__card:focus-within,
.oc-album__card.is-selected {
  --oc-node-tail-action-display: inline-flex;
}
</style>
