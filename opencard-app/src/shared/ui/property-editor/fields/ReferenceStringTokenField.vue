<!-- 多项字符串字段：已提交的项显示为标签，最后一段用输入框编辑；值仍是单个字符串，分隔符见 definition.listSeparator。 -->
<template>
  <div class="reference-string-token-field-shell">
    <OcFieldFrame class="reference-string-token-field" full-width wrap :readonly="definition.isReadonly"
      :invalid="hasInvalidToken">
      <span v-for="(token, index) in tokens" :key="`${index}:${token}`"
        class="reference-string-token-field__token" :class="{ 'is-invalid': isInvalidToken(token) }">
        <span class="reference-string-token-field__token-text">{{ token }}</span>
        <OcButton class="reference-string-token-field__token-remove" icon-only size="sm" variant="ghost"
          icon="action.close" :data-tooltip="removeText" :aria-label="removeText"
          :disabled="definition.isReadonly" @click="removeToken(index)" />
      </span>

      <OcFieldInput v-if="definition.multiline" as="textarea" variant="plain" full-width
        class="reference-string-token-field__input" :value="draft" :readonly="definition.isReadonly"
        :minlength="definition.minLength" :maxlength="definition.maxLength"
        :placeholder="tokens.length ? undefined : definition.placeholder"
        resize="none" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list"
        :aria-invalid="hasInvalidToken" :aria-expanded="isMenuOpen" :aria-controls="autocompleteId"
        :aria-activedescendant="activeDescendantId"
        @focus="handleFocus" @blur="handleBlur" @click="handleCursorChange" @input="handleInput"
        @keydown="handleKeydown" @keyup="handleCursorKeyup" @paste="handlePaste" />
      <OcFieldInput v-else as="input" variant="plain" full-width class="reference-string-token-field__input"
        type="text" :value="draft" :readonly="definition.isReadonly"
        :minlength="definition.minLength" :maxlength="definition.maxLength"
        :placeholder="tokens.length ? undefined : definition.placeholder"
        autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list"
        :aria-invalid="hasInvalidToken" :aria-expanded="isMenuOpen" :aria-controls="autocompleteId"
        :aria-activedescendant="activeDescendantId"
        @focus="handleFocus" @blur="handleBlur" @click="handleCursorChange" @input="handleInput"
        @keydown="handleKeydown" @keyup="handleCursorKeyup" @paste="handlePaste" />
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
import { useI18n } from 'vue-i18n'
import type {
  PropertyCompletionItem,
  PropertyCompletionResult,
  PropertyEditorFieldDefinition,
} from '../propertyEditor.types'
import {
  joinReferenceStringTokens,
  referenceStringSeparatorChar,
  referenceStringTokenPrefix,
  splitPastedReferenceStringTokens,
  splitReferenceStringTokens,
  type ReferenceStringListSeparator,
} from './referenceStringTokens'
import OcAutocompletePopover from '../../../../components/standard/OcAutocompletePopover.vue'
import OcButton from '../../../../components/base/OcButton.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'

type StringDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'string' }>
type TextControl = HTMLInputElement | HTMLTextAreaElement

