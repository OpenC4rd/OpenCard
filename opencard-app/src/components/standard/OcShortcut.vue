<!-- Shared structured-shortcut renderer. Callers own only the surrounding layout. -->
<template>
  <span class="oc-shortcut" :aria-hidden="decorative || undefined">
    <template v-for="(part, index) in parts" :key="index">
      <OcKey v-if="typeof part === 'string'">{{ part }}</OcKey>
      <OcKey v-else-if="'icon' in part"><OcIcon :name="part.icon" size="sm" /></OcKey>
      <span v-else class="oc-shortcut__separator">{{ part.separator }}</span>
    </template>
  </span>
</template>

<script lang="ts">
export type { OcShortcutPart } from '../../shared/ui/action/action.types'
</script>

<script setup lang="ts">
import type { OcShortcutPart } from '../../shared/ui/action/action.types'
import OcIcon from '../base/OcIcon.vue'
import OcKey from './OcKey.vue'

defineOptions({ name: 'OcShortcut' })

defineProps<{
  parts: readonly OcShortcutPart[]
  decorative?: boolean
}>()
</script>

<style scoped>
.oc-shortcut {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--oc-space-1);
}

.oc-shortcut__separator {
  margin-inline: var(--oc-border-width);
  color: var(--oc-fg-muted);
}
</style>
