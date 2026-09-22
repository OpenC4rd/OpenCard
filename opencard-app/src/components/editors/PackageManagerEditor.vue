<template>
  <ProjectRegistryEditorShell content-mode="workspace">
    <div class="package-manager">
      <OcEmpty v-if="!rows.length" tone="muted" inset="comfortable">{{ t('packageManager.empty') }}</OcEmpty>
      <template v-else>
        <div class="package-manager__view">
          <OcAlbum v-if="packageManagerView === 'album'" fill :data="treeData"
            :aria-label="t('packageManager.title')" selection-mode="none" activation-mode="none"
            @action="handleNodeAction" />
          <OcTree v-else fill :data="treeData" :aria-label="t('packageManager.title')" @action="handleNodeAction" />
        </div>
      </template>
    </div>
    <OcDialog :open="Boolean(confirmRequest)" :title="t('packageManager.confirmTitle')"
      :description="confirmRequest?.message ?? ''" size="sm" @close="resolveConfirm(false)">
      <template #footer>
        <OcButton variant="ghost" @click="resolveConfirm(false)">{{ t('packageManager.cancel') }}</OcButton>
        <OcButton variant="solid" @click="resolveConfirm(true)">{{ t('packageManager.confirm') }}</OcButton>
      </template>
    </OcDialog>
    <OcDialog :open="addOpen" :title="t('packageManager.add')" size="sm" @close="addOpen = false">
      <OcOptionGroup v-model="addMode" :options="addModeOptions" />
      <div v-if="addMode === 'local'" class="package-manager__field">
        <OcButton icon="action.folder-plus" @click="choosePackage">{{ t('packageManager.choosePackages') }}</OcButton>
        <OcText v-if="localPaths.length">{{ t('packageManager.selectedFiles', { count: localPaths.length }) }}</OcText>
      </div>
      <div v-else class="package-manager__field">
        <ReferenceStringPropertyField :definition="remoteSourceDefinition" :value="remoteSource"
          @update:value="updateRemoteSource" />
        <OcText v-if="invalidRemoteEntries.length" tone="danger" size="sm" role="alert">
          {{ t('packageManager.invalidSource', { source: invalidRemoteEntries[0] }) }}
        </OcText>
      </div>
      <template #footer><OcButton variant="ghost" @click="addOpen = false">{{ t('packageManager.cancel') }}</OcButton><OcButton variant="solid" :disabled="!canAdd" @click="addPackage">{{ t('packageManager.add') }}</OcButton></template>
    </OcDialog>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { ResourcePackageManifest } from '../../features/workspace/model/resourcePackage'
import type { OcNode, OcNodeActionEvent, OcNodeCollection } from '../../shared/ui/node/node.types'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { ShellWorkspaceAction } from '../../features/shell/shell.types'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { createRemotePackageLocator, parseRemotePackageEntry } from '../../features/workspace/services/remotePackageSource'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import OcButton from '../base/OcButton.vue'
import OcEmpty from '../base/OcEmpty.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'
import OcTree from '../standard/OcTree.vue'
import OcAlbum from '../standard/OcAlbum.vue'
import OcOptionGroup, { type OcOption } from '../standard/OcOptionGroup.vue'
import ReferenceStringPropertyField from '../../shared/ui/property-editor/fields/ReferenceStringPropertyField.vue'
import { useAppSettingsStore } from '../../features/settings/store/appSettingsStore'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'
import { notifyError, notifySuccess } from '../../features/notifications/titlebarNotices'
import { publishAppOutput } from '../../features/logging/appOutput'
import { useShellProgressTasks } from '../../features/shell/composables/useShellProgressTasks'
const removeAction = (key: string) => `package-remove:${key}`

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const projectStore = useProjectStore()
const settingsStore = useAppSettingsStore()
const shellProgress = useShellProgressTasks()
const PACKAGE_ADD_TASK_KEY = 'package-manager-add'
/** Adding installs package files, so it owns the global progress bar and disables related commands. */
const addTaskBusy = computed(() => shellProgress.tasks.value.some(task => task.key === PACKAGE_ADD_TASK_KEY))
const busy = ref(false)
const confirmRequest = ref<{ message: string; resolve: (accepted: boolean) => void } | null>(null)
const addOpen = ref(false)
const addMode = ref<'local' | 'remote'>('local')
const localPaths = ref<string[]>([])
const remoteSource = ref('')
/** 远程来源是"分号分隔的多项字符串"字段：回车或分号成一项，不合法的项当场标出。 */
const remoteSourceDefinition = computed(() => ({
  fieldType: 'string' as const,
  title: t('packageManager.source'),
  placeholder: t('packageManager.sourcePlaceholder'),
  multiline: true,
  listSeparator: 'semicolon' as const,
  listInvalid: (token: string) => parseRemotePackageEntry(token) === null,
}))
const addModeOptions = computed<readonly OcOption[]>(() => [
  { value: 'local', label: t('packageManager.local') },
  { value: 'remote', label: t('packageManager.remote') },
])
const packageManagerView = computed(() => settingsStore.settings.value.workspace.packageManagerView)

