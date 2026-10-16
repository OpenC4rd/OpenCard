<template>
  <Teleport :to="overlayRoot">
    <Transition name="oc-floating-layer-fade" appear>
      <div
        v-if="open && anchor"
        ref="floatingRef"
        class="oc-floating-layer"
        :style="layerStyle"
        :data-placement="resolvedPlacement"
        v-bind="$attrs"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch, type CSSProperties } from 'vue'
import { isOverlayRootActive, registerOverlayOwner, resolveOverlayRoot } from '../../shared/ui/overlayScope'
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  type Placement,
  type ReferenceElement,
  type VirtualElement,
} from '@floating-ui/vue'

defineOptions({
  name: 'OcFloatingLayer',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  open: boolean
  anchor: HTMLElement | DOMRect | null
  owner?: HTMLElement | null
  placement?: Placement
  gap?: number
  viewportPadding?: number
  matchAnchorWidth?: boolean
  maxHeight?: number
}>(), {
  placement: 'bottom-start',
  gap: 4,
  viewportPadding: 8,
  matchAnchorWidth: false,
  maxHeight: 320,
})


const floatingRef = ref<HTMLElement | null>(null)
watch([floatingRef, () => props.owner ?? (props.anchor instanceof HTMLElement ? props.anchor : null)], ([root, owner], _, cleanup) => {
  if (root && owner) cleanup(registerOverlayOwner(root, owner))
}, { flush: 'post' })
const overlayRoot = computed(() => resolveOverlayRoot(props.owner ?? (props.anchor instanceof HTMLElement ? props.anchor : null)))
const anchorRef = computed<ReferenceElement | null>(() => {
  const anchor = props.anchor
  if (!anchor || anchor instanceof HTMLElement) {
    return anchor
  }

  const virtualAnchor: VirtualElement = {
    getBoundingClientRect: () => anchor,
  }
  return virtualAnchor
})
const openRef = toRef(props, 'open')
const middleware = computed(() => [
  offset(props.gap),
  flip({ padding: props.viewportPadding }),
  shift({ padding: props.viewportPadding }),
  size({
    padding: props.viewportPadding,
    apply({ availableHeight, rects, elements }) {
      Object.assign(elements.floating.style, {
        width: props.matchAnchorWidth ? `${rects.reference.width}px` : '',
        maxHeight: `${Math.max(0, Math.min(props.maxHeight, availableHeight))}px`,
      })
    },
  }),
])

const { floatingStyles, isPositioned, placement: resolvedPlacement } = useFloating(anchorRef, floatingRef, {
  open: openRef,
  placement: toRef(props, 'placement'),
  strategy: 'fixed',
  middleware,
  whileElementsMounted: autoUpdate,
})

const layerStyle = computed<CSSProperties>(() => ({
  ...floatingStyles.value,
  visibility: isPositioned.value && isOverlayRootActive(overlayRoot.value) ? 'visible' : 'hidden',
}))
</script>

<style scoped>
.oc-floating-layer {
  z-index: var(--oc-z-popover);
  box-sizing: border-box;
  color: var(--oc-fg-default);
  background-color: var(--oc-bg-surface);
  background-clip: padding-box;
  border-radius: var(--oc-floating-layer-radius, var(--oc-radius-control));
  isolation: isolate;
}

.oc-floating-layer-fade-enter-active,
.oc-floating-layer-fade-leave-active {
  transition: opacity var(--oc-duration-quick) var(--oc-ease);
}

.oc-floating-layer-fade-enter-from,
.oc-floating-layer-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .oc-floating-layer-fade-enter-active,
  .oc-floating-layer-fade-leave-active {
    transition: none;
  }
}
</style>

<style>
.oc-floating-layer--surface {
  border: 1px solid var(--oc-border-default);
  border-radius: var(--oc-floating-layer-radius, var(--oc-radius-control));
  background: var(--oc-bg-surface);
  box-shadow: var(--oc-shadow-lg);
}
</style>
