<!-- Base 复选框：勾选控件，支持 v-model:checked 双向绑定。 -->

<template>
  <label class="oc-checkbox" :class="[{ 'oc-checkbox--disabled': disabled }, attrs.class]" :style="attrs.style">
    <input
      ref="inputRef"
      type="checkbox"
      class="oc-checkbox__input"
      :checked="checked"
      :aria-checked="indeterminate ? 'mixed' : checked"
      :disabled="disabled"
      v-bind="inputAttrs"
      @change="handleChange"
    />
    <div class="oc-checkbox__box" />
    <span v-if="label || $slots.default" class="oc-checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useAttrs, watch } from 'vue'

defineOptions({ name: 'OcCheckbox', inheritAttrs: false })

interface Props {
  checked?: boolean
  indeterminate?: boolean
  disabled?: boolean
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  checked: false,
  indeterminate: false,
  disabled: false,
})

const attrs = useAttrs()
const inputRef = ref<HTMLInputElement | null>(null)
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const emit = defineEmits<{
  'update:checked': [value: boolean]
  'change': [value: boolean, event: Event]
}>()

onMounted(syncIndeterminate)
watch(() => props.indeterminate, syncIndeterminate)

function syncIndeterminate(): void {
  if (inputRef.value) inputRef.value.indeterminate = props.indeterminate
}

const handleChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.checked
  emit('update:checked', value)
  emit('change', value, event)
}
</script>

<style scoped>
.oc-checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-2);
  cursor: pointer;
  color: var(--oc-fg-default);
  font-size: var(--oc-text-base);
}

.oc-checkbox__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  margin: 0;
  cursor: pointer;
}

.oc-checkbox__box {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border: 1px solid var(--oc-border-default);
  border-radius: var(--oc-radius-sm);
  background-color: transparent;
  transition: all var(--oc-duration-fast) var(--oc-ease);
  position: relative;
}

.oc-checkbox__input:focus-visible ~ .oc-checkbox__box {
  box-shadow: var(--oc-focus-ring);
}

.oc-checkbox__input:checked ~ .oc-checkbox__box {
  background-color: var(--oc-bg-accent);
  border-color: var(--oc-bg-accent);
}

.oc-checkbox__input:indeterminate ~ .oc-checkbox__box {
  background-color: var(--oc-bg-accent);
  border-color: var(--oc-bg-accent);
}

.oc-checkbox__input:indeterminate ~ .oc-checkbox__box::after {
  content: '';
  position: absolute;
  top: 5px;
  right: 3px;
  left: 3px;
  height: 2px;
  border-radius: 1px;
  background: var(--oc-accent-fg);
}

.oc-checkbox__input:checked:not(:indeterminate) ~ .oc-checkbox__box::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 0px;
  width: 4px;
  height: 8px;
  border: solid var(--oc-accent-fg);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.oc-checkbox__label {
  user-select: none;
}

.oc-checkbox--disabled {
  opacity: var(--oc-opacity-disabled);
  cursor: not-allowed;
}

.oc-checkbox--disabled .oc-checkbox__input {
  cursor: not-allowed;
}
</style>
