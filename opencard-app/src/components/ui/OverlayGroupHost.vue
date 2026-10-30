<template>
  <Teleport :to="overlayRoot">
    <OcFloatingLayer
      class="overlay-group-layer oc-floating-layer--surface"
      inline
      :anchor="state.anchor"
      :owner="state.owner"
      :placement="state.placement"
      :open="state.visible"
      :max-height="state.maxHeight"
      @after-leave="handleAfterLeave"
    >
      <div ref="contentEl" class="overlay-group-content" :class="{ 'is-sizing': hasSize }" />
    </OcFloatingLayer>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import OcFloatingLayer from '../standard/OcFloatingLayer.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'
import { resolveOverlayRoot } from '../../shared/ui/overlayScope'

defineOptions({ name: 'OverlayGroupHost' })

const props = defineProps<{ group: string }>()

const state = overlayGroups.get(props.group)!

const overlayRoot = computed(() => resolveOverlayRoot(
  state.owner ?? (state.anchor instanceof HTMLElement ? state.anchor : null),
))

const contentEl = shallowRef<HTMLElement | null>(null)
/** 首次量出真实尺寸之前不加过渡，宿主才不会从 0 撑开。 */
const hasSize = ref(false)
let sizeObserver: ResizeObserver | null = null
let contentObserver: MutationObserver | null = null
let sizedWidth = 0
let sizedHeight = 0

/**
 * 尺寸量 contentEl 自己：位置由 OcFloatingLayer 的 transform 负责，
 * 换内容只该动内容盒子，两层各管一件事才不会互相覆盖。
 */
function measure(): void {
  const element = contentEl.value
  if (!element) return
  const pinnedWidth = element.style.width
  // 只有宽度松绑：宽度被钉住时 scrollWidth 量不出内容想要的宽度。
  element.style.width = 'auto'
  const width = element.scrollWidth
  element.style.width = pinnedWidth || 'auto'
  const height = naturalHeight(element)
  const settled = hasSize.value && width === sizedWidth && height === sizedHeight
  // 内容还没挂进来时写 0 会让宿主从 0 撑开，等它来了再量。
  if (width === 0 || height === 0 || settled) {
    element.style.width = pinnedWidth
    return
  }
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  sizedWidth = width
  sizedHeight = height
  hasSize.value = true
}

/**
 * 内容自然高度：量内容范围，不去动宿主自己的 height。
 * 宿主高度被钉住时它只会返回钉住值，所以把 height 归零再量是行不通的；而归零会强制布局，
 * 把正在跑的 height 过渡按在 auto 上——内容一变高矮，弹层就整块瞬跳。
 * 只有绝对定位内容量不到高度时才退回老办法。
 */
function naturalHeight(element: HTMLElement): number {
  const range = document.createRange()
  range.selectNodeContents(element)
  // jsdom 的 Range 没有 getBoundingClientRect：量不到就走下面的退路。
  const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null
  const height = rect ? Math.ceil(rect.height) : 0
  if (height > 0) return height
  const pinnedHeight = element.style.height
  element.style.height = 'auto'
  const fallback = element.scrollHeight
  element.style.height = pinnedHeight
  return fallback
}

/**
 * 离场播完才销毁宿主。离场期间组可能已经被新的 marker 重新打开（visible 又变 true），
 * 那时这一层还在用，删掉会让面板凭空消失。
 */
function handleAfterLeave(): void {
  if (!state.visible) disposeGroup(props.group)
}

/**
 * OcFloatingLayer 的根是 v-if：宿主关一次再开时内容盒会被重建。
 * Teleport 目标和尺寸观察器都必须跟着换，否则重开后内容投进旧节点、也没有人再量新盒。
 */
watch(contentEl, element => {
  state.contentEl = element
  sizeObserver?.disconnect()
  contentObserver?.disconnect()
  sizeObserver = null
  contentObserver = null
  if (!element) return
  measure()
  // 尺寸固定在自己身上之后，内容变化不会再改变这个盒子：盒子交给 RO，内容交给 MO。
  if (typeof ResizeObserver !== 'undefined') {
    sizeObserver = new ResizeObserver(() => measure())
    sizeObserver.observe(element)
  }
  contentObserver = new MutationObserver(() => measure())
  contentObserver.observe(element, { childList: true, characterData: true, subtree: true })
}, { flush: 'post', immediate: true })

onBeforeUnmount(() => {
  sizeObserver?.disconnect()
  contentObserver?.disconnect()
  sizeObserver = null
  contentObserver = null
  state.contentEl = null
})
</script>

<style>
.overlay-group-layer {
  /* 同组换 marker 只换锚点：宿主节点不变，位置滑过去而不是跳过去。 */
  transition: transform var(--oc-duration-quick) var(--oc-ease);
}

.overlay-group-layer .overlay-group-content {
  overflow: hidden;
  max-height: inherit;
  user-select: none;
  -webkit-user-select: none;
}

.overlay-group-content.is-sizing {
  transition: width var(--oc-duration-quick) var(--oc-ease),
    height var(--oc-duration-quick) var(--oc-ease);
}

@media (prefers-reduced-motion: reduce) {
  .overlay-group-layer,
  .overlay-group-content.is-sizing {
    transition: none;
  }
}
</style>
