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
          <span class="oc-album__clip">
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
import { resolveNodeSelection, type OcNodeSelectionMode } from '../../shared/ui/node/nodeSelection'

type OcAlbumSelectionMode = OcNodeSelectionMode
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
  const resolution = resolveNodeSelection({
    mode: props.selectionMode,
    orderedEntries: entries.value,
    selectedKeys: props.selectedKeys,
    triggerKey: key,
    anchorKey: selectionAnchorKey.value,
    toggle,
    range,
  })
  if (!resolution) return
  if (resolution.movesAnchor) selectionAnchorKey.value = key
  emit('selection-change', { triggerKey: key, selectedKeys: resolution.selectedKeys })
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

/*
 * 圆角只由这一层切：它贴在边框内缘（卡片的 padding box），所以里面的东西一律不要圆角。
 * 信息条是 backdrop-filter 合成层、图片也可能被提升，它们会逃过祖先的 overflow 裁剪 —— 所以
 * 这里除了 overflow 还写 clip-path：那条裁剪随合成一起生效，探不出圆角去。
 */
.oc-album__clip {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: calc(var(--oc-radius-md) - var(--oc-border-width));
  clip-path: inset(0 round calc(var(--oc-radius-md) - var(--oc-border-width)));
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
  /* 图片自己也按内缘圆角收边：卡片那圈的裁剪在这个 WebView 里管不到被提升的图片层，
     否则图片的直角会从圆角处探出来（信息条同理）。几何与 .oc-album__clip 完全一致。 */
  overflow: hidden;
  border-radius: calc(var(--oc-radius-md) - var(--oc-border-width));
  /* 卡片可点时封面自己放大一点：手指/光标按下去的确实是这张图。 */
  transition: transform var(--oc-duration-normal) var(--oc-ease);
}

.oc-album__card:hover .oc-album__media,
.oc-album__card:focus-visible .oc-album__media {
  transform: scale(var(--oc-album-cover-zoom));
}

@media (prefers-reduced-motion: reduce) {
  .oc-album__media {
    transition-duration: 0.01ms;
  }
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
  /* 与图片同理：这一层带 backdrop-filter，祖先的圆角裁剪对它不生效，所以它自己按内缘圆角收边。 */
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
