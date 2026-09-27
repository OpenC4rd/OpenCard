<template>
  <OcDialog class="unsaved-editors-dialog"
    :open="open" :title="title" :description="description" :size="isSingle ? 'md' : 'lg'"
    :height-mode="isSingle ? 'content' : 'fixed'" :height="isSingle ? undefined : 'lg'"
    :padded="false" :scrollable="false" :dismissible="!busy" @request-close="handleCancel">
    <template #header="{ titleId, descriptionId }">
        <div class="unsaved-editors-dialog__header-content">
          <div>
            <h2 :id="titleId">{{ title }}</h2>
            <p :id="descriptionId">{{ description }}</p>
            <p v-if="singleError" class="unsaved-editors-dialog__error" role="alert">
              {{ resolveError(singleError) }}
            </p>
          </div>
        </div>
    </template>

        <div v-if="!isSingle" class="unsaved-editors-dialog__selection-bar">
          <OcCheckbox
            autofocus
            :checked="allPendingSelected"
            :indeterminate="somePendingSelected"
            :disabled="busy || pendingCount === 0"
            :label="t('app.unsavedEditors.selectAllPending')"
            @update:checked="emit('select-all', $event)"
          />
          <span>{{ t('app.unsavedEditors.pendingCount', { count: pendingCount }) }}</span>
        </div>

        <div v-if="!isSingle" class="unsaved-editors-dialog__list" role="list">
          <article
            v-for="row in rows"
            :key="row.sessionId"
            class="unsaved-editors-dialog__row"
            :class="`unsaved-editors-dialog__row--${row.decision}`"
            role="listitem"
          >
            <div v-if="!isSingle" class="unsaved-editors-dialog__selection">
              <OcCheckbox
                v-if="row.decision === 'pending'"
                :checked="row.selected"
                :disabled="busy"
                :aria-label="t('app.unsavedEditors.selectEditor', { name: row.name })"
                @update:checked="emit('select-row', row.sessionId, $event)"
              />
              <OcIcon
                v-else
                :name="decisionIcon(row.decision)"
                :tone="decisionTone(row.decision)"
              />
            </div>

            <OcIcon
              class="unsaved-editors-dialog__file-icon"
              :name="resolveFileTypeById(row.fileTypeId).icon"
              :tone="resolveFileTypeById(row.fileTypeId).iconTone"
              size="lg"
            />

            <div class="unsaved-editors-dialog__identity">
              <strong>{{ row.name }}</strong>
              <span :data-tooltip="row.path ?? undefined" data-tooltip-overflow>
                {{ row.resourceKind === 'draft' ? t('app.unsavedEditors.notOnDisk') : row.path }}
              </span>
            </div>

            <div v-if="!isSingle" class="unsaved-editors-dialog__decision">
              <span
                class="unsaved-editors-dialog__decision-label"
                :class="`unsaved-editors-dialog__decision-label--${row.decision}`"
                :data-tooltip="row.savePath ?? undefined"
                data-tooltip-overflow
              >
                {{ decisionLabel(row) }}
              </span>
              <span v-if="row.error" class="unsaved-editors-dialog__error" role="alert">
                {{ resolveError(row.error) }}
              </span>
            </div>

            <OcButton
              v-if="!isSingle && row.decision !== 'pending'"
              class="unsaved-editors-dialog__change-button"
              size="sm"
              :disabled="busy"
              @click="emit('change-decision', row.sessionId)"
            >
              {{ t('app.unsavedEditors.change') }}
            </OcButton>
          </article>
        </div>

        <div v-if="!isSingle" class="unsaved-editors-dialog__batch-actions">
          <OcButton
            class="unsaved-editors-dialog__discard-button"
            variant="soft"
            icon="action.delete"
            icon-tone="danger"
            :disabled="busy || selectedCount === 0"
            @click="emit('mark-discard')"
          >
            {{ t('app.unsavedEditors.markDiscard', { count: selectedCount }) }}
          </OcButton>
          <OcButton
            variant="soft"
            icon="action.save"
            icon-tone="success"
            :disabled="busy || selectedCount === 0"
            @click="emit('mark-save')"
          >
            {{ t('app.unsavedEditors.markSave', { count: selectedCount }) }}
          </OcButton>
        </div>

    <template #footer>
        <div class="unsaved-editors-dialog__footer-content">
          <div v-if="!isSingle" class="unsaved-editors-dialog__summary" aria-live="polite">
            {{ t('app.unsavedEditors.summary', {
              save: saveCount,
              discard: discardCount,
              pending: pendingCount,
            }) }}
            <span v-if="globalError" class="unsaved-editors-dialog__error" role="alert">
              {{ resolveError(globalError) }}
            </span>
          </div>
          <div class="unsaved-editors-dialog__footer-actions">
            <OcButton :disabled="busy" @click="emit('cancel')">
              {{ t('app.unsavedEditors.cancel') }}
            </OcButton>
            <template v-if="isSingle">
              <OcButton
                class="unsaved-editors-dialog__discard-button"
                variant="soft"
                :disabled="busy"
                @click="emit('discard-single')"
              >
                {{ t('app.unsavedEditors.singleDiscard') }}
              </OcButton>
              <OcButton variant="solid" :disabled="busy" @click="emit('save-single')">
                {{ busy ? t('app.unsavedEditors.processing') : t('app.unsavedEditors.singleSave') }}
              </OcButton>
            </template>
            <OcButton v-else variant="solid" :disabled="!canConfirm" @click="emit('confirm')">
              {{ busy ? t('app.unsavedEditors.processing') : t('app.unsavedEditors.confirm') }}
            </OcButton>
          </div>
        </div>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcCheckbox from '../../../components/base/OcCheckbox.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import type { IconToken, IconTone } from '../../../shared/ui/icon/iconRegistry'
