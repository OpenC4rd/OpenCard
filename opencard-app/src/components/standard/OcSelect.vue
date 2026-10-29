<template>
  <div
    ref="rootRef"
    class="oc-select"
    :class="[{ 'oc-select--full-width': fullWidth, 'is-open': open }, attrs.class]"
    :style="attrs.style"
  >
    <OcFieldFrame
      :size="size"
      :full-width="fullWidth"
      :disabled="disabled"
      :readonly="readonly"
      :invalid="invalid"
      :busy="busy"
    >
      <button
        ref="triggerRef"
        v-bind="triggerAttrs"
        type="button"
        class="oc-select__trigger"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-activedescendant="activeOptionId"
        :aria-readonly="readonly || undefined"
        :disabled="disabled"
        @click="toggleOpen"
        @keydown="handleTriggerKeydown"
      >
        <span class="oc-select__value" :class="{ 'is-placeholder': !selectedOption }"
          :style="selectedOption?.labelStyle"
          :data-tooltip="selectedOption?.label ?? placeholder" data-tooltip-overflow>
          {{ selectedOption?.label ?? placeholder }}
        </span>
        <OcIcon
          class="oc-select__chevron"
          :class="{ 'is-open': open }"
          name="mdiChevronDown"
          size="sm"
          tone="muted"
        />
      </button>
    </OcFieldFrame>

    <OcOverlayMarker
      ref="layer"
      :group="selectId"
      :anchor="triggerRef"
      :owner="rootRef"
      placement="bottom-start"
      :max-height="maxHeight"
      :open="open"
      @update:open="open = $event"
    >
      <div class="oc-select__dropdown" :style="dropdownStyle">
        <OcSelectList
          :id="listboxId"
          :options="options"
          :active-index="activeIndex"
          :model-value="modelValue"
          :empty-text="emptyText"
          @activate="setActiveIndex"
          @select="selectOption"
        />
      </div>
    </OcOverlayMarker>
  </div>
</template>

<script lang="ts">
export type { OcSelectOption } from './OcSelectList.vue'
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, useId, watch, type CSSProperties } from 'vue'
import { useOverlayDismiss } from '../../shared/ui/useOverlayDismiss'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcIcon from '../base/OcIcon.vue'
import OcOverlayMarker from './OcOverlayMarker.vue'
import OcSelectList, { type OcSelectOption } from './OcSelectList.vue'

defineOptions({ name: 'OcSelect', inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: string
  options: readonly OcSelectOption[]
  placeholder?: string
  emptyText?: string
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  busy?: boolean
  maxHeight?: number
}>(), {
  modelValue: '',
  placeholder: 'Select',
  emptyText: 'No options',
  size: 'md',
  fullWidth: false,
  disabled: false,
  readonly: false,
  invalid: false,
  busy: false,
  maxHeight: 240,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  commit: [value: string]
  'open-change': [open: boolean]
}>()

const attrs = useAttrs()
const layer = ref<InstanceType<typeof OcOverlayMarker> | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const activeIndex = ref(-1)
/** 每个实例一个组：下拉之间不需要互斥，点外部由 dismiss 负责。 */
const selectId = `oc-select-${useId().replace(/:/g, '')}`
const listboxId = `${selectId}-listbox`
/** 由宿主同步出来的打开状态：它既是渲染输入（aria/箭头），也是 marker 的打开意图。 */
const open = ref(false)
const triggerWidth = ref(0)
let triggerObserver: ResizeObserver | null = null
let typeahead = ''
let typeaheadTimer: number | null = null

const triggerAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue))
const activeOptionId = computed(() => (
  open.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined
))
/** 列表与触发器同宽：宿主没有这个能力，宽度由调用点喂给内容盒。 */
const dropdownStyle = computed<CSSProperties>(() => (
  triggerWidth.value > 0 ? { width: `${triggerWidth.value}px` } : {}
))

useOverlayDismiss(() => open.value, () => rootRef.value, () => closeSelect(true))

// 选项换了就回到初始项（已选中项，否则首个可用项），与键盘当前位置无关。
watch(() => props.options, () => {
  if (!open.value) return
  activeIndex.value = resolveInitialIndex()
}, { flush: 'sync' })
watch(open, value => {
  emit('open-change', value)
  if (!value) clearTypeahead()
})
watch(() => props.disabled || props.readonly, blocked => {
  if (blocked) closeSelect(false)
})

