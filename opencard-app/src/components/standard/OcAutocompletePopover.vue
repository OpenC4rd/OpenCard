<template>
  <OcFloatingLayer
    :open="open && items.length > 0"
    :anchor="anchor"
    :placement="placement"
    :max-height="maxHeight"
    :match-anchor-width="matchAnchorWidth"
    class="oc-autocomplete-popover oc-floating-layer--surface"
    role="listbox"
    :id="id"
  >
    <div class="oc-autocomplete-popover__scroll">
      <OcRow
        v-for="item in items"
        :id="getOptionId(item.key)"
        :key="item.key"
        :ref="(element) => setOptionElement(item.key, element)"
        class="oc-autocomplete-popover__option"
        :class="{ 'is-active': item.key === activeKey }"
        role="option"
        :aria-selected="item.key === activeKey"
        @pointerdown.prevent="emit('select', item.key)"
      >
        <template v-if="item.icon || item.thumbnailStyle" #leading>
          <OcIcon v-if="item.icon" :name="item.icon" size="sm" />
          <span v-else class="oc-autocomplete-popover__thumbnail"
            :class="{ 'oc-project-icon': isProjectIconStyle(item.thumbnailStyle!) }"
            :style="item.thumbnailStyle" role="img" :aria-label="item.thumbnailLabel ?? item.label" />
        </template>
        <template #title>
          <span class="oc-autocomplete-popover__title">
            <OcOverflowText class="oc-autocomplete-popover__label" :text="item.label"
              :active="item.key === activeKey" :content-style="item.labelStyle" />
            <OcOverflowText v-if="item.detail && detailLayout === 'inline'"
              class="oc-autocomplete-popover__detail oc-autocomplete-popover__detail--inline"
              :text="item.detail" :active="item.key === activeKey" align="right" />
          </span>
        </template>
        <template v-if="item.detail && detailLayout === 'stacked'" #subtitle>
          <OcOverflowText class="oc-autocomplete-popover__detail"
            :text="item.detail" :active="item.key === activeKey" align="right" />
        </template>
      </OcRow>
    </div>
  </OcFloatingLayer>
</template>

<script setup lang="ts">
import { nextTick, watch, type ComponentPublicInstance } from 'vue'
import type { Placement } from '@floating-ui/vue'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import { isProjectIconStyle } from '../../shared/ui/visual/projectIconStyle'
import OcIcon from '../base/OcIcon.vue'
import OcFloatingLayer from './OcFloatingLayer.vue'
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
  open: boolean
  anchor: HTMLElement | DOMRect | null
  items: readonly OcAutocompleteItem[]
  activeKey: string | null
  placement?: Placement
  maxHeight?: number
  matchAnchorWidth?: boolean
  detailLayout?: 'stacked' | 'inline'
}>(), {
  placement: 'bottom-start',
  maxHeight: 220,
  matchAnchorWidth: true,
  detailLayout: 'stacked',
})

const emit = defineEmits<{
  select: [key: string]
}>()

const optionElements = new Map<string, HTMLElement>()

function getOptionId(key: string): string {
  return `${props.id}-option-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

/** 行现在由 OcRow 渲染，组件实例要把根元素取出来才能用于滚动定位。 */
function setOptionElement(key: string, element: Element | ComponentPublicInstance | null): void {
  const root = element instanceof HTMLElement
    ? element
    : (element as ComponentPublicInstance | null)?.$el

  if (root instanceof HTMLElement) optionElements.set(key, root)
  else optionElements.delete(key)
}

watch(
  () => [props.open, props.activeKey, props.items] as const,
  async ([open, activeKey]) => {
    if (!open || !activeKey) return
    await nextTick()
    optionElements.get(activeKey)?.scrollIntoView?.({ block: 'nearest' })
  },
  { deep: true },
)
</script>

<style scoped>
.oc-autocomplete-popover {
  min-width: var(--oc-autocomplete-popover-min-width);
  padding: var(--oc-space-2xs);
  --oc-floating-layer-radius: var(--oc-radius-control);
}

.oc-autocomplete-popover__scroll {
  max-height: inherit;
  overflow-y: auto;
}

.oc-autocomplete-popover__thumbnail {
  display: inline-block;
  flex: none;
  font-size: var(--oc-size-sm);
  background-repeat: no-repeat;
  vertical-align: text-bottom;
}

.oc-autocomplete-popover__title {
  display: flex;
  align-items: baseline;
  gap: var(--oc-space-sm);
}

.oc-autocomplete-popover__label {
  flex: 1 1 auto;
}

.oc-autocomplete-popover__detail--inline {
  flex: 0 1 auto;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}
</style>
