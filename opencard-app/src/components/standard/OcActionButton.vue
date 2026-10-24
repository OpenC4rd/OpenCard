<!-- Base action button: its menu is one marker in the shared "menu" group, so any other menu takes the host over. -->
<template>
  <div
    ref="rootRef"
    class="oc-action-button"
    :class="{
      'is-disabled': action.disabled === true,
      'is-menu-open': isMenuOpen,
      'has-children': hasActionChildren(action),
    }"
    v-bind="$attrs"
    @pointerleave="scheduleCloseMenu"
    @focusin="openMenu"
    @focusout="scheduleCloseMenu"
    @keydown="handleRootKeydown"
  >
    <OcButton
      :variant="variant"
      :size="size"
      :icon-size="iconSize"
      :active="active"
      icon-only
      :icon="action.icon"
      :icon-tone="action.iconTone"
      :data-tooltip="isMenuOpen ? null : actionTitleText(action) || null"
      :aria-label="actionAccessibleLabel(inlineMarkupToText(actionTitleText(action) ?? action.key), action.badgeLabel)"
      :aria-haspopup="hasActionChildren(action) ? 'menu' : undefined"
      :aria-expanded="hasActionChildren(action) ? isMenuOpen : undefined"
      :aria-pressed="props.ariaPressed"
      :tabindex="props.buttonTabindex"
      :disabled="action.disabled === true"
      @click.stop="handleButtonClick"
    />
    <span v-if="hasActionBadge(action.badge)" class="oc-number-badge oc-action-button__badge" aria-hidden="true">
      {{ formatActionBadge(action.badge) }}
    </span>

    <!--
      组名固定 "menu"：和标题栏菜单共用同一个宿主，全局同一时刻只有一个菜单。
      抢先打开时旧菜单收到 close（真正关闭），这里只跟 marker 的结果。
    -->
    <OcOverlayMarker
      ref="menuLayer"
      group="menu"
      :anchor="rootRef"
      :owner="rootRef"
      placement="bottom-end"
      :open="isMenuOpen"
      @update:open="isMenuOpen = $event"
      @close="handleMenuClosed"
    >
      <OcActionMenu
        :actions="actionChildren(props.action)"
        :overlay-key="overlayKey"
        :on-select="handleMenuSelect"
        @pointerenter="cancelCloseMenu"
        @focusin="cancelCloseMenu"
        @close="closeMenu"
      />
    </OcOverlayMarker>
  </div>
</template>