function togglePackageManagerView(): void {
  settingsStore.updateSetting('workspace.packageManagerView', packageManagerView.value === 'album' ? 'tree' : 'album')
}
const remoteEntries = computed(() => remoteSource.value.split(/[;\n]+/)
  .map(entry => entry.trim())
  .filter(Boolean)
  .map(entry => ({ entry, parsed: parseRemotePackageEntry(entry) })))
const invalidRemoteEntries = computed(() => remoteEntries.value.filter(item => !item.parsed).map(item => item.entry))
const canAdd = computed(() => addMode.value === 'local'
  ? localPaths.value.length > 0
  : remoteEntries.value.length > 0 && invalidRemoteEntries.value.length === 0)
type PackageRow = {
  key: string
  version: string
  source?: string | null
  status: 'missing' | 'version' | null
  coverSrc?: string
}
const presentation = computed<EditorPresentation>(() => ({
  title: t('packageManager.title'),
  description: t('packageManager.description'),
  icon: 'file.package',
}))

const WORKSPACE_SYNC_ACTION_KEY = 'project-package-manager.sync'
const WORKSPACE_ADD_ACTION_KEY = 'project-package-manager.add'
const WORKSPACE_VIEW_ACTION_KEY = 'project-package-manager.toggle-view'

const workspaceActions = computed<ShellWorkspaceAction[]>(() => {
  const albumMode = packageManagerView.value === 'album'
  return [
    {
      key: WORKSPACE_VIEW_ACTION_KEY,
      icon: albumMode ? 'data.list-tree' : 'layout.columns',
      hoverTip: t('packageManager.switchView', {
        view: t(albumMode ? 'packageManager.viewTree' : 'packageManager.viewAlbum'),
      }),
      disabled: !rows.value.length,
    },
    {
      key: WORKSPACE_SYNC_ACTION_KEY,
      icon: 'action.refresh',
      hoverTip: t('packageManager.sync'),
      disabled: busy.value || addTaskBusy.value,
    },
    {
      key: WORKSPACE_ADD_ACTION_KEY,
      icon: 'action.add',
      hoverTip: t('packageManager.add'),
      disabled: busy.value || addTaskBusy.value,
    },
  ]
})

async function runWorkspaceAction(actionKey: string): Promise<boolean> {
  if (actionKey === WORKSPACE_VIEW_ACTION_KEY) {
    togglePackageManagerView()
    return true
  }
  if (actionKey === WORKSPACE_SYNC_ACTION_KEY) {
    await synchronizePackages()
    return true
  }
  if (actionKey === WORKSPACE_ADD_ACTION_KEY) {
    await importPackage()
    return true
  }
  return false
}

defineExpose({ presentation, workspaceActions, runWorkspaceAction })

