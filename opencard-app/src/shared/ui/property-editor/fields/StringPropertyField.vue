<template>
  <div v-if="definition.isReadonly" class="readonly-value" :data-tooltip="stringValue || '-'" data-tooltip-overflow>
    {{ stringValue || '-' }}
  </div>
  <OcEnumStepper v-else-if="definition.options?.length && definition.presentation === 'stepper'"
    :model-value="stringValue" :options="enumOptions" @update:model-value="emit('update:value', $event)" />
  <OcOptionGroup v-else-if="definition.options?.length && definition.presentation === 'option-group'"
    :model-value="stringValue" :options="selectOptions" appearance="sliding-outline" fill
    @update:model-value="emit('update:value', $event)" />
  <OcSelect v-else-if="definition.options?.length" :model-value="stringValue"
    :options="selectOptions" full-width @update:model-value="emit('update:value', $event)" />
  <OcFieldFrame v-else-if="definition.multiline" class="multiline-field" full-width>
    <OcFieldInput as="textarea" variant="plain" full-width class="multiline-field__input"
      :value="draftValue" :placeholder="definition.placeholder"
      resize="none" @input="handleInput" @blur="handleBlur" @keydown="handleKeydown" />
  </OcFieldFrame>
  <OcFieldFrame v-else class="autocomplete-field" full-width>
    <OcFieldInput
      as="input"
      variant="plain"
      full-width
      class="autocomplete-input"
      input-class="autocomplete-input"
      type="text"
      :value="draftValue"
      :readonly="definition.isReadonly"
      :placeholder="definition.placeholder"
      @input="handleInput"
      @blur="handleBlur"
      @keydown="handleKeydown"
    />
    <div v-if="ghostSuffix" class="autocomplete-ghost" aria-hidden="true">
      <span class="autocomplete-current">{{ draftValue }}</span>
      <span>{{ ghostSuffix }}</span>
    </div>
  </OcFieldFrame>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import OcSelect from '../../../../components/standard/OcSelect.vue'
import OcEnumStepper from '../../../../components/standard/OcEnumStepper.vue'
import OcOptionGroup from '../../../../components/standard/OcOptionGroup.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'string' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()
const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as ((key: string) => string) | undefined
const optionLabel = (option: string) => props.definition.optionLabels?.[option]
  ?? (props.definition.optionLabelKeys?.[option]
    ? translate?.(props.definition.optionLabelKeys[option]!) ?? option
    : option)

const stringValue = computed(() => (props.value == null ? '' : String(props.value)))
const draftValue = ref(stringValue.value)
let cancelPending = false

watch(stringValue, value => {
  draftValue.value = value
})
const selectOptions = computed(() => (
  props.definition.options?.map(option => ({ value: option, label: optionLabel(option) })) ?? []
))
const enumOptions = computed(() => (
  props.definition.options?.map(option => ({ value: option, label: optionLabel(option) })) ?? []
))

const autocompleteMatch = computed(() => {
  const current = draftValue.value
  const suggestions = props.definition.completion?.static?.values ?? []
  if (!current) return ''

  const trailingMatch = current.match(/([a-z%]+)$/i)
  const fragment = trailingMatch?.[1] ?? current
  const prefix = trailingMatch ? current.slice(0, -fragment.length) : ''

  return [...suggestions]
    .filter((suggestion) =>
      suggestion.length > fragment.length &&
      suggestion.toLowerCase().startsWith(fragment.toLowerCase())
    )
    .sort((left, right) => {
      if (left.length !== right.length) {
        return left.length - right.length
      }
      return left.localeCompare(right, undefined, { sensitivity: 'base' })
    })
    .map((suggestion) => `${prefix}${suggestion}`)[0] ?? ''
})

const ghostSuffix = computed(() => {
  const suggestion = autocompleteMatch.value
  const current = draftValue.value
  if (!suggestion || !current) return ''
  return suggestion.slice(current.length)
})

function commitDraft(): void {
  if (draftValue.value !== stringValue.value) emit('update:value', draftValue.value)
}

function handleInput(event: Event): void {
  draftValue.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  if ((props.definition.commitMode ?? 'input') === 'input') emit('update:value', draftValue.value)
}

function handleBlur(): void {
  if ((props.definition.commitMode ?? 'input') === 'blur' && !cancelPending) commitDraft()
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.definition.isReadonly) return
  if ((props.definition.commitMode ?? 'input') === 'blur' && event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelPending = true
    draftValue.value = stringValue.value
    ;(event.currentTarget as HTMLInputElement | HTMLTextAreaElement).blur()
    cancelPending = false
    return
  }
  if ((props.definition.commitMode ?? 'input') === 'blur' && event.key === 'Enter'
    && !props.definition.multiline && !event.isComposing) {
    event.preventDefault()
    ;(event.currentTarget as HTMLInputElement).blur()
    return
  }
  if (event.key !== 'Tab' || !autocompleteMatch.value) return

  event.preventDefault()
  draftValue.value = autocompleteMatch.value
  if ((props.definition.commitMode ?? 'input') === 'input') emit('update:value', draftValue.value)
}
</script>

<style scoped>
.multiline-field {
  flex: 1 1 auto;
  height: var(
    --oc-field-control-target-height,
    var(--oc-field-control-height, var(--oc-property-row-height))
  );
  transition:
    height var(--oc-duration-normal) var(--oc-ease),
    border-color var(--oc-duration-fast) var(--oc-ease);
}

.multiline-field:focus-within {
  --oc-field-control-target-height: var(
    --oc-field-control-expanded-height,
    var(--oc-property-row-expanded-height)
  );
}

.multiline-field :deep(.multiline-field__input) {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: var(--oc-field-content-padding, var(--oc-space-2));
  overflow-y: auto;
  border: 0;
  line-height: 1.45;
}

.multiline-field :deep(.multiline-field__input:focus),
.multiline-field :deep(.multiline-field__input:focus-visible) {
  border-color: transparent;
}

.autocomplete-field {
  flex: 1 1 auto;
}

.autocomplete-field :deep(.autocomplete-input) {
  width: 100%;
  height: 100%;
  align-self: stretch;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  background: transparent;
  border: 0;
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  line-height: normal;
}

.autocomplete-ghost {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  font-size: var(--oc-text-base);
  line-height: normal;
  color: var(--oc-fg-disabled);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
}

.autocomplete-current {
  visibility: hidden;
}

.readonly-value {
  flex: 1;
  min-width: 0;
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  font-size: var(--oc-text-base);
  line-height: 1.4;
  color: var(--oc-fg-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .multiline-field {
    transition: none;
  }
}
</style>
