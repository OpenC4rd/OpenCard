<!-- Base 空状态提示：独立实现文案尺寸、色调与对齐策略，不依赖 shared primitives。 -->
<template>
  <p class="oc-empty" :class="emptyClass">
    <slot />
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type OcEmptyTone = 'dim' | 'muted'
type OcEmptySize = 'label' | 'body'
type OcEmptyAlign = 'start' | 'center'
type OcEmptyInset = 'none' | 'compact' | 'comfortable'

interface OcEmptyProps {
  /** 文案色调。 */
  tone?: OcEmptyTone
  /** 文案尺寸。 */
  size?: OcEmptySize
  /** 文案对齐方式。 */
  align?: OcEmptyAlign
  /** 内边距语义。 */
  inset?: OcEmptyInset
}

defineOptions({ name: 'OcEmpty' })

const props = withDefaults(defineProps<OcEmptyProps>(), {
  tone: 'dim',
  size: 'body',
  align: 'center',
  inset: 'comfortable',
})

const emptyClass = computed(() => [
  `oc-empty--tone-${props.tone}`,
  `oc-empty--size-${props.size}`,
  `oc-empty--align-${props.align}`,
  `oc-empty--inset-${props.inset}`,
])
</script>

<style scoped>
.oc-empty {
  margin: 0;
  width: 100%;
}

.oc-empty.oc-empty--tone-dim {
  color: var(--oc-fg-muted);
}

.oc-empty.oc-empty--tone-muted {
  color: var(--oc-fg-subtle);
}

.oc-empty--size-label {
  font-size: var(--oc-text-sm);
}

.oc-empty--size-body {
  font-size: var(--oc-text-base);
}

.oc-empty--align-start {
  text-align: left;
}

.oc-empty--align-center {
  text-align: center;
}

.oc-empty--inset-none {
  padding: 0;
}

.oc-empty--inset-compact {
  padding: 8px 10px;
}

.oc-empty--inset-comfortable {
  padding: 24px;
}
</style>
