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
          name="nav.chevron-down"
          size="sm"
          tone="muted"
        />
      </button>
    </OcFieldFrame>

    <OcFloatingLayer
      :open="open"
      :anchor="triggerRef"
      placement="bottom-start"
      :match-anchor-width="true"
      :max-height="maxHeight"
      :z-index="zIndex"
      class="oc-select__floating"
      :data-oc-select-owner="selectId"
    >
      <div :id="listboxId" class="oc-select__listbox" role="listbox">
        <OcRow
          v-for="(option, index) in options"
          :id="optionId(index)"
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
          @pointerenter="setActiveIndex(index)"
          @mousedown.prevent
          @click="selectOption(option)"
        >
          <template #title>
            <span class="oc-select__option-label" :style="option.labelStyle"
              :data-tooltip="option.label" data-tooltip-overflow>{{ option.label }}</span>
          </template>
          <template v-if="option.value === modelValue" #append>
            <OcIcon name="action.check" size="sm" tone="active" />
          </template>
        </OcRow>
        <div v-if="options.length === 0" class="oc-select__empty">{{ emptyText }}</div>
      </div>
    </OcFloatingLayer>
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
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, useId, watch } from 'vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcIcon from '../base/OcIcon.vue'
import OcFloatingLayer from './OcFloatingLayer.vue'
import OcRow from './OcRow.vue'

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
  zIndex?: number
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
  zIndex: 2000,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  commit: [value: string]
  'open-change': [open: boolean]
}>()

const attrs = useAttrs()
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)
const selectId = `oc-select-${useId().replace(/:/g, '')}`
const listboxId = `${selectId}-listbox`
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

watch(() => props.options, () => {
  if (!open.value) return
  activeIndex.value = resolveInitialIndex()
})
watch(() => props.disabled || props.readonly, blocked => {
  if (blocked) closeSelect(false)
})

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown, true))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  clearTypeahead()
})

function optionId(index: number): string {
  return `${selectId}-option-${index}`
}

function setOpen(next: boolean): void {
  if (open.value === next) return
  open.value = next
  if (next) activeIndex.value = resolveInitialIndex()
  emit('open-change', next)
}

function toggleOpen(): void {
  if (props.disabled || props.readonly || props.busy) return
  setOpen(!open.value)
}

function closeSelect(restoreFocus: boolean): void {
  setOpen(false)
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

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const path = event.composedPath()
  if (rootRef.value && path.includes(rootRef.value)) return
  const insideFloating = path.some(target => (
    target instanceof HTMLElement && target.dataset.ocSelectOwner === selectId
  ))
  if (!insideFloating) closeSelect(false)
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
  gap: var(--oc-space-2);
  padding: var(--oc-field-content-padding, 0 var(--oc-space-2));
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
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
  transition: transform var(--oc-duration-fast) var(--oc-ease);
}

.oc-select__chevron.is-open {
  transform: rotate(180deg);
}
</style>

<style>
.oc-select__floating {
  overflow: hidden;
  border: 1px solid var(--oc-border-default);
  border-radius: var(--oc-radius-md);
  background: var(--oc-bg-surface);
  box-shadow: var(--oc-shadow-lg);
}

.oc-select__listbox {
  box-sizing: border-box;
  max-height: inherit;
  padding: var(--oc-space-1);
  overflow-y: auto;
}

.oc-select__empty {
  padding: var(--oc-space-3);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
  text-align: center;
}
</style>
