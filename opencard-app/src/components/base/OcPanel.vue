<!-- Base 面板：布局 + 表面的便捷组合容器。大多数 UI 区域的首选外壳。 -->
<template>
  <component :is="as" class="oc-panel" :class="[panelClasses, attrs.class]"
    :style="[panelStyles, attrs.style]" v-bind="forwardedAttrs">
    <slot />
  </component>
</template>

<script lang="ts">
import type { ExtractPropTypes, PropType } from 'vue'

export const OC_PANEL_GAPS = ['none', '1', '2', '3', '4', '5', '6', '8'] as const
export const OC_PANEL_PADDINGS = ['none', '1', '2', '3', '4', '5', '6'] as const
export const OC_PANEL_ALIGNS = ['start', 'center', 'end', 'stretch'] as const
export const OC_PANEL_TONES = ['base', 'surface', 'raised', 'glass', 'accent', 'transparent'] as const
export const OC_PANEL_BORDERS = ['none', 'default', 'muted', 'strong', 'accent'] as const
export const OC_PANEL_RADII = ['none', 'sm', 'md', 'lg'] as const
export const OC_PANEL_SHADOWS = ['none', 'sm', 'md', 'lg'] as const
export const OC_PANEL_OVERFLOWS = ['visible', 'hidden', 'auto', 'scroll'] as const

export type OcPanelGap = (typeof OC_PANEL_GAPS)[number]
export type OcPanelPadding = (typeof OC_PANEL_PADDINGS)[number]
export type OcPanelAlign = (typeof OC_PANEL_ALIGNS)[number]
export type OcPanelTone = (typeof OC_PANEL_TONES)[number]
export type OcPanelBorder = (typeof OC_PANEL_BORDERS)[number]
export type OcPanelRadius = (typeof OC_PANEL_RADII)[number]
export type OcPanelShadow = (typeof OC_PANEL_SHADOWS)[number]
export type OcPanelOverflow = (typeof OC_PANEL_OVERFLOWS)[number]

export const ocPanelProps = {
  /** 根元素标签。默认 'div' */
  as: {
    type: String,
    default: 'div',
  },
  /** 间距。默认 'none' */
  gap: {
    type: String as PropType<OcPanelGap>,
    default: 'none',
  },
  /** 内边距。默认 '3' */
  padding: {
    type: String as PropType<OcPanelPadding>,
    default: '3',
  },
  /** 交叉轴对齐。默认 'stretch' */
  align: {
    type: String as PropType<OcPanelAlign>,
    default: 'stretch',
  },
  /** 背景。默认 'surface' */
  tone: {
    type: String as PropType<OcPanelTone>,
    default: 'surface',
  },
  /** 边框。默认 'default' */
  border: {
    type: String as PropType<OcPanelBorder>,
    default: 'default',
  },
  /** 圆角。默认 'sm' */
  radius: {
    type: String as PropType<OcPanelRadius>,
    default: 'sm',
  },
  /** 阴影。默认 'none' */
  shadow: {
    type: String as PropType<OcPanelShadow>,
    default: 'none',
  },
  /** 占满父容器。默认 false */
  fill: {
    type: Boolean,
    default: false,
  },
  /** 溢出。默认 'visible' */
  overflow: {
    type: String as PropType<OcPanelOverflow>,
    default: 'visible',
  },
} as const

export type OcPanelProps = Readonly<ExtractPropTypes<typeof ocPanelProps>>
</script>

<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import type { CSSProperties } from 'vue'

defineOptions({
  name: 'OcPanel',
  inheritAttrs: false,
})

const props = defineProps(ocPanelProps)
const attrs = useAttrs()

const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const panelClasses = computed(() => [
  `oc-panel--gap-${props.gap}`,
  `oc-panel--padding-${props.padding}`,
  `oc-panel--align-${props.align}`,
  `oc-panel--tone-${props.tone}`,
  `oc-panel--border-${props.border}`,
  `oc-panel--radius-${props.radius}`,
  `oc-panel--shadow-${props.shadow}`,
  { 'oc-panel--fill': props.fill },
])