import { resolveFileTypeById } from '../../workspace/model/fileTypes'
import type {
  UnsavedCloseIntent,
  UnsavedDecision,
  UnsavedEditorDecision,
} from '../composables/useUnsavedSessionGuard'

const props = defineProps<{
  open: boolean
  intentType?: UnsavedCloseIntent['type']
  rows: readonly UnsavedEditorDecision[]
  busy: boolean
  globalError: string
  selectedCount: number
  pendingCount: number
  saveCount: number
  discardCount: number
  allPendingSelected: boolean
  somePendingSelected: boolean
  canConfirm: boolean
}>()

const emit = defineEmits<{
  (e: 'select-all', selected: boolean): void
  (e: 'select-row', sessionId: string, selected: boolean): void
  (e: 'mark-discard'): void
  (e: 'mark-save'): void
  (e: 'change-decision', sessionId: string): void
  (e: 'cancel'): void
  (e: 'confirm'): void
  (e: 'discard-single'): void
  (e: 'save-single'): void
}>()

const { t } = useI18n()
const isSingle = computed(() => props.rows.length === 1)
const singleRow = computed(() => isSingle.value ? props.rows[0] : undefined)
const title = computed(() => singleRow.value
  ? t('app.unsavedEditors.singleTitle', { name: singleRow.value.name })
  : t(`app.unsavedEditors.titles.${props.intentType ?? 'sessions'}`))
const description = computed(() => singleRow.value
  ? t(singleRow.value.resourceKind === 'draft'
      ? 'app.unsavedEditors.singleDraftDescription'
      : 'app.unsavedEditors.singleDirtyDescription')
  : t('app.unsavedEditors.description'))
const singleError = computed(() => singleRow.value?.error || props.globalError)

function decisionIcon(decision: UnsavedDecision): IconToken {
  if (decision === 'save') return 'action.save'
  if (decision === 'discard') return 'status.error'
  return 'status.warning'
}

function decisionTone(decision: UnsavedDecision): IconTone {
  if (decision === 'save') return 'success'
  if (decision === 'discard') return 'danger'
  return 'warning'
}

function decisionLabel(row: UnsavedEditorDecision): string {
  if (row.decision === 'save') {
    return t('app.unsavedEditors.saveTo', { path: row.savePath ?? row.path ?? row.name })
  }
  if (row.decision === 'discard') return t('app.unsavedEditors.discard')
  return t('app.unsavedEditors.pending')
}

function resolveError(error: string): string {
  if (error === 'cancelled') return t('app.unsavedEditors.errors.cancelled')
  if (error === 'save-failed') return t('app.unsavedEditors.errors.saveFailed')
  if (error === 'close-failed') return t('app.unsavedEditors.errors.closeFailed')
  return error
}

function handleCancel(): void {
  if (!props.busy) emit('cancel')
}
</script>

<style scoped>
.unsaved-editors-dialog {
  user-select: none;
  -webkit-user-select: none;
}