const rows = computed<PackageRow[]>(() => {
  return [...projectStore.projectPackageManifests.value]
    .map<PackageRow>(([key, required]) => {
      const actual = [...projectStore.projectResourcePackages.value]
        .find(([candidate]) => candidate.toLocaleLowerCase() === key.toLocaleLowerCase())?.[1]
      return {
        key,
        version: required.version,
        source: required.source,
        status: actual && actual.manifest.version !== required.version ? 'version' : actual ? null : 'missing',
        coverSrc: actual?.cover?.src,
      }
    })
    .sort((left, right) => left.key.localeCompare(right.key))
})
/** Status chip per requirement problem; a matching version shows no chip at all. */
const PACKAGE_STATUS_BADGES = {
  missing: { icon: 'status.error', tone: 'danger' },
  version: { icon: 'status.warning', tone: 'warning' },
} as const

const treeData = computed<OcNodeCollection>(() => ({
  rootKeys: rows.value.map(row => row.key),
  items: new Map(rows.value.map((row): [string, OcNode] => [row.key, {
    label: `${row.key}@${row.version}`,
    tail: [
      row.source?.trim() || t('packageManager.local'),
      ...(row.status
        ? [{
            type: 'badge' as const,
            label: t(`packageManager.status.${row.status}`),
            ...PACKAGE_STATUS_BADGES[row.status],
          }]
        : []),
      { key: removeAction(row.key), title: t('packageManager.noLongerNeeded'), icon: 'action.delete', iconTone: 'danger' },
    ],
    visual: {
      type: 'icon',
      icon: 'file.package',
      iconTone: row.status === 'missing' ? 'muted' : row.status === 'version' ? 'warning' : 'success',
    },
    // 相册视图独有的封面槽位；缺失时卡片媒体区留空，标题前的包图标始终保留。
    ...(row.coverSrc
      ? { cover: { type: 'image' as const, src: row.coverSrc, label: `${row.key} ${t('packageManifest.coverAlt')}` } }
      : {}),
  }])),
  children: new Map(),
}))
function handleNodeAction(event: OcNodeActionEvent): void {
  if (event.actionKey.startsWith('package-remove:')) void removePackage(event.actionKey.slice('package-remove:'.length))
}
async function removePackage(key: string): Promise<void> { await projectStore.removeRequiredPackage(key); await refresh() }
watch(() => props.filePath, () => {
  emit('modified', false)
  void refresh()
}, { immediate: true })

/** 一次性失败交给即时信息，同时留在输出里，页面不再长期挂着过期报错。 */
function reportFailure(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  notifyError(message)
  publishAppOutput({ severity: 'error', message })
}

function requestConfirm(next: ResourcePackageManifest, previous: ResourcePackageManifest): Promise<boolean> {
  return new Promise(resolve => {
    confirmRequest.value = {
      message: t('packageManager.confirmReplace', { name: next.name, previous: previous.version, version: next.version }),
      resolve,
    }
  })
}

function resolveConfirm(accepted: boolean): void {
  const request = confirmRequest.value
  confirmRequest.value = null
  request?.resolve(accepted)
}

async function refresh(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await projectStore.reloadProjectResourceEnvironment()
  } catch (cause) {
    reportFailure(cause)
  } finally {
    busy.value = false
  }
}