<script lang="ts">
export type {
  ActionButtonSize,
  ActionButtonVariant,
  OcActionDefinition,
  OcActionMenuEntry,
  OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
</script>

<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from 'vue'
import { actionChildren, hasActionChildren } from '../../shared/ui/action/action.types'
import OcButton from '../base/OcButton.vue'
import type { OcIconSize } from '../base/OcIcon.vue'
import { inlineMarkupToText } from '../../shared/ui/inline-markup/inlineMarkup'
import type {
  ActionButtonSize,
  ActionButtonVariant,
  OcActionDefinition,
  OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
import OcActionMenu from './OcActionMenu.vue'
import OcOverlayMarker from './OcOverlayMarker.vue'
import { useOverlayDismiss } from '../../shared/ui/useOverlayDismiss'
import { isFocusOpenSuppressed, withFocusOpenSuppressed } from '../../composables/overlayGroups'
import { actionAccessibleLabel, actionTitleText, formatActionBadge, hasActionBadge } from './actionBadge'

defineOptions({
  name: 'OcActionButton',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  action: OcActionDefinition
  size?: ActionButtonSize
  iconSize?: OcIconSize
  variant?: ActionButtonVariant
  active?: boolean
  ariaPressed?: boolean
  buttonTabindex?: number
}>(), {
  size: 'md',
  iconSize: 'action',
  variant: 'ghost',
  active: false,
  ariaPressed: undefined,
})

const emit = defineEmits<{
  select: [payload: OcActionSelectPayload]
}>()

/** 指针离开按钮后给菜单留的过渡时间。 */
const CLOSE_DELAY_MS = 90

const rootRef = ref<HTMLElement | null>(null)
const menuLayer = ref<{ open(): void; close(): void } | null>(null)
/** 只用来给这一份菜单的子层组名定位，不再参与任何注册表。 */
const overlayKey = `action-button:${useId()}`
/** 打开状态由 marker 同步上来：它既是渲染输入（aria / 图标），也是 marker 的打开意图。 */
const isMenuOpen = ref(false)
/** 点一次钉住：钉住期间指针离开也不收；再点一次或别处交互才收。 */
const isMenuPinned = ref(false)
let closeTimer: number | null = null

useOverlayDismiss(() => isMenuOpen.value, () => rootRef.value, () => closeMenu())

// 按钮被卸载（页面切换、行重键）时，它打开的那一层不能留在 "menu" 组里变成空面板。
onBeforeUnmount(() => {
  cancelCloseMenu()
  menuLayer.value?.close()
})

function cancelCloseMenu(): void {
  if (closeTimer === null) return
  window.clearTimeout(closeTimer)
  closeTimer = null
}

function scheduleCloseMenu(): void {
  if (isMenuPinned.value) return
  cancelCloseMenu()
  closeTimer = window.setTimeout(() => {
    closeTimer = null
    closeMenu()
  }, CLOSE_DELAY_MS)
}

function handleButtonClick(): void {
  if (props.action.disabled) return

  if (!hasActionChildren(props.action)) {
    emit('select', { key: props.action.key })
    return
  }

  if (isMenuPinned.value) {
    closeMenu()
    return
  }

  // 只钉住真的打开了的菜单：锚点还没挂上时不留一个「钉住但没菜单」的状态。
  isMenuPinned.value = openMenu()
}

function openMenu(): boolean {
  // 程序化回焦触发按钮时不要顺手把刚关掉的菜单再打开。
  if (isFocusOpenSuppressed()) return false
  if (props.action.disabled || !hasActionChildren(props.action) || !rootRef.value) return false
  cancelCloseMenu()
  isMenuOpen.value = true
  return true
}

/** 键盘收菜单：焦点还在菜单里，一收就掉到 body 上，还给触发按钮；Esc 只退这一层。 */
function handleRootKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isMenuOpen.value) return
  event.preventDefault()
  event.stopPropagation()
  closeMenu(true)
}

function closeMenu(restoreFocus = false): void {
  const returnFocus = restoreFocus && isMenuOpen.value
  cancelCloseMenu()
  isMenuPinned.value = false
  isMenuOpen.value = false
  if (!returnFocus) return
  withFocusOpenSuppressed(() => rootRef.value?.querySelector<HTMLElement>('.oc-button')?.focus())
}

/** 被别的菜单抢走 "menu" 组，或这一层自己关了：状态跟着 marker 走，钉住一并解除。 */
function handleMenuClosed(): void {
  cancelCloseMenu()
  isMenuOpen.value = false
  isMenuPinned.value = false
}

/** 选中：先收菜单再执行动作，动作自己带闭包，不依赖菜单还开着。 */
function handleMenuSelect(key: string): void {
  closeMenu()
  emit('select', { key })
}
</script>

<style>
.oc-action-button {
  position: relative;
  display: inline-flex;
}

.oc-action-button__badge {
  position: absolute;
  z-index: 1;
  top: calc(-1 * var(--oc-space-2xs));
  right: calc(-1 * var(--oc-space-2xs));
}

.oc-action-button .oc-button__icon {
  transform-origin: center;
  transition: transform var(--oc-duration-quick) var(--oc-ease);
}

.oc-action-button.is-menu-open .oc-button__icon {
  transform: rotate(45deg);
}
</style>
