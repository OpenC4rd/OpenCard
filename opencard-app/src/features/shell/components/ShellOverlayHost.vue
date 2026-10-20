<template>
  <div v-if="isExternalFileDragActive && !isExternalFileDragOverZone" class="shell-file-drop-overlay"
    role="status" aria-live="polite">
    <OcIcon name="file.generic" size="lg" tone="file-opencard" />
    <span>{{ t('app.shell.dropFilesToOpen') }}</span>
  </div>

  <ReleaseNotesDialog :open="releaseNotesDialogMode !== null" :release="displayedReleaseNotes"
    :available="releaseNotesDialogMode === 'available'" :busy="isDownloadingUpdate || isInstallingUpdate"
    :downloaded="isUpdateDownloaded" @close="emit('close-release-notes')" @action="emit('release-action')" />

  <FeedbackDialog :open="feedbackCenterPage !== null" :initial-kind="feedbackDialogKind" :active-page="feedbackCenterPage ?? 'submit'"
    :developer-mode="developerMode"
    :diagnostics="latestFeedbackDiagnostics" @page-change="emit('feedback-page-change', $event)"
    @close="emit('close-feedback')" />

  <OcDialog :open="Boolean(confirmationRequest)" :title="confirmationRequest?.title ?? ''"
    size="sm" @request-close="resolveConfirmation(false)">
    <OcInlineMarkup :source="confirmationRequest?.message ?? ''" />
    <template #footer>
      <OcButton variant="ghost" @click="resolveConfirmation(false)">
        {{ t('projectTemplates.actions.cancel') }}
      </OcButton>
      <OcButton variant="solid" @click="resolveConfirmation(true)">
        {{ confirmationRequest?.confirmLabel ?? '' }}
      </OcButton>
    </template>
  </OcDialog>

  <FloatingMenuHost />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FloatingMenuHost from '../../../components/ui/FloatingMenuHost.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcButton from '../../../components/base/OcButton.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import OcInlineMarkup from '../../../components/standard/OcInlineMarkup.vue'
import ReleaseNotesDialog from './ReleaseNotesDialog.vue'
import FeedbackDialog from '../../feedback/components/FeedbackDialog.vue'
import type { FeedbackDiagnosticInput, FeedbackKind, FeedbackPage } from '../../feedback/model/feedback'
import type { ReleaseNotesSnapshot } from '../composables/updateStatePersistence'
import { confirmationRequest, resolveConfirmation } from '../services/appConfirmation'

defineProps<{
  isExternalFileDragActive: boolean
  isExternalFileDragOverZone: boolean
  releaseNotesDialogMode: 'current' | 'available' | null
  displayedReleaseNotes: ReleaseNotesSnapshot | null
  isDownloadingUpdate: boolean
  isInstallingUpdate: boolean
  isUpdateDownloaded: boolean
  feedbackCenterPage: FeedbackPage | null
  feedbackDialogKind: FeedbackKind
  latestFeedbackDiagnostics?: FeedbackDiagnosticInput
  developerMode: boolean
}>()
const emit = defineEmits<{
  'close-release-notes': []
  'release-action': []
  'feedback-page-change': [page: FeedbackPage]
  'close-feedback': []
}>()
const { t } = useI18n()
</script>
