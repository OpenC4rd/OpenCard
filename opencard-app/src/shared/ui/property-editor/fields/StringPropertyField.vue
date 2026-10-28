<template>
  <div v-if="definition.isReadonly" class="readonly-value" :data-tooltip="stringValue || '-'" data-tooltip-overflow>
    {{ stringValue || '-' }}
  </div>
  <OcEnumStepper
    v-else-if="definition.options?.length && definition.presentation === 'stepper'"
    :model-value="stringValue"
    :options="enumOptions"
    @update:model-value="emit('update:value', $event)"
  />
  <OcOptionGroup
    v-else-if="definition.options?.length && definition.presentation === 'option-group'"
    :model-value="stringValue"
    :options="selectOptions"
    appearance="sliding-outline"
    fill
    @update:model-value="emit('update:value', $event)"
  />
  <OcSelect
    v-else-if="definition.options?.length"
    :model-value="stringValue"
    :options="selectOptions"
    :placeholder="definition.placeholder"
    :aria-label="definition.title"
    full-width
    @update:model-value="emit('update:value', $event)"
  />
  <ReferenceStringTokenField
    v-else-if="definition.listSeparator"
    :definition="definition"
    :value="value"
    @update:value="emit('update:value', $event as string)"
  />
  <div v-else class="string-property-field">
    <OcFieldFrame
      :class="definition.multiline ? 'string-property-field__multiline' : 'string-property-field__singleline'"
      full-width
      :readonly="definition.isReadonly"
    >
      <OcFieldInput
        :as="definition.multiline ? 'textarea' : 'input'"
        variant="plain"
        full-width
        class="string-property-field__input"
        input-class="string-property-field__input"
        :type="definition.multiline ? undefined : 'text'"
        :value="draftValue"
        :aria-label="definition.title"
        :readonly="definition.isReadonly"
        :minlength="definition.minLength"
        :maxlength="definition.maxLength"
        :placeholder="definition.placeholder"
        :resize="definition.multiline ? 'none' : undefined"
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
      <div v-if="!definition.multiline && ghostSuffix && !isMenuOpen" class="string-property-field__ghost" aria-hidden="true">
        <span class="string-property-field__ghost-current">{{ draftValue }}</span>
        <span>{{ ghostSuffix }}</span>
      </div>
    </OcFieldFrame>

    <OcOverlayMarker
      ref="layer"
      :group="`completion:${autocompleteId}`"
      :anchor="completionAnchor"
      :owner="completionControl"
      placement="bottom-start"
      :max-height="220"
      :open="isMenuOpen"
      @update:open="isMenuOpen = $event"
      @close="isMenuOpen = false"
    >
      <OcAutocompleteList
        :id="autocompleteId"
        :items="suggestions"
        :active-key="activeKey"
        @select="acceptSuggestionByKey"
      />
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import OcAutocompleteList from '../../../../components/standard/OcAutocompleteList.vue'
import OcEnumStepper from '../../../../components/standard/OcEnumStepper.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import OcOptionGroup from '../../../../components/standard/OcOptionGroup.vue'
import OcOverlayMarker from '../../../../components/standard/OcOverlayMarker.vue'
import OcSelect from '../../../../components/standard/OcSelect.vue'
import type {
  PropertyCompletionItem,
  PropertyEditorFieldDefinition,
} from '../propertyEditor.types'
import ReferenceStringTokenField from './ReferenceStringTokenField.vue'
import { matchStaticCompletion, usePropertyCompletion } from './usePropertyCompletion'

type StringDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'string' }>
type TextControl = HTMLInputElement | HTMLTextAreaElement

const props = defineProps<{
  definition: StringDefinition
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string) => string)
  | undefined
const optionLabel = (option: string) =>
  props.definition.optionLabels?.[option]
  ?? (props.definition.optionLabelKeys?.[option]
    ? translate?.(props.definition.optionLabelKeys[option]!) ?? option
    : option)

const stringValue = computed(() => (props.value == null ? '' : String(props.value)))
const draftValue = ref(stringValue.value)
const activeInput = ref<TextControl | null>(null)
const layer = ref<InstanceType<typeof OcOverlayMarker> | null>(null)
let cancelPending = false

const completion = usePropertyCompletion(() => activeInput.value)
const {
  completionState,
  suggestions,
  isMenuOpen,
  activeKey,
  autocompleteId,
  activeDescendantId,
  anchor: completionAnchor,
  control: completionControl,
} = completion

onBeforeUnmount(() => layer.value?.close())

const selectOptions = computed(() =>
  props.definition.options?.map(option => ({ value: option, label: optionLabel(option) })) ?? [],
)
const enumOptions = computed(() =>
  props.definition.options?.map(option => ({ value: option, label: optionLabel(option) })) ?? [],
)

const autocompleteMatch = computed(() =>
  matchStaticCompletion(draftValue.value, props.definition.completion?.static?.values ?? []),
)

