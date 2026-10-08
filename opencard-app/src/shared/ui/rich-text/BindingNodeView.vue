<template>
  <NodeViewWrapper
    as="span"
    class="binding-node"
    :class="{ 'is-selected': selected, 'is-editing': editing }"
    data-drag-handle
    contenteditable="false"
    @oc-edit-binding="startEditing"
  >
    <span v-if="editing" class="binding-node__editor binding-node__expression"
      :style="expressionStyle" @mousedown.stop>
      <span class="binding-node__brace">{{ openBrace }}</span>
      <OcFieldInput
        ref="input"
        as="input"
        variant="plain"
        :value="draftExpression"
        class="binding-node__input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-label="Binding expression"
        aria-autocomplete="list"
        :aria-expanded="menuOpen"
        :aria-controls="autocompleteId"
        @input="handleInput"
        @keydown="handleKeydown"
        @blur="handleBlur"
      />
      <span class="binding-node__brace">{{ closeBrace }}</span>
    </span>
    <span
      v-else
      class="binding-node__label binding-node__expression"
      :style="expressionStyle"
      role="button"
      tabindex="-1"
      :aria-label="tr('propertyEditor.richText.selectBinding', '点击选中 binding')"
      @mousedown.stop
      @click="handleLabelClick"
      @dblclick.stop="startEditing"
    >{{ bindingLabel }}</span>

    <OcAutocompletePopover
      :id="autocompleteId"
      :open="menuOpen"
      :anchor="inputElement"
      :items="suggestions"
      :active-key="activeKey"
      @select="acceptSuggestionByKey"
    />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, getCurrentInstance, nextTick, onMounted, ref, useId, type ComponentPublicInstance } from 'vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcAutocompletePopover from '../../../components/standard/OcAutocompletePopover.vue'
import type { BindingNodeOptions } from './bindingNode'
import type {
  RichTextBindingCompletionItem,
  RichTextBindingCompletionResult,
} from './bindingNode.types'

const props = defineProps<NodeViewProps>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

const openBrace = '{{'
const closeBrace = '}}'
const input = ref<ComponentPublicInstance | null>(null)
const editSession = ref<{ original: string, draft: string } | null>(null)
const completionState = ref<RichTextBindingCompletionResult | null>(null)
const activeKey = ref<string | null>(null)
const menuOpen = ref(false)
const autocompleteId = useId()
let completionRequestId = 0

const expression = computed(() => String(props.node.attrs.expression ?? '').trim())
const editing = computed(() => editSession.value !== null)
const draftExpression = computed({
  get: () => editSession.value?.draft ?? '',
  set: (draft: string) => {
    const session = editSession.value
    if (session) editSession.value = { ...session, draft }
  },
})
const bindingLabel = computed(() => `{{${expression.value}}}`)
const expressionStyle = computed(() => {
  const highlight = props.node.marks.find(mark => mark.type.name === 'highlight')
  const backgroundColor = typeof highlight?.attrs.color === 'string' ? highlight.attrs.color : null
  return backgroundColor ? { backgroundColor } : undefined
})
const suggestions = computed(() => completionState.value?.items ?? [])
const completionProvider = computed(() => (
  (props.extension.options as BindingNodeOptions).completion
))
const inputElement = computed(() => input.value?.$el instanceof HTMLInputElement
  ? input.value.$el
  : null)

onMounted(() => {
  if (!expression.value) void startEditing()
})

async function startEditing(): Promise<void> {
  editSession.value = { original: expression.value, draft: expression.value }
  await nextTick()
  inputElement.value?.focus()
  inputElement.value?.setSelectionRange(draftExpression.value.length, draftExpression.value.length)
  await refreshCompletion()
}

function handleLabelClick(): void {
  const position = props.getPos()
  if (typeof position !== 'number') return
  props.editor.view.dispatch(
    props.editor.state.tr.setSelection(NodeSelection.create(props.editor.state.doc, position)),
  )
  props.editor.view.focus()
}

