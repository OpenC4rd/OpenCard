<template>
  <OcDialog class="feedback-dialog" :open="open" :title="t('app.feedback.title')"
    :description="t(activePage === 'submit' ? 'app.feedback.description' : 'app.feedback.history.description')"
    as="form" size="xl" height-mode="fixed" height="lg" :scrollable="false"
    :dismissible="!submitting" @request-close="close" @submit="submit">
    <OcOptionGroup class="feedback-dialog__pages" :model-value="activePage" :options="pageOptions" semantics="tabs"
      :aria-label="t('app.feedback.pages.label')" :disabled="submitting"
      @update:model-value="changePage" />
    <section v-show="activePage === 'submit'" class="feedback-dialog__form" role="tabpanel" :aria-label="t('app.feedback.pages.submit')">
      <label class="feedback-dialog__kind">
        <span>{{ t('app.feedback.kind.label') }}</span>
        <OcSelect :model-value="kind" :options="kindOptions" :disabled="submitting"
          :aria-label="t('app.feedback.kind.label')" @update:model-value="changeKind" />
      </label>
      <div class="feedback-dialog__fields">
      <label v-for="field in fields" :key="field.key" class="feedback-dialog__field"
        :class="{ 'is-wide': field.key !== 'expected' && field.key !== 'actual' }">
        <span>{{ field.title }}</span>
        <OcFieldInput :as="field.rows ? 'textarea' : 'input'" :value="draft[field.key]" full-width
          :resize="field.rows ? 'vertical' : undefined" :rows="field.rows" :maxlength="field.maxLength"
          :placeholder="field.placeholder" :required="field.required" :disabled="submitting"
          @input="draft[field.key] = fieldValue($event)" />
      </label>
      </div>
      <OcCheckbox v-if="kind === 'bug' && hasDiagnostics" v-model:checked="includeDiagnostics" :disabled="submitting">
        {{ t('app.feedback.diagnostics.include') }}
      </OcCheckbox>
      <details v-if="kind === 'bug' && hasDiagnostics && includeDiagnostics" class="feedback-dialog__diagnostics">
        <summary>{{ t('app.feedback.diagnostics.preview') }}</summary>
        <pre>{{ diagnosticsPreview }}</pre>
      </details>
      <p v-if="!configured" class="feedback-dialog__notice" role="status">{{ t('app.feedback.unavailable') }}</p>
      <p v-else-if="status === 'success'" class="feedback-dialog__success" role="status">
        {{ t('app.feedback.success', { reportId }) }}
      </p>
      <p v-if="receiptSaveFailed" class="feedback-dialog__notice" role="status">{{ t('app.feedback.receiptSaveFailed') }}</p>
      <p v-else-if="errorKey" class="feedback-dialog__error" role="alert">{{ t(errorKey) }}</p>
    </section>
    <FeedbackHistory v-if="open" v-show="activePage === 'history'" :active="activePage === 'history'"
      :developer-mode="developerMode" role="tabpanel" :aria-label="t('app.feedback.pages.history')" />
    <template #footer>
      <OcButton type="button" :disabled="submitting" @click="close">
        {{ t(activePage === 'history' || status === 'success' ? 'app.feedback.actions.done' : 'app.feedback.actions.cancel') }}
      </OcButton>
      <OcButton v-if="activePage === 'submit' && status !== 'success'" type="submit" variant="solid" :disabled="!canSubmit">
        {{ submitting ? t('app.feedback.actions.submitting') : t('app.feedback.actions.submit') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcCheckbox from '../../../components/base/OcCheckbox.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import OcOptionGroup from '../../../components/standard/OcOptionGroup.vue'
import OcSelect from '../../../components/standard/OcSelect.vue'
import FeedbackHistory from './FeedbackHistory.vue'
import {
  createFeedbackSubmission,
  FEEDBACK_LIMITS,
  type FeedbackDiagnosticInput,
  type FeedbackKind,
  type FeedbackPage,
} from '../model/feedback'
import {
  createFeedbackEnvironment,
  FeedbackServiceError,
  isFeedbackServiceConfigured,
  submitFeedback,
} from '../services/feedbackService'
import { useFeedbackInbox } from '../composables/useFeedbackInbox'

const props = withDefaults(defineProps<{
  open: boolean
  initialKind?: FeedbackKind
  diagnostics?: FeedbackDiagnosticInput
  activePage?: FeedbackPage
  developerMode?: boolean
}>(), {
  initialKind: 'suggestion',
  diagnostics: () => ({}),
  activePage: 'submit',
  developerMode: false,
})
const feedbackInbox = useFeedbackInbox()

const emit = defineEmits<{ close: []; pageChange: [page: FeedbackPage] }>()
const { locale, t } = useI18n()
const kind = ref<FeedbackKind>(props.initialKind)
const draft = reactive({ message: '', reproduction: '', expected: '', actual: '', contact: '' })
const includeDiagnostics = ref(false)
const status = ref<'idle' | 'submitting' | 'success'>('idle')
const errorKey = ref('')
const reportId = ref('')
const receiptSaveFailed = ref(false)

const configured = isFeedbackServiceConfigured()
const submitting = computed(() => status.value === 'submitting')
const hasDiagnostics = computed(() => Object.values(props.diagnostics).some(value => (
  Array.isArray(value) ? value.length > 0 : Boolean(value)
)))
const canSubmit = computed(() => configured && draft.message.trim().length > 0 && status.value === 'idle')
const diagnosticsPreview = computed(() => {
  const preview = createFeedbackSubmission({
    kind: 'bug',
    message: draft.message || 'preview',
    includeDiagnostics: true,
  }, createFeedbackEnvironment(locale.value), props.diagnostics, {
    reportId: 'preview',
    submittedAt: 'preview',
  }).diagnostics
  return preview ? JSON.stringify(preview, null, 2) : ''
})

const pageOptions = computed(() => (['submit', 'history'] as const).map(value => ({
  value, label: t(`app.feedback.pages.${value}`),
})))
const kindOptions = computed(() => (['bug', 'suggestion'] as const).map(value => ({
  value, label: t(`app.feedback.kind.${value}`),
})))
type FeedbackField = {
  key: keyof typeof draft
  title: string
  rows?: number
  maxLength: number
  placeholder?: string
  required?: boolean
}
const fields = computed<FeedbackField[]>(() => [
  { key: 'message', title: t(`app.feedback.fields.${kind.value}.message`), rows: 5,
    maxLength: FEEDBACK_LIMITS.message, required: true },
  ...(kind.value === 'bug' ? (['reproduction', 'expected', 'actual'] as const).map(key => ({
    key, title: t(`app.feedback.fields.bug.${key}`), rows: key === 'reproduction' ? 3 : 2,
    maxLength: FEEDBACK_LIMITS.detail,
  })) : []),
  { key: 'contact', title: t('app.feedback.fields.contact'), maxLength: FEEDBACK_LIMITS.contact,
    placeholder: t('app.feedback.fields.contactPlaceholder') },
])

watch(() => props.open, open => {
  if (!open) return
  // Only a completed submission starts a new draft; switching pages or closing preserves unfinished input.
  if (status.value === 'success') {
    for (const key of Object.keys(draft) as (keyof typeof draft)[]) draft[key] = ''
    status.value = 'idle'
    reportId.value = ''
    receiptSaveFailed.value = false
  }
  if (!draft.message.trim()) kind.value = props.initialKind
  includeDiagnostics.value = false
  errorKey.value = ''
})

function changePage(page: string): void {
  if (!submitting.value && (page === 'submit' || page === 'history')) emit('pageChange', page)
}
function changeKind(value: string): void {
  if (!submitting.value && (value === 'bug' || value === 'suggestion')) kind.value = value
}

function fieldValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value
}

function close(): void {
  if (!submitting.value) emit('close')
}

async function submit(): Promise<void> {
  if (props.activePage !== 'submit' || !canSubmit.value) return
  status.value = 'submitting'
  errorKey.value = ''
  try {
    const submission = createFeedbackSubmission({
      kind: kind.value,
      message: draft.message,
      reproduction: kind.value === 'bug' ? draft.reproduction : undefined,
      expected: kind.value === 'bug' ? draft.expected : undefined,
      actual: kind.value === 'bug' ? draft.actual : undefined,
      contact: draft.contact,
      includeDiagnostics: kind.value === 'bug' && includeDiagnostics.value,
    }, createFeedbackEnvironment(locale.value), props.diagnostics)
    const result = await submitFeedback(submission)
    try {
      await feedbackInbox.addReceipt(submission, result)
    } catch {
      receiptSaveFailed.value = true
    }
    reportId.value = result.reportId
    status.value = 'success'
  } catch (error) {
    status.value = 'idle'
    errorKey.value = error instanceof FeedbackServiceError
      ? `app.feedback.errors.${error.code}`
      : 'app.feedback.errors.network'
  }
}
</script>

<style scoped>
.feedback-dialog__pages { align-self: flex-start; flex: 0 0 auto; }
.feedback-dialog__kind { display: flex; align-items: center; gap: var(--oc-space-md); color: var(--oc-fg-muted); font-size: var(--oc-text-sm); }
.feedback-dialog__form {
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-lg);
  min-height: 0;
  overflow: auto;
}
.feedback-dialog__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--oc-space-md); }
.feedback-dialog__field.is-wide { grid-column: 1 / -1; }
.feedback-dialog__field {
  display: grid;
  gap: var(--oc-space-xs);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.feedback-dialog__diagnostics {
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.feedback-dialog__diagnostics pre {
  max-height: 160px;
  overflow: auto;
  margin: var(--oc-space-xs) 0 0;
  padding: var(--oc-space-sm);
  border: 1px solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-input);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.feedback-dialog__notice,
.feedback-dialog__error,
.feedback-dialog__success {
  margin: 0;
  padding: var(--oc-space-sm);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-muted);
}

@media (max-width: 640px) {
  .feedback-dialog__fields { grid-template-columns: 1fr; }
}

.feedback-dialog__error {
  color: var(--oc-fg-danger);
  background: var(--oc-bg-danger-subtle);
}

.feedback-dialog__success {
  color: var(--oc-fg-default);
  border: 1px solid var(--oc-border-accent);
}

</style>
