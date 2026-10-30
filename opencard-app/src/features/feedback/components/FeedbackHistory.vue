<template>
  <div class="feedback-history">
    <div v-if="loading" class="feedback-history__empty" role="status">{{ t('app.feedback.history.loading') }}</div>
    <div v-else-if="records.length === 0" class="feedback-history__empty">
      <strong>{{ errorKey ? t(errorKey) : t('app.feedback.history.emptyTitle') }}</strong>
      <span v-if="!errorKey">{{ t('app.feedback.history.emptyDescription') }}</span>
    </div>
    <div v-else class="feedback-history__body">
      <nav class="feedback-history__list" :aria-label="t('app.feedback.history.listLabel')">
        <header class="feedback-history__list-heading">
          <OcText size="xs" tone="muted">{{ t('app.feedback.history.listLabel') }}</OcText>
          <OcText size="xs" tone="subtle">{{ records.length }}</OcText>
        </header>
        <ul>
          <li v-for="record in records" :key="record.reportId">
            <OcRow as="button" type="button" :class="{ 'is-selected': record.reportId === selectedReportId }"
              :aria-current="record.reportId === selectedReportId ? 'true' : undefined" @click="selectRecord(record.reportId)">
              <template #title><OcText truncate size="base" :bold="record.reportId === selectedReportId">{{ record.summary }}</OcText></template>
              <template #subtitle>
                <span class="feedback-history__list-meta">
                  <time :datetime="record.submittedAt">{{ formatDate(record.submittedAt, true) }}</time>
                  <span class="feedback-history__status" :data-status="record.status">{{ t(`app.feedback.history.status.${record.status}`) }}</span>
                </span>
              </template>
            </OcRow>
          </li>
        </ul>
      </nav>
      <article v-if="selectedRecord" class="feedback-history__detail">
        <header class="feedback-history__detail-heading">
          <div class="feedback-history__detail-meta">
            <OcText size="xs" tone="muted">{{ t(`app.feedback.kind.${selectedRecord.kind}`) }}</OcText>
            <span class="feedback-history__status" :data-status="selectedRecord.status">{{ t(`app.feedback.history.status.${selectedRecord.status}`) }}</span>
          </div>
          <h3>{{ selectedRecord.summary }}</h3>
          <p class="feedback-history__submitted">
            {{ t('app.feedback.history.submittedAt') }}
            <time :datetime="selectedRecord.submittedAt">{{ formatDate(selectedRecord.submittedAt) }}</time>
          </p>
        </header>
        <section v-if="selectedRecord.officialResponse" class="feedback-history__response">
          <header>
            <h4>{{ t('app.feedback.history.officialResponse') }}</h4>
            <time :datetime="selectedRecord.officialResponse.updatedAt">{{ formatDate(selectedRecord.officialResponse.updatedAt) }}</time>
          </header>
          <div class="feedback-history__response-body oc-markdown" v-html="renderedResponse" />
        </section>
        <p v-else class="feedback-history__pending">{{ t(`app.feedback.history.noResponse.${selectedRecord.status}`) }}</p>
        <p v-if="errorKey" class="feedback-history__error" role="alert">{{ t(errorKey) }}</p>
        <details class="feedback-history__receipt">
          <summary>{{ t('app.feedback.history.reportId') }}</summary>
          <code>{{ selectedRecord.reportId }}</code>
          <p v-if="selectedRecord.lastSyncedAt">
            {{ t('app.feedback.history.lastSyncedAt') }}
            <time :datetime="selectedRecord.lastSyncedAt">{{ formatDate(selectedRecord.lastSyncedAt) }}</time>
          </p>
        </details>
        <footer>
          <OcButton icon="mdiTrashCanOutline" icon-tone="danger" size="sm" variant="ghost" @click="removeSelected">
            {{ t('app.feedback.history.deleteLocal') }}
          </OcButton>
          <OcButton v-if="developerMode" icon="mdiRefresh" size="sm" :disabled="refreshing" @click="refreshRecords(true)">
            {{ refreshing ? t('app.feedback.history.refreshing') : t('app.feedback.history.refresh') }}
          </OcButton>
        </footer>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcRow from '../../../components/standard/OcRow.vue'
import OcText from '../../../components/base/OcText.vue'
import { useFeedbackInbox } from '../composables/useFeedbackInbox'
import { requestConfirmation } from '../../shell/services/appConfirmation'
import { renderMarkdown } from '../../../shared/ui/markdown/renderMarkdown'

const props = withDefaults(defineProps<{
  active: boolean
  developerMode?: boolean
}>(), {
  developerMode: false,
})
const { locale, t } = useI18n()
const feedbackInbox = useFeedbackInbox()
const records = feedbackInbox.records
const selectedReportId = ref<string | null>(null)
const loading = ref(false)
const refreshing = feedbackInbox.refreshing
const errorKey = ref('')

const selectedRecord = computed(() => (
  records.value.find(record => record.reportId === selectedReportId.value) ?? null
))
const renderedResponse = computed(() => renderMarkdown(selectedRecord.value?.officialResponse?.text ?? ''))

watch(() => props.active, active => {
  if (active) void loadRecords()
  else errorKey.value = ''
}, { immediate: true })

watch(
  [() => props.active, () => selectedRecord.value?.officialResponse?.updatedAt],
  ([active, responseUpdatedAt]) => {
    if (!active || !selectedRecord.value || !responseUpdatedAt) return
    void feedbackInbox.markResponseRead(selectedRecord.value.reportId, responseUpdatedAt)
  },
  { flush: 'post' },
)

