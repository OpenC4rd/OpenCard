<!-- Standard 只读进度条：只展示用量/进度，不接收交互；max 为 null 表示无上限，不画填充。 -->
<template>
  <span
    class="oc-progress-bar"
    :class="{ 'oc-progress-bar--thin': variant === 'thin' }"
    role="progressbar"
    aria-valuemin="0"
    :aria-valuemax="max ?? undefined"
    :aria-valuenow="value"
    :aria-valuetext="text || undefined"
  >
    <span class="oc-progress-bar__track">
      <span class="oc-progress-bar__fill" :style="{ width: fillWidth }" />
    </span>
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
  /** 文字水平、垂直居中；细条通过文字阴影保持可读。 */
  text?: string
  variant?: 'default' | 'thin'
}

const props = withDefaults(defineProps<OcProgressBarProps>(), { variant: 'default' })

const fillWidth = computed(() => {
  if (props.max == null || props.max <= 0) return '0%'
  return `${Math.min(100, Math.max(0, (props.value / props.max) * 100))}%`
})
</script>

<style scoped>
.oc-progress-bar {
  display: grid;
  align-items: center;
  min-width: 0;
}

.oc-progress-bar__track {
  grid-area: 1 / 1;
  position: relative;
  height: var(--oc-size-sm);
  width: 100%;
  overflow: hidden;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-bg-raised);
}

.oc-progress-bar__fill {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  background: var(--oc-accent);
}

.oc-progress-bar__text {
  grid-area: 1 / 1;
  position: relative;
  text-align: center;
  color: var(--oc-fg-default);
  font-size: var(--oc-text-xs);
}

.oc-progress-bar--thin .oc-progress-bar__track { height: var(--oc-space-2xs); }
.oc-progress-bar--thin .oc-progress-bar__text {
  justify-self: center;
  text-shadow: 0 0 2px var(--oc-bg-surface), 0 1px 2px var(--oc-bg-surface);
}
</style>