const props = defineProps<{
  definition: StringDefinition
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const { t, te } = useI18n()
const removeText = computed(() => te('propertyEditor.tokens.remove') ? t('propertyEditor.tokens.remove') : 'Remove item')
const separator = computed<ReferenceStringListSeparator>(() => props.definition.listSeparator ?? 'semicolon')
const separatorChar = computed(() => referenceStringSeparatorChar(separator.value))

const initial = splitReferenceStringTokens(stringOf(props.value), separator.value)
const tokens = ref<string[]>(initial.tokens)
const draft = ref(initial.draft)
/** 自己发出去的值回传时不重新解析，否则正在输入的那一项会被规范化（去空白）打断。 */
let lastEmitted = ''
const activeInput = ref<TextControl | null>(null)
const completionState = ref<PropertyCompletionResult | null>(null)
const isMenuOpen = ref(false)
const activeKey = ref<string | null>(null)
const autocompleteId = useId()

const suggestions = computed(() => {
  const result = completionState.value
  return result ? [...result.items, ...(result.parent ? [result.parent] : [])] : []
})
const activeDescendantId = computed(() => {
  if (!activeKey.value) return undefined
  return `${autocompleteId}-option-${activeKey.value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
})
/** 补全 provider 拿到的是整串 + 整串光标，所以尾巴要补回已提交项的前缀。 */
const editedValue = computed(() => `${referenceStringTokenPrefix(tokens.value, separator.value)}${draft.value}`)
const hasInvalidToken = computed(() => [...tokens.value, draft.value]
  .map(token => token.trim())
  .filter(Boolean)
  .some(isInvalidToken))

watch(() => props.value, value => {
  const next = stringOf(value)
  if (next === lastEmitted) return
  const parsed = splitReferenceStringTokens(next, separator.value)
  tokens.value = parsed.tokens
  draft.value = parsed.draft
})

function stringOf(value: unknown): string {
  return value == null ? '' : String(value)
}
function isInvalidToken(token: string): boolean {
  return props.definition.listInvalid?.(token) === true
}

function emitTokens(): void {
  const next = joinReferenceStringTokens(tokens.value, draft.value, separator.value)
  lastEmitted = next
  if ((props.definition.commitMode ?? 'input') === 'input') emit('update:value', next)
}

async function focusInput(): Promise<void> {
  await nextTick()
  activeInput.value?.focus()
}

/** 把尾巴提交成一项；只提交非空内容。 */
function commitDraft(): void {
  const token = draft.value.trim()
  if (!token) return
  tokens.value = [...tokens.value, token]
  draft.value = ''
  emitTokens()
  completionState.value = null
  isMenuOpen.value = false
  void focusInput()
}

function removeToken(index: number): void {
  tokens.value = tokens.value.filter((_, tokenIndex) => tokenIndex !== index)
  emitTokens()
  void focusInput()
}

function setCursor(control: TextControl, cursor: number): void {
  nextTick(() => {
    control.focus()
    control.setSelectionRange(cursor, cursor)
  })
}

let completionRequestId = 0

async function refreshCompletion(
  control: TextControl,
  value = editedValue.value,
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

function handleInput(event: Event): void {
  const control = event.target as TextControl
  activeInput.value = control
  draft.value = control.value
  emitTokens()
  const prefixLength = referenceStringTokenPrefix(tokens.value, separator.value).length
  void refreshCompletion(control, editedValue.value, prefixLength + (control.selectionStart ?? draft.value.length))
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
  if ((props.definition.commitMode ?? 'input') === 'blur') {
    const next = joinReferenceStringTokens(tokens.value, draft.value, separator.value)
    if (next !== stringOf(props.value)) emit('update:value', next)
  }
  window.setTimeout(() => {
    if (document.activeElement !== activeInput.value) isMenuOpen.value = false
  }, 0)
}

/** 粘贴一整列来源时按分隔符/换行拆成多项，一次成标签。 */
function handlePaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!text) return
  const pasted = splitPastedReferenceStringTokens(text, separator.value)
  if (pasted.length < 2) return
  event.preventDefault()
  const pending = draft.value.trim()
  tokens.value = [...tokens.value, ...(pending ? [pending] : []), ...pasted]
  draft.value = ''
  emitTokens()
  void focusInput()
}

function acceptSuggestionByKey(key: string): void {
  const suggestion = suggestions.value.find((item) => item.key === key)
  if (suggestion) acceptSuggestion(suggestion)
}

function acceptSuggestion(suggestion: PropertyCompletionItem): void {
  const state = completionState.value
  const control = activeInput.value
  if (!state || !control) return

  const current = editedValue.value
  const nextValue = `${current.slice(0, state.replaceStart)}${suggestion.insertText}${current.slice(state.replaceEnd)}`
  const parsed = splitReferenceStringTokens(nextValue, separator.value)
  tokens.value = parsed.tokens
  draft.value = parsed.draft
  emitTokens()

  const prefixLength = referenceStringTokenPrefix(tokens.value, separator.value).length
  const cursor = prefixLength + draft.value.length
  control.value = draft.value
  control.setSelectionRange(draft.value.length, draft.value.length)

  if (suggestion.keepOpen) void refreshCompletion(control, nextValue, cursor)
  else {
    completionState.value = null
    isMenuOpen.value = false
    setCursor(control, draft.value.length)
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
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const offset = event.key === 'ArrowDown' ? 1 : -1
      const currentIndex = Math.max(0, suggestions.value.findIndex((item) => item.key === activeKey.value))
      const nextIndex = (currentIndex + offset + suggestions.value.length) % suggestions.value.length
      activeKey.value = suggestions.value[nextIndex]?.key ?? null
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

  if (props.definition.isReadonly) return
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    commitDraft()
    return
  }
  if (separatorChar.value !== '\n' && event.key === separatorChar.value) {
    event.preventDefault()
    commitDraft()
    return
  }
  if (event.key === 'Backspace' && !draft.value && tokens.value.length > 0) {
    event.preventDefault()
    removeToken(tokens.value.length - 1)
  }
}
</script>

<style scoped>
.reference-string-token-field-shell {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

/* 标签会换行，所以外壳按内容长高，而不是固定一行。 */
/* 标签与输入框的排布交给 OcFieldFrame 的 `wrap`（见该 prop 的说明）：标签直接是控件区的子项，
   行才会断在"最后一个标签与输入框之间"。 */
.reference-string-token-field {
  height: auto;
  min-height: var(--oc-field-control-height, var(--oc-size-md));
  padding: var(--oc-space-1);
}

.reference-string-token-field__token {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  gap: var(--oc-space-1);
  padding-inline-start: var(--oc-space-2);
  border-radius: var(--oc-radius-sm);
  background: var(--oc-bg-hover);
  color: var(--oc-fg-default);
}

.reference-string-token-field__token.is-invalid {
  color: var(--oc-fg-danger);
}

.reference-string-token-field__token-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-string-token-field :deep(.reference-string-token-field__token-remove) {
  min-width: var(--oc-size-sm);
  height: var(--oc-size-sm);
}

.reference-string-token-field :deep(.reference-string-token-field__input) {
  /* 基准宽取一个尺寸 token：剩余空间不足这个宽度时输入框换到下一行，够的话紧跟最后一个标签。 */
  flex: 1 1 var(--oc-size-lg);
  min-width: 0;
  border: 0;
  padding: 0 var(--oc-space-1);
  background: transparent;
}
</style>