onMounted(() => {
  const trigger = triggerRef.value
  if (!trigger) return
  triggerWidth.value = trigger.offsetWidth
  if (typeof ResizeObserver === 'undefined') return
  triggerObserver = new ResizeObserver(() => { triggerWidth.value = trigger.offsetWidth })
  triggerObserver.observe(trigger)
})

onBeforeUnmount(() => {
  layer.value?.close()
  triggerObserver?.disconnect()
  triggerObserver = null
  clearTypeahead()
})

function optionId(index: number): string {
  return `${listboxId}-option-${index}`
}

function setOpen(next: boolean): void {
  if (open.value === next) return
  if (!next) {
    closeSelect(false)
    return
  }
  activeIndex.value = resolveInitialIndex()
  open.value = true
}

function toggleOpen(): void {
  if (props.disabled || props.readonly || props.busy) return
  setOpen(!open.value)
}

function closeSelect(restoreFocus: boolean): void {
  open.value = false
  clearTypeahead()
  if (restoreFocus) triggerRef.value?.focus()
}

function resolveInitialIndex(): number {
  const selectedIndex = props.options.findIndex(option => option.value === props.modelValue && !option.disabled)
  if (selectedIndex >= 0) return selectedIndex
  return props.options.findIndex(option => !option.disabled)
}

function setActiveIndex(index: number): void {
  if (!props.options[index]?.disabled) activeIndex.value = index
}

function moveActive(direction: 1 | -1): void {
  if (props.options.length === 0) return
  let next = activeIndex.value
  for (let count = 0; count < props.options.length; count += 1) {
    next = (next + direction + props.options.length) % props.options.length
    if (!props.options[next]?.disabled) {
      activeIndex.value = next
      return
    }
  }
}

function selectOption(option: OcSelectOption): void {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  emit('commit', option.value)
  closeSelect(true)
}

function handleTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled || props.readonly || props.busy) return

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) setOpen(true)
    else moveActive(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Home' || event.key === 'End') {
    if (!open.value) return
    event.preventDefault()
    const indexes = props.options.map((_, index) => index).filter(index => !props.options[index]?.disabled)
    activeIndex.value = event.key === 'Home'
      ? (indexes[0] ?? -1)
      : (indexes[indexes.length - 1] ?? -1)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!open.value) setOpen(true)
    else if (activeIndex.value >= 0) selectOption(props.options[activeIndex.value]!)
    return
  }
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    closeSelect(true)
    return
  }
  if (event.key === 'Tab') {
    closeSelect(false)
    return
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    handleTypeahead(event.key)
  }
}

function handleTypeahead(character: string): void {
  typeahead += character.toLocaleLowerCase()
  if (!open.value) setOpen(true)
  const match = props.options.findIndex(option => (
    !option.disabled && option.label.toLocaleLowerCase().startsWith(typeahead)
  ))
  if (match >= 0) activeIndex.value = match
  if (typeaheadTimer !== null) window.clearTimeout(typeaheadTimer)
  typeaheadTimer = window.setTimeout(clearTypeahead, 500)
}

function clearTypeahead(): void {
  typeahead = ''
  if (typeaheadTimer !== null) window.clearTimeout(typeaheadTimer)
  typeaheadTimer = null
}

</script>

<style scoped>
.oc-select {
  display: inline-block;
  min-width: 0;
}

.oc-select--full-width {
  width: 100%;
}

.oc-select__trigger {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  align-items: center;
  gap: var(--oc-space-xs);
  padding: var(--oc-field-content-padding, 0 var(--oc-space-xs));
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.oc-select__trigger:disabled {
  cursor: not-allowed;
}

.oc-select__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oc-select__value.is-placeholder {
  color: var(--oc-fg-muted);
}

.oc-select__chevron {
  transition: transform var(--oc-duration-quick) var(--oc-ease);
}

.oc-select__chevron.is-open {
  transform: rotate(180deg);
}

/* 列表的 max-height 从这里继承：宿主内容盒 → 这一层 → listbox，滚动仍归 listbox。 */
.oc-select__dropdown {
  max-height: inherit;
}
</style>
