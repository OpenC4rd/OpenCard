<template>
  <OcDialog class="workbook-import-dialog" :open="Boolean(result)"
    :title="t('cardDesigner.dataTable.importReviewTitle')"
    :description="t('cardDesigner.dataTable.importReviewDescription')"
    size="lg" height-mode="fixed" height="lg" close-on-backdrop @request-close="emit('cancel')">
    <template v-if="result">
        <dl class="workbook-import-dialog__summary">
          <div>
            <dt>{{ t('cardDesigner.dataTable.importReviewInstances') }}</dt>
            <dd>{{ result.newInstances.length }}</dd>
          </div>
          <div>
            <dt>{{ t('cardDesigner.dataTable.importReviewBlockNames') }}</dt>
            <dd>{{ result.blockRenames.length }}</dd>
          </div>
          <div>
            <dt>{{ t('cardDesigner.dataTable.importReviewCells') }}</dt>
            <dd>{{ result.updates.length }}</dd>
          </div>
        </dl>

        <div v-if="result.newInstances.length || result.blockRenames.length" class="workbook-import-dialog__details">
          <section v-if="result.newInstances.length">
            <h3>{{ t('cardDesigner.dataTable.importReviewNewInstances') }}</h3>
            <ul>
              <li v-for="instance in result.newInstances" :key="instance.id">{{ instance.name }}</li>
            </ul>
          </section>
          <section v-if="result.blockRenames.length">
            <h3>{{ t('cardDesigner.dataTable.importReviewRenamedBlocks') }}</h3>
            <ul>
              <li v-for="rename in result.blockRenames" :key="rename.blockId">
                {{ rename.previousName }} → {{ rename.nextName || t('cardDesigner.dataTable.importReviewEmptyName') }}
              </li>
            </ul>
          </section>
        </div>

        <ul v-if="result.warnings.length" class="workbook-import-dialog__warnings" role="alert">
          <li v-for="warning in result.warnings" :key="warning">{{ warning }}</li>
        </ul>

        <p v-if="!hasChanges" class="workbook-import-dialog__empty">
          {{ t('cardDesigner.dataTable.importNoChanges') }}
        </p>

    </template>
    <template #footer>
      <OcButton @click="emit('cancel')">{{ t('cardDesigner.dataTable.importCancel') }}</OcButton>
      <OcButton variant="solid" :disabled="!hasChanges" @click="emit('confirm')">
        {{ t('cardDesigner.dataTable.importConfirm') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../components/base/OcButton.vue'
import OcDialog from '../../components/standard/OcDialog.vue'
import type { CardDataWorkbookImportResult } from './cardDataWorkbook'

const props = defineProps<{ result: CardDataWorkbookImportResult | null }>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()
const { t } = useI18n()
const hasChanges = computed(() => Boolean(
  props.result
  && (props.result.updates.length || props.result.blockRenames.length || props.result.newInstances.length),
))
</script>

<style scoped>
.workbook-import-dialog h3,
.workbook-import-dialog p,
.workbook-import-dialog dl,
.workbook-import-dialog ul {
  margin: 0;
}

.workbook-import-dialog__empty {
  color: var(--oc-fg-muted);
}

.workbook-import-dialog__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--oc-space-xs);
}

.workbook-import-dialog__summary > div,
.workbook-import-dialog__details section {
  padding: var(--oc-space-sm);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-raised);
}

.workbook-import-dialog__summary dt {
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.workbook-import-dialog__summary dd {
  margin: var(--oc-space-2xs) 0 0;
  font-size: var(--oc-text-lg);
}

.workbook-import-dialog__details {
  display: grid;
  gap: var(--oc-space-xs);
}

.workbook-import-dialog__details ul,
.workbook-import-dialog__warnings {
  padding-left: var(--oc-space-lg);
}

.workbook-import-dialog__warnings {
  color: var(--oc-icon-warning);
}

</style>
