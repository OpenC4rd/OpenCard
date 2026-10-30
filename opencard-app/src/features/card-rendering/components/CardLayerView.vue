<template>
  <div
    ref="rootRef"
    class="card-layer-view"
    @pointerup="handlePointerUp"
    @wheel.stop.prevent="handleWheel"
  >
    <aside class="card-layer-view__card-preview" :style="facePreviewStyle" aria-hidden="true">
      <canvas class="card-layer-view__preview-canvas" :width="props.face.width" :height="props.face.height" @vue:mounted="paintCanvas" />
    </aside>

    <div class="card-layer-view__stack">
      <div
        class="card-layer-view__block-plane card-layer-view__base-plane"
        :style="basePlaneStyle"
        aria-hidden="true"
      >
        <span class="card-layer-view__plane card-layer-view__base-face" :style="baseFaceStyle" />
        <span class="card-layer-view__plane-index card-layer-view__base-index" aria-hidden="true">
          {{ basePlaneLabel ?? 'Base' }}
        </span>
      </div>
      <section
        v-for="(layer, layerIndex) in layers"
        :key="layer.zIndex"
        class="card-layer-view__level"
        :class="{ 'is-active': layerIndex === activeLayerIndex }"
        :style="getLayerStyle(layerIndex)"
        :aria-label="`z-index ${formatZIndex(layer.zIndex)}`"
      >
        <button
          v-for="(snapshot, blockIndex) in getLayerSnapshots(layer)"
          :key="snapshot.id"
          type="button"
          class="card-layer-view__block-plane"
          :class="{ 'is-selected': snapshot.id === selectedBlockId }"
          :style="getBlockPlaneStyle(blockIndex, layer, layerIndex)"
          :data-layer-block-id="snapshot.id"
          :data-layer-index="layerIndex"
          :tabindex="getPlaneIndex(layerIndex, blockIndex) === activePlaneIndex ? 0 : -1"
          :aria-label="snapshot.name"
        >
          <span class="card-layer-view__plane" aria-hidden="true" />
          <span
            v-if="isLayerStart(getPlaneIndex(layerIndex, blockIndex))"
            class="card-layer-view__plane-index"
            aria-hidden="true"
          >
            Layer {{ formatZIndex(layer.zIndex) }}
          </span>
          <span
            class="card-layer-view__block"
          >
            <canvas
              class="card-layer-view__block-content"
              :width="props.face.width"
              :height="props.face.height"
              @vue:mounted="paintSnapshotCanvas"
            />
          </span>
        </button>
      </section>
    </div>

    <nav class="card-layer-view__rail" :style="railStyle" aria-label="Layer ruler" data-layer-rail>
      <span
        v-for="(layer, layerIndex) in layers"
        :key="layer.zIndex"
        class="card-layer-view__rail-segment"
        :class="{ 'is-active': layerIndex === activeLayerIndex }"
        :style="getRailSegmentStyle(layerIndex)"
        aria-hidden="true"
      >
        <span class="card-layer-view__rail-segment-line" />
        <span v-if="layerIndex !== activeLayerIndex" class="card-layer-view__rail-segment-index">
          {{ formatZIndex(layer.zIndex) }}
        </span>
      </span>
      <span
        v-if="planeEntries.length > 0"
        class="card-layer-view__rail-active-index"
        :style="thumbStyle"
        aria-hidden="true"
      >
        {{ formatZIndex(activeLayerZIndex) }}
      </span>
      <button
        v-for="(entry, index) in planeEntries"
        :key="entry.id"
        type="button"
        class="card-layer-view__tick"
        :class="{
          'is-active': index === activePlaneIndex,
          'is-selected': entry.id === selectedBlockId,
        }"
        :style="getTickStyle(index)"
        :aria-label="`${getPlaneName(entry)}, z-index ${formatZIndex(getPlaneZIndex(entry))}`"
        :data-layer-target-index="index"
      >
        <span class="card-layer-view__tick-name">{{ getPlaneName(entry) }}</span>
      </button>
      <span class="card-layer-view__thumb" :style="thumbStyle" aria-hidden="true" />
    </nav>

    <aside
      v-if="shortcutHints?.length"
      class="card-layer-view__shortcut-legend"
      :aria-label="shortcutLegendLabel"
    >
      <div v-for="hint in shortcutHints" :key="hint.label" class="card-layer-view__shortcut-row">
        <OcShortcut :parts="hint.keys" decorative />
        <span class="card-layer-view__shortcut-label">{{ hint.label }}</span>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { pinyin } from 'pinyin-pro'