.unsaved-editors-dialog input,
.unsaved-editors-dialog textarea,
.unsaved-editors-dialog [contenteditable='true'] {
  user-select: text;
  -webkit-user-select: text;
}

.unsaved-editors-dialog__selection-bar,
.unsaved-editors-dialog__batch-actions {
  padding-inline: var(--oc-space-5);
}

.unsaved-editors-dialog__header-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--oc-space-4);
}

.unsaved-editors-dialog__header-content h2,
.unsaved-editors-dialog__header-content p {
  margin: 0;
}

.unsaved-editors-dialog__header-content h2 {
  font-size: var(--oc-text-lg);
  font-weight: 600;
}

.unsaved-editors-dialog__header-content p {
  margin-top: var(--oc-space-2);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.unsaved-editors-dialog__selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  border-block: 1px solid var(--oc-border-muted);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.unsaved-editors-dialog__list {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: var(--oc-space-2) var(--oc-space-3);
}

.unsaved-editors-dialog__row {
  display: grid;
  grid-template-columns: 24px 28px minmax(140px, 0.85fr) minmax(180px, 1.15fr) auto;
  align-items: center;
  gap: var(--oc-space-3);
  min-height: 58px;
  padding: var(--oc-space-2) var(--oc-space-3);
  border-radius: var(--oc-radius-md);
}

.unsaved-editors-dialog__row + .unsaved-editors-dialog__row {
  border-top: 1px solid var(--oc-border-muted);
}

.unsaved-editors-dialog__row--pending {
  background: color-mix(in srgb, var(--oc-icon-warning) 7%, transparent);
}

.unsaved-editors-dialog__row--save {
  background: color-mix(in srgb, var(--oc-icon-success) 7%, transparent);
}

.unsaved-editors-dialog__row--discard {
  background: var(--oc-bg-danger-subtle);
}

.unsaved-editors-dialog__selection,
.unsaved-editors-dialog__file-icon {
  display: grid;
  place-items: center;
}

.unsaved-editors-dialog__identity,
.unsaved-editors-dialog__decision,
.unsaved-editors-dialog__summary {
  min-width: 0;
}

.unsaved-editors-dialog__identity,
.unsaved-editors-dialog__decision {
  display: grid;
  gap: 2px;
}

.unsaved-editors-dialog__identity strong,
.unsaved-editors-dialog__identity span,
.unsaved-editors-dialog__decision-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unsaved-editors-dialog__identity strong {
  font-size: var(--oc-text-base);
  font-weight: 500;
}

.unsaved-editors-dialog__identity span,
.unsaved-editors-dialog__decision-label,
.unsaved-editors-dialog__error,
.unsaved-editors-dialog__summary {
  font-size: var(--oc-text-sm);
}

.unsaved-editors-dialog__identity span,
.unsaved-editors-dialog__summary {
  color: var(--oc-fg-muted);
}

.unsaved-editors-dialog__decision-label--pending {
  color: var(--oc-icon-warning);
}

.unsaved-editors-dialog__decision-label--save {
  color: var(--oc-icon-success);
}

.unsaved-editors-dialog__decision-label--discard,
.unsaved-editors-dialog__error {
  color: var(--oc-fg-danger);
}

.unsaved-editors-dialog__batch-actions {
  /* 网格列按内容取宽：按钮保持自身尺寸，不必再去改按钮内部的 flex。 */
  display: grid;
  grid-auto-flow: column;
  justify-content: end;
  gap: var(--oc-space-2);
  padding-block: var(--oc-space-3);
  border-top: 1px solid var(--oc-border-muted);
}

.unsaved-editors-dialog__discard-button:not(:disabled) {
  color: var(--oc-fg-danger);
}

.unsaved-editors-dialog__footer-content {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-4);
}

.unsaved-editors-dialog__summary {
  display: grid;
  gap: var(--oc-space-1);
}

.unsaved-editors-dialog__footer-actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--oc-space-2);
}

@media (max-width: 680px) {
  .unsaved-editors-dialog__row {
    grid-template-columns: 24px 24px minmax(0, 1fr) auto;
  }

  .unsaved-editors-dialog__decision {
    grid-column: 3 / -1;
    grid-row: 2;
  }

  .unsaved-editors-dialog__change-button {
    grid-column: 4;
    grid-row: 1;
  }

  .unsaved-editors-dialog__footer-content {
    align-items: stretch;
    flex-direction: column;
  }

  .unsaved-editors-dialog__footer-actions {
    justify-content: flex-end;
  }
}
</style>
