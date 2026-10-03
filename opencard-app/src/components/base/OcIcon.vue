<!-- Base 图标：渲染项目语义图标的 MDI SVG path。 -->
<template>
  <svg
    class="oc-icon oc-icon-svg"
    :class="[sizeClass]"
    :style="iconStyle"
    :viewBox="icon.viewBox ?? '0 0 24 24'"
    fill="currentColor"
    aria-hidden="true"
    v-bind="forwardedAttrs"
  >
    <path :d="icon.path" />
  </svg>
</template>

<script lang="ts">
export type OcIconSize = 'sm' | 'md' | 'lg' | 'action' | 'display'
</script>

<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { resolveIcon, type IconToken, type IconTone } from '../../shared/ui/icon/iconRegistry'

/**
 * Icon tone/color semantic tokens.
 * 通用、文件、文件夹和 Block tone 均由图标注册表统一定义。
 */
/**
 * OcIcon component props.
 */
interface OcIconProps {
  /** 图标注册键 */
  name?: IconToken
  /** 图标色调 */
  tone?: IconTone
  /** 图标尺寸 */
  size?: OcIconSize
}

defineOptions({
  name: 'OcIcon',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<OcIconProps>(), {
  name: 'file.generic',
  tone: 'default',
  size: 'md',
})

const attrs = useAttrs()
const icon = computed(() => resolveIcon(props.name, 'OcIcon.props.name'))

const forwardedAttrs = computed(() => {
  const { color: _deprecatedColor, ...restAttrs } = attrs
  return restAttrs
})

const sizeClass = computed(() => `oc-icon--${props.size}`)

const iconStyle = computed(() => ({
  color: `var(--oc-icon-${props.tone})`,
}))
</script>

<style scoped>
.oc-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.oc-icon-svg {
  overflow: visible;
}

.oc-icon--sm {
  font-size: var(--oc-icon-size-sm);
  width: var(--oc-icon-size-sm);
  height: var(--oc-icon-size-sm);
}

.oc-icon--md {
  font-size: var(--oc-icon-size-md);
  width: var(--oc-icon-size-md);
  height: var(--oc-icon-size-md);
}

.oc-icon--lg {
  font-size: var(--oc-icon-size-lg);
  width: var(--oc-icon-size-lg);
  height: var(--oc-icon-size-lg);
}

.oc-icon--action {
  font-size: var(--oc-icon-size-action);
  width: var(--oc-icon-size-action);
  height: var(--oc-icon-size-action);
}

.oc-icon--display {
  font-size: var(--oc-icon-size-display);
  width: var(--oc-icon-size-display);
  height: var(--oc-icon-size-display);
}
</style>
