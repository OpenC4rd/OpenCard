<!-- 递归菜单：每层的子菜单是一个 marker，同组换分支只换锚点 —— 宿主不动、内容硬切、位置滑过去。 -->
<template>
  <div
    ref="menuElement"
    class="oc-action-menu"
    role="menu"
    @pointerenter="keepMenuOpen"
    @pointerleave="releaseMenu"
    @focusin="keepMenuOpen"
    @focusout="releaseMenu"
  >
    <template v-for="entry in actions" :key="entry.key">
      <div
        v-if="isActionDivider(entry)"
        class="oc-action-menu__divider"
        role="separator"
      />
      <div
        v-else
        class="oc-action-menu__item"
        :class="{
          'is-disabled': entry.disabled === true,
          'has-children': hasActionChildren(entry),
        }"
        @pointerenter="handleBranchPointerEnter(entry)"
        @pointerleave="handleBranchPointerLeave(entry)"
        @focusin="handleBranchFocusIn(entry)"
        @focusout="handleBranchFocusOut(entry)"
      >
        <button
          :ref="(element) => setBranchAnchor(entry.key, element)"
          type="button"
          class="oc-action-menu__button"
          :data-oc-action-key="entry.key"
          :disabled="entry.disabled === true"
          role="menuitem"
          :aria-label="accessibleActionLabel(entry)"
          :aria-haspopup="hasActionChildren(entry) ? 'menu' : undefined"
          :aria-expanded="hasActionChildren(entry) ? openBranch === entry.key : undefined"
          @click.stop="handleActionClick(entry)"
          @keydown="handleActionKeydown($event, entry)"
        >
          <span v-if="entry.thumbnailStyle" class="oc-action-menu__thumbnail"
            :class="{ 'oc-project-icon': isProjectIconStyle(entry.thumbnailStyle) }"
            :style="entry.thumbnailStyle" role="img"
            :aria-label="entry.thumbnailLabel ?? entry.title ?? entry.key" />
          <OcIcon
            v-else-if="entry.icon"
            :name="entry.icon"
            :tone="entry.iconTone"
            size="md"
            class="oc-action-menu__icon"
          />
          <span v-else class="oc-action-menu__icon-spacer" />
          <OcInlineMarkup class="oc-action-menu__label" :source="entry.title ?? entry.key"
            :data-tooltip="entry.title ?? entry.key" data-tooltip-overflow />
          <span v-if="hasActionBadge(entry.badge)" class="oc-number-badge" aria-hidden="true">
            {{ formatActionBadge(entry.badge) }}
          </span>
          <OcShortcut v-if="entry.shortcut?.length" :parts="entry.shortcut" decorative />
          <OcIcon
            v-if="hasActionChildren(entry)"
            name="mdiArrowRight"
            size="md"
            class="oc-action-menu__caret"
          />
        </button>

      </div>
    </template>

    <!--
      子层：组名由这一层的 overlayKey 拼出来。同一层的所有子项共享这一个组，
      在分支之间移动只是同一个 marker 换锚点，宿主原地滑过去；不同菜单的 overlayKey 不同，子组天然隔离。
    -->
    <OcOverlayMarker
      ref="sublayer"
      :group="sublayerGroup"
      :anchor="sublayerAnchor"
      :owner="menuElement"
      placement="right-start"
      :max-height="480"
      @close="handleSublayerDismissed"
    >
      <OcActionMenu
        v-if="openBranchAction"
        :key="openBranchAction.key"
        :ref="(element) => setSublayerMenu(element)"
        :actions="childActions"
        :overlay-key="sublayerGroup"
        :on-select="props.onSelect"
        @close="closeSublayer"
        @pointerenter="keepMenuOpen"
        @focusin="keepMenuOpen"
      />
    </OcOverlayMarker>
  </div>
</template>

