<template>
  <div class="oc-action-rail" data-tooltip-group>
    <OcActionButton
      v-for="action in actions"
      :key="action.key"
      :action="action"
      :size="size"
      :icon-size="iconSize"
      :variant="variant"
      @select="emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { OcIconSize } from '../base/OcIcon.vue'
import type {
  ActionButtonSize,
  ActionButtonVariant,
  OcActionDefinition,
  OcActionSelectPayload,
} from '../../shared/ui/action/action.types'
import OcActionButton from './OcActionButton.vue'

withDefaults(defineProps<{
  actions: readonly OcActionDefinition[]
  size?: ActionButtonSize
  iconSize?: OcIconSize
  variant?: ActionButtonVariant
}>(), {
  size: 'sm',
  iconSize: 'action',
  variant: 'ghost',
})

const emit = defineEmits<{
  select: [payload: OcActionSelectPayload]
}>()
</script>

<style scoped>
.oc-action-rail {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--oc-space-1);
}
</style>