const ghostSuffix = computed(() => {
  const suggestion = autocompleteMatch.value
  if (!suggestion || !draftValue.value) return ''
  return suggestion.slice(draftValue.value.length)
})

const completionProvider = computed(
  () => props.definition.completion?.provider ?? props.definition.binding?.provider,
)

watch(stringValue, (value) => {
  if (value !== draftValue.value) {
    draftValue.value = value
  }
})

watch(completionProvider, () => {
  const control = activeInput.value
  if (
    control
    && document.activeElement === control
    && (isMenuOpen.value || completion.isPending.value)
  ) {
    void refreshCompletion(control)
  }
})

async function refreshCompletion(
  control: TextControl,
  value = draftValue.value,
  cursor = control.selectionStart ?? value.length,
): Promise<void> {
  activeInput.value = control
  const provider = completionProvider.value
  if (!provider || props.definition.isReadonly) return completion.clear()
  await completion.refresh(() => provider({ value, cursor }))
}

function emitValue(value: string): void {
  draftValue.value = value
  if ((props.definition.commitMode ?? 'input') === 'input') emit('update:value', value)
}

function commitDraft(): void {
  const currentValue = stringValue.value
  if (draftValue.value !== currentValue) emit('update:value', draftValue.value)
  if (props.definition.commitMode === 'blur') {
    const submitted = draftValue.value
    void nextTick(() => {
      if (draftValue.value === submitted) draftValue.value = stringValue.value
    })
  }
}

function setCursor(control: TextControl, cursor: number): void {
  nextTick(() => {
    if (document.activeElement !== control) return
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
    const pair = props.definition.autoPairs?.find(({ open, close }) =>
      nextValue.slice(Math.max(0, cursor - open.length), cursor) === open
      && nextValue.slice(cursor, cursor + close.length) !== close,
    )
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
  completion.clear()
  if ((props.definition.commitMode ?? 'input') === 'blur' && !cancelPending) commitDraft()
}

function acceptSuggestionByKey(key: string): void {
  const suggestion = suggestions.value.find(item => item.key === key)
  if (suggestion) acceptSuggestion(suggestion)
}

function acceptSuggestion(suggestion: PropertyCompletionItem): void {
  const state = completionState.value
  const control = activeInput.value
  if (!state || !control) return

  const replaceStart = suggestion.replaceStart ?? state.replaceStart
  const replaceEnd = suggestion.replaceEnd ?? state.replaceEnd
  const value = `${draftValue.value.slice(0, replaceStart)}${suggestion.insertText}${draftValue.value.slice(replaceEnd)}`
  const cursor = replaceStart + suggestion.insertText.length
  emitValue(value)
  if (props.definition.commitMode === 'blur') commitDraft()
  control.value = value
  control.setSelectionRange(cursor, cursor)
  setCursor(control, cursor)

  if (suggestion.keepOpen) {
    void refreshCompletion(control, value, cursor)
  } else {
    completion.clear()
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.definition.isReadonly) return
  if (event.isComposing || event.keyCode === 229) return
  if (completion.handleKeydown(event, acceptSuggestion)) return

  if ((props.definition.commitMode ?? 'input') === 'blur' && event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelPending = true
    draftValue.value = stringValue.value
    ;(event.currentTarget as TextControl).blur()
    cancelPending = false
    return
  }

  if (event.key === 'Enter' && !props.definition.multiline && !event.isComposing) {
    commitDraft()
    return
  }

  if (event.key === 'Tab' && !event.shiftKey && autocompleteMatch.value) {
    event.preventDefault()
    emitValue(autocompleteMatch.value)
  }
}
</script>

<style scoped>
.string-property-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.string-property-field__multiline {
  height: var(
    --oc-field-control-target-height,
    var(--oc-field-control-height, var(--oc-property-row-height))
  );
  transition:
    height var(--oc-duration) var(--oc-ease),
    border-color var(--oc-duration-quick) var(--oc-ease);
}

.string-property-field__multiline:focus-within {
  --oc-field-control-target-height: var(
    --oc-field-control-expanded-height,
    var(--oc-property-row-expanded-height)
  );
}

.string-property-field__input {
  position: relative;
  z-index: 1;
  line-height: normal;
}

.string-property-field__ghost {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: var(--oc-field-content-padding, var(--oc-space-2xs) var(--oc-space-xs));
  font-size: var(--oc-text-base);
  line-height: normal;
  color: var(--oc-fg-disabled);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
}

.string-property-field__ghost-current {
  visibility: hidden;
}

.readonly-value {
  flex: 1;
  min-width: 0;
  padding: var(--oc-field-content-padding, var(--oc-space-2xs) var(--oc-space-xs));
  font-size: var(--oc-text-base);
  line-height: 1.4;
  color: var(--oc-fg-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .string-property-field__multiline {
    transition: none;
  }
}
</style>