import OcShortcut, { type OcShortcutPart } from '../../../components/standard/OcShortcut.vue'
import type { RenderReadyCardFace } from '../render.types'
import type { CardRenderResourceContext } from '../cardRenderResources'
import { buildCardLayerGroups, type CardLayerGroup } from './cardLayerModel'
import { computeSceneLayout } from '../geometry'
import { createCanvasAssetStore } from '../painter/canvasAssetStore'
import { paintCardScene } from '../painter/paintCardScene'
import { prefersReducedMotion } from '../../../shared/ui/foundation'

type Snapshot = {
  id: string
  name: string
  width: number
  height: number
  x: number
  y: number
}

type PlaneEntry = {
  id: string
  layerIndex: number
  blockIndex: number
}

type VisualPlaneSlot =
  | { type: 'block'; entryIndex: number; zIndex: number }
  | { type: 'face'; zIndex: 0 }

const POSITION_EPSILON = 0.002
const POSITION_SMOOTHING = 0.22
const WHEEL_FOCUS_THRESHOLD = 40
const WHEEL_RESET_DELAY = 140
const RULER_TICK_PITCH = 30
const RULER_LAYER_PITCH = 72
const RULER_STACK_GAP = 78

const props = defineProps<{
  face: RenderReadyCardFace
  resourceContext?: CardRenderResourceContext
  selectedBlockId?: string | null
  viewportWidth: number
  viewportHeight: number
  spaceModifierActive?: boolean
  shortcutLegendLabel?: string
  basePlaneLabel?: string
  shortcutHints?: Array<{ keys: OcShortcutPart[]; label: string }>
  atomicBlockIds?: readonly string[]
}>()