async function loadRecords(): Promise<void> {
  loading.value = true
  errorKey.value = ''
  try {
    const result = await feedbackInbox.refresh(false)
    if (result.errorCode) errorKey.value = `app.feedback.history.errors.${result.errorCode}`
    if (!records.value.some(record => record.reportId === selectedReportId.value)) {
      selectedReportId.value = records.value[0]?.reportId ?? null
    }
  } catch {
    selectedReportId.value = null
    errorKey.value = 'app.feedback.history.errors.storage'
  } finally {
    loading.value = false
  }
}

function selectRecord(reportId: string): void {
  if (selectedReportId.value === reportId) return
  selectedReportId.value = reportId
  errorKey.value = ''
}

async function refreshRecords(force: boolean): Promise<void> {
  if (refreshing.value) return
  errorKey.value = ''
  try {
    const result = await feedbackInbox.refresh(force)
    if (result.errorCode) errorKey.value = `app.feedback.history.errors.${result.errorCode}`
  } catch {
    errorKey.value = 'app.feedback.history.errors.storage'
  }
}

async function removeSelected(): Promise<void> {
  const record = selectedRecord.value
  if (!record || !await requestConfirmation({
    title: t('app.feedback.history.deleteLocal'),
    message: t('app.feedback.history.deleteConfirmation'),
    confirmLabel: t('app.feedback.history.deleteLocal'),
  })) return
  try {
    await feedbackInbox.removeReceipt(record.reportId)
    errorKey.value = ''
    selectedReportId.value = null
    if (records.value.length) selectedReportId.value = records.value[0]?.reportId ?? null
  } catch {
    errorKey.value = 'app.feedback.history.errors.storage'
  }
}

function formatDate(value: string, dateOnly = false): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value, dateOnly
    ? { year: 'numeric', month: '2-digit', day: '2-digit' }
    : { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
</script>

<style scoped>
.feedback-history { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
.feedback-history__body {
  display: grid;
  grid-template-columns: minmax(180px, 28%) minmax(0, 1fr);
  min-height: 0;
  flex: 1 1 auto;
}
.feedback-history__list {
  min-width: 0;
  overflow: auto;
  padding-right: var(--oc-space-md);
  border-right: var(--oc-border-width) solid var(--oc-border-muted);
}
.feedback-history__list-heading {
  display: flex;
  justify-content: space-between;
  padding: var(--oc-space-xs) var(--oc-space-sm) var(--oc-space-md);
}
.feedback-history__list ul {
  display: grid;
  gap: var(--oc-space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}
.feedback-history__list li { min-width: 0; }
.feedback-history__list-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--oc-space-sm); padding-top: var(--oc-space-2xs); font-size: var(--oc-text-xs); }
.feedback-history__status { flex: 0 0 auto; color: var(--oc-fg-muted); font-size: var(--oc-text-xs); white-space: nowrap; }
.feedback-history__status[data-status="answered"] { color: var(--oc-fg-accent); }
.feedback-history__status[data-status="closed"] { color: var(--oc-fg-subtle); }
.feedback-history__detail {
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-lg);
  min-width: 0;
  overflow: auto;
  padding: var(--oc-space-xs) var(--oc-space-lg);
}
.feedback-history__detail-heading { display: grid; gap: var(--oc-space-sm); }
.feedback-history__detail-meta { display: flex; align-items: center; gap: var(--oc-space-md); }
.feedback-history__detail-heading h3 { margin: 0; font-size: var(--oc-text-xl); font-weight: var(--font-weight-ui-title); overflow-wrap: anywhere; }
.feedback-history__submitted, .feedback-history__receipt {
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-xs);
}
.feedback-history__submitted { margin: 0; }
.feedback-history__submitted time, .feedback-history__receipt time { margin-left: var(--oc-space-xs); }
.feedback-history__response { border-top: var(--oc-border-width) solid var(--oc-border-muted); padding-top: var(--oc-space-lg); }
.feedback-history__response header { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--oc-space-sm); }
.feedback-history__response > header h4 { margin: 0; font-size: var(--oc-text-base); }
.feedback-history__response time { color: var(--oc-fg-subtle); font-size: var(--oc-text-xs); }
.feedback-history__response-body { margin-top: var(--oc-space-md); }
.feedback-history__pending { margin: 0; color: var(--oc-fg-muted); font-size: var(--oc-text-sm); line-height: 1.6; }
.feedback-history__receipt { margin-top: auto; }
.feedback-history__receipt summary { cursor: pointer; }
.feedback-history__receipt code { display: block; margin-top: var(--oc-space-sm); overflow-wrap: anywhere; user-select: text; }
.feedback-history__receipt p { margin: var(--oc-space-sm) 0 0; }
.feedback-history__error { margin: 0; padding: var(--oc-space-sm); border-radius: var(--oc-radius-control); background: var(--oc-bg-danger-subtle); color: var(--oc-fg-danger); }
.feedback-history__detail footer {
  display: flex;
  justify-content: space-between;
  gap: var(--oc-space-sm);
  border-top: var(--oc-border-width) solid var(--oc-border-muted);
  padding-top: var(--oc-space-sm);
}
.feedback-history__empty { display: grid; min-height: 0; flex: 1 1 auto; place-content: center; gap: var(--oc-space-xs); padding: var(--oc-space-lg); color: var(--oc-fg-muted); text-align: center; }
@media (max-width: 700px) {
  .feedback-history__body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .feedback-history__list { max-height: 160px; padding-right: 0; padding-bottom: var(--oc-space-sm); border-right: 0; border-bottom: var(--oc-border-width) solid var(--oc-border-muted); }
  .feedback-history__detail { padding: var(--oc-space-md) var(--oc-space-sm); }
}
</style>
