<!-- Standard 比例尺：把屏幕缩放换算成一段整齐的毫米长度，贴在最近定位祖先的左下角。 -->
<template>
  <div class="oc-scale-bar" role="img" :aria-label="label" :style="style">{{ label }}</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ViewportInsets } from '../../shared/ui/viewport/viewportNavigation'
import { resolveScaleBar } from './scaleBar'

const props = withDefaults(defineProps<{
  /** 当前缩放：每毫米对应的屏幕像素。 */
  pixelsPerMm: number
  /** 被浮层占用的边距；比例尺贴着剩余区域的左下角。 */
  insets?: ViewportInsets
}>(), { insets: () => ({}) })

const bar = computed(() => resolveScaleBar(props.pixelsPerMm))
const label = computed(() => `${bar.value.lengthMm}mm`)
const style = computed(() => ({
  width: `${bar.value.width}px`,
  left: `calc(${props.insets.left ?? 0}px + var(--oc-space-sm))`,
  bottom: `calc(${props.insets.bottom ?? 0}px + var(--oc-space-sm))`,
}))

defineOptions({ name: 'OcScaleBar' })
</script>

<style scoped>
.oc-scale-bar {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  border: solid var(--oc-fg-muted);
  border-width: 0 1px 1px;
  background: var(--oc-scale-bar-background, transparent);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
</style>
