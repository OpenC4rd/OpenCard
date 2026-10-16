<!-- Standard 只读进度条：只展示用量/进度，不接收交互；max 为 null 表示无上限，不画填充。 -->
<template>
  <span
    class="oc-progress-bar"
    role="progressbar"
    aria-valuemin="0"
    :aria-valuemax="max ?? undefined"
    :aria-valuenow="value"
    :aria-valuetext="text || undefined"
  >
    <span class="oc-progress-bar__fill" :style="{ width: fillWidth }" />
    <span v-if="text" class="oc-progress-bar__text">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 只读进度条 props。
 */
interface OcProgressBarProps {
  /** 当前值 */
  value: number
  /** 上限；null 表示无上限，不画填充 */
  max: number | null
  /** 叠在轨道中间的文字 */
  text?: string
}

const props = defineProps<OcProgressBarProps>()

const fillWidth = computed(() => {
  if (props.max == null || props.max <= 0) return '0%'
  return `${Math.min(100, Math.max(0, (props.value / props.max) * 100))}%`
})
</script>

<style scoped>
.oc-progress-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--oc-size-sm);
  min-width: 0;
  overflow: hidden;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-bg-raised);
}

.oc-progress-bar__fill {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  background-image: var(--oc-overlay-accent);
}

.oc-progress-bar__text {
  position: relative;
  color: var(--oc-fg-default);
  font-size: var(--oc-text-xs);
}
</style>
