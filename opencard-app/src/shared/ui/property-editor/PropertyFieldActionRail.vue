<!-- 字段 Action Rail：统一渲染字段宿主提供的 Action Definition。 -->
<template>
  <div v-if="actions.length > 0" class="property-field-action-rail">
    <OcActionButton
      v-for="action in actions"
      :key="action.key"
      :action="action"
      size="sm"
      variant="ghost"
      @select="emit('action', $event.key)"
    />
  </div>
</template>

<script setup lang="ts">
import type { OcActionDefinition } from '../action/action.types'
import OcActionButton from '../../../components/standard/OcActionButton.vue'

defineOptions({ name: 'PropertyFieldActionRail' })

defineProps<{
  actions: readonly OcActionDefinition[]
}>()

const emit = defineEmits<{
  action: [actionKey: string]
}>()
</script>

<style scoped>
.property-field-action-rail {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--oc-space-1);
}
</style>