const panelStyles = computed<CSSProperties>(() => ({
  overflow: props.overflow,
}))
</script>

<style scoped>
.oc-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  transition:
    background-color var(--oc-duration-fast) var(--oc-ease),
    border-color var(--oc-duration-fast) var(--oc-ease),
    box-shadow var(--oc-duration-fast) var(--oc-ease);
}

/* Gap */
.oc-panel--gap-none {
  gap: 0;
}

.oc-panel--gap-1 {
  gap: var(--oc-space-1);
}

.oc-panel--gap-2 {
  gap: var(--oc-space-2);
}

.oc-panel--gap-3 {
  gap: var(--oc-space-3);
}

.oc-panel--gap-4 {
  gap: var(--oc-space-4);
}

.oc-panel--gap-5 {
  gap: var(--oc-space-5);
}

.oc-panel--gap-6 {
  gap: var(--oc-space-6);
}

.oc-panel--gap-8 {
  gap: var(--oc-space-8);
}

/* Padding */
.oc-panel--padding-none {
  padding: 0;
}

.oc-panel--padding-1 {
  padding: var(--oc-space-1);
}

.oc-panel--padding-2 {
  padding: var(--oc-space-2);
}

.oc-panel--padding-3 {
  padding: var(--oc-space-3);
}

.oc-panel--padding-4 {
  padding: var(--oc-space-4);
}

.oc-panel--padding-5 {
  padding: var(--oc-space-5);
}

.oc-panel--padding-6 {
  padding: var(--oc-space-6);
}

/* Align (cross-axis) */
.oc-panel--align-start {
  align-items: flex-start;
}

.oc-panel--align-center {
  align-items: center;
}

.oc-panel--align-end {
  align-items: flex-end;
}

.oc-panel--align-stretch {
  align-items: stretch;
}

/* Tone (background) */
.oc-panel--tone-base {
  background-color: var(--oc-bg-base);
}

.oc-panel--tone-surface {
  background-color: var(--oc-bg-surface);
}

.oc-panel--tone-raised {
  background-color: var(--oc-bg-raised);
}

.oc-panel--tone-glass {
  background-color: var(--oc-bg-glass);
  -webkit-backdrop-filter: blur(var(--oc-blur-glass));
  backdrop-filter: blur(var(--oc-blur-glass));
}

.oc-panel--tone-accent {
  background-color: var(--oc-bg-accent);
  color: var(--oc-accent-fg);
}

.oc-panel--tone-transparent {
  background-color: transparent;
}

/* Border */
.oc-panel--border-none {
  border: none;
}

.oc-panel--border-default {
  border: 1px solid var(--oc-border-default);
}

.oc-panel--border-muted {
  border: 1px solid var(--oc-border-muted);
}

.oc-panel--border-strong {
  border: 1px solid var(--oc-border-strong);
}

.oc-panel--border-accent {
  border: 1px solid var(--oc-border-accent);
}

/* Radius */
.oc-panel--radius-none {
  border-radius: 0;
}

.oc-panel--radius-sm {
  border-radius: var(--oc-radius-sm);
}

.oc-panel--radius-md {
  border-radius: var(--oc-radius-md);
}

.oc-panel--radius-lg {
  border-radius: var(--oc-radius-lg);
}

/* Shadow */
.oc-panel--shadow-none {
  box-shadow: none;
}

.oc-panel--shadow-sm {
  box-shadow: var(--oc-shadow-sm);
}

.oc-panel--shadow-md {
  box-shadow: var(--oc-shadow-md);
}

.oc-panel--shadow-lg {
  box-shadow: var(--oc-shadow-lg);
}

/* Fill */
.oc-panel--fill {
  width: 100%;
  height: 100%;
}
</style>
