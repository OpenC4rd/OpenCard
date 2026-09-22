<!--
  Standard 交互行：leading + 标题（可带副文本）+ 尾部追加。

  职责边界：
  - 只提供行盒几何与状态外观（悬浮、当前高亮、已选中、禁用）
  - 不携带 role、tabindex、键盘与事件：这些由使用方通过属性透传到根元素
  - 行内不含任何交互逻辑，也不读取业务数据

  状态类（写在根元素上）：
  - `is-active`   键盘或指针当前所在项
  - `is-selected` 已选中项
  - `is-disabled` 不可用（原生 button 也可直接用 :disabled）
-->
<template>
  <component :is="as" class="oc-row" v-bind="$attrs">
    <span v-if="$slots.leading" class="oc-row__leading"><slot name="leading" /></span>
    <span class="oc-row__body">
      <span class="oc-row__title"><slot name="title" /></span>
      <span v-if="subtitle || $slots.subtitle" class="oc-row__subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </span>
    </span>
    <span v-if="$slots.append" class="oc-row__append" data-tooltip-group><slot name="append" /></span>
  </component>
</template>

<script setup lang="ts">
interface OcRowProps {
  /** 根元素标签。需要原生按钮语义（点击、禁用、表单提交）时传 'button'。 */
  as?: 'div' | 'button'
  /** 副文本：标题下方的一行说明。 */
  subtitle?: string
}

defineOptions({ name: 'OcRow', inheritAttrs: false })

withDefaults(defineProps<OcRowProps>(), {
  as: 'div',
  subtitle: undefined,
})
</script>

<style scoped>
.oc-row {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  min-height: var(--oc-size-md);
  align-items: center;
  gap: var(--oc-space-2);
  padding-inline: var(--oc-space-3);
  border: 0;
  border-radius: var(--oc-radius-sm);
  background: transparent;
  color: var(--oc-fg-default);
  font: inherit;
  text-align: start;
  transition: background-color var(--oc-duration-fast) var(--oc-ease);
}

/* 只有可操作的行才是按钮指针；禁用行保持默认指针（铁律 16：不改鼠标）。 */
button.oc-row:not(:disabled):not(.is-disabled) {
  cursor: pointer;
}

/* 禁用行不响应悬停高光：它本来就不是可操作目标（铁律 16：只降不透明度）。 */
.oc-row:hover:not(.is-disabled):not(:disabled),
.oc-row.is-active:not(.is-disabled):not(:disabled),
.oc-row:focus-visible:not(.is-disabled):not(:disabled) {
  background: var(--oc-bg-hover);
}

.oc-row:focus-visible {
  outline: none;
}

.oc-row.is-selected {
  background: var(--oc-bg-selected);
}

.oc-row.is-disabled,
.oc-row:disabled {
  opacity: var(--oc-opacity-disabled);
}

.oc-row__leading {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-1);
}

.oc-row__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.oc-row__title,
.oc-row__subtitle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oc-row__subtitle {
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

/* 尾部可收缩：让位顺序由尾部内部元素自己声明（例如尾部文本先让、命令后让）。
   标题所在的 body 基数更大，正常宽度下先收缩的是它，尾部图标不会被压扁。 */
.oc-row__append {
  flex: 0 1 auto;
  min-width: 0;
  margin-inline-start: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-1);
}

/*
 * 尾部只有徽标与命令时不再收缩：负空间按基数分摊，长标题的行会把尾部一起挤窄，
 * 命令于是溢出盒外，把这一行的勾选框推得比别的行更靠右（探进滚动条底下）。
 * 没有尾部文本可让位时让标题独自让位，尾部留原位；带尾部文本的行仍然先让文本，让位顺序不变。
 */
.oc-row__append:not(:has(.oc-node-tail__text)) {
  flex-shrink: 0;
}
</style>