const emit = defineEmits<{
  (e: 'block-click', blockId: string, event: PointerEvent): void
  (e: 'z-index-step', payload: { delta: -1 | 1; existingLayersOnly: boolean }): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const scene = computed(() => computeSceneLayout(props.face))
const layers = computed(() => buildCardLayerGroups(props.face, new Set(props.atomicBlockIds ?? [])))
const snapshots = ref(new Map<string, Snapshot>())
const assets = createCanvasAssetStore()
let unsubscribeAssets: (() => void) | null = null
let preloadToken = 0
const layerPosition = ref(0)
const targetLayerPosition = ref(0)
const focusedPlaneIndex = ref(0)
let animationFrame: number | null = null
let accumulatedWheelDelta = 0
let wheelResetTimer: number | null = null

const planeEntries = computed<PlaneEntry[]>(() => layers.value.flatMap((layer, layerIndex) => (
  layer.blocks.map((block, blockIndex) => ({ id: block.id, layerIndex, blockIndex }))
)))
const visualPlaneSlots = computed<VisualPlaneSlot[]>(() => {
  const blockSlots = planeEntries.value.map<VisualPlaneSlot>((entry, entryIndex) => ({
    type: 'block',
    entryIndex,
    zIndex: layers.value[entry.layerIndex]?.zIndex ?? 0,
  }))
  const firstNegativeIndex = blockSlots.findIndex(slot => slot.zIndex < 0)
  const faceIndex = firstNegativeIndex >= 0 ? firstNegativeIndex : blockSlots.length
  blockSlots.splice(faceIndex, 0, { type: 'face', zIndex: 0 })
  return blockSlots
})
const visualIndexByEntry = computed(() => {
  const indexes = new Map<number, number>()
  visualPlaneSlots.value.forEach((slot, visualIndex) => {
    if (slot.type === 'block') indexes.set(slot.entryIndex, visualIndex)
  })
  return indexes
})
const faceVisualIndex = computed(() => Math.max(
  0,
  visualPlaneSlots.value.findIndex(slot => slot.type === 'face'),
))
const activePlaneIndex = computed(() => focusedPlaneIndex.value)
const activeLayerIndex = computed(() => planeEntries.value[activePlaneIndex.value]?.layerIndex ?? 0)
const activeLayerZIndex = computed(() => layers.value[activeLayerIndex.value]?.zIndex ?? 0)
const focusedVisualIndex = computed(() => (
  visualIndexByEntry.value.get(focusedPlaneIndex.value) ?? faceVisualIndex.value
))
const planeScale = computed(() => {
  const radians = Math.PI / 180
  const projectedWidth = props.face.width * Math.cos(24 * radians)
    + props.face.height * Math.cos(56 * radians) * Math.sin(24 * radians)
  const projectedHeight = props.face.width * Math.sin(24 * radians)
    + props.face.height * Math.cos(56 * radians) * Math.cos(24 * radians)
  return Math.max(0.035, Math.min(
    0.62,
    props.viewportWidth * 0.58 / Math.max(1, projectedWidth),
    props.viewportHeight * 0.5 / Math.max(1, projectedHeight),
  ))
})
const facePreviewScale = computed(() => Math.min(
  0.4,
  Math.max(0.04, props.viewportWidth * 0.28 / Math.max(1, props.face.width)),
  Math.max(0.04, props.viewportHeight * 0.46 / Math.max(1, props.face.height)),
))
const facePreviewStyle = computed<CSSProperties>(() => ({
  zIndex: '300',
  width: `${props.face.width * facePreviewScale.value}px`,
  height: `${props.face.height * facePreviewScale.value}px`,
  '--card-layer-preview-scale': String(facePreviewScale.value),
  '--card-layer-preview-width': `${props.face.width}mm`,
  '--card-layer-preview-height': `${props.face.height}mm`,
}))
const layerPitch = computed(() => Math.min(400, Math.max(220, props.viewportHeight * 0.36)))
const sameLayerPitch = computed(() => Math.min(180, Math.max(110, props.viewportHeight * 0.16)))
const planeOffsets = computed(() => {
  const offsets = [0]
  for (let index = 1; index < visualPlaneSlots.value.length; index += 1) {
    const sameLayer = visualPlaneSlots.value[index - 1]?.zIndex === visualPlaneSlots.value[index]?.zIndex
    offsets.push(offsets[index - 1]! + (sameLayer ? sameLayerPitch.value : layerPitch.value))
  }
  return offsets
})
const currentPlaneOffset = computed(() => {
  const lowerIndex = Math.floor(layerPosition.value)
  const upperIndex = Math.ceil(layerPosition.value)
  const progress = layerPosition.value - lowerIndex
  return (planeOffsets.value[lowerIndex] ?? 0) * (1 - progress)
    + (planeOffsets.value[upperIndex] ?? planeOffsets.value[lowerIndex] ?? 0) * progress
})
const basePlaneStyle = computed<CSSProperties>(() => {
  return {
    width: `${props.face.width * planeScale.value}px`,
    height: `${props.face.height * planeScale.value}px`,
    ...getVisualPlaneStyle(faceVisualIndex.value),
  }
})
const baseFaceStyle = computed<CSSProperties>(() => ({
  background: props.face.background,
}))
const rulerOffsets = computed(() => {
  const offsets = [0]
  for (let index = 1; index < planeEntries.value.length; index += 1) {
    const sameLayer = planeEntries.value[index - 1]?.layerIndex === planeEntries.value[index]?.layerIndex
    offsets.push(offsets[index - 1]! + (sameLayer ? RULER_TICK_PITCH : RULER_LAYER_PITCH))
  }
  return offsets
})
const thumbStyle = computed<CSSProperties>(() => ({
  top: `${props.viewportHeight / 2}px`,
}))
const railStyle = computed<CSSProperties>(() => {
  const radians = Math.PI / 180
  const projectedHalfWidth = (
    props.face.width * planeScale.value * Math.cos(24 * radians)
    + props.face.height * planeScale.value * Math.cos(56 * radians) * Math.sin(24 * radians)
  ) / 2
  const stackCenterX = props.viewportWidth / 2 - 40
  const left = stackCenterX + projectedHalfWidth + RULER_STACK_GAP
  return {
    left: `${left}px`,
    width: `${Math.max(96, Math.min(180, props.viewportWidth - left - 12))}px`,
  }
})

function clampIndex(value: number): number {
  return Math.min(Math.max(value, 0), Math.max(0, planeEntries.value.length - 1))
}

function formatZIndex(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function getRailY(index: number): number {
  const focusedOffset = rulerOffsets.value[focusedPlaneIndex.value] ?? 0
  return props.viewportHeight / 2 + (rulerOffsets.value[index] ?? 0) - focusedOffset
}

function getPlaneZIndex(entry: PlaneEntry): number {
  return layers.value[entry.layerIndex]?.zIndex ?? 0
}

function getPlaneName(entry: PlaneEntry): string {
  const name = layers.value[entry.layerIndex]?.blocks[entry.blockIndex]?.block.name
  return typeof name === 'string' && name ? name : entry.id
}

function isLayerStart(index: number): boolean {
  if (index === 0) return true
  return getPlaneZIndex(planeEntries.value[index]!) !== getPlaneZIndex(planeEntries.value[index - 1]!)
}

function getRailSegmentStyle(layerIndex: number): CSSProperties {
  const entryIndexes = planeEntries.value.flatMap((entry, entryIndex) => (
    entry.layerIndex === layerIndex ? [entryIndex] : []
  ))
  const firstIndex = entryIndexes[0]
  const lastIndex = entryIndexes[entryIndexes.length - 1]
  if (firstIndex === undefined || lastIndex === undefined) return { display: 'none' }
  const top = getRailY(firstIndex) - RULER_TICK_PITCH / 2
  const bottom = getRailY(lastIndex) + RULER_TICK_PITCH / 2
  return {
    top: `${top}px`,
    height: `${Math.max(RULER_TICK_PITCH, bottom - top)}px`,
  }
}

function getTickStyle(index: number): CSSProperties {
  const distance = Math.abs(index - focusedPlaneIndex.value)
  return {
    top: `${getRailY(index)}px`,
    fontSize: `${10.5 + 13.5 * Math.exp(-1.4 * distance)}px`,
    fontWeight: index === focusedPlaneIndex.value ? '600' : '400',
  }
}

function getLayerStyle(index: number): CSSProperties {
  return {
    pointerEvents: index === activeLayerIndex.value ? 'auto' : 'none',
  }
}

function getPlaneIndex(layerIndex: number, blockIndex: number): number {
  return planeEntries.value.findIndex(entry => (
    entry.layerIndex === layerIndex && entry.blockIndex === blockIndex
  ))
}

function getBlockPlaneStyle(
  blockIndex: number,
  _layer: CardLayerGroup,
  layerIndex: number,
): CSSProperties {
  const planeIndex = getPlaneIndex(layerIndex, blockIndex)
  const visualIndex = visualIndexByEntry.value.get(planeIndex) ?? planeIndex
  return {
    width: `${props.face.width * planeScale.value}px`,
    height: `${props.face.height * planeScale.value}px`,
    ...getVisualPlaneStyle(visualIndex),
  }
}

function getVisualPlaneStyle(visualIndex: number): CSSProperties {
  const absoluteDistance = Math.abs(visualIndex - layerPosition.value)
  const focusDistance = Math.abs(visualIndex - focusedVisualIndex.value)
  return {
    opacity: String(focusDistance >= 2 ? 0.015 : Math.exp(-1.0 * focusDistance)),
    transform: `perspective(1400px) translate(-50%, -50%) translate3d(0, ${(planeOffsets.value[visualIndex] ?? 0) - currentPlaneOffset.value}px, ${-absoluteDistance * 54}px) rotateX(56deg) rotateZ(-24deg)`,
    zIndex: String(100 - Math.round(absoluteDistance * 10)),
  }
}

function getLayerSnapshots(layer: CardLayerGroup): Snapshot[] {
  return layer.blocks.flatMap(block => {
    const snapshot = snapshots.value.get(block.id)
    return snapshot ? [snapshot] : []
  })
}

function paintCanvas(canvas: Element): void {
  const canvasElement = ((canvas as unknown as { el?: Element }).el ?? canvas) as HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  try { ctx = typeof canvasElement.getContext === 'function' ? canvasElement.getContext('2d') : null } catch { return }
  if (ctx) {
    paintCardScene(ctx, scene.value, assets, {
      resourceContext: props.resourceContext,
    })
  }
}

function paintSnapshotCanvas(canvas: Element): void {
  const canvasElement = ((canvas as unknown as { el?: Element }).el ?? canvas) as HTMLCanvasElement
  const id = canvasElement.closest('[data-layer-block-id]')?.getAttribute('data-layer-block-id')
  if (!id) return
  let ctx: CanvasRenderingContext2D | null = null
  try { ctx = typeof canvasElement.getContext === 'function' ? canvasElement.getContext('2d') : null } catch { return }
  if (ctx) {
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height)
    paintCardScene(ctx, scene.value, assets, {
      onlyBlockId: id,
      resourceContext: props.resourceContext,
    })
  }
}

function rebuildSnapshots(): void {
  const currentScene = scene.value
  const nextSnapshots = new Map<string, Snapshot>()
  for (const layer of layers.value) {
    for (const item of layer.blocks) {
      const node = currentScene.nodeMap.get(item.id)
      const rect = node?.localRect
      nextSnapshots.set(item.id, {
        id: item.id,
        name: item.block.name || item.id,
        width: rect ? Math.max(1, Math.round(rect.width)) : Math.max(1, Number.parseFloat(item.block.width) || 1),
        height: rect ? Math.max(1, Math.round(rect.height)) : Math.max(1, Number.parseFloat(item.block.height) || 1),
        x: rect ? Math.round(rect.x) : (Number.parseFloat(item.block.translateX) || 0),
        y: rect ? Math.round(rect.y) : (Number.parseFloat(item.block.translateY) || 0),
      })
    }
  }
  snapshots.value = nextSnapshots
}

function repaintAllCanvases(): void {
  if (!rootRef.value) return
  const previewCanvas = rootRef.value.querySelector<HTMLCanvasElement>('.card-layer-view__preview-canvas')
  if (previewCanvas) paintCanvas(previewCanvas)
  const snapshotCanvases = rootRef.value.querySelectorAll<HTMLCanvasElement>('.card-layer-view__block-content')
  snapshotCanvases.forEach(canvas => paintSnapshotCanvas(canvas))
}

async function loadAndRepaint(): Promise<void> {
  const currentToken = ++preloadToken
  await assets.preloadSceneAssets(scene.value, props.resourceContext)
  if (currentToken !== preloadToken) return
  await nextTick()
  repaintAllCanvases()
}

function stopAnimation(): void {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  animationFrame = null
}

function animateToTarget(): void {
  stopAnimation()
  if (prefersReducedMotion()) {
    layerPosition.value = targetLayerPosition.value
    return
  }

  const tick = () => {
    const delta = targetLayerPosition.value - layerPosition.value
    if (Math.abs(delta) <= POSITION_EPSILON) {
      layerPosition.value = targetLayerPosition.value
      animationFrame = null
      return
    }
    layerPosition.value += delta * POSITION_SMOOTHING
    animationFrame = requestAnimationFrame(tick)
  }
  animationFrame = requestAnimationFrame(tick)
}

function focusPlane(value: number): void {
  focusedPlaneIndex.value = clampIndex(Math.round(value))
  targetLayerPosition.value = focusedVisualIndex.value
  animateToTarget()
}

function stepLayer(direction: -1 | 1, wholeLayer = false): void {
  if (!wholeLayer) {
    focusPlane(focusedPlaneIndex.value + direction)
    return
  }

  const currentLayerIndex = planeEntries.value[focusedPlaneIndex.value]?.layerIndex
  if (currentLayerIndex === undefined) return
  if (direction > 0) {
    const targetIndex = planeEntries.value.findIndex(entry => entry.layerIndex > currentLayerIndex)
    focusPlane(targetIndex >= 0 ? targetIndex : focusedPlaneIndex.value)
    return
  }

  let targetIndex = -1
  for (let index = focusedPlaneIndex.value - 1; index >= 0; index -= 1) {
    if (planeEntries.value[index]?.layerIndex < currentLayerIndex) {
      targetIndex = index
      break
    }
  }
  focusPlane(targetIndex >= 0 ? targetIndex : focusedPlaneIndex.value)
}

function scheduleWheelReset(): void {
  if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer)
  wheelResetTimer = window.setTimeout(() => {
    accumulatedWheelDelta = 0
    wheelResetTimer = null
  }, WHEEL_RESET_DELAY)
}

