<!--
  下拉列表的内容：只渲染 listbox 与选项，位置、尺寸、显隐由浮层容器提供。

  职责边界：
  - 不创建浮层、不做定位、不判断打开状态。
  - 键盘与 typeahead 由触发器一侧消费；这里用 @mousedown.prevent 保持焦点留在触发器上。
-->
<template>
  <div :id="id" class="oc-select__listbox" role="listbox">
    <OcRow
      v-for="(option, index) in options"
      :id="`${id}-option-${index}`"
      :key="option.value"
      as="button"
      type="button"
      class="oc-select__option"
      :class="{
        'is-active': index === activeIndex,
        'is-selected': option.value === modelValue,
      }"
      role="option"
      tabindex="-1"
      :aria-selected="option.value === modelValue"
      :disabled="option.disabled"
      @pointerenter="emit('activate', index)"
      @mousedown.prevent
      @click="emit('select', option)"
    >
      <template #title>
        <span class="oc-select__option-label" :style="option.labelStyle"
          :data-tooltip="option.label" data-tooltip-overflow>{{ option.label }}</span>
      </template>
      <template v-if="option.value === modelValue" #append>
        <OcIcon name="mdiCheck" size="sm" />
      </template>
    </OcRow>
    <div v-if="options.length === 0" class="oc-select__empty">{{ emptyText }}</div>
  </div>
</template>

<script lang="ts">
export interface OcSelectOption {
  value: string
  label: string
  disabled?: boolean
  labelStyle?: Readonly<Record<string, string>>
}
</script>

<script setup lang="ts">
import OcIcon from '../base/OcIcon.vue'
import OcRow from './OcRow.vue'

defineOptions({ name: 'OcSelectList' })

defineProps<{
  id: string
  options: readonly OcSelectOption[]
  activeIndex: number
  modelValue: string
  emptyText: string
}>()

const emit = defineEmits<{
  activate: [index: number]
  select: [option: OcSelectOption]
}>()
</script>

<style scoped>
/* 容器负责定位与最大高度；列表自己继承它并滚动。 */
.oc-select__listbox {
  box-sizing: border-box;
  max-height: inherit;
  padding: var(--oc-space-2xs);
  overflow-y: auto;
}

.oc-select__empty {
  padding: var(--oc-space-sm);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
  text-align: center;
}
</style>
