<!-- Base 输入框：原生表单元素的语义化包装。 -->
<template>
  <component
    :is="as"
    ref="fieldRef"
    class="oc-field-input"
    :class="fieldClass"
    v-bind="attrs"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs, type ComponentPublicInstance } from 'vue'

/**
 * Props interface for OcFieldInput component.
 * Provides semantic wrapping around native form elements with design token support.
 */
interface OcFieldInputProps {
  /**
   * 根元素类型。
   * @default 'input'
   */
  as?: 'input' | 'select' | 'textarea'

  /**
   * 字段视觉变体。
   * - filled: 有背景和边框
   * - plain: 透明无边框
   * @default 'filled'
   */
  variant?: 'filled' | 'plain' | 'underline'

  /**
   * 字号尺寸。
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg'

  /**
   * 是否占满可用宽度。
   * @default false
   */
  fullWidth?: boolean

  /**
   * 是否切换为等宽字体。
   * @default false
   */
  mono?: boolean

  /**
   * textarea 缩放行为。
   * @default 'none'
   */
  resize?: 'none' | 'vertical' | 'horizontal' | 'both'
}

defineOptions({
  name: 'OcFieldInput',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<OcFieldInputProps>(), {
  as: 'input',
  variant: 'filled',
  size: 'md',
  fullWidth: false,
  mono: false,
  resize: 'none',
})

const attrs = useAttrs()
const fieldRef = ref<
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | ComponentPublicInstance
  | null
>(null)

const fieldClass = computed(() => [
  `oc-field-input--${props.variant}`,
  `oc-field-input--${props.size}`,
  {
    'oc-field-input--full-width': props.fullWidth,
    'oc-field-input--mono': props.mono,
    'oc-field-input--resize-none': props.resize === 'none',
    'oc-field-input--resize-vertical': props.resize === 'vertical',
    'oc-field-input--resize-horizontal': props.resize === 'horizontal',
    'oc-field-input--resize-both': props.resize === 'both',
  },
])

function resolveNativeField() {
  const current = fieldRef.value
  if (!current) {
    return null
  }

  if (
    current instanceof HTMLInputElement
    || current instanceof HTMLTextAreaElement
    || current instanceof HTMLSelectElement
  ) {
    return current
  }

  const element = (current as ComponentPublicInstance).$el
  if (
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
  ) {
    return element
  }

  return null
}

defineExpose({
  focus() {
    resolveNativeField()?.focus()
  },
  blur() {
    resolveNativeField()?.blur()
  },
  select() {
    const field = resolveNativeField()
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.select()
  },
})
</script>

<style scoped>
.oc-field-input {
  box-sizing: border-box;
  line-height: 1.4;
  font-family: var(--oc-font-sans);
  min-width: 0;
}

.oc-field-input:is(input, textarea) {
  caret-color: var(--oc-fg-default);
  cursor: text;
}

.oc-field-input--filled {
  background: var(--oc-field-surface-background, var(--oc-bg-input));
  border: var(--oc-field-surface-border-width, 1px) solid var(--oc-field-surface-border-color, var(--oc-border-default));
  border-radius: var(--oc-field-surface-border-radius, var(--oc-radius-sm));
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  color: var(--oc-fg-default);
  transition: border-color var(--oc-duration-fast) var(--oc-ease);
}

.oc-field-input--filled:focus:not(:disabled):not(:read-only),
.oc-field-input--filled:focus-visible:not(:disabled):not(:read-only) {
  border-color: var(--oc-field-surface-focus-border-color, var(--oc-border-accent));
  outline: none;
}

.oc-field-input--plain {
  background: transparent;
  border: var(--oc-field-surface-border-width, 1px) solid transparent;
  /* `plain` 不画自己的表面，但内缩仍是它自己的：字段边框归 frame，内容内缩归这里。
     上下文可用 `--oc-field-content-padding` 归零（属性面板用它把内边距交给整行）。 */
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  color: var(--oc-fg-default);
  transition: border-color var(--oc-duration-fast) var(--oc-ease);
}

.oc-field-input--plain:focus:not(:disabled):not(:read-only),
.oc-field-input--plain:focus-visible:not(:disabled):not(:read-only) {
  border-color: var(--oc-field-surface-focus-border-color, var(--oc-border-accent));
  outline: none;
}

.oc-field-input--underline {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--oc-border-default);
  border-radius: 0;
  padding: var(--oc-space-1) 0;
  color: var(--oc-fg-default);
  transition: border-color var(--oc-duration-fast) var(--oc-ease);
}

.oc-field-input--underline:focus:not(:disabled):not(:read-only),
.oc-field-input--underline:focus-visible:not(:disabled):not(:read-only) {
  border-bottom-color: var(--oc-border-accent);
  outline: none;
}

.oc-field-input--sm {
  min-height: var(--oc-field-control-height, var(--oc-size-sm));
  font-size: var(--oc-text-sm);
}

.oc-field-input--md {
  min-height: var(--oc-field-control-height, var(--oc-size-md));
  font-size: var(--oc-text-base);
}

.oc-field-input--lg {
  min-height: var(--oc-field-control-height, var(--oc-size-lg));
  font-size: var(--oc-text-lg);
}

.oc-field-input--full-width {
  width: 100%;
}

.oc-field-input--mono {
  font-family: var(--oc-font-mono);
}

.oc-field-input::placeholder {
  color: var(--oc-fg-muted);
}

.oc-field-input:disabled {
  color: var(--oc-fg-disabled);
  cursor: not-allowed;
  opacity: .5;
}

.oc-field-input--filled:read-only {
  background: var(--oc-field-readonly-background, var(--oc-bg-raised));
  color: var(--oc-fg-muted);
}

.oc-field-input[aria-invalid="true"] {
  border-color: var(--oc-field-invalid-border-color, var(--oc-danger));
}

.oc-field-input[aria-busy="true"] {
  cursor: progress;
}

.oc-field-input--resize-none {
  resize: none;
}

.oc-field-input--resize-vertical {
  resize: vertical;
}

.oc-field-input--resize-horizontal {
  resize: horizontal;
}

.oc-field-input--resize-both {
  resize: both;
}
</style>