function handleWheel(event: WheelEvent): void {
  if (planeEntries.value.length === 0) return
  const normalizedDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? event.deltaY * props.viewportHeight
      : event.deltaY
  if (accumulatedWheelDelta !== 0 && Math.sign(accumulatedWheelDelta) !== Math.sign(normalizedDelta)) {
    accumulatedWheelDelta = 0
  }
  accumulatedWheelDelta += normalizedDelta
  scheduleWheelReset()
  if (Math.abs(accumulatedWheelDelta) < WHEEL_FOCUS_THRESHOLD) return

  const direction = accumulatedWheelDelta > 0 ? 1 : -1
  accumulatedWheelDelta = 0
  if (props.spaceModifierActive) {
    emit('z-index-step', {
      delta: direction < 0 ? 1 : -1,
      existingLayersOnly: event.shiftKey,
    })
    return
  }
  stepLayer(direction, event.shiftKey)
}

function handlePointerUp(event: PointerEvent): void {
  if (event.button !== 0) return
  const target = event.target instanceof Element ? event.target : null
  const block = target?.closest<HTMLElement>('[data-layer-block-id]')
  const blockLayerIndex = block?.dataset.layerIndex
  if (block?.dataset.layerBlockId && Number(blockLayerIndex) === activeLayerIndex.value) {
    emit('block-click', block.dataset.layerBlockId, event)
    return
  }
  const targetIndex = target?.closest<HTMLElement>('[data-layer-target-index]')?.dataset.layerTargetIndex
  if (targetIndex !== undefined) focusPlane(Number(targetIndex))
}

