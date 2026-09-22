<!-- Base 按钮：多变体、多尺寸的可点击操作触点。 -->
<template>
  <button
    class="oc-button"
    :class="[variantClass, sizeClass, radiusClass, stateClasses, attrs.class]"
    :style="attrs.style"
    :type="type"
    :disabled="disabled"
    v-bind="forwardedAttrs"
    @click="emit('click', $event)"
  >
    <span class="oc-button__content">
      <OcIcon
        v-if="icon && iconSide === 'left'"
        class="oc-button__icon"
        :name="icon"
        :tone="iconTone"
        :size="resolvedIconSize"
      />
      <slot name="icon" />
      <span v-if="!isIconOnly" class="oc-button__label">
        <slot />
      </span>
      <OcIcon
        v-if="icon && iconSide === 'right'"
        class="oc-button__icon"
        :name="icon"
        :tone="iconTone"
        :size="resolvedIconSize"
      />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, useAttrs, useSlots } from 'vue'
import type { IconToken, IconTone } from '../../shared/ui/icon/iconRegistry'
import OcIcon, { type OcIconSize } from './OcIcon.vue'

/**
 * 按钮视觉变体。
 * - solid: 强调填充背景
 * - soft: 浅色背景
 * - ghost: 透明背景
 * - outline: 描边样式
 */
type ButtonVariant = 'solid' | 'soft' | 'ghost' | 'outline'

/**
 * 按钮尺寸。
 * - sm: 22px (--oc-size-sm)
 * - md: 28px (--oc-size-md)
 * - lg: 36px (--oc-size-lg)
 */
type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * 按钮圆角。
 * - sm: --oc-radius-sm
 * - md: --oc-radius-md
 * - full: 50%
 */
type ButtonRadius = 'sm' | 'md' | 'full'

/**
 * OcButton Props
 */
interface OcButtonProps {
  /** 视觉变体。solid=强调填充, soft=浅色背景, ghost=透明, outline=描边。默认 'ghost' */
  variant?: ButtonVariant
  /** 控件尺寸。默认 'md' */
  size?: ButtonSize
  /** 圆角。默认 'sm' */
  radius?: ButtonRadius
  /** 图标 */
  icon?: IconToken
  /** 图标语义色调 */
  iconTone?: IconTone
  /** 图标视觉尺寸；省略时沿用按钮尺寸映射 */
  iconSize?: OcIconSize
  /** 图标位置。默认 'left' */
  iconSide?: 'left' | 'right'
  /** 是否纯图标模式。默认 false */
  iconOnly?: boolean
  /** 是否激活态。默认 false */
  active?: boolean
  /** 是否占满宽度。默认 false */
  block?: boolean
  /** 禁用。默认 false */
  disabled?: boolean
  /** 原生 type。默认 'button' */
  type?: 'button' | 'submit' | 'reset'
}

/**
 * OcButton Emits
 */
interface OcButtonEmits {
  /** 点击事件 */
  click: [event: MouseEvent]
}

defineOptions({
  name: 'OcButton',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<OcButtonProps>(), {
  variant: 'ghost',
  size: 'md',
  radius: 'sm',
  icon: undefined,
  iconTone: 'default',
  iconSize: undefined,
  iconSide: 'left',
  iconOnly: false,
  active: false,
  block: false,
  disabled: false,
  type: 'button',
})

const emit = defineEmits<OcButtonEmits>()
const attrs = useAttrs()
const slots = useSlots()

const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, type: _type, disabled: _disabled, ...rest } = attrs
  return rest
})

const hasDefaultSlot = computed(() => Boolean(slots.default?.().length))
const isIconOnly = computed(() => props.iconOnly || (!hasDefaultSlot.value && Boolean(props.icon)))

const resolvedIconSize = computed<OcIconSize>(() => {
  if (props.iconSize) return props.iconSize
  if (isIconOnly.value) return 'action'
  const sizeMap: Record<ButtonSize, 'sm' | 'md' | 'lg'> = {
    sm: 'sm',
    md: 'md',
    lg: 'lg',
  }
  return sizeMap[props.size]
})

