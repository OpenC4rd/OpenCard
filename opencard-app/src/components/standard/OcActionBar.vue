<!--
  操作条：把一组操作渲染成一排（或一列）按钮，选中时回报 key。

  - appearance：方形图标按钮，或以标题为文字的按钮。
  - overflow="fit"：放不下时从末尾往前收进「更多」；文字与 alwaysVisible 的操作不收。
    条是父 flex 行里可收缩的一项（min-width: 0），父容器给多少空间就按多少折叠。
  - 方向键在按钮之间移动焦点。
-->
<template>
  <div
    v-if="items.length > 0"
    ref="rootRef"
    class="oc-action-bar"
    :class="[`oc-action-bar--${orientation}`, { 'oc-action-bar--fit': overflow === 'fit' }]"
    role="toolbar"
    :aria-orientation="orientation"
    data-tooltip-group
    @keydown="moveFocus"
  >
    <template v-for="item in folded.visible" :key="itemKey(item)">
      <span v-if="typeof item === 'string'" class="oc-action-bar__text" :data-index="items.indexOf(item)">
        {{ item }}
      </span>
      <span v-else-if="item.type === 'divider'" class="oc-action-bar__divider" role="separator"
        :data-index="items.indexOf(item)" />
      <OcActionButton
        v-else
        :data-index="items.indexOf(item)"
        :data-action-key="item.key"
        :action="item"
        :appearance="appearance"
        :size="size"
        :icon-size="iconSize"
        :variant="item.active ? 'soft' : variant"
        :active="item.active"
        :aria-pressed="item.active"
        @select="emit('select', $event)"
      />
    </template>
    <OcActionButton
      v-if="folded.overflow.length > 0"
      :data-action-key="moreAction.key"
      :action="moreAction"
      :size="size"
      :icon-size="iconSize"
      :variant="variant"
      @select="emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { OcIconSize } from '../base/OcIcon.vue'
import type {
  ActionButtonSize,
  ActionButtonVariant,
  OcActionBarItem,
  OcActionDefinition,
  OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
import { foldActionBar, isFoldableAction } from '../../shared/ui/action/actionBar'
import OcActionButton from './OcActionButton.vue'

defineOptions({ name: 'OcActionBar' })

const props = withDefaults(defineProps<{
  items: readonly OcActionBarItem[]
  orientation?: 'horizontal' | 'vertical'
  appearance?: 'icon' | 'text'
  overflow?: 'fit' | 'none'
  size?: ActionButtonSize
  iconSize?: OcIconSize
  variant?: ActionButtonVariant
}>(), {
  orientation: 'horizontal',
  appearance: 'icon',
  overflow: 'fit',
  size: 'sm',
  iconSize: 'action',
  variant: 'ghost',
})

const emit = defineEmits<{
  select: [payload: OcActionSelectPayload]
}>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string) => string)
  | undefined

const rootRef = ref<HTMLElement | null>(null)
const keep = ref(Number.POSITIVE_INFINITY)
const folded = computed(() => foldActionBar(props.items, keep.value))
const moreAction = computed<OcActionDefinition>(() => ({
  key: '__oc-action-bar-more__',
  icon: 'mdiDotsHorizontal',
  title: translate?.('app.menu.moreActions') ?? 'More actions',
  children: folded.value.overflow,
}))

function itemKey(item: OcActionBarItem): string {
  return typeof item === 'string' ? `text:${props.items.indexOf(item)}` : item.key
}

/**
 * 先全部摆出来：此时条被父容器压缩，clientWidth 就是可用空间，各项尺寸也都量得到；
 * 再挑出放得下的最多可收项。整个过程在同一帧里完成，不会闪一下全量。
 */
async function measure(): Promise<void> {
  const root = rootRef.value
  if (props.overflow !== 'fit' || !root) return
  keep.value = Number.POSITIVE_INFINITY
  await nextTick()
  const horizontal = props.orientation === 'horizontal'
  const available = horizontal ? root.clientWidth : root.clientHeight
  const style = getComputedStyle(root)
  const gap = Number.parseFloat(horizontal ? style.columnGap : style.rowGap) || 0
  const sizes = new Map<number, number>()
  for (const child of root.children) {
    const rect = child.getBoundingClientRect()
    sizes.set(Number((child as HTMLElement).dataset.index), horizontal ? rect.width : rect.height)
  }
  // 不用 scrollWidth：条靠末端对齐，溢出落在起始一侧，不计入可滚动范围。
  const content = [...sizes.values()].reduce((total, size) => total + size, 0) + gap * (sizes.size - 1)
  if (content <= available) return
  // 「更多」是方形图标按钮：边长取条的另一个方向。
  const moreSize = horizontal ? root.clientHeight : root.clientWidth
  const foldable = props.items.filter(isFoldableAction).length
  for (let candidate = foldable - 1; candidate >= 0; candidate -= 1) {
    const visible = foldActionBar(props.items, candidate).visible
    const used = visible.reduce((total, item) => total + (sizes.get(props.items.indexOf(item)) ?? 0), 0)
      + moreSize + gap * visible.length
    if (used <= available || candidate === 0) {
      keep.value = candidate
      return
    }
  }
}

let observer: ResizeObserver | null = null
let measuredParentSize = ''
const sizeOf = (element: HTMLElement) => `${element.clientWidth}x${element.clientHeight}`
onMounted(() => {
  const parent = rootRef.value?.parentElement
  if (props.overflow !== 'fit' || !parent || typeof ResizeObserver === 'undefined') return
  // 折叠本身可能改变父容器尺寸：只在尺寸不是自己量完后留下的那个时才重量，免得来回震荡。
  observer = new ResizeObserver(() => {
    if (sizeOf(parent) !== measuredParentSize) void measure().then(() => nextTick()).then(() => { measuredParentSize = sizeOf(parent) })
  })
  observer.observe(parent)
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => props.items, () => { void measure() })

function moveFocus(event: KeyboardEvent): void {
  const forward = props.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const backward = props.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  if (event.key !== forward && event.key !== backward) return
  const buttons = [...rootRef.value?.querySelectorAll<HTMLButtonElement>('.oc-action-button > button:not(:disabled)') ?? []]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  buttons[(index + (event.key === forward ? 1 : -1) + buttons.length) % buttons.length]?.focus()
}
</script>

<style scoped>
.oc-action-bar {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--oc-space-2xs);
}

.oc-action-bar--vertical {
  flex-direction: column;
}

.oc-action-bar > * {
  flex: 0 0 auto;
}

/* 可收缩：父容器压缩时条变窄，measure 才量得到可用空间。 */
.oc-action-bar--fit {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.oc-action-bar__text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--oc-size-sm);
  min-height: var(--oc-size-sm);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.oc-action-bar__divider {
  flex: 0 0 auto;
  background: var(--oc-border-muted);
}

.oc-action-bar--horizontal .oc-action-bar__divider {
  width: var(--oc-border-width);
  height: var(--oc-size-sm);
}

.oc-action-bar--vertical .oc-action-bar__divider {
  width: var(--oc-size-sm);
  height: var(--oc-border-width);
}
</style>
