<template>
  <ProjectExportDialog :open="projectExportDialogOpen" :model-value="projectExportDialogTask"
    :documents="projectExportDocumentCandidates" :busy="isExportPreparing || isProjectExportRunning"
    :preparation-issues="exportPreparationIssues" @update:model-value="emit('update:projectExportDialogTask', $event)"
    @close="emit('close-project-export')" @submit="emit('submit-project-export')" />
  <ResourcePackageBuilderDialog :open="resourcePackageBuilderOpen" :project-root-path="projectPath ?? ''"
    :project-name="projectName" :entries="resourcePackageBuilderEntries" @close="emit('close-resource-package-builder')" />

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

</template>

<script setup lang="ts">
import ProjectExportDialog from '../../exporting/components/ProjectExportDialog.vue'
import ResourcePackageBuilderDialog from '../../workspace/components/ResourcePackageBuilderDialog.vue'
import UnsavedEditorsDialog from './UnsavedEditorsDialog.vue'
import type { ProjectExportTask } from '../../workspace/model/projectMetadata'
import type { ExportDocumentCandidate } from '../../../components/editors/ProjectExportTaskEditor.vue'
import type { ExportTaskValidationIssue } from '../../exporting/exportTask'
import type { UnsavedCloseIntent, UnsavedEditorDecision } from '../composables/useUnsavedSessionGuard'

defineProps<{
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
}>()

const emit = defineEmits<{
  'update:projectExportDialogTask': [task: ProjectExportTask]
  'close-project-export': []
  'submit-project-export': []
  'close-resource-package-builder': []
  'select-all-unsaved': [selected: boolean]
  'select-unsaved-row': [sessionId: string, selected: boolean]
  'mark-unsaved-discard': []
  'mark-unsaved-save': []
  'reset-unsaved-decision': [sessionId: string]
  'cancel-unsaved-close': []
  'confirm-unsaved-close': []
  'discard-single-unsaved': []
  'save-single-unsaved': []
}>()

function handleSelectRow(sessionId: string, selected: boolean): void {
  emit('select-unsaved-row', sessionId, selected)
}
</script>
