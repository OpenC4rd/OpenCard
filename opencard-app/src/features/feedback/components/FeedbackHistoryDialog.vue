<template>
  <OcDialog class="feedback-history" :open="open" :title="t('app.feedback.title')"
    :description="t('app.feedback.history.description')" size="xl" :padded="false"
    :scrollable="false" height-mode="fixed" height="lg" @request-close="close">
    <template #header="{ titleId, descriptionId }">
        <div class="feedback-history__header-content">
          <div>
            <h2 :id="titleId">{{ t('app.feedback.title') }}</h2>
            <p :id="descriptionId">{{ t('app.feedback.history.description') }}</p>
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
            @click="close"
          />
        </div>
    </template>

        <div v-if="loading" class="feedback-history__empty" role="status">
          {{ t('app.feedback.history.loading') }}
        </div>
        <div v-else-if="records.length === 0" class="feedback-history__empty">
          <strong>{{ errorKey ? t(errorKey) : t('app.feedback.history.emptyTitle') }}</strong>
          <span v-if="!errorKey">{{ t('app.feedback.history.emptyDescription') }}</span>
        </div>
        <div v-else class="feedback-history__body">
          <nav :aria-label="t('app.feedback.history.listLabel')">
            <button
              v-for="record in records"
              :key="record.reportId"
              type="button"
              class="feedback-history__item"
              :class="{ 'is-active': record.reportId === selectedReportId }"
              :aria-current="record.reportId === selectedReportId ? 'true' : undefined"
              @click="selectRecord(record.reportId)"
            >
              <span class="feedback-history__item-heading">
                <strong>{{ record.summary }}</strong>
                <span class="feedback-history__status" :data-status="record.status">
                  {{ t(`app.feedback.history.status.${record.status}`) }}
                </span>
              </span>
              <span>{{ t(`app.feedback.kind.${record.kind}`) }} {{ formatDate(record.submittedAt) }}</span>
            </button>
          </nav>

          <article v-if="selectedRecord" class="feedback-history__detail">
            <div class="feedback-history__detail-heading">
              <div>
                <span>{{ t(`app.feedback.kind.${selectedRecord.kind}`) }}</span>
                <h3>{{ selectedRecord.summary }}</h3>
              </div>
              <span class="feedback-history__status" :data-status="selectedRecord.status">
                {{ t(`app.feedback.history.status.${selectedRecord.status}`) }}
              </span>
            </div>

            <dl>
              <div>
                <dt>{{ t('app.feedback.history.reportId') }}</dt>
                <dd>{{ selectedRecord.reportId }}</dd>
              </div>
              <div>
                <dt>{{ t('app.feedback.history.submittedAt') }}</dt>
                <dd>{{ formatDate(selectedRecord.submittedAt) }}</dd>
              </div>
              <div v-if="selectedRecord.lastSyncedAt">
                <dt>{{ t('app.feedback.history.lastSyncedAt') }}</dt>
                <dd>{{ formatDate(selectedRecord.lastSyncedAt) }}</dd>
              </div>
            </dl>

            <section class="feedback-history__response">
              <h4>{{ t('app.feedback.history.officialResponse') }}</h4>
              <p v-if="selectedRecord.officialResponse">{{ selectedRecord.officialResponse.text }}</p>
              <p v-else class="feedback-history__muted">
                {{ t(`app.feedback.history.noResponse.${selectedRecord.status}`) }}
              </p>
            </section>

            <p v-if="errorKey" class="feedback-history__error" role="alert">{{ t(errorKey) }}</p>

            <div v-if="confirmingDelete" class="feedback-history__delete-confirm" role="alertdialog">
              <span>{{ t('app.feedback.history.deleteConfirmation') }}</span>
              <div>
                <OcButton size="sm" @click="confirmingDelete = false">
                  {{ t('app.feedback.actions.cancel') }}
                </OcButton>
                <OcButton size="sm" variant="solid" icon="action.delete" @click="removeSelected">
                  {{ t('app.feedback.history.deleteLocal') }}
                </OcButton>
              </div>
            </div>

            <footer>
              <OcButton v-if="!confirmingDelete" icon="action.delete" icon-tone="danger" @click="confirmingDelete = true">
                {{ t('app.feedback.history.deleteLocal') }}
              </OcButton>
              <OcButton
                v-if="developerMode"
                icon="action.refresh"
                variant="solid"
                :disabled="refreshing"
                @click="refreshRecords(true)"
              >
                {{ refreshing ? t('app.feedback.history.refreshing') : t('app.feedback.history.refresh') }}
              </OcButton>
            </footer>
          </article>
        </div>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import type { FeedbackPage } from '../model/feedback'
import { useFeedbackInbox } from '../composables/useFeedbackInbox'
import FeedbackPageTabs from './FeedbackPageTabs.vue'