function selectInitialLayer(): void {
  const selectedIndex = props.selectedBlockId
    ? planeEntries.value.findIndex(entry => entry.id === props.selectedBlockId)
    : -1
  layerPosition.value = selectedIndex >= 0
    ? visualIndexByEntry.value.get(selectedIndex) ?? selectedIndex
    : visualIndexByEntry.value.get(Math.max(0, Math.floor((planeEntries.value.length - 1) / 2)))
      ?? faceVisualIndex.value
  focusedPlaneIndex.value = clampIndex(selectedIndex >= 0
    ? selectedIndex
    : Math.max(0, Math.floor((planeEntries.value.length - 1) / 2)))
  targetLayerPosition.value = focusedVisualIndex.value
}

function focusBlock(blockId: string): void {
  const index = planeEntries.value.findIndex(entry => entry.id === blockId)
  if (index >= 0) focusPlane(index)
}

function getFocusedBlockId(): string | null {
  return planeEntries.value[focusedPlaneIndex.value]?.id ?? null
}

function getNameInitial(name: string): string | undefined {
  const firstCharacter = Array.from(name.trimStart())[0]
  if (!firstCharacter) return undefined
  if (/^\p{Script=Han}$/u.test(firstCharacter)) {
    return pinyin(firstCharacter, { pattern: 'first', toneType: 'none' })
      .charAt(0)
      .toLocaleLowerCase()
  }
  return firstCharacter.toLocaleLowerCase()
}

