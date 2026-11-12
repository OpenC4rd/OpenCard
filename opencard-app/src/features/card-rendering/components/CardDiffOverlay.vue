<!-- 卡片对比的块级标注：两侧各一层随分隔线裁切的变更框；并排时悬停把同一块的两侧连起来。 -->
<template>
  <div v-for="side in SIDES" :key="side" class="card-diff-overlay-layer" :class="`card-diff-overlay-layer--${side}`"
    :style="clips[side]" aria-hidden="true">
    <div v-for="highlight in highlights[side]" :key="highlight.blockId" :data-block-id="highlight.blockId" class="card-diff-overlay"
      :class="[`card-diff-overlay--${highlight.kind}`, `card-diff-overlay--${side}`]" :style="highlight.style">
      <span class="card-diff-overlay__label"><OcIcon :name="ICONS[highlight.kind]" size="sm" /></span>
    </div>
  </div>
  <svg v-if="hoverLink" class="card-diff-hover-link" aria-hidden="true">
    <defs>
      <marker id="card-diff-hover-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L7,3.5 L0,7 Z" />
      </marker>
    </defs>
    <path :d="hoverLink" marker-end="url(#card-diff-hover-arrow)" />
  </svg>
</template>

<script lang="ts">
export type CardDiffHighlight = {
  blockId: string
  kind: 'added' | 'removed' | 'changed'
}
</script>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import { computeSceneLayout } from '../geometry'
import type { RenderReadyCardFace } from '../render.types'

type Side = 'before' | 'after'
type Layer = { face: RenderReadyCardFace; diffHighlights?: readonly CardDiffHighlight[] }

const SIDES = ['before', 'after'] as const
const ICONS = { added: 'mdiPlus', removed: 'mdiMinus', changed: 'mdiCircleMedium' } as const

const props = defineProps<{
  before: Layer
  after: Layer
  /** 两侧卡面左上角在视口里的位置，已含平移。 */
  origins: Record<Side, { x: number; y: number }>
  scale: number
  /** 两侧各自的可见区域，跟卡面层用同一份裁切。 */
  clips: Record<Side, CSSProperties>
  sideBySide: boolean
}>()

const scenes = computed(() => ({
  before: computeSceneLayout(props.before.face),
  after: computeSceneLayout(props.after.face),
}))

function frames(side: Side) {
  const origin = props.origins[side]
  return (props[side].diffHighlights ?? []).flatMap(highlight => {
    const box = scenes.value[side].nodeMap.get(highlight.blockId)?.worldAabb
    if (!box) return []
    const left = origin.x + box.x * props.scale
    const top = origin.y + box.y * props.scale
    const width = box.width * props.scale
    const height = box.height * props.scale
    return [{
      ...highlight, left, top, width, height,
      style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` },
    }]
  })
}
const highlights = computed(() => ({ before: frames('before'), after: frames('after') }))

const hoveredBlockId = ref<string | null>(null)

/** 指针落在哪个元素上：往上找到第一个两侧都有标注的块，把它记为悬停块。 */
function hover(target: EventTarget | null): void {
  hoveredBlockId.value = null
  if (!props.sideBySide || !(target instanceof Element)) return
  const afterIds = new Set((props.after.diffHighlights ?? []).map(highlight => highlight.blockId))
  const linkedIds = new Set((props.before.diffHighlights ?? [])
    .map(highlight => highlight.blockId)
    .filter(blockId => afterIds.has(blockId)))
  for (let element = target.closest('[data-block-id]'); element; element = element.parentElement?.closest('[data-block-id]') ?? null) {
    const blockId = element instanceof HTMLElement ? element.dataset.blockId : undefined
    if (blockId && linkedIds.has(blockId)) {
      hoveredBlockId.value = blockId
      return
    }
  }
}

const hoverLink = computed(() => {
  if (!props.sideBySide || !hoveredBlockId.value) return null
  const before = highlights.value.before.find(highlight => highlight.blockId === hoveredBlockId.value)
  const after = highlights.value.after.find(highlight => highlight.blockId === hoveredBlockId.value)
  if (!before || !after) return null
  const startX = before.left + before.width
  const startY = before.top + before.height / 2
  const endX = after.left
  const endY = after.top + after.height / 2
  const controlX = (startX + endX) / 2
  return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`
})

defineExpose({ hover })
</script>

<style scoped>
.card-diff-overlay-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.card-diff-overlay {
  position: absolute;
  z-index: var(--oc-z-overlay-toolbar);
  box-sizing: border-box;
  border: var(--oc-border-width) solid var(--oc-diff-changed-border);
  border-radius: var(--oc-radius-control);
  pointer-events: none;
}
.card-diff-overlay--added { border-color: var(--oc-diff-added-border); }
.card-diff-overlay--removed { border-color: var(--oc-diff-removed-border); }
.card-diff-overlay__label {
  position: absolute;
  top: calc(var(--oc-border-width) * -1);
  left: calc(var(--oc-border-width) * -1);
  display: grid;
  width: var(--oc-icon-size-md);
  height: var(--oc-icon-size-md);
  place-items: center;
  border-radius: var(--oc-radius-control) 0 var(--oc-radius-control) 0;
  background: var(--oc-diff-changed-border);
  color: var(--oc-fg-default);
}
.card-diff-overlay--added .card-diff-overlay__label { background: var(--oc-diff-added-border); }
.card-diff-overlay--removed .card-diff-overlay__label { background: var(--oc-diff-removed-border); }
.card-diff-overlay--after .card-diff-overlay__label {
  right: calc(var(--oc-border-width) * -1);
  left: auto;
  border-radius: 0 var(--oc-radius-control) 0 var(--oc-radius-control);
}
.card-diff-overlay--before { border-top-left-radius: 0; }
.card-diff-overlay--after { border-top-right-radius: 0; }
.card-diff-overlay__label .oc-icon { flex: none; }

.card-diff-hover-link {
  position: absolute;
  inset: 0;
  z-index: var(--oc-z-overlay-toolbar);
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.card-diff-hover-link path {
  fill: none;
  stroke: var(--oc-diff-changed-border);
  stroke-width: var(--oc-border-width);
  stroke-linecap: round;
  stroke-dasharray: var(--oc-space-2xs) var(--oc-space-2xs);
  marker-end: url(#card-diff-hover-arrow);
}

.card-diff-hover-link marker path {
  fill: var(--oc-diff-changed-border);
  stroke: none;
}
</style>