const props = withDefaults(defineProps<{
  open: boolean
  developerMode?: boolean
  activePage?: FeedbackPage
}>(), {
  developerMode: false,
  activePage: 'history',
})
const emit = defineEmits<{ close: []; pageChange: [page: FeedbackPage] }>()
const { locale, t } = useI18n()
const feedbackInbox = useFeedbackInbox()
const records = feedbackInbox.records
const selectedReportId = ref<string | null>(null)
const loading = ref(false)
const refreshing = feedbackInbox.refreshing
const confirmingDelete = ref(false)
const errorKey = ref('')

const selectedRecord = computed(() => (
  records.value.find(record => record.reportId === selectedReportId.value) ?? null
))

watch(() => props.open, (open) => {
  if (open) void loadRecords()
  else resetTransientState()
}, { immediate: true })

watch(
  [() => props.open, () => selectedRecord.value?.officialResponse?.updatedAt],
  ([open, responseUpdatedAt]) => {
    if (!open || !selectedRecord.value || !responseUpdatedAt) return
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
  confirmingDelete.value = false
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
  if (!selectedRecord.value) return
  try {
    await feedbackInbox.removeReceipt(selectedRecord.value.reportId)
    errorKey.value = ''
    confirmingDelete.value = false
    selectedReportId.value = null
    if (records.value.length) selectedReportId.value = records.value[0]?.reportId ?? null
  } catch {
    errorKey.value = 'app.feedback.history.errors.storage'
  }
}

function close(): void {
  emit('close')
}

function resetTransientState(): void {
  confirmingDelete.value = false
  errorKey.value = ''
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
</script>

<style scoped>
.feedback-history__header-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--oc-space-4);
}
.feedback-history__header-content > :last-child { justify-self: end; }

.feedback-history__header-content h2,
.feedback-history__header-content p,
.feedback-history__detail h3,
.feedback-history__response h4,
.feedback-history__response p {
  margin: 0;
}

.feedback-history__header-content h2 { font-size: var(--oc-text-lg); }
.feedback-history__header-content p,
.feedback-history__muted { color: var(--oc-fg-muted); }
.feedback-history__header-content p { margin-top: var(--oc-space-1); }

.feedback-history__body {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.6fr);
  min-height: 0;
  flex: 1 1 auto;
  width: 100%;
}

.feedback-history__body nav {
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: 1px solid var(--oc-border-muted);
  background: var(--oc-bg-base);
}

.feedback-history__item {
  display: grid;
  width: 100%;
  gap: var(--oc-space-2);
  padding: var(--oc-space-4);
  border: 0;
  border-bottom: 1px solid var(--oc-border-muted);
  background: transparent;
  color: var(--oc-fg-muted);
  text-align: left;
  cursor: pointer;
}

.feedback-history__item:hover { background: var(--oc-bg-hover); }
.feedback-history__item.is-active {
  background: var(--oc-bg-selected);
  box-shadow: inset 2px 0 0 var(--oc-fg-accent);
}

.feedback-history__item-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--oc-space-2);
  min-width: 0;
}

.feedback-history__item strong {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--oc-fg-default);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feedback-history__status {
  flex: 0 0 auto;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
}

.feedback-history__status[data-status="answered"] { color: var(--oc-fg-accent); }
.feedback-history__status[data-status="closed"] { color: var(--oc-fg-subtle); }

.feedback-history__detail {
  min-width: 0;
  overflow: auto;
  padding: var(--oc-space-5);
}

.feedback-history__detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--oc-space-4);
}

.feedback-history__detail-heading > div > span,
.feedback-history__detail dt {
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-xs);
}

.feedback-history__detail h3 { margin-top: var(--oc-space-1); }
.feedback-history__detail dl {
  display: grid;
  gap: var(--oc-space-2);
  margin: var(--oc-space-5) 0;
}
.feedback-history__detail dl > div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: var(--oc-space-3);
}
.feedback-history__detail dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.feedback-history__response {
  padding: var(--oc-space-4);
  border: 1px solid var(--oc-border-muted);
  border-radius: var(--oc-radius-md);
  background: var(--oc-bg-raised);
}
.feedback-history__response p {
  margin-top: var(--oc-space-3);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.feedback-history__error,
.feedback-history__delete-confirm {
  margin: var(--oc-space-4) 0 0;
  padding: var(--oc-space-3);
  border-radius: var(--oc-radius-sm);
  background: var(--oc-bg-danger-subtle);
  color: var(--oc-fg-danger);
}
.feedback-history__delete-confirm,
.feedback-history__delete-confirm > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-2);
}

.feedback-history__detail footer {
  display: flex;
  justify-content: space-between;
  gap: var(--oc-space-3);
  margin-top: var(--oc-space-5);
}

.feedback-history__empty {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  place-content: center;
  gap: var(--oc-space-2);
  padding: var(--oc-space-6);
  color: var(--oc-fg-muted);
  text-align: center;
}

@media (max-width: 700px) {
  .feedback-history__header-content { grid-template-columns: 1fr auto; }
  .feedback-history__header-content > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
  .feedback-history__body { grid-template-columns: 1fr; }
  .feedback-history__body nav { max-height: 180px; border-right: 0; border-bottom: 1px solid var(--oc-border-muted); }
}
</style>
