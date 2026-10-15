<!-- Standard 弹窗外置侧栏布局：主窗口右侧从背面抽出的侧栏，边上小握把控制收起与展开。 -->
<template>
  <div class="oc-dialog-layout" :class="[`oc-dialog-layout--${size}`, { 'is-sidebar-open': expanded, 'is-sidebar-dragging': dragging }]"
    :style="dragStyle">
    <div class="oc-dialog-layout__content">
      <slot />
    </div>

    <template v-if="showSidebar">
      <aside class="oc-dialog-layout__sidebar" :inert="!open || undefined" :aria-label="label">
        <header class="oc-dialog-layout__heading">{{ label }}</header>
        <div class="oc-dialog-layout__body">
          <slot name="sidebar" />
        </div>
      </aside>

      <button ref="handleRef" class="oc-dialog-layout__handle" type="button" :aria-expanded="open"
        :aria-label="tooltip ?? label" :data-tooltip="tooltip" data-tooltip-placement="right"
        @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag"
        @dblclick.prevent="toggle" @click="handleActivate" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useSlots, type CSSProperties } from 'vue'
import { clamp } from '../../shared/model/number'
import { readThemePixels } from '../../shared/ui/foundation/themeTokenPixels'

defineOptions({ name: 'OcDialogLayout' })

const props = withDefaults(defineProps<{
  /** 是否显示侧栏及把手；正文始终保留。 */
  sidebar?: boolean
  /** 主窗口宽度预设；侧栏展开时主窗口宽度不变，整体仍然居中。 */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 侧栏标题，同时作为把手的无障碍名称。 */
  label: string
  /** 把手悬停提示；提供时同时作为把手的无障碍名称。 */
  tooltip?: string
}>(), { sidebar: true, size: 'md' })

const SIDEBAR_WIDTH = readThemePixels('--oc-dialog-sidebar-width')
const EXPAND_THRESHOLD = readThemePixels('--oc-dialog-sidebar-expand-threshold')
const COLLAPSE_THRESHOLD = readThemePixels('--oc-dialog-sidebar-collapse-threshold')

type SidebarDrag = {
  pointerId: number
  startX: number
  /** 拖动期间位置锁定在起始状态，居中直到落位才切换。 */
  startOpen: boolean
}

/** 侧栏展开状态；由布局自己持有，把手是唯一的操作入口。 */
const open = ref(true)
const slots = useSlots()
const showSidebar = computed(() => props.sidebar && Boolean(slots.sidebar))
/** 只有侧栏真正存在并展开时，抽屉才占用布局宽度。 */
const expanded = computed(() => showSidebar.value && open.value)

const handleRef = ref<HTMLButtonElement | null>(null)
const drag = ref<SidebarDrag | null>(null)
/** 拖动位移：正数向外拉，负数向内推；不拖动时为 null，位置由状态类决定。 */
const pull = ref<number | null>(null)
const dragging = computed(() => drag.value !== null)
const dragStyle = computed<CSSProperties | undefined>(() => (
  pull.value === null ? undefined : { '--oc-dialog-sidebar-drag': `${pull.value}px` }
))
let previousBodyCursor = ''
let previousBodyUserSelect = ''

function toggle(): void {
  open.value = !open.value
}

/** 指针点击不做动作（拖动和双击才是操作方式）；键盘与辅助技术触发的 click 才切换。 */
function handleActivate(event: MouseEvent): void {
  if (event.detail === 0) toggle()
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0 || drag.value) return
  drag.value = { pointerId: event.pointerId, startX: event.clientX, startOpen: open.value }
  pull.value = 0
  handleRef.value?.focus({ preventScroll: true })
  handleRef.value?.setPointerCapture?.(event.pointerId)
  previousBodyCursor = document.body.style.cursor
  previousBodyUserSelect = document.body.style.userSelect
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('keydown', handleDragKeydown, true)
  event.preventDefault()
}

function moveDrag(event: PointerEvent): void {
  const state = drag.value
  if (!state || state.pointerId !== event.pointerId) return
  const travelled = event.clientX - state.startX
  pull.value = state.startOpen
    ? clamp(travelled, -SIDEBAR_WIDTH, 0)
    : clamp(travelled, 0, SIDEBAR_WIDTH)
  event.preventDefault()
}

function endDrag(event: PointerEvent): void {
  const state = drag.value
  if (!state || state.pointerId !== event.pointerId) return
  const travelled = pull.value ?? 0
  open.value = state.startOpen ? travelled > -COLLAPSE_THRESHOLD : travelled >= EXPAND_THRESHOLD
  finishDrag()
  event.preventDefault()
}

function cancelDrag(): void {
  finishDrag()
}

function handleDragKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  cancelDrag()
}

function finishDrag(): void {
  const state = drag.value
  if (!state) return
  if (handleRef.value?.hasPointerCapture?.(state.pointerId)) {
    handleRef.value.releasePointerCapture(state.pointerId)
  }
  drag.value = null
  pull.value = null
  document.removeEventListener('keydown', handleDragKeydown, true)
  document.body.style.cursor = previousBodyCursor
  document.body.style.userSelect = previousBodyUserSelect
  previousBodyCursor = ''
  previousBodyUserSelect = ''
}

onBeforeUnmount(finishDrag)
</script>

