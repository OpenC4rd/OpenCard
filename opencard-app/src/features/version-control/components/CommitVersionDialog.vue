<template>
  <OcDialog
    :open="open"
    :title="t('versionControl.commitDialog.title')"
    :description="t('versionControl.commitDialog.description')"
    as="form"
    size="md"
    :dismissible="!busy"
    :close-on-backdrop="!busy"
    :aria-busy="busy"
    @request-close="requestClose"
    @submit="submit"
  >
    <div class="commit-version-dialog" :inert="busy ? true : undefined">
      <label class="commit-version-dialog__field">
        <OcText as="span" size="sm">{{ t('versionControl.commitDialog.summaryLabel') }}</OcText>
        <OcFieldInput
          full-width
          autofocus
          required
          :value="summary"
          :placeholder="t('versionControl.commitDialog.summaryPlaceholder')"
          :aria-invalid="submitted && !summary.trim()"
          :disabled="busy"
          @input="summary = fieldValue($event)"
        />
      </label>
      <OcText v-if="submitted && !summary.trim()" as="p" size="sm" tone="danger" role="alert">
        {{ t('versionControl.commitDialog.summaryRequired') }}
      </OcText>
      <label class="commit-version-dialog__field">
        <OcText as="span" size="sm">{{ t('versionControl.commitDialog.descriptionLabel') }}</OcText>
        <OcFieldInput
          as="textarea"
          full-width
          resize="vertical"
          :value="description"
          :placeholder="t('versionControl.commitDialog.descriptionPlaceholder')"
          :disabled="busy"
          @input="description = fieldValue($event)"
        />
      </label>
      <OcText v-if="error" as="p" size="sm" tone="danger" role="alert">
        {{ error }}
      </OcText>
    </div>

    <template #footer>
      <OcButton type="button" variant="ghost" :disabled="busy" @click="requestClose">
        {{ t('versionControl.commitDialog.cancel') }}
      </OcButton>
      <OcButton type="submit" variant="solid" :disabled="busy || !summary.trim()">
        {{ busy ? t('versionControl.commitDialog.committing') : t('versionControl.commitDialog.commit') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcText from '../../../components/base/OcText.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'

const props = withDefaults(defineProps<{
  open: boolean
  busy?: boolean
  error?: string
}>(), {
  busy: false,
  error: '',
})
const emit = defineEmits<{
  close: []
  submit: [value: { summary: string; description: string }]
}>()
const { t } = useI18n()
const summary = ref('')
const description = ref('')
const submitted = ref(false)

watch(() => props.open, open => {
  if (!open) return
  summary.value = ''
  description.value = ''
  submitted.value = false
})

function fieldValue(event: Event): string {
  return (event.target as HTMLTextAreaElement).value
}

function requestClose(): void {
  if (!props.busy) emit('close')
}

function submit(): void {
  submitted.value = true
  const normalizedSummary = summary.value.trim()
  if (!props.busy && normalizedSummary) {
    emit('submit', { summary: normalizedSummary, description: description.value.trim() })
  }
}
</script>

<style scoped>
.commit-version-dialog { display: grid; gap: var(--oc-space-xs); }
.commit-version-dialog__field { display: grid; gap: var(--oc-space-xs); color: var(--oc-fg-muted); }
.commit-version-dialog__field .oc-field-input { min-height: var(--oc-size-lg); }
.commit-version-dialog p { margin: 0; }
</style>