const variantClass = computed(() => `oc-button--variant-${props.variant}`)
const sizeClass = computed(() => `oc-button--size-${props.size}`)
const radiusClass = computed(() => `oc-button--radius-${props.radius}`)

const stateClasses = computed(() => ({
  'oc-button--icon-only': isIconOnly.value,
  'oc-button--active': props.active,
  'oc-button--block': props.block,
}))

</script>

<style scoped>
.oc-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--oc-fg-default);
  font: inherit;
  line-height: 1.4;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color var(--oc-duration-fast) var(--oc-ease),
    border-color var(--oc-duration-fast) var(--oc-ease),
    color var(--oc-duration-fast) var(--oc-ease);
}

.oc-button:focus-visible {
  box-shadow: var(--oc-control-focus-shadow, var(--oc-focus-ring));
}

.oc-button:disabled {
  opacity: var(--oc-opacity-disabled);
  pointer-events: none;
}

.oc-button--block {
  width: 100%;
}

/* Size variants */
.oc-button--size-sm {
  height: var(--oc-size-sm);
  padding: 0 var(--oc-space-3);
  font-size: var(--oc-text-sm);
  gap: var(--oc-space-2);
}

.oc-button--size-md {
  height: var(--oc-size-md);
  padding: 0 var(--oc-space-4);
  font-size: var(--oc-text-base);
  gap: var(--oc-space-3);
}

.oc-button--size-lg {
  height: var(--oc-size-lg);
  padding: 0 var(--oc-space-4);
  font-size: var(--oc-text-lg);
  gap: var(--oc-space-3);
}

/* Radius variants */
.oc-button--radius-sm {
  border-radius: var(--oc-control-border-radius, var(--oc-radius-sm));
}

.oc-button--radius-md {
  border-radius: var(--oc-control-border-radius, var(--oc-radius-md));
}

.oc-button--radius-full {
  border-radius: var(--oc-control-icon-border-radius, 50%);
}

/* Variant: solid */
.oc-button--variant-solid {
  background-color: var(--oc-bg-accent);
  color: var(--oc-accent-fg);
  border-color: transparent;
}

.oc-button--variant-solid:hover:not(:disabled) {
  background-color: var(--oc-bg-accent-hover);
}

/* Variant: soft */
.oc-button--variant-soft {
  background-color: var(--oc-bg-accent-subtle);
  color: var(--oc-fg-accent);
  border-color: transparent;
}

.oc-button--variant-soft:hover:not(:disabled) {
  border-color: var(--oc-border-accent);
}

/* Variant: ghost */
.oc-button--variant-ghost {
  background-color: transparent;
  color: var(--oc-fg-default);
  border-color: transparent;
}

.oc-button--variant-ghost:hover:not(:disabled) {
  background-color: var(--oc-bg-hover);
}

/* Variant: outline */
.oc-button--variant-outline {
  background-color: transparent;
  color: var(--oc-fg-default);
  border-color: var(--oc-border-default);
}

.oc-button--variant-outline:hover:not(:disabled) {
  border-color: var(--oc-border-accent);
}

/* Active state */
.oc-button--active {
  background-color: var(--oc-bg-active);
  border-color: var(--oc-border-accent);
}

/* Icon-only mode */
.oc-button--icon-only {
  width: var(--oc-size-sm);
  height: var(--oc-size-sm);
  padding: 0;
}

.oc-button--icon-only.oc-button--size-md {
  width: var(--oc-size-md);
  height: var(--oc-size-md);
}

.oc-button--icon-only.oc-button--size-lg {
  width: var(--oc-size-lg);
  height: var(--oc-size-lg);
}

/* Content wrapper */
.oc-button__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: inherit;
  min-width: 0;
}

/* Label */
.oc-button__label {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Icon */
.oc-button__icon {
  flex-shrink: 0;
}
</style>
