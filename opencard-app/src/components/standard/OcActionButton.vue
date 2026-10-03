<!-- Base action button: top-level children open on click/focus; nested menu items own hover behavior. -->
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
  >
    <!-- An action with children opens its own labelled menu on hover/focus, so a trigger tooltip
         would only cover the menu it belongs to. -->
    <OcButton
      :variant="variant"
      :size="size"
      :icon-size="iconSize"
      :active="active"
      icon-only
      :icon="action.icon"
      :icon-tone="action.iconTone"
      :data-tooltip="hasActionChildren(action) ? null : actionTitleText(action) || null"
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
    <OcFloatingLayer
      v-if="isMenuOpen && hasActionChildren(action)"
      :open="true"
      :anchor="rootRef"
      placement="bottom-end"
      :gap="0"
      :max-height="480"
      class="oc-action-button__floating oc-floating-layer--surface"
      :data-oc-action-menu-branch="menuBranchId"
      @pointerenter="cancelCloseMenu"
      @pointerleave="scheduleCloseMenu"
    >
      <OcActionMenu
        v-if="hasActionChildren(action)"
        :actions="action.children"
        :branch-id="menuBranchId"
        @select="handleMenuSelect"
        @dismiss="closeMenu"
        @keep-open="cancelCloseMenu"
      />
    </OcFloatingLayer>
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
import OcButton from '../base/OcButton.vue'
import type { OcIconSize } from '../base/OcIcon.vue'
import { inlineMarkupToText } from '../../shared/ui/inline-markup/inlineMarkup'
import OcActionMenu, {
  isActionMenuBranchEvent,
} from './OcActionMenu.vue'
import type {
  ActionButtonSize,
  ActionButtonVariant,
  OcActionDefinition,
  OcActionMenuEntry,
  OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
import OcFloatingLayer from './OcFloatingLayer.vue'
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

const rootRef = ref<HTMLElement | null>(null)
const menuBranchId = useId()
const isMenuOpen = ref(false)
const isMenuPinned = ref(false)
let closeTimer: number | null = null
let listeningForOutsidePointer = false

onBeforeUnmount(() => {
  cancelCloseMenu()
  stopListeningForOutsidePointer()
})

function handleButtonClick(): void {
  if (props.action.disabled) {
    return
  }

  if (hasActionChildren(props.action)) {
    if (isMenuPinned.value) {
      closeMenu()
      return
    }
    isMenuPinned.value = true
    startListeningForOutsidePointer()
    openMenu()
    return
  }

  emit('select', { key: props.action.key })
}

function handleMenuSelect(payload: OcActionSelectPayload): void {
  closeMenu()
  emit('select', payload)
}

function openMenu(): void {
  if (props.action.disabled || !hasActionChildren(props.action) || !rootRef.value) {
    return
  }

  cancelCloseMenu()
  isMenuOpen.value = true
}

function scheduleCloseMenu(): void {
  if (isMenuPinned.value) return
  cancelCloseMenu()
  closeTimer = window.setTimeout(() => {
    closeMenu()
  }, 90)
}

function cancelCloseMenu(): void {
  if (closeTimer === null) {
    return
  }

  window.clearTimeout(closeTimer)
  closeTimer = null
}

function closeMenu(): void {
  cancelCloseMenu()
  isMenuPinned.value = false
  isMenuOpen.value = false
  stopListeningForOutsidePointer()
}

function startListeningForOutsidePointer(): void {
  if (listeningForOutsidePointer) return
  listeningForOutsidePointer = true
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
}

function stopListeningForOutsidePointer(): void {
  if (!listeningForOutsidePointer) return
  listeningForOutsidePointer = false
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isMenuPinned.value) return
  const path = event.composedPath()
  const isInsideTrigger = rootRef.value ? path.includes(rootRef.value) : false
  const isInsideActionMenu = isActionMenuBranchEvent(event, menuBranchId)
  if (!isInsideTrigger && !isInsideActionMenu) closeMenu()
}

function hasActionChildren(
  action: OcActionDefinition,
): action is OcActionDefinition & { children: readonly OcActionMenuEntry[] } {
  return Array.isArray(action.children) && action.children.length > 0
}
</script>

<style>
.oc-action-button {
  position: relative;
  display: inline-flex;
}

.oc-action-button__floating {
  overflow: visible;
}

.oc-action-button__badge {
  position: absolute;
  z-index: 1;
  top: calc(-1 * var(--oc-space-1));
  right: calc(-1 * var(--oc-space-1));
}

.oc-action-button .oc-button__icon {
  transform-origin: center;
  transition: transform var(--oc-duration-fast) var(--oc-ease);
}

.oc-action-button.is-menu-open .oc-button__icon {
  transform: rotate(45deg);
}
</style>