async function importPackage(): Promise<void> {
  addOpen.value = true
}
async function synchronizePackages(): Promise<void> {
  const declared = projectStore.projectPackageManifests.value
  const extras = [...projectStore.projectResourcePackages.value.keys()]
    .filter(key => ![...declared.keys()].some(candidate => candidate.toLocaleLowerCase() === key.toLocaleLowerCase()))
  const pending = rows.value.filter(row => row.status !== null && row.source)
  if (!extras.length && !pending.length) { await refresh(); return }
  busy.value = true
  const taskKey = 'package-manager-install-all'
  const totalSteps = extras.length + pending.length
  let completedSteps = 0
  shellProgress.setTask({ key: taskKey, title: t('packageManager.sync'), progress: 0, cancellable: false })
  try {
    for (const key of extras) {
      await projectStore.removeResourcePackage(key)
      completedSteps += 1
      shellProgress.setTask({ key: taskKey, title: t('packageManager.sync'), progress: completedSteps / totalSteps, cancellable: false })
    }
    const result = await projectStore.installMissingRemotePackages(pending.map(row => ({ key: row.key, version: row.version, source: row.source })), (done) => {
      completedSteps = extras.length + done
      shellProgress.setTask({ key: taskKey, title: t('packageManager.sync'), progress: totalSteps ? completedSteps / totalSteps : 1, cancellable: false })
    })
    if (result.failed.length) notifyError(t('packageManager.installSummaryFailed', { count: result.failed.length }))
    else notifySuccess(t('packageManager.installSummary', { count: result.succeeded.length }))
    await projectStore.reloadProjectResourceEnvironment()
  } catch (cause) {
    reportFailure(cause)
  } finally {
    shellProgress.removeTask(taskKey)
    busy.value = false
  }
}
function updateRemoteSource(value: string): void {
  remoteSource.value = value
}
async function choosePackage(): Promise<void> {
  if (!projectStore.projectPath.value) return
  const options = {
    title: t('packageManager.choose'),
    fileTypeName: 'OpenCard package',
    extensions: ['ocpack'],
    defaultPath: projectStore.projectPath.value,
  }
  const sources = fileSystemService.pickFiles
    ? await fileSystemService.pickFiles(options)
    : [await fileSystemService.pickFile(options)].filter((source): source is string => Boolean(source))
  if (!sources.length) return
  localPaths.value = sources
}
/**
 * The dialog has already validated its input, so it closes up front and the install continues on the
 * shell's global progress bar. That keeps the workspace usable instead of freezing a modal, and the
 * outcome arrives as an instant message. Replacement confirmation still happens inline as it is needed.
 */
async function addPackage(): Promise<void> {
  if (!canAdd.value || busy.value || addTaskBusy.value) return
  const mode = addMode.value
  const localSources = [...localPaths.value]
  const remoteEntriesToAdd = remoteEntries.value.map(item => ({ entry: item.entry, parsed: item.parsed }))
  const total = mode === 'remote' ? remoteEntriesToAdd.length : localSources.length
  addOpen.value = false
  const publish = (completed: number) => {
    shellProgress.setTask({
      key: PACKAGE_ADD_TASK_KEY,
      title: t('packageManager.add'),
      progress: total > 0 ? Math.min(1, completed / total) : 1,
      cancellable: false,
    })
  }
  publish(0)
  try {
    if (mode === 'remote') {
      await projectStore.addRequiredPackages(remoteEntriesToAdd.map(item => {
        if (!item.parsed) throw new Error(t('packageManager.invalidSource', { source: item.entry }))
        return { key: item.parsed.key, version: item.parsed.version, source: createRemotePackageLocator(item.parsed) }
      }))
      publish(total)
    } else {
      let completed = 0
      for (const source of localSources) {
        await projectStore.installResourcePackageFile(source, { confirmReplacement: requestConfirm })
        completed += 1
        publish(completed)
      }
    }
    notifySuccess(t('packageManager.added', { count: total }))
    // Only a completed add clears the input, so a failed one can be retried from the same selection.
    localPaths.value = []
    remoteSource.value = ''
    await refresh()
  } catch (cause) {
    notifyError(t('packageManager.addFailed', {
      message: cause instanceof Error ? cause.message : String(cause),
    }))
  } finally {
    shellProgress.removeTask(PACKAGE_ADD_TASK_KEY)
  }
}
</script>

<style scoped>
.package-manager {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.package-manager__view { flex: 1 1 auto; min-height: 0; }
.package-manager__field { display: grid; gap: var(--oc-space-2); margin-block: var(--oc-space-3); }
</style>
