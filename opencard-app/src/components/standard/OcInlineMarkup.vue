<!-- Safe application-copy renderer. It never accepts or emits arbitrary HTML. -->
<template>
  <span class="oc-inline-markup">
    <template v-for="(node, index) in nodes" :key="index">
      <span v-if="node.type === 'text'">{{ node.value }}</span>
      <strong v-else-if="node.type === 'strong'">{{ node.value }}</strong>
      <em v-else-if="node.type === 'emphasis'">{{ node.value }}</em>
      <code v-else-if="node.type === 'code'" class="oc-inline-markup__code">{{ node.value }}</code>
      <OcKey v-else-if="node.type === 'key'">{{ node.value }}</OcKey>
      <br v-else-if="node.type === 'break'">
      <OcIcon v-else :name="node.reference" size="sm" class="oc-inline-markup__icon" />
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import OcIcon from '../base/OcIcon.vue'
import { parseInlineMarkup } from '../../shared/ui/inline-markup/inlineMarkup'
import OcKey from './OcKey.vue'

defineOptions({ name: 'OcInlineMarkup' })

const props = defineProps<{ source: string }>()
const nodes = computed(() => parseInlineMarkup(props.source))
</script>

<style scoped>
.oc-inline-markup__code {
  padding: 0 var(--oc-space-2xs);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-hover);
  color: var(--oc-fg-default);
  font-family: var(--oc-font-mono);
}

.oc-inline-markup__icon {
  vertical-align: -0.125em;
}
</style>
