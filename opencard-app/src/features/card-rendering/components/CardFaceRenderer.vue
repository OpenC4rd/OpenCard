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
  screenScale: 1,
})
const canvasStyle = computed(() => {
  const view = props.view
  // 画布按屏幕尺寸布局，不靠缩放变换：WebKit 给嵌套缩放的图层按布局尺寸栅格化，放大后整张发糊。
  // 位置用 transform 给：CSS 布局量化到 1/64px，变换不量化，位图才能 1:1 落在设备像素上。
  return {
    display: 'block',
    background: props.face.background,
    ...(view ? {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: `${view.width * view.screenScale}px`,
      height: `${view.height * view.screenScale}px`,
      transform: `translate(${view.left * view.screenScale}px, ${view.top * view.screenScale}px)`,
      transformOrigin: '0 0',
    } : {
      width: `calc(${props.face.width}px * var(--oc-card-stage-scale, 1))`,
      height: `calc(${props.face.height}px * var(--oc-card-stage-scale, 1))`,
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
  if (!props.view || !props.face.bleed) return
  // 出血线（实线）与裁切线（虚线）：只在编辑视图里画，反色保证任何背景上都看得见。
  const line = 1 / pixelScale
  const outer = props.face.bleed - line / 2 // 线向内收半个线宽，不被画布边缘切掉
  ctx.globalCompositeOperation = 'difference'
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = line
  ctx.strokeRect(-outer, -outer, props.face.width + outer * 2, props.face.height + outer * 2)
  ctx.setLineDash([4 * line, 4 * line])
  ctx.strokeRect(0, 0, props.face.width, props.face.height)
  ctx.setLineDash([])
  ctx.globalCompositeOperation = 'source-over'
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