function cycleLayerByInitial(initial: string, currentLayerOnly = false): boolean {
  const initialLetter = getNameInitial(initial)
  const entryCount = planeEntries.value.length
  if (!initialLetter || entryCount === 0) return false

  const focusedLayerIndex = planeEntries.value[focusedPlaneIndex.value]?.layerIndex
  for (let offset = 1; offset <= entryCount; offset += 1) {
    const index = (focusedPlaneIndex.value + offset) % entryCount
    const entry = planeEntries.value[index]
    if (!entry || (currentLayerOnly && entry.layerIndex !== focusedLayerIndex)) continue
    const nameInitial = getNameInitial(getPlaneName(entry))
    if (nameInitial !== initialLetter) continue
    focusPlane(index)
    return true
  }
  return false
}

watch(() => [props.face, props.resourceContext], async () => {
  rebuildSnapshots()
  await nextTick()
  repaintAllCanvases()
  void loadAndRepaint()
}, { deep: true })

watch(planeEntries, () => {
  const next = clampIndex(focusedPlaneIndex.value)
  focusedPlaneIndex.value = next
  layerPosition.value = focusedVisualIndex.value
  targetLayerPosition.value = focusedVisualIndex.value
})

onMounted(() => {
  selectInitialLayer()
  rebuildSnapshots()
  unsubscribeAssets = assets.onAssetLoaded(() => {
    repaintAllCanvases()
  })
  void loadAndRepaint()
})

