<!-- UI 浮动菜单宿主：承载全局菜单语义与打开态关闭策略，几何定位交给 OcFloatingLayer。 -->
<template>
  <OcFloatingLayer
    :open="state.isOpen && Boolean(menuAnchor)"
    :anchor="menuAnchor"
    :placement="state.placement"
    class="floating-menu-surface oc-floating-layer--surface"
    :data-oc-action-menu-branch="menuBranchId"
    @pointerdown.stop
  >
    <OcActionMenu
      ref="menuRef"
      :actions="state.items"
      :branch-id="menuBranchId"
      @select="selectMenuItem($event.key)"
      @dismiss="closeMenu"
    />
  </OcFloatingLayer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import OcActionMenu, { isActionMenuBranchEvent } from '../standard/OcActionMenu.vue'
import OcFloatingLayer from '../standard/OcFloatingLayer.vue'
import { useFloatingMenu } from '../../composables/useFloatingMenu'

defineOptions({ name: 'FloatingMenuHost' })

const { state, closeMenu: closeFloatingMenu, selectMenuItem } = useFloatingMenu()
const menuRef = ref<InstanceType<typeof OcActionMenu> | null>(null)
const menuBranchId = useId()
const menuAnchor = computed(() => state.value.anchor)
const MENU_POINTER_GRACE_DISTANCE = 24
const MENU_POINTER_CLOSE_DELAY = 180
let pointerCloseTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => [state.value.isOpen, state.value.focusOnOpen] as const,
  async ([isOpen, focusOnOpen]) => {
    if (!isOpen || !focusOnOpen) return
    await nextTick()
    menuRef.value?.focusFirst()
  },
)
function handlePointerDown(event: PointerEvent): void {
  if (isActionMenuBranchEvent(event, menuBranchId)) return
  closeMenu()
}

function closeMenu(): void {
  cancelPointerClose()
  closeFloatingMenu()
}

function distanceToRect(x: number, y: number, rect: DOMRect): number {
  const deltaX = Math.max(rect.left - x, 0, x - rect.right)
  const deltaY = Math.max(rect.top - y, 0, y - rect.bottom)
  return Math.hypot(deltaX, deltaY)
}

function cancelPointerClose(): void {
  if (pointerCloseTimer === null) return
  clearTimeout(pointerCloseTimer)
  pointerCloseTimer = null
}

function schedulePointerClose(): void {
  if (pointerCloseTimer !== null) return
  pointerCloseTimer = setTimeout(() => {
    pointerCloseTimer = null
    closeMenu()
  }, MENU_POINTER_CLOSE_DELAY)
}

function handleWindowPointerMove(event: PointerEvent): void {
  if (!state.value.isOpen) {
    cancelPointerClose()
    return
  }
  const surfaces = document.querySelectorAll<HTMLElement>(
    '.floating-menu-surface, .oc-action-menu__floating',
  )
  const isNearMenu = Array.from(surfaces).some(surface => (
    distanceToRect(event.clientX, event.clientY, surface.getBoundingClientRect())
      <= MENU_POINTER_GRACE_DISTANCE
  ))
  if (isNearMenu) cancelPointerClose()
  else schedulePointerClose()
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !state.value.isOpen) {
    return
  }

  event.preventDefault()
  closeMenu()
}

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('keydown', handleWindowKeydown)
  cancelPointerClose()
})
</script>

<style>
.floating-menu-surface {
  --oc-floating-layer-radius: var(--oc-radius-md);
}
</style>
