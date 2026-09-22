<template>
  <ReferenceStringTokenField v-if="definition.listSeparator" :definition="definition" :value="value"
    @update:value="emit('update:value', $event)" />

  <div v-else class="reference-string-field">
    <OcFieldFrame v-if="definition.multiline" class="reference-string-field__multiline" full-width
      :readonly="definition.isReadonly">
      <OcFieldInput
        as="textarea"
        variant="plain"
        full-width
        class="reference-string-field__input"
        :value="draftValue"
        :readonly="definition.isReadonly"
        :minlength="definition.minLength"
        :maxlength="definition.maxLength"
        :placeholder="definition.placeholder"
        resize="none"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="isMenuOpen"
        :aria-controls="autocompleteId"
        :aria-activedescendant="activeDescendantId"
        @focus="handleFocus"
        @blur="handleBlur"
        @click="handleCursorChange"
        @input="handleInput"
        @keydown="handleKeydown"
        @keyup="handleCursorKeyup"
      />
    </OcFieldFrame>

    <OcFieldFrame v-else class="reference-string-field__singleline" full-width
      :readonly="definition.isReadonly">
      <OcFieldInput
        as="input"
        variant="plain"
        full-width
        class="reference-string-field__input"
        type="text"
        :value="draftValue"
        :readonly="definition.isReadonly"
        :minlength="definition.minLength"
        :maxlength="definition.maxLength"
        :placeholder="definition.placeholder"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="isMenuOpen"
        :aria-controls="autocompleteId"
        :aria-activedescendant="activeDescendantId"
        @focus="handleFocus"
        @blur="handleBlur"
        @click="handleCursorChange"
        @input="handleInput"
        @keydown="handleKeydown"
        @keyup="handleCursorKeyup"
      />
      <div v-if="ghostSuffix && !isMenuOpen" class="reference-string-field__ghost" aria-hidden="true">
        <span class="reference-string-field__ghost-current">{{ draftValue }}</span>
        <span>{{ ghostSuffix }}</span>
      </div>
    </OcFieldFrame>

    <OcAutocompletePopover
      :id="autocompleteId"
      :open="isMenuOpen"
      :anchor="activeInput"
      :items="suggestions"
      :active-key="activeKey"
      @select="acceptSuggestionByKey"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import type {
  PropertyCompletionItem,
  PropertyCompletionResult,
  PropertyEditorFieldDefinition,
} from '../propertyEditor.types'
import OcAutocompletePopover from '../../../../components/standard/OcAutocompletePopover.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import ReferenceStringTokenField from './ReferenceStringTokenField.vue'

type StringDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'string' }>
type TextControl = HTMLInputElement | HTMLTextAreaElement