onBeforeUnmount(() => {
  preloadToken += 1
  stopAnimation()
  if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer)
  if (unsubscribeAssets) {
    unsubscribeAssets()
    unsubscribeAssets = null
  }
  assets.clear()
})

defineExpose({ stepLayer, handleWheel, focusBlock, getFocusedBlockId, cycleLayerByInitial })
</script>

<style scoped>
.card-layer-view {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  user-select: none;
  touch-action: none;
  background: color-mix(in srgb, var(--oc-bg-raised) 24%, transparent);
  animation: layer-view-enter var(--oc-duration) var(--oc-ease) both;
}

.card-layer-view__stack {
  position: absolute;
  inset: 0 112px 0 32px;
  transform-style: preserve-3d;
}

.card-layer-view__card-preview {
  position: absolute;
  top: 18px;
  left: 18px;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  pointer-events: none;
}

.card-layer-view__card-preview-content {
  width: var(--card-layer-preview-width);
  height: var(--card-layer-preview-height);
  transform: scale(var(--card-layer-preview-scale));
  transform-origin: 0 0;
}

.card-layer-view__card-preview-content :deep(*) {
  pointer-events: none !important;
}

.card-layer-view__level {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: opacity var(--oc-duration-quick) var(--oc-ease);
  will-change: transform, opacity;
}

.card-layer-view__base-plane {
  pointer-events: none;
}

.card-layer-view__base-face {
  display: block;
}

.card-layer-view__base-face::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.86);
  pointer-events: none;
}

.card-layer-view__block-plane {
  position: absolute;
  left: 50%;
  top: 50%;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  transform-style: preserve-3d;
  pointer-events: none;
  cursor: pointer;
  will-change: transform;
  transition: opacity var(--oc-duration-quick) var(--oc-ease);
}

.card-layer-view__plane {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--oc-fg-default) 28%, transparent);
  background: color-mix(in srgb, var(--oc-bg-base) 62%, transparent);
  box-shadow: 24px 30px 44px color-mix(in srgb, #000000 17%, transparent);
  pointer-events: none;
}

.card-layer-view__plane.card-layer-view__base-face {
  border-color: var(--oc-accent);
}

.card-layer-view__block {
  position: absolute;
  inset: 0;
  display: block;
  padding: 0;
  overflow: visible;
  border: 0;
  color: inherit;
  background: transparent;
  pointer-events: none;
}

.card-layer-view__level.is-active .card-layer-view__block-plane {
  pointer-events: auto;
}

