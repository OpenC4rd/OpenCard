<!-- Base 文本：语义化文本渲染，控制色调、字号与截断。 -->
<template>
  <component
    :is="as"
    ref="rootElement"
    class="oc-text"
    :class="textClass"
    :data-tooltip="truncate ? text : undefined"
    :data-tooltip-overflow="truncate ? '' : undefined"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, onMounted, onUpdated, ref } from 'vue'

/**
 * Text tone options for semantic color control.
 */
type OcTextTone = 'default' | 'muted' | 'subtle' | 'accent' | 'success' | 'warning' | 'danger'

/**
 * Text size options for typography hierarchy.
 */
type OcTextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl'

/**
 * Props interface for OcText component.
 */
interface OcTextProps {
  /**
   * 根元素标签，默认 'span'
   */
  as?: string
  /**
   * 文本色调
   */
  tone?: OcTextTone
  /**
   * 文本字号
   */
  size?: OcTextSize
  /**
   * 是否使用等宽字体，默认 false
   */
  mono?: boolean
  /**
   * 是否加粗，默认 false
   */
  bold?: boolean
  /**
   * 单行省略。省略时这段文字自己就是 hover 提示的全文：真的放不下才提示，放得下就不打扰。
   */
  truncate?: boolean
}

defineOptions({ name: 'OcText' })

const props = withDefaults(defineProps<OcTextProps>(), {
  as: 'span',
  tone: 'default',
  mono: false,
  bold: false,
  truncate: false,
})

const textClass = computed(() => [
  `oc-text--tone-${props.tone}`,
  props.size ? `oc-text--size-${props.size}` : undefined,
  { 'oc-text--mono': props.mono },
  { 'oc-text--bold': props.bold },
  { 'oc-text--truncate': props.truncate },
])

/**
 * 省略号盖掉的是全文，所以提示的全文就是这里渲染出来的字 —— 组件自己读一遍 DOM，
 * 调用方不必再把同一段文字抄进一个 prop；抄漏一处，那一处就永远看不到全文。
 */
const rootElement = ref<HTMLElement | null>(null)
const text = ref('')

function captureText(): void {
  text.value = rootElement.value?.textContent?.trim() ?? ''
}

onMounted(captureText)
onUpdated(captureText)
</script>

<style scoped>
.oc-text {
  font-family: var(--oc-font-sans);
  font-size: var(--oc-text-base);
  color: var(--oc-fg-default);
}

.oc-text--tone-default {
  color: var(--oc-fg-default);
}

.oc-text--tone-muted {
  color: var(--oc-fg-muted);
}

.oc-text--tone-subtle {
  color: var(--oc-fg-subtle);
}

.oc-text--tone-accent {
  color: var(--oc-fg-accent);
}

.oc-text--tone-success {
  color: var(--oc-fg-success);
}

.oc-text--tone-warning {
  color: var(--oc-fg-warning);
}

.oc-text--tone-danger {
  color: var(--oc-fg-danger);
}

.oc-text--size-xs {
  font-size: var(--oc-text-xs);
}

.oc-text--size-sm {
  font-size: var(--oc-text-sm);
}

.oc-text--size-base {
  font-size: var(--oc-text-base);
}

.oc-text--size-lg {
  font-size: var(--oc-text-lg);
}

.oc-text--size-xl {
  font-size: var(--oc-text-xl);
}

.oc-text--mono {
  font-family: var(--oc-font-mono);
}

.oc-text--bold {
  font-weight: 600;
}

.oc-text--truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
