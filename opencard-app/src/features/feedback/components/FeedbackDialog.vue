<template>
  <OcDialog class="feedback-dialog" :open="open" :title="t('app.feedback.title')"
    :description="t('app.feedback.description')" as="form" size="xl"
    min-height="md"
    :dismissible="!submitting" @request-close="close" @submit="submit">
    <template #header="{ titleId, descriptionId }">
        <div class="feedback-dialog__header-content">
          <div>
            <h2 :id="titleId">{{ t('app.feedback.title') }}</h2>
            <p :id="descriptionId">{{ t('app.feedback.description') }}</p>
          </div>
          <FeedbackPageTabs
            :active-page="activePage"
            @update:active-page="emit('pageChange', $event)"
          />
          <OcButton
            icon="action.close"
            icon-only
            :aria-label="t('app.feedback.actions.close')"
            :data-tooltip="t('app.feedback.actions.close')"
            :disabled="submitting"
            @click="close"
          />
        </div>
    </template>
          <div class="feedback-dialog__kind" role="group" :aria-label="t('app.feedback.kind.label')">
            <OcButton
              variant="outline"
              icon="status.error"
              :active="kind === 'bug'"
              :aria-pressed="kind === 'bug'"
              @click="kind = 'bug'"
            >
              {{ t('app.feedback.kind.bug') }}
            </OcButton>
            <OcButton
              variant="outline"
              icon="action.edit"
              :active="kind === 'suggestion'"
              :aria-pressed="kind === 'suggestion'"
              @click="kind = 'suggestion'"
            >
              {{ t('app.feedback.kind.suggestion') }}
            </OcButton>
          </div>

          <label class="feedback-dialog__field">
            <span>{{ t(`app.feedback.fields.${kind}.message`) }}</span>
            <OcFieldInput
              as="textarea"
              :value="message"
              full-width
              resize="vertical"
              rows="5"
              :maxlength="FEEDBACK_LIMITS.message"
              :disabled="submitting"
              required
              autofocus
              @input="message = fieldValue($event)"
            />
          </label>

          <template v-if="kind === 'bug'">
            <label class="feedback-dialog__field">
              <span>{{ t('app.feedback.fields.bug.reproduction') }}</span>
              <OcFieldInput
                as="textarea"
                :value="reproduction"
                full-width
                resize="vertical"
                rows="3"
                :maxlength="FEEDBACK_LIMITS.detail"
                :disabled="submitting"
                @input="reproduction = fieldValue($event)"
              />
            </label>
            <div class="feedback-dialog__field-row">
              <label class="feedback-dialog__field">
                <span>{{ t('app.feedback.fields.bug.expected') }}</span>
                <OcFieldInput
                  as="textarea"
                  :value="expected"
                  full-width
                  resize="vertical"
                  rows="2"
                  :maxlength="FEEDBACK_LIMITS.detail"
                  :disabled="submitting"
                  @input="expected = fieldValue($event)"
                />
              </label>
              <label class="feedback-dialog__field">
                <span>{{ t('app.feedback.fields.bug.actual') }}</span>
                <OcFieldInput
                  as="textarea"
                  :value="actual"
                  full-width
                  resize="vertical"
                  rows="2"
                  :maxlength="FEEDBACK_LIMITS.detail"
                  :disabled="submitting"
                  @input="actual = fieldValue($event)"
                />
              </label>
            </div>
          </template>

          <label class="feedback-dialog__field">
            <span>{{ t('app.feedback.fields.contact') }}</span>
            <OcFieldInput
              :value="contact"
              full-width
              :maxlength="FEEDBACK_LIMITS.contact"
              :placeholder="t('app.feedback.fields.contactPlaceholder')"
              :disabled="submitting"
              @input="contact = fieldValue($event)"
            />
          </label>

          <OcCheckbox
            v-if="kind === 'bug' && hasDiagnostics"
            v-model:checked="includeDiagnostics"
            :disabled="submitting"
          >
            {{ t('app.feedback.diagnostics.include') }}
          </OcCheckbox>
          <details v-if="kind === 'bug' && hasDiagnostics && includeDiagnostics" class="feedback-dialog__diagnostics">
            <summary>{{ t('app.feedback.diagnostics.preview') }}</summary>
            <pre>{{ diagnosticsPreview }}</pre>
          </details>

          <p v-if="!configured" class="feedback-dialog__notice" role="status">
            {{ t('app.feedback.unavailable') }}
          </p>
          <p v-else-if="status === 'success'" class="feedback-dialog__success" role="status">
            {{ t('app.feedback.success', { reportId }) }}
          </p>
          <p v-if="receiptSaveFailed" class="feedback-dialog__notice" role="status">
            {{ t('app.feedback.receiptSaveFailed') }}
          </p>
          <p v-else-if="errorKey" class="feedback-dialog__error" role="alert">
            {{ t(errorKey) }}
          </p>

    <template #footer>
      <OcButton type="button" :disabled="submitting" @click="close">
        {{ status === 'success' ? t('app.feedback.actions.done') : t('app.feedback.actions.cancel') }}
      </OcButton>
      <OcButton v-if="status !== 'success'" type="submit" variant="solid" :disabled="!canSubmit">
        {{ submitting ? t('app.feedback.actions.submitting') : t('app.feedback.actions.submit') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcCheckbox from '../../../components/base/OcCheckbox.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import FeedbackPageTabs from './FeedbackPageTabs.vue'
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
}>(), {
  initialKind: 'suggestion',
  diagnostics: () => ({}),
  activePage: 'submit',
})
const feedbackInbox = useFeedbackInbox()

