<template>
  <div v-if="showExportRenderer" style="position: fixed; top: -9999px; left: -9999px;">
    <CardFaceRenderer v-if="exportCardFace && exportResourceContext" :ref="setExportRendererRef"
      :face="exportCardFace" :clip-to-face="true" :resource-context="exportResourceContext" />
  </div>

  <ProjectExportDialog :open="projectExportDialogOpen" :model-value="projectExportDialogTask"
    :documents="projectExportDocumentCandidates" :busy="isExportPreparing || isProjectExportRunning"
    :preparation-issues="exportPreparationIssues" @update:model-value="emit('update:projectExportDialogTask', $event)"
    @close="emit('close-project-export')" @submit="emit('submit-project-export')" />
  <ResourcePackageBuilderDialog :open="resourcePackageBuilderOpen" :project-root-path="projectPath ?? ''"
    :project-name="projectName" :entries="resourcePackageBuilderEntries" @close="emit('close-resource-package-builder')" />
  <CommitVersionDialog :open="commitVersionDialogOpen" :busy="isCommittingVersion" :error="commitVersionError"
    @close="emit('close-commit-version')" @submit="emit('submit-commit-version', $event)" />

  <div v-if="isExternalFileDragActive && !isExternalFileDragOverZone" class="shell-file-drop-overlay"
    role="status" aria-live="polite">
    <OcIcon name="file.generic" size="lg" tone="file-opencard" />
    <span>{{ t('app.shell.dropFilesToOpen') }}</span>
  </div>

  <UnsavedEditorsDialog :open="isUnsavedEditorsDialogOpen" :intent-type="pendingCloseIntent?.type"
    :rows="unsavedEditorDecisions" :busy="isUnsavedCloseBusy" :global-error="unsavedCloseError"
    :selected-count="unsavedSelectedCount" :pending-count="unsavedPendingCount" :save-count="unsavedSaveCount"
    :discard-count="unsavedDiscardCount" :all-pending-selected="allUnsavedPendingSelected"
    :some-pending-selected="someUnsavedPendingSelected" :can-confirm="canConfirmUnsavedClose"
    @select-all="emit('select-all-unsaved', $event)"
    @select-row="handleSelectRow"
    @mark-discard="emit('mark-unsaved-discard')" @mark-save="emit('mark-unsaved-save')"
    @change-decision="emit('reset-unsaved-decision', $event)" @cancel="emit('cancel-unsaved-close')"
    @confirm="emit('confirm-unsaved-close')" @discard-single="emit('discard-single-unsaved')"
    @save-single="emit('save-single-unsaved')" />

  <ReleaseNotesDialog :open="releaseNotesDialogMode !== null" :release="displayedReleaseNotes"
    :available="releaseNotesDialogMode === 'available'" :busy="isDownloadingUpdate || isInstallingUpdate"
    :downloaded="isUpdateDownloaded" @close="emit('close-release-notes')" @action="emit('release-action')" />

  <FeedbackDialog :open="feedbackCenterPage === 'submit'" :initial-kind="feedbackDialogKind" active-page="submit"
    :diagnostics="latestFeedbackDiagnostics" @page-change="emit('feedback-page-change', $event)"
    @close="emit('close-feedback')" />
  <FeedbackHistoryDialog :open="feedbackCenterPage === 'history'" active-page="history"
    :developer-mode="developerMode" @page-change="emit('feedback-page-change', $event)"
    @close="emit('close-feedback')" />

  <OcDialog :open="Boolean(confirmationRequest)" :title="confirmationRequest?.title ?? ''"
    :description="confirmationRequest?.message ?? ''" size="sm" @close="emit('resolve-confirmation', false)">
    <template #footer>
      <OcButton variant="ghost" @click="emit('resolve-confirmation', false)">
        {{ t('projectTemplates.actions.cancel') }}
      </OcButton>
      <OcButton variant="solid" @click="emit('resolve-confirmation', true)">
        {{ confirmationRequest?.confirmLabel ?? '' }}
      </OcButton>
    </template>
  </OcDialog>

  <FloatingMenuHost />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ComponentPublicInstance } from 'vue'