<style scoped>
/*
 * 收起时布局宽度只等于主窗口，主窗口因此回到视口正中；展开时整体（主窗口加侧栏和把手）居中。
 * 布局宽度和正文宽度只由收开状态决定：拖动期间整块不动，居中在落位时才切换。
 */
.oc-dialog-layout {
  --oc-dialog-sidebar-drag: 0px;
  --oc-dialog-sidebar-extent: 0px;
  --oc-dialog-sidebar-gap: 0px;
  position: relative;
  width: min(100%, calc(var(--oc-dialog-main-width) + var(--oc-dialog-sidebar-extent)));
  min-width: 0;
  min-height: 0;
  max-height: calc(100dvh - var(--oc-space-lg) * 2);
  transition: width var(--oc-duration) var(--oc-ease);
}

.oc-dialog-layout--sm { --oc-dialog-main-width: var(--oc-dialog-width-sm); }
.oc-dialog-layout--md { --oc-dialog-main-width: var(--oc-dialog-width-md); }
.oc-dialog-layout--lg { --oc-dialog-main-width: var(--oc-dialog-width-lg); }
.oc-dialog-layout--xl { --oc-dialog-main-width: var(--oc-dialog-width-xl); }

.oc-dialog-layout.is-sidebar-open {
  --oc-dialog-sidebar-extent: calc(var(--oc-dialog-sidebar-width) + var(--oc-dialog-sidebar-handle-width));
  --oc-dialog-sidebar-gap: var(--oc-dialog-sidebar-handle-width);
}

.oc-dialog-layout__content {
  position: relative;
  z-index: 2;
  display: flex;
  width: calc(100% - var(--oc-dialog-sidebar-extent));
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  transition: width var(--oc-duration) var(--oc-ease);
}

/*
 * 侧栏上下各内缩一个圆角半径，正好对上主窗口右缘的直线段，左缘平齐贴住它、不收圆角。
 * 收起时右缘落到主窗口右缘，整块藏进主窗口背面；展开时左缘贴住主窗口右缘。
 * 拖动位移只作用在它和把手上，布局宽度不动。
 */
.oc-dialog-layout__sidebar {
  position: absolute;
  z-index: 1;
  top: var(--oc-radius-control);
  right: calc(var(--oc-dialog-sidebar-gap) - var(--oc-dialog-sidebar-drag));
  bottom: var(--oc-radius-control);
  box-sizing: border-box;
  display: flex;
  width: var(--oc-dialog-sidebar-width);
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  visibility: hidden;
  border: var(--oc-border-width) solid var(--oc-border-default);
  border-left: 0;
  border-radius: 0 var(--oc-radius-control) var(--oc-radius-control) 0;
  background: var(--oc-bg-raised);
  box-shadow: var(--oc-shadow-lg);
  color: var(--oc-fg-default);
  transition:
    visibility var(--oc-duration) var(--oc-ease),
    right var(--oc-duration) var(--oc-ease);
}

.oc-dialog-layout.is-sidebar-open .oc-dialog-layout__sidebar,
.oc-dialog-layout.is-sidebar-dragging .oc-dialog-layout__sidebar {
  visibility: visible;
}

/* 把手是侧栏右缘之外那一条抓取区，露出的小握把与拖动控件同尺寸、同颜色。 */
.oc-dialog-layout__handle {
  position: absolute;
  z-index: 0;
  top: var(--oc-radius-control);
  right: calc(var(--oc-dialog-sidebar-gap) - var(--oc-dialog-sidebar-drag) - var(--oc-dialog-sidebar-handle-width));
  bottom: var(--oc-radius-control);
  display: flex;
  width: var(--oc-dialog-sidebar-handle-width);
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--oc-border-muted);
  cursor: col-resize;
  outline: none;
  touch-action: none;
  transition:
    right var(--oc-duration) var(--oc-ease),
    color var(--oc-duration-quick) var(--oc-ease);
}

.oc-dialog-layout__handle::after {
  display: block;
  width: var(--oc-space-2xs);
  height: var(--oc-size-md);
  border-radius: var(--oc-radius-pill);
  background: currentColor;
  content: '';
  transition: box-shadow var(--oc-duration-quick) var(--oc-ease);
}

.oc-dialog-layout__handle:hover,
.oc-dialog-layout__handle:focus-visible {
  color: var(--oc-border-accent);
}

.oc-dialog-layout__handle:focus-visible::after {
  box-shadow: var(--oc-focus-ring);
}

/* 拖动期间位置直接跟手，动画只留给松手后的落位。 */
.oc-dialog-layout.is-sidebar-dragging,
.oc-dialog-layout.is-sidebar-dragging .oc-dialog-layout__content,
.oc-dialog-layout.is-sidebar-dragging .oc-dialog-layout__sidebar,
.oc-dialog-layout.is-sidebar-dragging .oc-dialog-layout__handle {
  transition: none;
}

.oc-dialog-layout__heading {
  flex: 0 0 auto;
  padding: var(--oc-space-sm);
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.oc-dialog-layout__body {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
}

@media (prefers-reduced-motion: reduce) {
  .oc-dialog-layout,
  .oc-dialog-layout__content,
  .oc-dialog-layout__sidebar,
  .oc-dialog-layout__handle {
    transition: none;
  }
}
</style>