.card-layer-view__block-plane:hover .card-layer-view__plane,
.card-layer-view__block-plane:focus-visible .card-layer-view__plane {
  border-color: color-mix(in srgb, var(--oc-accent) 76%, var(--oc-fg-default));
  box-shadow:
    24px 30px 44px color-mix(in srgb, #000000 17%, transparent),
    0 0 0 2px color-mix(in srgb, var(--oc-accent) 58%, transparent);
}

.card-layer-view__block-plane:focus-visible {
  outline: none;
}

.card-layer-view__block-plane.is-selected .card-layer-view__plane {
  border-color: var(--oc-accent);
  box-shadow:
    24px 30px 44px color-mix(in srgb, #000000 17%, transparent),
    0 0 0 2px color-mix(in srgb, var(--oc-accent) 72%, transparent),
    0 0 24px color-mix(in srgb, var(--oc-accent) 20%, transparent);
}

.card-layer-view__plane-index {
  position: absolute;
  left: 0;
  top: -8px;
  color: var(--oc-fg-default);
  font-size: calc(var(--oc-text-xl) * 2);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  pointer-events: none;
  transform: translateY(-100%);
}

.card-layer-view__block-content {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.card-layer-view__block-content :deep(*) {
  pointer-events: none !important;
}

.card-layer-view__rail {
  position: absolute;
  top: 0;
  bottom: 0;
  overflow: visible;
  pointer-events: auto;
}

.card-layer-view__rail-segment {
  position: absolute;
  left: 8px;
  width: 2px;
  color: var(--oc-fg-muted);
  transition:
    top var(--oc-duration) var(--oc-ease),
    height var(--oc-duration) var(--oc-ease),
    color var(--oc-duration-quick) var(--oc-ease);
  will-change: top, height;
}

.card-layer-view__rail-segment-line {
  position: absolute;
  inset: 0;
  border-radius: var(--oc-radius-pill);
  background: currentColor;
  opacity: 0.46;
}

.card-layer-view__rail-segment-line::before,
.card-layer-view__rail-segment-line::after {
  position: absolute;
  left: 50%;
  width: 8px;
  height: 2px;
  border-radius: var(--oc-radius-pill);
  background: currentColor;
  content: '';
  transform: translateX(-50%);
}

.card-layer-view__rail-segment-line::before {
  top: 0;
}

.card-layer-view__rail-segment-line::after {
  bottom: 0;
}

.card-layer-view__rail-segment-index {
  position: absolute;
  top: 50%;
  right: 10px;
  color: currentColor;
  font-size: calc(var(--oc-text-lg) + 1px);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  transform: translateY(-50%);
  white-space: nowrap;
}

.card-layer-view__rail-segment.is-active {
  color: var(--oc-fg-accent);
}

.card-layer-view__rail-segment.is-active .card-layer-view__rail-segment-line {
  opacity: 1;
}

.card-layer-view__rail-active-index {
  position: absolute;
  left: 8px;
  color: var(--oc-fg-accent);
  font-size: calc(var(--oc-text-lg) + 1px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-left: -10px;
  transform: translate(-100%, -50%);
  white-space: nowrap;
}

.card-layer-view__tick {
  position: absolute;
  left: 2px;
  display: flex;
  align-items: center;
  width: max-content;
  min-width: 100%;
  height: 24px;
  padding: 0 0 0 20px;
  border: 0;
  color: var(--oc-fg-subtle);
  background: transparent;
  font: inherit;
  font-size: var(--oc-text-xs);
  font-variant-numeric: tabular-nums;
  text-align: left;
  transform: translateY(-50%);
  cursor: pointer;
  transition:
    top var(--oc-duration) var(--oc-ease),
    font-size var(--oc-duration-quick) var(--oc-ease),
    color var(--oc-duration-quick) var(--oc-ease);
}

.card-layer-view__tick::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 6px;
  width: 8px;
  height: 1px;
  background: currentColor;
}

.card-layer-view__tick:hover,
.card-layer-view__tick:focus-visible,
.card-layer-view__tick.is-active {
  color: var(--oc-fg-default);
  outline: none;
}

.card-layer-view__tick.is-selected {
  color: var(--oc-fg-accent);
}

.card-layer-view__tick-name {
  display: block;
  line-height: 1;
  white-space: nowrap;
}

.card-layer-view__thumb {
  position: absolute;
  left: 8px;
  width: 13px;
  height: 13px;
  border: 2px solid var(--oc-bg-raised);
  border-radius: 50%;
  background: var(--oc-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--oc-accent) 55%, transparent);
  transform: translate(-50%, -50%);
  will-change: top;
}

.card-layer-view__shortcut-legend {
  position: absolute;
  left: 18px;
  bottom: 18px;
  z-index: 120;
  display: grid;
  gap: 6px;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-xs);
  pointer-events: none;
}

.card-layer-view__shortcut-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
}


.card-layer-view__shortcut-label {
  white-space: nowrap;
}

@keyframes layer-view-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .card-layer-view,
  .card-layer-view__level,
  .card-layer-view__block,
  .card-layer-view__tick {
    animation: none;
    transition: none;
  }
}
</style>