<script lang="ts">
export type {
  OcActionDefinition,
  OcActionDivider,
  OcActionMenuEntry,
  OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
</script>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
  type ComponentPublicInstance,
} from 'vue'
import { actionChildren, hasActionChildren } from '../../shared/ui/action/action.types'
import type {
  OcActionDefinition,
  OcActionDivider,
  OcActionMenuEntry,
} from '../../shared/ui/action/action.types'
import OcIcon from '../base/OcIcon.vue'
import { inlineMarkupToText } from '../../shared/ui/inline-markup/inlineMarkup'
import { isProjectIconStyle } from '../../shared/ui/visual/projectIconStyle'
import OcInlineMarkup from './OcInlineMarkup.vue'
import OcOverlayMarker from './OcOverlayMarker.vue'
import OcShortcut from './OcShortcut.vue'
import { actionAccessibleLabel, formatActionBadge, hasActionBadge } from './actionBadge'
import { isFocusOpenSuppressed, withFocusOpenSuppressed, type OverlayAnchor } from '../../composables/overlayGroups'

defineOptions({ name: 'OcActionMenu' })

/** 指针在分支和子层之间穿过的余量：离开后等这么久再收。 */
const CLOSE_DELAY_MS = 90
/** 子层的组名 = 这一层的 overlayKey 加这个后缀；后缀同时是「这一层在别人的宿主里」的判据。 */
const SUBLAYER_SUFFIX = '/sub'

interface MenuLayerHandle {
  open(): void
  close(): void
}

interface MenuContentHandle {
  focusFirst(): void
}

const props = defineProps<{
  actions: readonly OcActionMenuEntry[]
  overlayKey: string
  onSelect?: (key: string) => void
}>()

const emit = defineEmits<{
  /**
   * 请求关掉自己所在的那一层：根层归调用方关，子层归打开它的父层关（那一层的 marker 归父层所有）。
   * restoreFocus: 按键收层时把焦点还给打开这一层的分支按钮；指针离开导致的关闭不抢焦点。
   */
  close: [restoreFocus: boolean]
}>()

const menuElement = ref<HTMLElement | null>(null)
const sublayer = ref<MenuLayerHandle | null>(null)
const sublayerMenu = shallowRef<MenuContentHandle | null>(null)
const branchAnchors = reactive(new Map<string, HTMLElement>())

/** 这一层是被父层打开的子菜单：自己离开就收；根层收不收归调用方。 */
const isSubmenu = computed(() => props.overlayKey.endsWith(SUBLAYER_SUFFIX))
const sublayerGroup = computed(() => `${props.overlayKey}${SUBLAYER_SUFFIX}`)

/** 当前展开的分支：同一时刻最多一个子层，换分支不换组。 */
const openBranch = ref<string | null>(null)
const openBranchAction = computed<OcActionDefinition | null>(() => {
  const branch = openBranch.value
  if (!branch) return null
  const action = props.actions.find((entry): entry is OcActionDefinition => (
    !isActionDivider(entry) && entry.key === branch
  ))
  return action && action.disabled !== true && hasActionChildren(action) ? action : null
})
const childActions = computed<readonly OcActionMenuEntry[]>(() => (
  openBranchAction.value ? actionChildren(openBranchAction.value) : []
))

/**
 * 锚点是「当前展开分支的那个按钮」。
 * 每次换分支都返回一个新函数，marker 才会把新锚点推进组里让宿主滑过去；
 * 函数锚点让 autoUpdate 每次重算都拿到按钮的当前矩形，菜单自己滚动也不会错位。
 */
const sublayerAnchor = computed<OverlayAnchor>(() => {
  const branch = openBranch.value
  return () => (branch ? branchAnchors.get(branch)?.getBoundingClientRect() ?? null : null)
})

/** 打开中的子层，指针离开分支后留的过渡时间。 */
let branchCloseTimer: number | null = null
/** 这一层自己（子菜单）在指针或焦点离开整层后的延迟关闭。 */
let layerCloseTimer: number | null = null
/** ArrowRight 请求把焦点放进子层：子层要等宿主挂上内容才存在，所以等到它出现再聚焦。 */
let focusSublayerOnMount = false

function isActionDivider(entry: OcActionMenuEntry): entry is OcActionDivider {
  return entry.type === 'divider'
}