async function refreshCompletion(): Promise<void> {
  const provider = completionProvider.value
  if (!provider) {
    closeMenu()
    return
  }

  const wrappedValue = `{{${draftExpression.value}}}`
  const cursor = (inputElement.value?.selectionStart ?? draftExpression.value.length) + 2
  const requestId = ++completionRequestId
  const result = await provider({ value: wrappedValue, cursor })
  if (requestId !== completionRequestId) return

  completionState.value = result
  menuOpen.value = Boolean(result?.items.length)
  activeKey.value = result?.items[0]?.key ?? null
}

function handleInput(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  draftExpression.value = target.value
  void refreshCompletion()
}

function acceptSuggestionByKey(key: string): void {
  const suggestion = suggestions.value.find(item => item.key === key)
  if (suggestion) acceptSuggestion(suggestion)
}

function acceptSuggestion(suggestion: RichTextBindingCompletionItem): void {
  const state = completionState.value
  if (!state) return

  const replaceStart = Math.max(0, state.replaceStart - 2)
  const replaceEnd = Math.max(replaceStart, Math.min(draftExpression.value.length, state.replaceEnd - 2))
  draftExpression.value = `${draftExpression.value.slice(0, replaceStart)}${suggestion.insertText}${draftExpression.value.slice(replaceEnd)}`
  const cursor = replaceStart + suggestion.insertText.length

  nextTick(() => {
    inputElement.value?.focus()
    inputElement.value?.setSelectionRange(cursor, cursor)
  })

  if (suggestion.keepOpen) {
    void nextTick(refreshCompletion)
    return
  }

  commitExpression()
}

function commitExpression(): void {
  const session = editSession.value
  if (!session) return
  const value = session.draft.trim()
  closeMenu()
  editSession.value = null
  if (!value) {
    props.deleteNode()
    return
  }
  props.updateAttributes({ expression: value })
  props.editor.commands.focus()
}

function cancelEditing(): void {
  const session = editSession.value
  if (!session) return
  closeMenu()
  editSession.value = null
  if (!session.original) props.deleteNode()
  else props.editor.commands.focus()
}

function closeMenu(): void {
  completionRequestId += 1
  completionState.value = null
  activeKey.value = null
  menuOpen.value = false
}

function handleBlur(): void {
  window.setTimeout(() => {
    if (editSession.value && document.activeElement !== inputElement.value) commitExpression()
  }, 0)
}

function handleKeydown(event: KeyboardEvent): void {
  if (menuOpen.value && suggestions.value.length > 0) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const currentIndex = Math.max(0, suggestions.value.findIndex(item => item.key === activeKey.value))
      const nextIndex = (currentIndex + direction + suggestions.value.length) % suggestions.value.length
      activeKey.value = suggestions.value[nextIndex]?.key ?? null
      return
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      if (activeKey.value) acceptSuggestionByKey(activeKey.value)
      return
    }
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    commitExpression()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelEditing()
  }
}
</script>

<style scoped>
.binding-node {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 2px;
  margin-inline: 1px;
  padding: 1px 2px 1px 6px;
  border: 1px solid var(--oc-border-default);
  border-radius: 999px;
  background: var(--oc-bg-active);
  line-height: 1.45;
  vertical-align: baseline;
  white-space: nowrap;
}

.binding-node.is-selected {
  border-color: var(--oc-border-strong);
  box-shadow: var(--oc-focus-ring);
}

.binding-node__label {
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  text-overflow: ellipsis;
}

.binding-node__expression {
  border-radius: 2px;
}

.binding-node__editor {
  display: inline-flex;
  min-width: 90px;
  align-items: baseline;
}

.binding-node__brace {
  color: var(--oc-fg-muted);
}

.binding-node__input {
  width: clamp(72px, 16em, 240px);
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

</style>
