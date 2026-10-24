<!--
  自动补全的列表内容：只渲染 listbox 与选项，位置、尺寸、显隐由浮层容器提供。

  职责边界：
  - 不创建浮层、不做定位、不判断打开状态。
  - 键盘由输入框一侧消费；这里只用 @pointerdown.prevent 选择，保持焦点留在输入框。
-->
<template>
  <div :id="id" class="oc-autocomplete-list" role="listbox">
    <OcRow
      v-for="item in items"
      :id="getOptionId(item.key)"
      :key="item.key"
      :ref="(element) => setOptionElement(item.key, element)"
      :class="{ 'is-active': item.key === activeKey }"
      role="option"
      :aria-selected="item.key === activeKey"
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
          <OcOverflowText v-if="item.detail && detailLayout === 'inline'"
            class="oc-autocomplete-list__detail oc-autocomplete-list__detail--inline"
            :text="item.detail" :active="item.key === activeKey" align="right" />
        </span>
      </template>
      <template v-if="item.detail && detailLayout === 'stacked'" #subtitle>
        <OcOverflowText class="oc-autocomplete-list__detail"
          :text="item.detail" :active="item.key === activeKey" align="right" />
      </template>
    </OcRow>
  </div>
</template>

<script setup lang="ts">
import { nextTick, watch, type ComponentPublicInstance } from 'vue'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
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

const props = withDefaults(defineProps<{
  id: string
  items: readonly OcAutocompleteItem[]
  activeKey: string | null
  detailLayout?: 'stacked' | 'inline'
}>(), {
  detailLayout: 'stacked',
})

const emit = defineEmits<{
  select: [key: string]
}>()

const optionElements = new Map<string, HTMLElement>()

function getOptionId(key: string): string {
  return `${props.id}-option-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

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
  min-width: var(--oc-autocomplete-popover-min-width);
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

.oc-autocomplete-list__detail--inline {
  flex: 0 1 auto;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}
</style>