function setBranchAnchor(key: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) branchAnchors.set(key, element)
  else branchAnchors.delete(key)
}

function setSublayerMenu(element: Element | ComponentPublicInstance | null): void {
  sublayerMenu.value = element && '$el' in element ? element as ComponentPublicInstance & MenuContentHandle : null
}

function cancelBranchClose(): void {
  if (branchCloseTimer === null) return
  window.clearTimeout(branchCloseTimer)
  branchCloseTimer = null
}

function cancelLayerClose(): void {
  if (layerCloseTimer === null) return
  window.clearTimeout(layerCloseTimer)
  layerCloseTimer = null
}

function scheduleBranchClose(branch: string): void {
  cancelBranchClose()
  branchCloseTimer = window.setTimeout(() => {
    branchCloseTimer = null
    // 期间换了分支就不再是这个待关闭的分支了。
    if (openBranch.value === branch) closeSublayer(false)
  }, CLOSE_DELAY_MS)
}

function scheduleLayerClose(): void {
  cancelLayerClose()
  layerCloseTimer = window.setTimeout(() => {
    layerCloseTimer = null
    emit('close', false)
  }, CLOSE_DELAY_MS)
}

/** 指针或焦点回到这一层、或落进它打开的子层：两个待关闭都作废（父链同理，逐层撤销）。 */
function keepMenuOpen(): void {
  cancelLayerClose()
  cancelBranchClose()
}

/** 指针或焦点离开整层：只有子菜单自己收；根层什么时候收归调用方。 */
function releaseMenu(event: Event): void {
  if (!isSubmenu.value) return
  const next = event instanceof FocusEvent ? event.relatedTarget : null
  if (next instanceof Node && menuElement.value?.contains(next)) return
  scheduleLayerClose()
}

/**
 * 子层跟着「当前展开的分支」走：换分支组不重建，宿主还在原位，只把新锚点推进去；
 * 分支没了（或没有可展开的子项）就收掉。post-flush：这时模板已经把新 anchor 交给 marker。
 */
watch(openBranchAction, action => {
  if (action) {
    sublayer.value?.open()
    return
  }
  // 展开中的分支被换掉（父级条目整组更新）：状态跟着收，别留一个指向不存在分支的展开项。
  if (openBranch.value) openBranch.value = null
  sublayer.value?.close()
}, { flush: 'post' })

watch(sublayerMenu, menu => {
  if (!menu || !focusSublayerOnMount) return
  focusSublayerOnMount = false
  menu.focusFirst()
})

function openBranchLayer(branch: string): void {
  cancelBranchClose()
  openBranch.value = branch
}

/** 收掉子层。restoreFocus：焦点原本在按键上，收完要还给打开它的分支。 */
function closeSublayer(restoreFocus: boolean): void {
  const branch = openBranch.value
  if (!branch) return
  cancelBranchClose()
  cancelLayerClose()
  openBranch.value = null
  sublayer.value?.close()
  if (!restoreFocus) return
  void nextTick(() => {
    // 程序化回焦到分支会触发它的 focusin，不抑制就会把刚收起的子层又打开。
    withFocusOpenSuppressed(() => branchAnchors.get(branch)?.focus())
  })
}

/** 子层被宿主收掉（抢占或它自己的 close）：这一层不再认为有展开的分支。 */
function handleSublayerDismissed(): void {
  cancelBranchClose()
  openBranch.value = null
}

function focusSublayerFirst(): void {
  const menu = sublayerMenu.value
  if (!menu) {
    focusSublayerOnMount = true
    return
  }
  focusSublayerOnMount = false
  menu.focusFirst()
}

/** ArrowRight：打开分支并聚焦子层第一项；子层内容这一帧才换，所以等渲染完再聚焦。 */
function openBranchWithFocus(branch: string): void {
  openBranchLayer(branch)
  void nextTick(focusSublayerFirst)
}

function handleBranchPointerEnter(action: OcActionDefinition): void {
  if (hasActionChildren(action)) openBranchLayer(action.key)
}

function handleBranchPointerLeave(action: OcActionDefinition): void {
  if (hasActionChildren(action)) scheduleBranchClose(action.key)
}