const props = defineProps<{
  definition: StringDefinition
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const draftValue = ref(props.value == null ? '' : String(props.value))
const activeInput = ref<TextControl | null>(null)
const completionState = ref<PropertyCompletionResult | null>(null)
const isMenuOpen = ref(false)
const activeKey = ref<string | null>(null)
const autocompleteId = useId()

const suggestions = computed(() => {
  const result = completionState.value
  return result
    ? [...result.items, ...(result.parent ? [result.parent] : [])]
    : []
})
const activeDescendantId = computed(() => {
  if (!activeKey.value) return undefined
  return autocompleteId + '-option-' + activeKey.value.replace(/[^a-zA-Z0-9_-]/g, '-')
})

const autocompleteMatch = computed(() => {
  const current = draftValue.value
  const values = props.definition.completion?.static?.values ?? []
  if (!current) return ''

  const trailingMatch = current.match(/([a-z%]+)$/i)
  const fragment = trailingMatch?.[1] ?? current
  const prefix = trailingMatch ? current.slice(0, -fragment.length) : ''

  return [...values]
    .filter((suggestion) => suggestion.length > fragment.length
      && suggestion.toLowerCase().startsWith(fragment.toLowerCase()))
    .sort((left, right) => left.length - right.length
      || left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .map((suggestion) => `${prefix}${suggestion}`)[0] ?? ''
})

const ghostSuffix = computed(() => {
  const suggestion = autocompleteMatch.value
  if (!suggestion || !draftValue.value) return ''
  return suggestion.slice(draftValue.value.length)
})

watch(() => props.value, (value) => {
  const nextValue = value == null ? '' : String(value)
  if (nextValue !== draftValue.value) {
    draftValue.value = nextValue
  }
})

watch(suggestions, (items) => {
  if (items.some((item) => item.key === activeKey.value)) {
    return
  }
  activeKey.value = items[0]?.key ?? null
})

watch(() => props.definition.completion, () => {
  const control = activeInput.value
  if (control && document.activeElement === control) void refreshCompletion(control)
})

let completionRequestId = 0

async function refreshCompletion(
  control: TextControl,
  value = draftValue.value,
  cursor = control.selectionStart ?? value.length,
): Promise<void> {
  activeInput.value = control
  const completion = props.definition.completion
  if (!completion?.provider) {
    completionState.value = null
    isMenuOpen.value = false
    return
  }

  const requestId = ++completionRequestId
  const result = await completion.provider({ value, cursor })
  if (requestId !== completionRequestId) return
  completionState.value = result
  isMenuOpen.value = suggestions.value.length > 0
  activeKey.value = suggestions.value[0]?.key ?? null
}

function emitValue(value: string): void {
  draftValue.value = value
  if ((props.definition.commitMode ?? 'input') === 'input') emit('update:value', value)
}

function commitDraft(): void {
  const currentValue = props.value == null ? '' : String(props.value)
  if (draftValue.value !== currentValue) emit('update:value', draftValue.value)
}

function setCursor(control: TextControl, cursor: number): void {
  nextTick(() => {
    control.focus()
    control.setSelectionRange(cursor, cursor)
  })
}

function handleInput(event: Event): void {
  const control = event.target as TextControl
  activeInput.value = control
  const inputEvent = event as InputEvent
  let nextValue = control.value
  const cursor = control.selectionStart ?? nextValue.length

  if (inputEvent.inputType === 'insertText') {
    const pair = props.definition.autoPairs?.find(({ open, close }) => (
      nextValue.slice(Math.max(0, cursor - open.length), cursor) === open
      && nextValue.slice(cursor, cursor + close.length) !== close
    ))
    if (pair) {
      nextValue = `${nextValue.slice(0, cursor)}${pair.close}${nextValue.slice(cursor)}`
      control.value = nextValue
      setCursor(control, cursor)
    }
  }

  emitValue(nextValue)
  void refreshCompletion(control, nextValue, cursor)
}

function handleFocus(event: FocusEvent): void {
  void refreshCompletion(event.target as TextControl)
}

function handleCursorChange(event: MouseEvent): void {
  void refreshCompletion(event.target as TextControl)
}

function handleCursorKeyup(event: KeyboardEvent): void {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    void refreshCompletion(event.target as TextControl)
  }
}

function handleBlur(): void {
  if ((props.definition.commitMode ?? 'input') === 'blur') commitDraft()
  window.setTimeout(() => {
    if (document.activeElement !== activeInput.value) {
      isMenuOpen.value = false
    }
  }, 0)
}

function acceptSuggestionByKey(key: string): void {
  const suggestion = suggestions.value.find((item) => item.key === key)
  if (suggestion) {
    acceptSuggestion(suggestion)
  }
}

function acceptSuggestion(suggestion: PropertyCompletionItem): void {
  const state = completionState.value
  const control = activeInput.value
  if (!state || !control) return

  const value = `${draftValue.value.slice(0, state.replaceStart)}${suggestion.insertText}${draftValue.value.slice(state.replaceEnd)}`
  const cursor = state.replaceStart + suggestion.insertText.length
  emitValue(value)
  control.value = value
  control.setSelectionRange(cursor, cursor)
  setCursor(control, cursor)

  if (suggestion.keepOpen) {
    void refreshCompletion(control, value, cursor)
  } else {
    completionState.value = null
    isMenuOpen.value = false
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (isMenuOpen.value && suggestions.value.length > 0) {
    if (event.key === 'Tab' && event.shiftKey) {
      const parent = completionState.value?.parent
      if (!parent) return
      event.preventDefault()
      acceptSuggestion(parent)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const currentIndex = Math.max(0, suggestions.value.findIndex((item) => item.key === activeKey.value))
      activeKey.value = suggestions.value[(currentIndex + 1) % suggestions.value.length]?.key ?? null
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const currentIndex = Math.max(0, suggestions.value.findIndex((item) => item.key === activeKey.value))
      activeKey.value = suggestions.value[
        (currentIndex - 1 + suggestions.value.length) % suggestions.value.length
      ]?.key ?? null
      return
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      if (activeKey.value) acceptSuggestionByKey(activeKey.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      isMenuOpen.value = false
      return
    }
  }

  if (event.key === 'Tab' && !event.shiftKey && autocompleteMatch.value) {
    event.preventDefault()
    emitValue(autocompleteMatch.value)
  }
}
</script>

<style scoped>
.reference-string-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.reference-string-field__multiline {
  height: var(
    --oc-field-control-target-height,
    var(--oc-field-control-height, var(--oc-property-row-height))
  );
  transition: height var(--oc-duration-normal) var(--oc-ease);
}

.reference-string-field__multiline:focus-within {
  --oc-field-control-target-height: var(
    --oc-field-control-expanded-height,
    var(--oc-property-row-expanded-height)
  );
}

.reference-string-field__input {
  width: 100%;
  height: 100%;
  border: 0;
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  background: transparent;
}

.reference-string-field__multiline :deep(.reference-string-field__input) {
  padding: var(--oc-field-content-padding, var(--oc-space-2));
  overflow-y: auto;
}

.reference-string-field__ghost {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2));
  color: var(--oc-fg-disabled);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
}

.reference-string-field__ghost-current {
  visibility: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .reference-string-field__multiline {
    transition: none;
  }
}
</style>
