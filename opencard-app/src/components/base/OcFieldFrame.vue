<!-- Base 复合字段外壳：统一输入表面并承载可选前后缀。 -->
<template>
  <div
    class="oc-field-frame"
    :class="[
      `oc-field-frame--${size}`,
      {
        'oc-field-frame--full-width': fullWidth,
        'oc-field-frame--disabled': disabled,
        'oc-field-frame--readonly': readonly,
        'oc-field-frame--invalid': invalid,
        'oc-field-frame--busy': busy,
        'oc-field-frame--wrap': wrap,
      },
    ]"
    :aria-disabled="disabled || undefined"
    :aria-readonly="readonly || undefined"
    :aria-invalid="invalid || undefined"
    :aria-busy="busy || undefined"
    v-bind="$attrs"
  >
    <span v-if="$slots.prefix" class="oc-field-frame__prefix"><slot name="prefix" /></span>
    <span class="oc-field-frame__control"><slot /></span>
    <span v-if="$slots.suffix" class="oc-field-frame__suffix"><slot name="suffix" /></span>
  </div>
</template>

<script setup lang="ts">
interface Props {
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  busy?: boolean
  /**
   * 控件区是否换行排布。默认单行，且每个子项都撑满宽度；开启后交给内容自己排：
   * 标签与输入框同一层的字段（引用 Token 字段）需要它，行才会断在"最后一个标签与输入框之间"。
   */
  wrap?: boolean
}

withDefaults(defineProps<Props>(), {
  size: 'md',
  fullWidth: false,
  disabled: false,
  readonly: false,
  invalid: false,
  busy: false,
  wrap: false,
})

defineOptions({ name: 'OcFieldFrame' })
</script>

<style scoped>
.oc-field-frame {
  display: flex;
  align-items: stretch;
  column-gap: var(--oc-space-1);
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
  border: var(--oc-field-surface-border-width, 1px) solid var(--oc-field-surface-border-color, var(--oc-border-default));
  border-radius: var(--oc-field-surface-border-radius, var(--oc-radius-sm));
  background: var(--oc-field-surface-background, var(--oc-bg-input));
  color: var(--oc-fg-default);
  transition: border-color var(--oc-duration-fast) var(--oc-ease);
}

.oc-field-frame:focus-within:not(.oc-field-frame--disabled):not(.oc-field-frame--readonly) {
  border-color: var(--oc-field-surface-focus-border-color, var(--oc-border-accent));
  box-shadow: var(--oc-field-surface-focus-shadow, var(--oc-focus-ring));
}

.oc-field-frame--sm { height: var(--oc-field-control-height, var(--oc-size-sm)); }
.oc-field-frame--md { height: var(--oc-field-control-height, var(--oc-size-md)); }
.oc-field-frame--lg { height: var(--oc-field-control-height, var(--oc-size-lg)); }

.oc-field-frame--full-width {
  width: 100%;
}

.oc-field-frame--disabled {
  opacity: .5;
  cursor: not-allowed;
}

.oc-field-frame--readonly {
  background: var(--oc-field-readonly-background, var(--oc-bg-raised));
  color: var(--oc-fg-muted);
}

.oc-field-frame--invalid {
  border-color: var(--oc-field-invalid-border-color, var(--oc-danger));
}

.oc-field-frame--busy {
  cursor: progress;
}

.oc-field-frame__prefix,
.oc-field-frame__suffix {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--oc-space-1);
}

.oc-field-frame__control {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: stretch;
  --oc-field-surface-border-width: 0;
  --oc-field-surface-border-radius: 0;
  --oc-field-surface-focus-border-color: transparent;
  --oc-field-surface-focus-shadow: none;
}

.oc-field-frame__control > :deep(*) {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

/* 换行模式：子项按内容取宽，行断在子项之间（对齐用文字基线，标签与输入框的文字落在同一条线上）。 */
.oc-field-frame--wrap .oc-field-frame__control {
  flex-wrap: wrap;
  align-items: baseline;
  align-content: center;
  gap: var(--oc-space-1);
}

.oc-field-frame--wrap .oc-field-frame__control > :deep(*) {
  flex: 0 1 auto;
  width: auto;
}
</style>
