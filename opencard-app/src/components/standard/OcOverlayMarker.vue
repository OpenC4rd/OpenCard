<script lang="ts">
/**
 * 抢占发生在另一个 marker 的调用栈里：调用者手里只有被抢占的 id，
 * 被抢占的实例只能靠这张表找回自己。这张表是组件模块私有的，
 * 不进入 overlayGroups 的公开接口——组状态归组，内容归 marker。
 */
const closers = new Map<string, () => void>()

function closeMarkerById(markerId: string): void {
  closers.get(markerId)?.()
}

function registerCloser(markerId: string, close: () => void): () => void {
  closers.set(markerId, close)
  return () => { closers.delete(markerId) }
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { Placement } from '@floating-ui/vue'
import {
  activateMarker,
  deactivateMarker,
  groupContentEl,
  type OverlayAnchor,
} from '../../composables/overlayGroups'

defineOptions({ name: 'OcOverlayMarker' })

const props = defineProps<{
  /** 同组内互斥：新的取走宿主，旧的真正关闭。 */
  group: string
  /** 定位来源。函数每次打开只用来判定「这次有没有位置」，存进组的仍是函数本身。 */
  anchor: OverlayAnchor
  /** 模态归属与 autoUpdate 的监听源；函数锚点必须给，否则面板内滚动不会重算。 */
  owner?: HTMLElement | null
  placement?: Placement
  maxHeight?: number
  /** 可选 v-model:open；它是唯一的外部意图，visible 只是结果。 */
  open?: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  close: []
}>()

const markerId = useId()
const visible = ref(false)
const contentEl = computed(() => groupContentEl(props.group))

/** 被抢占或主动关闭都走这里：停掉自己的内容，不回头碰组状态。 */
function hide(): void {
  if (!visible.value) return
  visible.value = false
  emit('update:open', false)
  emit('close')
}

function open(): void {
  // 只求值一次判断这次有没有位置；组里存函数本身，autoUpdate 才能每帧重算。
  const probe = typeof props.anchor === 'function' ? props.anchor() : props.anchor
  if (!probe) return
  const previousMarkerId = activateMarker(props.group, markerId, {
    anchor: props.anchor,
    owner: props.owner ?? null,
    placement: props.placement,
    maxHeight: props.maxHeight,
  })
  visible.value = true
  // 组已经指向自己，被抢占的那个只是丢掉内容：它不能反过来把组关掉。
  if (previousMarkerId) closeMarkerById(previousMarkerId)
  emit('update:open', true)
}

function close(): void {
  if (!visible.value) return
  deactivateMarker(props.group, markerId)
  hide()
}

function toggle(): void {
  if (visible.value) close()
  else open()
}

onBeforeUnmount(registerCloser(markerId, hide))

watch(() => props.open, next => {
  if (next === undefined) return
  if (next) open()
  else close()
}, { immediate: true })

defineExpose({ open, close, toggle })
</script>

<template>
  <Teleport v-if="visible && contentEl" :to="contentEl">
    <slot />
  </Teleport>
</template>
