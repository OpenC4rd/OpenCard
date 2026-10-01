<template>
  <OcCard class="oc-overlay-toolbar" :class="`oc-overlay-toolbar--${orientation}`"
    variant="glass" role="toolbar" :aria-label="label">
    <div class="oc-overlay-toolbar__items">
      <template v-if="props.items">
        <template v-for="(item, index) in props.items" :key="typeof item === 'string' ? `${item}-${index}` : item.key">
          <span v-if="typeof item === 'string'" class="oc-overlay-toolbar__text">
            {{ item }}
          </span>
          <span v-else-if="item.type === 'divider'" class="oc-overlay-toolbar__divider" role="separator" />
          <OcActionButton
            v-else
            :action="item"
            :size="item.size ?? props.itemSize"
            :icon-size="item.iconSize ?? props.itemIconSize"
            :variant="item.variant ?? props.itemVariant"
            :active="item.active"
            :aria-pressed="item.ariaPressed ?? item.active"
            @select="emit('select', $event)"
          />
        </template>
      </template>
      <slot v-else />
    </div>
  </OcCard>
</template>

<script lang="ts">
export type {
  OcOverlayToolbarAction,
  OcOverlayToolbarItem,
  OcViewportToolbarLabels,
} from './overlayToolbarItems'
</script>

<script setup lang="ts">
import OcActionButton from './OcActionButton.vue'
import OcCard from './OcCard.vue'
import type { OcIconSize } from '../base/OcIcon.vue'
import type {
  ActionButtonSize,
  ActionButtonVariant,
  OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
import type { OcOverlayToolbarItem } from './overlayToolbarItems'

const props = withDefaults(defineProps<{
  orientation?: 'horizontal' | 'vertical'
  label?: string
  items?: readonly OcOverlayToolbarItem[]
  itemSize?: ActionButtonSize
  itemIconSize?: OcIconSize
  itemVariant?: ActionButtonVariant
}>(), {
  orientation: 'horizontal',
  label: undefined,
  items: undefined,
  itemSize: 'sm',
  itemIconSize: 'action',
  itemVariant: 'ghost',
})

const emit = defineEmits<{
  select: [payload: OcActionSelectPayload]
}>()
</script>

<style scoped>
.oc-overlay-toolbar {
  pointer-events: auto;
}

.oc-overlay-toolbar__items {
  display: flex;
  align-items: center;
  gap: var(--oc-space-1);
}

.oc-overlay-toolbar--horizontal .oc-overlay-toolbar__items {
  flex-direction: row;
}

.oc-overlay-toolbar--vertical .oc-overlay-toolbar__items {
  flex-direction: column;
}

.oc-overlay-toolbar__text {
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

.oc-overlay-toolbar__divider {
  flex: 0 0 auto;
  background: var(--oc-border-muted);
}

.oc-overlay-toolbar--horizontal .oc-overlay-toolbar__divider {
  width: var(--oc-border-width);
  height: var(--oc-size-sm);
}

.oc-overlay-toolbar--vertical .oc-overlay-toolbar__divider {
  width: var(--oc-size-sm);
  height: var(--oc-border-width);
}
</style>
