<!-- Standard 选项组：单选按钮组，用于互斥选项切换。 -->
<script lang="ts">
import type { IconToken } from '../../shared/ui/icon/iconRegistry'

export interface OcOption {
  value: string
  label: string
  shortLabel?: string
  icon?: IconToken
}
</script>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
import OcButton from '../base/OcButton.vue'

interface Props {
  modelValue?: string
  options: readonly OcOption[]
  size?: 'sm' | 'md' | 'lg'
  columns?: number
  disabled?: boolean
  fill?: boolean
  square?: boolean
  iconOnly?: boolean
  appearance?: 'buttons' | 'sliding-outline'
  semantics?: 'radio' | 'tabs'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  size: 'sm',
  disabled: false,
  fill: false,
  square: false,
  iconOnly: false,
  appearance: 'buttons',
  semantics: 'radio',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)

defineOptions({ name: 'OcOptionGroup' })

const containerStyle = computed<CSSProperties>(() => {
  const selectionStyle = {
    '--oc-option-count': props.options.length,
    '--oc-option-index': selectedIndex.value,
    '--oc-option-gap': 'var(--oc-space-1)',
  }
  const columns = props.columns ?? props.options.length
  /*
   * 方形选项由容器几何决定，不去改每个按钮：容器按"列数 : 行数"取方形，行高等分，
   * 每个选项撑满自己的格子，于是格子是方的。
   */
  if (props.square) {
    const rows = Math.max(1, Math.ceil(props.options.length / Math.max(1, columns)))
    return {
      ...selectionStyle,
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gridAutoRows: '1fr',
      aspectRatio: `${columns} / ${rows}`,
      // 选项撑满自己的格子（高度由上下文 token 给，不去改按钮内部）。
      '--oc-control-height': '100%',
      gap: 'var(--oc-option-gap)',
    }
  }
  if (props.columns) {
    return {
      ...selectionStyle,
      display: 'grid',
      gridTemplateColumns: `repeat(${props.columns}, 1fr)`,
      gap: 'var(--oc-option-gap)',
    }
  }
  return {
    ...selectionStyle,
    display: 'flex',
    gap: 'var(--oc-option-gap)',
  }
})

const isSelected = (value: string) => props.modelValue === value
const selectedIndex = computed(() => {
  const index = props.options.findIndex((option) => isSelected(option.value))
  return index >= 0 ? index : 0
})

const handleSelect = (value: string) => {
  if (!props.disabled) {
    emit('update:modelValue', value)
  }
}

function handleKeydown(event: KeyboardEvent, index: number): void {
  if (props.disabled || props.options.length === 0) return

  const columnCount = props.columns ?? props.options.length
  const movement: Partial<Record<string, number>> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: props.columns ? -columnCount : -1,
    ArrowDown: props.columns ? columnCount : 1,
  }

  let nextIndex: number | null = null
  if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = props.options.length - 1
  else if (movement[event.key] != null) {
    nextIndex = (index + movement[event.key]! + props.options.length) % props.options.length
  }

  if (nextIndex == null) return
  event.preventDefault()
  const nextOption = props.options[nextIndex]
  const optionRole = props.semantics === 'tabs' ? 'tab' : 'radio'
  rootRef.value?.querySelectorAll<HTMLButtonElement>(`[role="${optionRole}"]`)[nextIndex]?.focus()
  emit('update:modelValue', nextOption.value)
}
</script>

<template>
  <div
    ref="rootRef"
    class="oc-option-group"
    :class="{
      'oc-option-group--fill': fill,
      'oc-option-group--square': square,
      'oc-option-group--icon-only': iconOnly,
      'oc-option-group--sliding-outline': appearance === 'sliding-outline',
    }"
    :style="containerStyle"
    :role="semantics === 'tabs' ? 'tablist' : 'radiogroup'"
    :aria-disabled="disabled || undefined"
  >
    <span v-if="appearance === 'sliding-outline'" class="oc-option-group__indicator" aria-hidden="true" />
    <OcButton
      v-for="(option, index) in options"
      :key="option.value"
      class="oc-option-group__option"
      :class="{ 'oc-option-group__option--selected': appearance === 'sliding-outline' && isSelected(option.value) }"
      :icon="option.icon"
      :size="size"
      :disabled="disabled"
      :variant="appearance === 'sliding-outline' ? 'ghost' : isSelected(option.value) ? 'solid' : 'soft'"
      :block="fill"
      :icon-only="iconOnly"
      :data-tooltip="iconOnly ? option.label : null"
      :aria-label="option.label"
      :role="semantics === 'tabs' ? 'tab' : 'radio'"
      :aria-checked="semantics === 'radio' ? isSelected(option.value) : undefined"
      :aria-selected="semantics === 'tabs' ? isSelected(option.value) : undefined"
      :tabindex="index === selectedIndex ? 0 : -1"
      @click="handleSelect(option.value)"
      @keydown="handleKeydown($event, index)"
    >
      <slot name="option" :option="option" :selected="isSelected(option.value)">
        {{ option.shortLabel ?? option.label }}
      </slot>
    </OcButton>
  </div>
</template>

<style scoped>
.oc-option-group {
  position: relative;
  min-width: 0;
}

/**
 * The frame spans one option and steps by one option plus the gap. The step uses `transform`
 * because a percentage there resolves against the frame's own width; the same `100%` inside
 * `inset-inline-start` would resolve against the whole row and throw the frame past the last option.
 */
.oc-option-group__indicator {
  position: absolute;
  z-index: 0;
  inset-block: 0;
  inset-inline-start: 0;
  width: calc((100% - (var(--oc-option-count) - 1) * var(--oc-option-gap)) / var(--oc-option-count));
  border: 1px solid var(--oc-border-accent);
  border-radius: var(--oc-radius-sm);
  pointer-events: none;
  transform: translateX(calc(var(--oc-option-index) * (100% + var(--oc-option-gap))));
  transition: transform var(--oc-duration-normal) var(--oc-ease);
}

/* 描边滑块在选项下面：把整组抬到它上面，不必逐个选项去改层级。 */
.oc-option-group--sliding-outline {
  z-index: 1;
}

/* 选中项的文字用强调色（这是组合自己的 class，落在按钮根节点上）。 */
.oc-option-group--sliding-outline .oc-option-group__option--selected {
  color: var(--oc-fg-accent);
}

.oc-option-group--fill {
  width: 100%;
}
</style>
