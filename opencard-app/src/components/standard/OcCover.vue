<!-- Standard 封面：把单个视觉铺满调用方给定的几何；图片加载失败时留空，源地址变化后自动重试。 -->
<template>
  <span class="oc-cover" :class="[`oc-cover--${displayedVisual?.type ?? 'empty'}`, { 'oc-cover--contain': displayedVisual?.type === 'image' && displayedVisual.fit === 'contain' }]">
    <OcVisual
      v-if="displayedVisual"
      class="oc-cover__visual"
      :visual="displayedVisual"
      :label="label"
      :size="size"
      @image-error="markBroken"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import OcVisual from '../base/OcVisual.vue'
import type { OcIconSize } from '../base/OcIcon.vue'
import type { OcVisual as OcVisualModel } from '../../shared/ui/visual/visual.types'

interface OcCoverProps {
  /** 要渲染的封面视觉。为 null 时封面框留空，占位内容由调用方自行安排。 */
  visual?: OcVisualModel | null
  /** 视觉自身未携带名称时的回退无障碍名称。 */
  label?: string
  /** 图标变体的尺寸。图片与样式变体始终铺满封面框，不受此值影响。 */
  size?: OcIconSize
}

defineOptions({ name: 'OcCover' })

const props = withDefaults(defineProps<OcCoverProps>(), {
  visual: null,
  label: '',
  size: 'lg',
})

/** 最近一次加载失败的图片源；只按地址判定，源地址一换就自动恢复渲染。 */
const brokenSrc = ref<string | null>(null)

const displayedVisual = computed(() => {
  const visual = props.visual
  if (!visual) return null
  if (visual.type === 'image' && visual.src === brokenSrc.value) return null
  return visual
})

function markBroken(): void {
  if (props.visual?.type === 'image') brokenSrc.value = props.visual.src
}
</script>

<style scoped>
.oc-cover {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 图片与样式变体按面积铺满封面框；图标变体保持自身尺寸，由 flex 居中。 */
.oc-cover--image .oc-cover__visual,
.oc-cover--style .oc-cover__visual {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.oc-cover--contain .oc-cover__visual {
  object-fit: contain;
}
</style>
