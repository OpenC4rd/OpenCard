<template>
  <canvas ref="canvasRef" class="card-canvas" :style="canvasStyle" @click="handleClick" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RenderReadyCardFace } from '../render.types'
import type { CardRenderResourceContext } from '../cardRenderResources'
import type { CardVisualReadinessRegistrar } from './cardRenderReadiness'
import { createCanvasAssetStore } from '../painter/canvasAssetStore'
import { paintCardScene } from '../painter/paintCardScene'
import { computeSceneLayout, hitTestScene, type CardSceneGraph } from '../geometry'

const props = withDefaults(defineProps<{
  face: RenderReadyCardFace
  visibleRootBlockIds?: string[]
  clipToFace?: boolean
  resourceContext: CardRenderResourceContext
  diffHighlights?: readonly { blockId: string; kind: 'added' | 'removed' | 'changed' }[]
  visualReadiness?: CardVisualReadinessRegistrar
  renderScale?: number
}>(), { visibleRootBlockIds: () => [], clipToFace: false, diffHighlights: () => [], renderScale: 1 })

const emit = defineEmits<{
  (e: 'block-click', blockId: string, event: MouseEvent): void
  (e: 'blank-click', event: MouseEvent): void
}>()

const MAX_CANVAS_PHYSICAL_PIXELS = 8192

const canvasRef = ref<HTMLCanvasElement>()
const devicePixelRatio = computed(() => typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1))
const effectivePixelRatio = computed(() => {
  const zoom = Number.isFinite(props.renderScale) && (props.renderScale ?? 0) > 0 ? (props.renderScale ?? 1) : 1
  const idealRatio = devicePixelRatio.value * zoom
  const maxSide = Math.max(props.face.width, props.face.height, 1)
  const maxSafeRatio = MAX_CANVAS_PHYSICAL_PIXELS / maxSide
  return Math.min(idealRatio, Math.max(0.1, maxSafeRatio))
})
const pixelWidth = computed(() => Math.max(1, Math.round(props.face.width * effectivePixelRatio.value)))
const pixelHeight = computed(() => Math.max(1, Math.round(props.face.height * effectivePixelRatio.value)))
const canvasStyle = computed(() => ({
  width: `${props.face.width}px`,
  height: `${props.face.height}px`,
  display: 'block',
  background: props.face.background,
}))

const assets = createCanvasAssetStore()
const renderFace = computed(() => props.visibleRootBlockIds.length
  ? { ...props.face, children: props.face.children.filter(child => props.visibleRootBlockIds.includes(child.block.id)) }
  : props.face)

const sceneGraph = computed<CardSceneGraph>(() => computeSceneLayout(renderFace.value))

function paint(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  if (canvas.width !== pixelWidth.value) {
    canvas.width = pixelWidth.value
  }
  if (canvas.height !== pixelHeight.value) {
    canvas.height = pixelHeight.value
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const ratio = effectivePixelRatio.value
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  paintCardScene(ctx, sceneGraph.value, assets, {
    diffHighlights: props.diffHighlights,
    resourceContext: props.resourceContext,
  })
}

function handleClick(event: MouseEvent): void {
  if (event.button !== 0) return
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const canvasWidth = rect.width > 0 ? rect.width : props.face.width
  const canvasHeight = rect.height > 0 ? rect.height : props.face.height
  const canvasLeft = rect.width > 0 ? rect.left : 0
  const canvasTop = rect.height > 0 ? rect.top : 0

  const worldX = (event.clientX - canvasLeft) * props.face.width / canvasWidth
  const worldY = (event.clientY - canvasTop) * props.face.height / canvasHeight

  const hitNode = hitTestScene(sceneGraph.value, { x: worldX, y: worldY })
  if (hitNode) {
    emit('block-click', hitNode.id, event)
  } else {
    emit('blank-click', event)
  }
}

let unbindAssets: (() => void) | null = null
const handleFontLoaded = () => { paint() }

onMounted(() => {
  unbindAssets = assets.onAssetLoaded(() => { paint() })
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts?.addEventListener?.('loadingdone', handleFontLoaded)
    void document.fonts?.ready?.then(() => { paint() })
  }
  paint()
})

onBeforeUnmount(() => {
  if (unbindAssets) {
    unbindAssets()
    unbindAssets = null
  }
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts?.removeEventListener?.('loadingdone', handleFontLoaded)
  }
  assets.clear()
})

watch(() => [props.face, props.resourceContext], () => {
  void assets.preloadSceneAssets(sceneGraph.value, props.resourceContext)
}, { immediate: true })

watch(() => [props.face, props.resourceContext, props.diffHighlights, props.visibleRootBlockIds, effectivePixelRatio.value], () => {
  paint()
}, { deep: true, flush: 'post' })

defineExpose({
  getCanvasElement: () => canvasRef.value,
  getSceneGraph: () => sceneGraph.value,
})
</script>

<style scoped>
.card-canvas {
  user-select: none;
  pointer-events: auto;
}
</style>