function handleBranchFocusIn(action: OcActionDefinition): void {
  // 程序化回焦到分支时不要顺手把刚收起的子层再打开。
  if (isFocusOpenSuppressed()) return
  if (hasActionChildren(action)) openBranchLayer(action.key)
}

function handleBranchFocusOut(action: OcActionDefinition): void {
  if (hasActionChildren(action)) scheduleBranchClose(action.key)
}

function handleActionClick(action: OcActionDefinition): void {
  if (!hasActionChildren(action) && action.disabled !== true) {
    props.onSelect?.(action.key)
  }
}

function accessibleActionLabel(action: OcActionDefinition): string {
  return actionAccessibleLabel(inlineMarkupToText(action.title ?? action.key), action.badgeLabel)
}

function enabledButtons(): HTMLButtonElement[] {
  return Array.from(menuElement.value?.querySelectorAll<HTMLButtonElement>(
    ':scope > .oc-action-menu__item > .oc-action-menu__button:not(:disabled)',
  ) ?? [])
}

function focusFirst(): void {
  enabledButtons()[0]?.focus()
}

defineExpose({ focusFirst })

function moveFocus(current: HTMLButtonElement, direction: -1 | 1): void {
  const buttons = enabledButtons()
  const currentIndex = buttons.indexOf(current)
  if (currentIndex < 0 || buttons.length === 0) return
  buttons[(currentIndex + direction + buttons.length) % buttons.length]?.focus()
}

/** ArrowLeft：先收掉自己打开的子层，没有子层就把自己这一层交还给父层。 */
function collapse(): void {
  if (openBranch.value) {
    closeSublayer(true)
    return
  }
  if (!isSubmenu.value) return
  emit('close', true)
}

function handleActionKeydown(event: KeyboardEvent, action: OcActionDefinition): void {
  const target = event.currentTarget
  if (!(target instanceof HTMLButtonElement)) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocus(target, event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    const buttons = enabledButtons()
    buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus()
  } else if (event.key === 'ArrowRight' && hasActionChildren(action)) {
    event.preventDefault()
    openBranchWithFocus(action.key)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    collapse()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    // 关掉的是自己这一层，它的子层随内容和宿主一起收走。
    emit('close', true)
  }
}

onBeforeUnmount(() => {
  cancelBranchClose()
  cancelLayerClose()
  // 这一层没了，它打开的子层不能留在自己的组宿主里变成空面板。
  sublayer.value?.close()
})
</script>

<style>
.oc-action-menu {
  position: static;
  box-sizing: border-box;
  min-width: 156px;
  max-height: inherit;
  padding: 3px;
  overflow-y: auto;
}

.oc-action-menu__item {
  position: relative;
}

.oc-action-menu__divider {
  height: 1px;
  margin: 3px var(--oc-space-xs);
  background: var(--oc-border-muted);
}

.oc-action-menu__button {
  width: 100%;
  height: var(--oc-size-md);
  padding: 0 var(--oc-space-sm);
  border: 0;
  border-radius: var(--oc-radius-control);
  background: transparent;
  color: var(--oc-fg-default);
  font: inherit;
  display: flex;
  align-items: center;
  gap: var(--oc-space-xs);
  cursor: pointer;
  text-align: left;
}

.oc-action-menu__button:hover:not(:disabled),
.oc-action-menu__button:focus-visible {
  background-image: var(--oc-overlay-hover);
  outline: none;
}

.oc-action-menu__button:disabled {
  opacity: var(--oc-opacity-disabled);
  cursor: not-allowed;
}

.oc-action-menu__icon,
.oc-action-menu__icon-spacer,
.oc-action-menu__thumbnail,
.oc-action-menu__caret {
  flex: 0 0 auto;
}

.oc-action-menu__thumbnail {
  display: inline-block;
  font-size: var(--oc-icon-size-md);
  background-repeat: no-repeat;
}

.oc-action-menu__icon-spacer {
  width: var(--oc-size-sm);
  height: var(--oc-size-sm);
}

.oc-action-menu__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
