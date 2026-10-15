<template>
  <OcDialog class="dictionary-workbook-dialog" :open="Boolean(result)"
    :title="t('dictionaryEditor.workbook.reviewTitle')"
    :description="t('dictionaryEditor.workbook.reviewDescription')"
    size="lg" height-mode="fixed" height="lg" close-on-backdrop @request-close="emit('cancel')">
    <template v-if="result">
      <dl class="dictionary-workbook-dialog__summary">
        <div>
          <dt>{{ t('dictionaryEditor.workbook.reviewRecords') }}</dt>
          <dd>{{ result.addedRecords.length }}</dd>
        </div>
        <div>
          <dt>{{ t('dictionaryEditor.workbook.reviewLanguages') }}</dt>
          <dd>{{ result.addedLanguages.length }}</dd>
        </div>
        <div>
          <dt>{{ t('dictionaryEditor.workbook.reviewCells') }}</dt>
          <dd>{{ result.updatedCells }}</dd>
        </div>
      </dl>

      <div v-if="result.addedRecords.length || result.addedLanguages.length"
        class="dictionary-workbook-dialog__details">
        <section v-if="result.addedRecords.length">
          <h3>{{ t('dictionaryEditor.workbook.newRecords') }}</h3>
          <ul><li v-for="key in result.addedRecords" :key="key">{{ key }}</li></ul>
        </section>
        <section v-if="result.addedLanguages.length">
          <h3>{{ t('dictionaryEditor.workbook.newLanguages') }}</h3>
          <ul><li v-for="key in result.addedLanguages" :key="key">{{ key }}</li></ul>
        </section>
      </div>

      <p v-if="!hasChanges" class="dictionary-workbook-dialog__empty">
        {{ t('dictionaryEditor.workbook.noChanges') }}
      </p>
    </template>
    <template #footer>
      <OcButton @click="emit('cancel')">{{ t('dictionaryEditor.workbook.cancel') }}</OcButton>
      <OcButton variant="solid" :disabled="!hasChanges" @click="emit('confirm')">
        {{ t('dictionaryEditor.workbook.confirm') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectDictionaryWorkbookImportResult } from '../../features/workspace/model/projectDictionaryWorkbook'
import OcButton from '../base/OcButton.vue'
import OcDialog from '../standard/OcDialog.vue'

const props = defineProps<{ result: ProjectDictionaryWorkbookImportResult | null }>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()
const { t } = useI18n()
const hasChanges = computed(() => Boolean(
  props.result
  && (props.result.addedRecords.length || props.result.addedLanguages.length || props.result.updatedCells),
))
</script>

<style scoped>
.dictionary-workbook-dialog h3,
.dictionary-workbook-dialog p,
.dictionary-workbook-dialog dl,
.dictionary-workbook-dialog ul { margin: 0; }
.dictionary-workbook-dialog__empty { color: var(--oc-fg-muted); }
.dictionary-workbook-dialog__summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--oc-space-xs); }
.dictionary-workbook-dialog__summary > div,
.dictionary-workbook-dialog__details section {
  display: grid;
  gap: var(--oc-space-2xs);
  padding: var(--oc-space-sm);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-raised);
}
.dictionary-workbook-dialog__summary dt { color: var(--oc-fg-muted); font-size: var(--oc-text-sm); }
.dictionary-workbook-dialog__summary dd { margin: 0; font-size: var(--oc-text-lg); }
.dictionary-workbook-dialog__details { display: grid; gap: var(--oc-space-xs); }
.dictionary-workbook-dialog__details ul { padding-left: var(--oc-space-lg); }
</style>
