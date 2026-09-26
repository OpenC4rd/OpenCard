<!-- Base 视觉槽：把互斥的图标 / 自选样式 / 图片源渲染成叶子元素；尺寸与几何由调用方通过 class 决定。 -->
<template>
  <OcIcon
    v-if="visual.type === 'icon'"
    class="oc-visual oc-visual--icon"
    :name="visual.icon"
    :tone="visual.iconTone"
    :size="size"
  />
  <span
    v-else-if="visual.type === 'style'"
    class="oc-visual oc-visual--style"
    :class="{ 'oc-project-icon': isProjectIconStyle(visual.style) }"
    :style="visual.style"
    role="img"
    :aria-label="visual.label ?? label"
  />
  <img
    v-else
    class="oc-visual oc-visual--image"
    :src="visual.src"
    :alt="visual.label ?? label"
    draggable="false"
    @error="emit('image-error')"
  />
</template>

<script setup lang="ts">
import OcIcon, { type OcIconSize } from './OcIcon.vue'
import type { OcVisual } from '../../shared/ui/visual/visual.types'
import { isProjectIconStyle } from '../../shared/ui/visual/projectIconStyle'

interface OcVisualProps {
  /** 该槽位要渲染的唯一视觉。 */
  visual: OcVisual
  /** 图标变体的尺寸；其余变体的尺寸由调用方 class 决定。 */
  size?: OcIconSize
  /** 视觉自身未携带名称时的回退无障碍名称。 */
  label?: string
}

defineOptions({ name: 'OcVisual' })

withDefaults(defineProps<OcVisualProps>(), {
  size: 'md',
  label: '',
})

const emit = defineEmits<{
  'image-error': []
}>()
</script>

<style scoped>
/* 精灵图裁剪需要按 em 计量，字号由调用方 class 决定。 */
.oc-visual--style {
  display: inline-block;
  flex: none;
  background-repeat: no-repeat;
}
</style>
