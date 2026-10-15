<template>
  <nav class="feedback-page-tabs" :aria-label="t('app.feedback.pages.label')">
    <OcButton
      size="sm"
      variant="ghost"
      :active="activePage === 'submit'"
      :aria-pressed="activePage === 'submit'"
      @click="emit('update:activePage', 'submit')"
    >
      {{ t('app.feedback.pages.submit') }}
    </OcButton>
    <OcButton
      size="sm"
      variant="ghost"
      :active="activePage === 'history'"
      :aria-pressed="activePage === 'history'"
      @click="emit('update:activePage', 'history')"
    >
      {{ t('app.feedback.pages.history') }}
    </OcButton>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import type { FeedbackPage } from '../model/feedback'

defineProps<{ activePage: FeedbackPage }>()
const emit = defineEmits<{ 'update:activePage': [page: FeedbackPage] }>()
const { t } = useI18n()
</script>

<style scoped>
.feedback-page-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-2xs);
  min-width: 0;
  padding-bottom: 1px;
  border-bottom: 1px solid var(--oc-border-muted);
}
</style>
