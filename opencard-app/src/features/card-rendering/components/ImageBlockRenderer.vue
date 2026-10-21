<!--
  使用说明：
  - 输入 `block` 提供图片块结构与样式字段
  - `placement` 描述 renderer 根节点在宿主中的位置

  职责边界：
  - 负责图片块渲染与样式投影
  - 只通过编辑器上下文回传点击意图 不处理文档写回

  主要输出事件：
  - 无 通过注入的 `handleBlockClick` 上抛选择意图
-->
<template>
    <div class="image-block" :data-block-id="block.id" :style="wrapStyle" @click.stop="handleClick">
        <div
            v-if="resolvedSource.kind !== 'icon' && (resolvedSource.kind !== 'image' || imageLoadState !== 'loaded')"
            class="image-block__placeholder"
            role="img"
            :aria-label="imageLoadState === 'error' ? tr('cardRenderer.imageFailed', '图片加载失败') : tr('cardRenderer.imageUnset', '未配置图片')"
        >
            <OcIcon
                :name="imageLoadState === 'error' ? 'mdiAlertOutline' : 'mdiFileImageOutline'"
                :tone="imageLoadState === 'error' ? 'warning' : 'muted'"
                size="lg"
            />
        </div>
        <ProjectIconGraphic
            v-if="resolvedSource.kind === 'icon'"
            :entry="resolvedSource.entry"
            mode="block"
            :fit="block.fit"
            :read-dimensions="editorContext.resources.resolveIconDimensions"
        />
        <img
            v-if="resolvedSource.kind === 'image'"
            :key="resolvedSource.src"
            class="image-block__image"
            :class="{ 'is-loaded': imageLoadState === 'loaded' }"
            :src="resolvedSource.src"
            :alt="block.name"
            :style="[imgStyle, maskStyle]"
            @load="handleImageLoad($event)"
            @error="handleImageError($event)"
        />
    </div>
</template>
<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch } from 'vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import ProjectIconGraphic from './ProjectIconGraphic.vue'
import { useCardEditorContext } from './cardEditorContext'
import type { RenderReadyImageBlock } from '../render.types'
import type { ResolvedResource } from '../cardRenderResources'
import { getBlockRenderPlacementStyles, type BlockRenderPlacement } from './blockRenderPlacement'

/** This renderer's view of a resolved resource: a usable URL is an `image`. */
type ImageSourceView = ResolvedResource | { kind: 'image', src: string }

const props = defineProps<{
    block: RenderReadyImageBlock
    placement: BlockRenderPlacement
}>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

const editorContext = useCardEditorContext()
const isTransformDisabled = computed(() => editorContext.transformDisabledBlockIds.value.has(props.block.id))

const imageLoadState = ref<'empty' | 'loading' | 'loaded' | 'error'>('empty')
const readinessSlot = editorContext.visualReadiness?.createSlot()
let readinessTicket: ReturnType<NonNullable<typeof readinessSlot>['begin']> | null = null
let expectedImageSrc = ''

const wrapStyle = computed(() => {
    const style = getBlockRenderPlacementStyles(props.block, props.placement, isTransformDisabled.value)
    return `${style}; overflow: hidden`
})

const imgStyle = computed(() => {
    const fit = props.block.fit
    return [
        'position: absolute',
        'inset: 0',
        'width: 100%',
        'height: 100%',
        `object-fit: ${fit}`,
        'object-position: 50% 50%',
        'display: block',
    ].join('; ')
})

const resolvedSource = computed<ImageSourceView>(() => {
  const resolved = editorContext.resources.resolve({
    value: props.block.source,
    expect: 'asset',
    blockId: props.block.id,
    fieldKey: 'source',
  })
  return resolved.kind === 'url' ? { kind: 'image', src: resolved.src } : resolved
})

const resolvedMaskSource = computed<ImageSourceView>(() => {
  if (!props.block.maskSource.trim()) return { kind: 'empty' }
  const resolved = editorContext.resources.resolve({ value: props.block.maskSource, expect: 'asset', blockId: props.block.id, fieldKey: 'maskSource' })
  return resolved.kind === 'url' ? { kind: 'image', src: resolved.src } : resolved
})

const maskStyle = computed(() => {
  const source = resolvedMaskSource.value
  const url = source.kind === 'image' ? source.src : source.kind === 'icon' ? source.entry.src : ''
  const size = props.block.maskFit === 'fill' ? '100% 100%' : props.block.maskFit
  return url ? {
    maskImage: `url("${url.replace(/"/g, '%22')}")`, WebkitMaskImage: `url("${url.replace(/"/g, '%22')}")`,
    maskMode: 'alpha', WebkitMaskMode: 'alpha', maskSize: size, WebkitMaskSize: size,
    maskPosition: 'center', WebkitMaskPosition: 'center', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
  } : { maskImage: 'none', WebkitMaskImage: 'none' }
})

function resolvedSourceIdentity(source: ImageSourceView): string {
    return source.kind === 'image' ? `image:${source.src}` : source.kind
}

watch(() => resolvedSourceIdentity(resolvedSource.value), () => {
    const source = resolvedSource.value
    readinessTicket = readinessSlot?.begin() ?? null
    expectedImageSrc = source.kind === 'image' ? source.src : ''
    imageLoadState.value = source.kind === 'image'
        ? 'loading'
        : source.kind === 'unavailable' ? 'error' : 'empty'
    if (source.kind !== 'image') readinessTicket?.settle()
}, { immediate: true })

function isCurrentImageEvent(event: Event): boolean {
    const image = event.currentTarget
    return image instanceof HTMLImageElement && image.src === expectedImageSrc
}

function handleImageLoad(event: Event): void {
    if (!isCurrentImageEvent(event)) return
    imageLoadState.value = 'loaded'
    readinessTicket?.settle()
}

function handleImageError(event: Event): void {
    if (!isCurrentImageEvent(event)) return
    imageLoadState.value = 'error'
    editorContext.resources.reportError?.(expectedImageSrc, 'Image could not be decoded')
    readinessTicket?.settle()
}

onBeforeUnmount(() => readinessSlot?.dispose())

function handleClick(event: MouseEvent) {
    editorContext.handleBlockClick(props.block.id, event)
}
</script>

<style scoped>
.image-block__placeholder,
.image-block__image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}

.image-block {
    position: relative;
    container-type: size;
}

.image-block__placeholder {
    display: grid;
    place-items: center;
    background: var(--oc-bg-subtle, rgba(255, 255, 255, 0.035));
    color: var(--oc-fg-muted);
}

.image-block__image {
    display: block;
    opacity: 0;
    object-position: 50% 50%;
}

.image-block__image.is-loaded {
    opacity: 1;
}
</style>
