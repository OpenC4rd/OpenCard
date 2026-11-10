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
import type { CardFaceView } from './cardFaceView'
import { taskScheduler } from '../../../utils/taskScheduler'

const props = withDefaults(defineProps<{
  face: RenderReadyCardFace
  visibleRootBlockIds?: string[]
  resourceContext: CardRenderResourceContext
  diffHighlights?: readonly { blockId: string; kind: 'added' | 'removed' | 'changed' }[]
  visualReadiness?: CardVisualReadinessRegistrar
  renderScale?: number
  view?: CardFaceView | null
}>(), { visibleRootBlockIds: () => [], diffHighlights: () => [], renderScale: 1, view: null })

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
const paintedView = computed<CardFaceView>(() => props.view ?? {
  left: 0,
  top: 0,
  width: props.face.width,
  height: props.face.height,
  pixelScale: effectivePixelRatio.value,
})
const canvasStyle = computed(() => {
  const view = props.view
  // 舞台负责缩放；视图模式用 transform 抵消它，CSS 布局量化到 1/64px，放大后会偏出整像素
  return {
    display: 'block',
    background: props.face.background,
    ...(view ? {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: `${view.width * view.pixelScale}px`,
      height: `${view.height * view.pixelScale}px`,
      transform: `translate(${view.left}px, ${view.top}px) scale(${1 / view.pixelScale})`,
      transformOrigin: '0 0',
    } : {
      width: `${props.face.width}px`,
      height: `${props.face.height}px`,
    }),
  }
})

const assets = createCanvasAssetStore()
const renderFace = computed(() => props.visibleRootBlockIds.length
  ? { ...props.face, children: props.face.children.filter(child => props.visibleRootBlockIds.includes(child.block.id)) }
  : props.face)

const sceneGraph = computed<CardSceneGraph>(() => computeSceneLayout(renderFace.value))

// 素材与字体是一个个到的：每到一个只登记一次重绘，同一帧里到多少个都只画一遍。
const repaint = taskScheduler.frame<void>(paint)

function paint(): void {
  repaint.cancel()
  const canvas = canvasRef.value
  if (!canvas) return
  const { left, top, width, height, pixelScale } = paintedView.value
  const pixelWidth = Math.max(1, Math.round(width * pixelScale))
  const pixelHeight = Math.max(1, Math.round(height * pixelScale))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(pixelScale, 0, 0, pixelScale, -left * pixelScale, -top * pixelScale)
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
  const view = paintedView.value
  const worldX = view.left + (event.clientX - rect.left) * (rect.width > 0 ? view.width / rect.width : 1)
  const worldY = view.top + (event.clientY - rect.top) * (rect.height > 0 ? view.height / rect.height : 1)

  const hitNode = hitTestScene(sceneGraph.value, { x: worldX, y: worldY })
  if (hitNode) {
    emit('block-click', hitNode.id, event)
  } else {
    emit('blank-click', event)
  }
}

const requestRepaint = () => repaint.schedule()

onMounted(() => {
  assets.onAssetLoaded(requestRepaint)
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts?.addEventListener?.('loadingdone', requestRepaint)
    void document.fonts?.ready?.then(requestRepaint)
  }
  paint()
})

onBeforeUnmount(() => {
  repaint.cancel()
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts?.removeEventListener?.('loadingdone', requestRepaint)
  }
  assets.clear()
})

watch(() => [props.face, props.resourceContext], () => {
  void assets.preloadSceneAssets(sceneGraph.value, props.resourceContext)
}, { immediate: true })

// 渲染就绪的卡面每次都是整份新产出，换了引用才需要重画，不必逐层比对。
watch(() => [props.face, props.resourceContext, props.diffHighlights, props.visibleRootBlockIds, paintedView.value], paint, { flush: 'post' })

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