import FloatingMenuHost from '../../../components/ui/FloatingMenuHost.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcButton from '../../../components/base/OcButton.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import CardFaceRenderer from '../../card-rendering/components/CardFaceRenderer.vue'
import ProjectExportDialog from '../../exporting/components/ProjectExportDialog.vue'
import ResourcePackageBuilderDialog from '../../workspace/components/ResourcePackageBuilderDialog.vue'
import CommitVersionDialog from '../../version-control/components/CommitVersionDialog.vue'
import UnsavedEditorsDialog from './UnsavedEditorsDialog.vue'
import ReleaseNotesDialog from './ReleaseNotesDialog.vue'
import FeedbackDialog from '../../feedback/components/FeedbackDialog.vue'
import FeedbackHistoryDialog from '../../feedback/components/FeedbackHistoryDialog.vue'
import type { FeedbackDiagnosticInput, FeedbackKind, FeedbackPage } from '../../feedback/model/feedback'
import type { ProjectExportTask } from '../../workspace/model/projectMetadata'
import type { ExportDocumentCandidate } from '../../../components/editors/ProjectExportTaskEditor.vue'
import type { ExportTaskValidationIssue } from '../../exporting/exportTask'
import type { RenderReadyCardFace } from '../../card-rendering/render.types'
import type { CardRenderResourceContext } from '../../card-rendering/cardRenderResources'
import type { ReleaseNotesSnapshot } from '../composables/updateStatePersistence'
import type { UnsavedCloseIntent, UnsavedEditorDecision } from '../composables/useUnsavedSessionGuard'

defineProps<{
  showExportRenderer: boolean
  exportCardFace: RenderReadyCardFace | null
  exportResourceContext: CardRenderResourceContext | null
  setExportRendererRef: (renderer: Element | ComponentPublicInstance | null) => void
  projectExportDialogOpen: boolean
  projectExportDialogTask: ProjectExportTask
  projectExportDocumentCandidates: readonly ExportDocumentCandidate[]
  isExportPreparing: boolean
  isProjectExportRunning: boolean
  exportPreparationIssues: readonly ExportTaskValidationIssue[]
  resourcePackageBuilderOpen: boolean
  projectPath: string | null
  projectName: string
  resourcePackageBuilderEntries: readonly string[]
  commitVersionDialogOpen: boolean
  isCommittingVersion: boolean
  commitVersionError: string
  isExternalFileDragActive: boolean
  isExternalFileDragOverZone: boolean
  isUnsavedEditorsDialogOpen: boolean
  pendingCloseIntent: UnsavedCloseIntent | null
  unsavedEditorDecisions: readonly UnsavedEditorDecision[]
  isUnsavedCloseBusy: boolean
  unsavedCloseError: string
  unsavedSelectedCount: number
  unsavedPendingCount: number
  unsavedSaveCount: number
  unsavedDiscardCount: number
  allUnsavedPendingSelected: boolean
  someUnsavedPendingSelected: boolean
  canConfirmUnsavedClose: boolean
  releaseNotesDialogMode: 'current' | 'available' | null
  displayedReleaseNotes: ReleaseNotesSnapshot | null
  isDownloadingUpdate: boolean
  isInstallingUpdate: boolean
  isUpdateDownloaded: boolean
  feedbackCenterPage: FeedbackPage | null
  feedbackDialogKind: FeedbackKind
  latestFeedbackDiagnostics?: FeedbackDiagnosticInput
  developerMode: boolean
  confirmationRequest: { title: string; message: string; confirmLabel: string } | null
}>()

const emit = defineEmits<{
  'update:projectExportDialogTask': [task: ProjectExportTask]
  'close-project-export': []
  'submit-project-export': []
  'close-resource-package-builder': []
  'close-commit-version': []
  'submit-commit-version': [value: { summary: string; description: string }]
  'select-all-unsaved': [selected: boolean]
  'select-unsaved-row': [sessionId: string, selected: boolean]
  'mark-unsaved-discard': []
  'mark-unsaved-save': []
  'reset-unsaved-decision': [sessionId: string]
  'cancel-unsaved-close': []
  'confirm-unsaved-close': []
  'discard-single-unsaved': []
  'save-single-unsaved': []
  'close-release-notes': []
  'release-action': []
  'feedback-page-change': [page: FeedbackPage]
  'close-feedback': []
  'resolve-confirmation': [accepted: boolean]
}>()

const { t } = useI18n()
function handleSelectRow(sessionId: string, selected: boolean): void {
  emit('select-unsaved-row', sessionId, selected)
}
</script>