const emit = defineEmits<{ close: []; pageChange: [page: FeedbackPage] }>()
const { locale, t } = useI18n()
const kind = ref<FeedbackKind>(props.initialKind)
const message = ref('')
const reproduction = ref('')
const expected = ref('')
const actual = ref('')
const contact = ref('')
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
const canSubmit = computed(() => configured && message.value.trim().length > 0 && !submitting.value)
const diagnosticsPreview = computed(() => {
  const preview = createFeedbackSubmission({
    kind: 'bug',
    message: message.value || 'preview',
    includeDiagnostics: true,
  }, createFeedbackEnvironment(locale.value), props.diagnostics, {
    reportId: 'preview',
    submittedAt: 'preview',
  }).diagnostics
  return preview ? JSON.stringify(preview, null, 2) : ''
})

watch(() => props.open, (open) => {
  if (!open) return
  kind.value = props.initialKind
  message.value = ''
  reproduction.value = ''
  expected.value = ''
  actual.value = ''
  contact.value = ''
  includeDiagnostics.value = false
  status.value = 'idle'
  errorKey.value = ''
  reportId.value = ''
  receiptSaveFailed.value = false
})

function fieldValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value
}

function close(): void {
  if (!submitting.value) emit('close')
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  status.value = 'submitting'
  errorKey.value = ''
  try {
    const submission = createFeedbackSubmission({
      kind: kind.value,
      message: message.value,
      reproduction: kind.value === 'bug' ? reproduction.value : undefined,
      expected: kind.value === 'bug' ? expected.value : undefined,
      actual: kind.value === 'bug' ? actual.value : undefined,
      contact: contact.value,
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
.feedback-dialog__header-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: var(--oc-space-md);
}

.feedback-dialog__header-content > :last-child { justify-self: end; }

.feedback-dialog__header-content h2,
.feedback-dialog__header-content p {
  margin: 0;
}

.feedback-dialog__header-content h2 {
  font-size: var(--oc-text-lg);
}

.feedback-dialog__header-content p {
  margin-top: var(--oc-space-2xs);
  color: var(--oc-fg-muted);
}

.feedback-dialog__kind,
.feedback-dialog__field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--oc-space-xs);
}

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

.feedback-dialog__error {
  color: var(--oc-fg-danger);
  background: var(--oc-bg-danger-subtle);
}

.feedback-dialog__success {
  color: var(--oc-fg-default);
  border: 1px solid var(--oc-border-accent);
}

@media (max-width: 640px) {
  .feedback-dialog__header-content {
    grid-template-columns: 1fr auto;
  }
  .feedback-dialog__header-content > :nth-child(2) {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .feedback-dialog__field-row {
    grid-template-columns: 1fr;
  }
}
</style>
