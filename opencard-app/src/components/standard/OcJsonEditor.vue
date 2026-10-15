<template>
  <OcPanel
    class="oc-json-editor"
    tone="surface"
    border="default"
    radius="md"
    shadow="none"
    gap="2"
    padding="2"
  >
    <div class="oc-json-editor__toolbar">
      <OcText tone="muted" size="xs" mono>JSON</OcText>
      <OcButton
        variant="soft"
        size="sm"
        :disabled="readonly || Boolean(errorMessage)"
        @click="formatDraft"
      >
        Format
      </OcButton>
    </div>

    <OcFieldInput
      as="textarea"
      class="oc-json-editor__input"
      :class="`oc-json-editor__input--${heightMode}`"
      full-width
      mono
      resize="vertical"
      :disabled="readonly"
      :readonly="readonly"
      :value="draft"
      @input="handleInput"
      @blur="formatDraft"
    />

    <OcText v-if="errorMessage" tone="danger" size="xs">
      {{ errorMessage }}
    </OcText>
    <OcText v-else tone="muted" size="xs">
      Parsed live. Invalid drafts stay local until the JSON is valid again.
    </OcText>
  </OcPanel>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcPanel from '../base/OcPanel.vue'
import OcText from '../base/OcText.vue'

defineOptions({ name: 'OcJsonEditor' })

const props = withDefaults(defineProps<{
  modelValue: unknown
  readonly?: boolean
  heightMode?: 'default' | 'array'
}>(), {
  readonly: false,
  heightMode: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const draft = ref(serializeJson(props.modelValue))
const errorMessage = ref('')
const lastCommitted = ref(draft.value)

watch(
  () => props.modelValue,
  (nextValue) => {
    const formatted = serializeJson(nextValue)
    if (formatted !== lastCommitted.value) {
      draft.value = formatted
      errorMessage.value = ''
    }
    lastCommitted.value = formatted
  },
  { deep: true },
)

function handleInput(event: Event): void {
  const nextDraft = (event.target as HTMLTextAreaElement).value
  draft.value = nextDraft

  const parsed = tryParseJson(nextDraft)
  if (!parsed.ok) {
    errorMessage.value = 'Invalid JSON'
    return
  }

  errorMessage.value = ''
  lastCommitted.value = serializeJson(parsed.value)
  emit('update:modelValue', parsed.value)
}

function formatDraft(): void {
  const parsed = tryParseJson(draft.value)
  if (!parsed.ok) {
    errorMessage.value = 'Invalid JSON'
    return
  }

  const formatted = serializeJson(parsed.value)
  draft.value = formatted
  lastCommitted.value = formatted
  errorMessage.value = ''
}

function serializeJson(value: unknown): string {
  if (value === undefined) {
    return 'null'
  }
  return JSON.stringify(value, null, 2)
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return {
      ok: true,
      value: JSON.parse(value),
    }
  } catch {
    return { ok: false }
  }
}
</script>

<style scoped>
.oc-json-editor {
  min-width: 0;
}

.oc-json-editor__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-xs);
}

.oc-json-editor__input {
  width: 100%;
  min-width: 0;
  line-height: 1.5;
}

.oc-json-editor__input--default {
  min-height: var(--oc-json-editor-min-height);
}

.oc-json-editor__input--array {
  min-height: var(--oc-json-editor-array-min-height);
}
</style>
