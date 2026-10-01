<template>
  <CreateProjectWorkspace v-if="mode === 'create-project'" :ref="setCreateProjectRef"
    :external-busy="isActivatingProject" :selected-key="selectedTemplateKey"
    :attached-resource-packages="attachedResourcePackages" @created="emit('created', $event)"
    @update:busy="emit('update:createBusy', $event)" @update:selected-key="emit('update:selectedTemplateKey', $event)" />
  <ExportTemplateWorkspace v-else-if="mode === 'export-template' && projectPath" :ref="setExportTemplateRef"
    :project-path="projectPath" @selection-change="emit('export-selection-change', $event)"
    @exported="emit('exported', $event)" @update:busy="emit('update:exportBusy', $event)" />
  <SettingsWorkspace v-else-if="mode === 'settings'" :view-model="activeSettingsCategory" :focus-key="settingsFocusKey"
    @intent="emit('settings-intent', $event)" />
  <AboutWorkspace v-else-if="mode === 'about'" :current-release-notes="currentReleaseNotes"
    :available-update-version="availableUpdate ? updateVersion : undefined" @back="emit('about-back')"
    @show-available-release="emit('show-available-release')" @send-feedback="emit('send-feedback')"
    @view-feedback="emit('view-feedback')" />
  <WelcomeWorkspace v-else-if="mode === 'welcome'" :covers="welcomeCovers" :highlight-keys="selectedRecentProjectKeys"
    :background-visible="backgroundVisible" @new-project="emit('new-project')" @open-project="emit('open-project')"
    @update:background-visible="emit('update:background-visible', $event)" />
  <WorkbenchWorkspace v-else :has-active-editor="Boolean(activeSession)" :has-project="Boolean(projectPath)"
    @open-project="emit('open-project')">
    <Transition name="shell-editor-fade" mode="out-in">
      <component v-if="activeSession" :is="currentEditorComponent" :key="currentEditorKey" :ref="setCurrentEditorRef"
        v-bind="currentEditorProps" @modified="emit('editor-modified', $event)" @save="emit('editor-save')"
        @open-file="emit('editor-open-file', $event)" @trash-file="emit('editor-trash-file', $event)"
        @update-viewport-transform="emit('viewport-transform', $event)"
        @update:pixelated="emit('pixelated', $event)" @update:card-designer-mode="emit('card-designer-mode', $event)"
        @update-card-designer-layout="emit('card-designer-layout', $event)"
        @update-card-designer-view="emit('card-designer-view', $event)"
        @update-diff-ui-state="emit('diff-ui-state', $event)"
        @issue-snapshot="emit('issue-snapshot', activeSession.id, $event)" />
    </Transition>
  </WorkbenchWorkspace>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import type { ProjectTemplateKey, CreatedProject, TemplateExportSelection } from '../../project-templates/model/projectTemplate'
import type { StoredResourcePackage } from '../../workspace/model/storedResourcePackage'
import type { SettingsCategoryViewModel } from '../../settings/composables/useSettingsWorkspace'
import type { SettingsIntent } from '../../settings/model/appSettings'
import type { WelcomeCoverWallCover } from './WelcomeCoverWall.vue'
import type {
  CardDesignerLayoutState,
  CardDesignerMode,
  CardDesignerViewState,
  EditorDiffUiState,
  EditorViewportTransform,
} from '../../editor-runtime/model/editorUiState'
import type { EditorIssueSnapshot } from '../../editor-runtime/model/editorIssue'
import type { CurrentReleaseNotes } from '../composables/updateStatePersistence'
import CreateProjectWorkspace from '../../project-templates/components/CreateProjectWorkspace.vue'
import ExportTemplateWorkspace from '../../project-templates/components/ExportTemplateWorkspace.vue'
import SettingsWorkspace from '../../settings/components/SettingsWorkspace.vue'
import AboutWorkspace from './AboutWorkspace.vue'
import WelcomeWorkspace from './WelcomeWorkspace.vue'
import WorkbenchWorkspace from './WorkbenchWorkspace.vue'

defineProps<{
  mode: 'welcome' | 'workbench' | 'settings' | 'create-project' | 'export-template' | 'about'
  isActivatingProject: boolean
  selectedTemplateKey: ProjectTemplateKey | null
  attachedResourcePackages: readonly StoredResourcePackage[]
  projectPath: string | null
  activeSettingsCategory: SettingsCategoryViewModel
  settingsFocusKey?: string
  currentReleaseNotes: CurrentReleaseNotes | null
  availableUpdate: boolean
  updateVersion: string
  welcomeCovers: readonly WelcomeCoverWallCover[]
  selectedRecentProjectKeys: readonly string[]
  backgroundVisible: boolean
  activeSession: EditorSession | null
  currentEditorComponent: Component | null
  currentEditorKey: string
  currentEditorProps: Record<string, unknown>
  setCreateProjectRef: (value: unknown) => void
  setExportTemplateRef: (value: unknown) => void
  setCurrentEditorRef: (value: unknown) => void
}>()

const emit = defineEmits<{
  created: [project: CreatedProject]
  'update:createBusy': [busy: boolean]
  'update:selectedTemplateKey': [key: ProjectTemplateKey | null]
  'export-selection-change': [selection: TemplateExportSelection]
  exported: [path: string]
  'update:exportBusy': [busy: boolean]
  'settings-intent': [intent: SettingsIntent]
  'about-back': []
  'show-available-release': []
  'send-feedback': []
  'view-feedback': []
  'new-project': []
  'open-project': []
  'update:background-visible': [visible: boolean]
  'editor-modified': [event: boolean]
  'editor-save': []
  'editor-open-file': [path: string]
  'editor-trash-file': [path: string]
  'viewport-transform': [value: EditorViewportTransform]
  pixelated: [value: boolean]
  'card-designer-mode': [value: CardDesignerMode]
  'card-designer-layout': [value: CardDesignerLayoutState]
  'card-designer-view': [value: CardDesignerViewState]
  'diff-ui-state': [value: EditorDiffUiState]
  'issue-snapshot': [sessionId: string, snapshot: EditorIssueSnapshot]
}>()
</script>
