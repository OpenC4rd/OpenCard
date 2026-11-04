<!--
  操作条：把一组操作渲染成一排（或一列）按钮，选中时回报 key。

  - appearance：方形图标按钮，或以标题为文字的按钮。
  - overflow="fit"：放不下时从末尾往前收进「更多」；文字与 alwaysVisible 的操作不收。
    overflow 给数字时是固定预算，不测量：列表行这种数量多的地方用。
    条是父 flex 行里可收缩的一项（min-width: 0），父容器给多少空间就按多少折叠。
  - menubar：每一项都是一个菜单入口，点击开关、开着时悬停切换，同一时刻只有一个菜单。
  - 方向键在按钮之间移动焦点。
-->
<template>
  <div
    v-show="items.length > 0"
    ref="rootRef"
    class="oc-action-bar"
    :class="[`oc-action-bar--${orientation}`, {
      'oc-action-bar--fit': overflow === 'fit',
      'is-folded': folded.overflow.length > 0,
    }]"
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
      <OcMenubarButton
        v-else-if="menubar"
        :data-index="items.indexOf(item)"
        :data-action-key="item.key"
        :action="item"
        :size="size"
        :open="menus.openKey.value === item.key"
        @pointerenter="menus.hover(item.key)"
        @click="menus.toggle(item.key)"
      />
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
    <OcMenubarButton
      v-if="menubar && folded.overflow.length > 0"
      :data-action-key="moreAction.key"
      :action="moreAction"
      :size="size"
      :open="menus.openKey.value === moreAction.key"
      icon-only
      :aria-label="moreAction.title"
      @pointerenter="menus.hover(moreAction.key)"
      @click="menus.toggle(moreAction.key)"
    />
    <OcActionButton
      v-else-if="folded.overflow.length > 0"
      :data-action-key="moreAction.key"
      :action="moreAction"
      :size="size"
      :icon-size="iconSize"
      :variant="variant"
      @select="emit('select', $event)"
    />
    <OcOverlayMarker
      v-if="menubar"
      group="menu"
      :anchor="menus.anchor.value"
      :owner="rootRef"
      placement="bottom-start"
      :open="menus.isOpen.value"
      @update:open="open => { if (!open) menus.close() }"
    >
      <OcActionMenu v-if="menus.openMenu.value" :actions="actionChildren(menus.openMenu.value)" overlay-key="menu"
        :on-select="menus.select" @close="menus.close" />
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { OcIconSize } from '../base/OcIcon.vue'
import {
  actionChildren,
  type ActionButtonSize,
  type ActionButtonVariant,
  type OcActionBarItem,
  type OcActionDefinition,
  type OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
import { actionContains, budgetKeep, foldActionBar, isFoldableAction } from '../../shared/ui/action/actionBar'
import { useMenubar } from '../../shared/ui/action/useMenubar'
import OcActionButton from './OcActionButton.vue'
import OcActionMenu from './OcActionMenu.vue'
import OcMenubarButton from './OcMenubarButton.vue'
import OcOverlayMarker from './OcOverlayMarker.vue'

defineOptions({ name: 'OcActionBar' })

const props = withDefaults(defineProps<{
  items: readonly OcActionBarItem[]
  orientation?: 'horizontal' | 'vertical'
  appearance?: 'icon' | 'text'
  overflow?: 'fit' | 'none' | number
  menubar?: boolean
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
const folded = computed(() => foldActionBar(props.items,
  typeof props.overflow === 'number' ? budgetKeep(props.items, props.overflow) : keep.value))
const moreAction = computed<OcActionDefinition>(() => ({
  key: '__oc-action-bar-more__',
  icon: 'mdiDotsHorizontal',
  title: translate?.('app.menu.moreActions') ?? 'More actions',
  children: folded.value.overflow,
}))

const menus = useMenubar(() => rootRef.value, () => [
  ...folded.value.visible.filter(isAction),
  ...(folded.value.overflow.length > 0 ? [moreAction.value] : []),
], (menu, key) => emit('select', {
  key,
  rootKey: menu.key === moreAction.value.key
    ? folded.value.overflow.find(entry => actionContains(entry, key))?.key
    : menu.key,
}))

function isAction(item: OcActionBarItem): item is OcActionDefinition {
  return typeof item !== 'string' && item.type !== 'divider'
}

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
  // 与子项同用 getBoundingClientRect：clientWidth 取整后会比恰好放下的内容小一点，误判成放不下。
  const bounds = root.getBoundingClientRect()
  const available = (horizontal ? bounds.width : bounds.height) + 0.5
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
  const moreSize = horizontal ? bounds.height : bounds.width
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

async function refit(): Promise<void> {
  await measure()
  menus.closeIfGone()
}

let observer: ResizeObserver | null = null
let measuredParentSize = ''
const sizeOf = (element: HTMLElement) => `${element.clientWidth}x${element.clientHeight}`
onMounted(() => {
  const parent = rootRef.value?.parentElement
  if (props.overflow !== 'fit' || !parent || typeof ResizeObserver === 'undefined') return
  // 折叠本身可能改变父容器尺寸：只在尺寸不是自己量完后留下的那个时才重量，免得来回震荡。
  observer = new ResizeObserver(() => {
    if (sizeOf(parent) !== measuredParentSize) void refit().then(() => nextTick()).then(() => { measuredParentSize = sizeOf(parent) })
  })
  observer.observe(parent)
})
onBeforeUnmount(() => observer?.disconnect())
// 调用方常在模板里现拼数组：只有内容真的变了才重量。
const itemsSignature = computed(() => props.items
  .map(item => (isAction(item) ? `${item.key}:${item.title}` : typeof item === 'string' ? item : item.key)).join('\n'))
watch(itemsSignature, () => { void refit() })

function moveFocus(event: KeyboardEvent): void {
  const forward = props.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const backward = props.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  if (event.key !== forward && event.key !== backward) return
  const buttons = [...rootRef.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  const next = buttons[(index + (event.key === forward ? 1 : -1) + buttons.length) % buttons.length]
  next?.focus()
  if (next?.dataset.actionKey) menus.hover(next.dataset.actionKey)
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

/* 可收缩：父容器压缩时条变窄，measure 才量得到可用空间。不裁剪：按钮角上的徽标在盒子外面。 */
.oc-action-bar--fit {
  min-width: 0;
  min-height: 0;
}

/* 折叠的结果已经量过：不再被同一行的兄弟压窄，否则「更多」会盖到旁边的内容上。 */
.oc-action-bar--fit.is-folded {
  flex-shrink: 0;
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
