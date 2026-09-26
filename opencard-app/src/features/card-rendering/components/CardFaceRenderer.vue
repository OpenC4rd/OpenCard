<!-- 卡面渲染器：只接收可直接渲染的完整卡面，并可选择裁切超出卡面尺寸的内容。 -->
<template>
    <div ref="cardCanvasRef" class="card-canvas" :class="{ 'card-canvas--clipped': props.clipToFace }"
        :style="canvasStyle">
        <NativeBlockRenderer :block="rootContainerBlock" :placement="{ kind: 'root' }" />
    </div>
</template>

<script setup lang="ts">
import { computed, provide, ref, watch, nextTick, onMounted } from 'vue'
import NativeBlockRenderer from './NativeBlockRenderer.vue'
import { cardEditorContextKey } from './cardEditorContext'
import type { RenderReadyCardFace, RenderReadySimpleContainerBlock } from '../render.types'
import {
    createCardResourceResolver,
    type CardRenderResourceContext,
} from '../cardRenderResources'
import type { CardVisualReadinessRegistrar } from './cardRenderReadiness'

const emit = defineEmits<{
    /** 块点击事件：上抛被点击 blockId 与原始鼠标事件。 */
    (e: 'block-click', blockId: string, event: MouseEvent): void
}>()

const props = withDefaults(defineProps<{
    /** 已完成解析、校验和默认值回退的卡面。 */
    face: RenderReadyCardFace
    /** 不允许被变换的块 ID 列表。 */
    transformDisabledBlockIds?: string[]
    /** 根层可见块 ID 列表（为空时显示全部）。 */
    visibleRootBlockIds?: string[]
    /** 是否裁切超出卡面尺寸的内容。 */
    clipToFace?: boolean
    /** 卡面资源唯一解析上下文。 */
  resourceContext: CardRenderResourceContext
  diffHighlights?: readonly { blockId: string; kind: 'added' | 'removed' | 'changed' }[]
  visualReadiness?: CardVisualReadinessRegistrar
}>(), {
    transformDisabledBlockIds: () => [],
    visibleRootBlockIds: () => [],
  clipToFace: false,
  diffHighlights: () => [],
})

const cardCanvasRef = ref<HTMLElement>()
async function applyDiffHighlights(highlights: readonly { blockId: string; kind: 'added' | 'removed' | 'changed' }[]) {
  await nextTick()
  const root = cardCanvasRef.value
  if (!root) return
  root.querySelectorAll<HTMLElement>('[data-block-id]').forEach(element => {
    const match = highlights.find(item => item.blockId === element.dataset.blockId)
    if (match) element.dataset.diffKind = match.kind
    else delete element.dataset.diffKind
  })
}
watch(() => props.diffHighlights, applyDiffHighlights, { deep: true })
onMounted(() => { void applyDiffHighlights(props.diffHighlights) })

const normalizedTransformDisabledBlockIds = computed(() => new Set(props.transformDisabledBlockIds))
const normalizedVisibleRootBlockIds = computed(() => new Set(props.visibleRootBlockIds))
const resources = createCardResourceResolver(() => props.resourceContext)

const canvasStyle = computed((): Record<string, string> => ({
    position: 'relative',
    width: `${props.face.width}px`,
    height: `${props.face.height}px`,
    background: props.face.background,
}))

const visibleChildren = computed(() => {
    if (normalizedVisibleRootBlockIds.value.size === 0) {
        return props.face.children
    }

    return props.face.children.filter(child =>
        normalizedVisibleRootBlockIds.value.has(child.block.id)
    )
})
const rootContainerBlock = computed<RenderReadySimpleContainerBlock>(() => {
    return {
        type: 'simple-container-block',
        id: props.face.id,
        name: props.face.faceKey,
        notes: '',
        visible: true,
        width: `${props.face.width}px`,
        height: `${props.face.height}px`,
        clip: false,
        children: visibleChildren.value,
        borderColor: '#000000',
        borderWidth: 0,
        borderStyle: 'solid',
        borderRadius: '',
        background: props.face.background,
        translateX: '0px',
        translateY: '0px',
        scaleX: 1,
        scaleY: 1,
        transformAnchor: 'cc',
        zIndex: 0,
        rotation: 0,
        opacity: 1,
        customCss: '',
    }
})

provide(cardEditorContextKey, {
    transformDisabledBlockIds: normalizedTransformDisabledBlockIds,
    handleBlockClick: (blockId, event) => {
        emit('block-click', blockId, event)
    },
	    resources,
		    richText: computed(() => props.resourceContext.richText ?? new Map()),
	    visualReadiness: props.visualReadiness,
	    documentId: props.face.id,
    faceKey: props.face.faceKey,
    bindingProject: computed(() => props.resourceContext.bindingProject),
    bindingDictionary: computed(() => props.resourceContext.bindingDictionary),
	})

defineExpose({
	    getCanvasElement: () => cardCanvasRef.value,
	})
</script>

<style scoped>
.card-canvas {
    user-select: none;
    display: inline-block;
}

.card-canvas--clipped {
    overflow: hidden;
}
</style>
