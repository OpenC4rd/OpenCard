<!-- 浮在画布上的工具条：玻璃卡片外壳，内容是一条 OcActionBar。 -->
<template>
  <OcCard class="oc-overlay-toolbar" variant="glass">
    <OcActionBar :items="items" :orientation="orientation" overflow="none" :aria-label="label"
      @select="emit('select', $event)" />
  </OcCard>
</template>

<script setup lang="ts">
import OcActionBar from './OcActionBar.vue'
import OcCard from './OcCard.vue'
import type { OcActionBarItem, OcActionSelectPayload } from '../../shared/ui/action/action.types'

withDefaults(defineProps<{
  items: readonly OcActionBarItem[]
  orientation?: 'horizontal' | 'vertical'
  label?: string
}>(), {
  orientation: 'horizontal',
  label: undefined,
})

const emit = defineEmits<{
  select: [payload: OcActionSelectPayload]
}>()
</script>

<style scoped>
.oc-overlay-toolbar {
  pointer-events: auto;
}
</style>
