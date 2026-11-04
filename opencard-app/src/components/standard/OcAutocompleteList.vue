<!--
  自动补全的列表内容：只渲染 listbox 与选项，位置、尺寸、显隐由浮层容器提供。

  职责边界：
  - 不创建浮层、不做定位、不判断打开状态。
  - 键盘由输入框一侧消费；这里只用 @pointerdown.prevent 选择，保持焦点留在输入框。
  - 指针移入即成为当前项：任何时候只有一行高亮。
-->
<template>
  <div :id="id" class="oc-autocomplete-list" role="listbox">
    <OcRow
      v-for="item in items"
      :id="completionOptionId(id, item.key)"
      :key="item.key"
      :ref="(element) => setOptionElement(item.key, element)"
      :class="{ 'is-active': item.key === activeKey }"
      role="option"
      :aria-selected="item.key === activeKey"
      @pointerenter="emit('activate', item.key)"
      @pointerdown.prevent="emit('select', item.key)"
    >
      <template v-if="item.icon || item.thumbnailStyle" #leading>
        <OcIcon v-if="item.icon" :name="item.icon" size="sm" />
        <span v-else class="oc-autocomplete-list__thumbnail"
          :class="{ 'oc-project-icon': isProjectIconStyle(item.thumbnailStyle!) }"
          :style="item.thumbnailStyle" role="img" :aria-label="item.thumbnailLabel ?? item.label" />
      </template>
      <template #title>
        <span class="oc-autocomplete-list__title">
          <OcOverflowText class="oc-autocomplete-list__label" :text="item.label"
            :active="item.key === activeKey" :content-style="item.labelStyle" />
          <OcOverflowText v-if="item.detail" class="oc-autocomplete-list__detail"
            :text="item.detail" :active="item.key === activeKey" align="right" />
        </span>
      </template>
    </OcRow>
  </div>
</template>

<script setup lang="ts">
import { nextTick, watch, type ComponentPublicInstance } from 'vue'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import { completionOptionId } from '../../shared/ui/useCompletionList'
import { isProjectIconStyle } from '../../shared/ui/visual/projectIconStyle'
import OcIcon from '../base/OcIcon.vue'
import OcOverflowText from './OcOverflowText.vue'
import OcRow from './OcRow.vue'

export type OcAutocompleteItem = {
  key: string
  label: string
  detail?: string
  icon?: IconToken
  thumbnailStyle?: Readonly<Record<string, string>>
  thumbnailLabel?: string
  labelStyle?: Readonly<Record<string, string>>
}

const props = defineProps<{
  id: string
  items: readonly OcAutocompleteItem[]
  activeKey: string | null
}>()

const emit = defineEmits<{
  activate: [key: string]
  select: [key: string]
}>()

const optionElements = new Map<string, HTMLElement>()

/** 行由 OcRow 渲染，组件实例要把根元素取出来才能用于滚动定位。 */
function setOptionElement(key: string, element: Element | ComponentPublicInstance | null): void {
  const root = element instanceof HTMLElement
    ? element
    : (element as ComponentPublicInstance | null)?.$el

  if (root instanceof HTMLElement) optionElements.set(key, root)
  else optionElements.delete(key)
}

watch(
  [() => props.activeKey, () => props.items],
  async ([activeKey]) => {
    if (!activeKey) return
    await nextTick()
    optionElements.get(activeKey)?.scrollIntoView?.({ block: 'nearest' })
  },
  { deep: true, immediate: true },
)
</script>

<style scoped>
/* 容器负责定位与最大高度；列表自己继承它并滚动。 */
.oc-autocomplete-list {
  box-sizing: border-box;
  width: max-content;
  max-width: min(420px, 80vw);
  max-height: inherit;
  min-width: 240px;
  overflow-y: auto;
  padding: var(--oc-space-2xs);
}

.oc-autocomplete-list__thumbnail {
  display: inline-block;
  flex: none;
  font-size: var(--oc-size-sm);
  background-repeat: no-repeat;
  vertical-align: text-bottom;
}

.oc-autocomplete-list__title {
  display: flex;
  align-items: baseline;
  gap: var(--oc-space-sm);
}

.oc-autocomplete-list__label {
  flex: 1 1 auto;
}

/* 指针所在行已经通过 activate 成为当前项；hover 不再另画一层，免得和键盘当前项同时亮。 */
.oc-autocomplete-list > .oc-row:hover:not(.is-active):not(.is-disabled) {
  background-image: none;
}

.oc-autocomplete-list__detail {
  flex: 0 1 auto;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}
</style>
