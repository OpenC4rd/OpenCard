<template>
  <MonacoEditor v-if="props.mode === 'diff'" :model-value="props.modelValue ?? ''" language="json"
    :mode="props.mode" :comparison="props.comparison" :theme-id="themeId" :theme-overrides="themeOverrides" />
  <ProjectRegistryEditorShell v-else content-mode="workspace" @keydown.ctrl.s.prevent="save">
    <ProjectIconRegistryWorkbench v-if="document" ref="workbenchRef" :series="document.iconSeries"
      :resolve-asset-src="source => projectStore.resolveResourceAssetSrcFromFile(props.filePath, source)"
      :default-open-path="iconDirectory" :pack-busy="packTaskBusy"
      :project-icon-catalog="projectStore.projectIconCatalog.value"
      @update:series="updateIconSeries" @key-conflicts="updateKeyConflicts"
      @export-pack="exportIconPack" @remove-series="openSeriesRemovalDialog" />

    <ProjectRegistryRepairEditor v-else :model-value="props.modelValue ?? ''" :theme-id="themeId"
      :theme-overrides="themeOverrides" :heading="t('iconRegistry.invalid')" :description="t('iconRegistry.repair')"
      @update:model-value="updateRawSource" @save="save" />

    <OcDialog :open="Boolean(pendingRemovalSeries)" :title="t('projectConfig.icons.removeSeriesTitle')"
      size="sm" close-on-backdrop :dismissible="!cleanupBusy" @request-close="closeSeriesRemovalDialog">
      <OcText>{{ t('projectConfig.icons.removeSeriesDescription', { name: pendingRemovalSeries?.name ?? '' }) }}</OcText>
      <OcCheckbox v-if="orphanedRemovalSources.length" v-model:checked="cleanupOrphanedFiles">
        {{ t('projectConfig.icons.cleanupOrphanedFiles', { count: orphanedRemovalSources.length }) }}
      </OcCheckbox>
      <OcText v-if="sharedRemovalSourceCount" tone="muted" size="sm">
        {{ t('projectConfig.icons.sharedFilesPreserved', { count: sharedRemovalSourceCount }) }}
      </OcText>
      <OcText tone="muted" size="sm">{{ t('projectConfig.icons.removeSeriesUndoHint') }}</OcText>
      <OcText v-if="cleanupError" tone="danger" size="sm" role="alert">{{ cleanupError }}</OcText>
      <template #footer>
        <OcButton :disabled="cleanupBusy" @click="closeSeriesRemovalDialog">
          {{ t('projectConfig.icons.cancel') }}
        </OcButton>
        <OcButton variant="solid" :disabled="cleanupBusy" @click="confirmSeriesRemoval">
          {{ t('projectConfig.icons.removeSeriesConfirm') }}
        </OcButton>
      </template>
    </OcDialog>

    <ProjectIconRegistrationDialog :open="registrationDialogOpen" :series="document?.iconSeries"
      :default-open-path="iconDirectory"
      @close="closeRegistrationDialog" @submit="registerIconSet" />
    <ProjectIconPackImportDialog :open="packImportDialogOpen" :series="document?.iconSeries"
      :default-open-path="projectDirectory" @close="closeImportPackDialog" @submit="importIconPack" />
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { HistoryOperationMeta } from '../../features/editor-runtime/history/history.types'
import type { ContentHistoryOperationMeta } from '../../features/editor-runtime/history/contentHistory'
import type { ShellWorkspaceAction } from '../../features/shell/shell.types'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type {
  EditorIssue,
  EditorIssueSnapshot,
  EditorNavigationResult,
  SessionNavigationToken,
} from '../../features/editor-runtime/model/editorIssue'
import { reportAppError, type AppErrorCode } from '../../features/logging/appErrorCatalog'
import { editorHistoryManager } from '../../features/editor-runtime/history/editorHistoryManager'
import { notifyAppError, notifySuccess } from '../../features/notifications/titlebarNotices'
import { useShellProgressTasks } from '../../features/shell/composables/useShellProgressTasks'
import {
  parseProjectIconRegistryText,
  PROJECT_ICON_REGISTRY_FILE_NAME,
  serializeProjectIconRegistry,
  type ProjectIconRegistryDocument,
} from '../../features/workspace/model/projectIconRegistry'
import {
  DEFAULT_PROJECT_ICON_DIRECTORY,
  projectIconSources,
  type ProjectIcon,
  type ProjectIconKeyConflict,
  type ProjectIconSeries,
} from '../../features/workspace/model/projectIcons'
import { PROJECT_INTERNAL_DIRECTORY_NAME } from '../../features/workspace/model/projectStructure'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { stageProjectAssetFiles } from '../../features/workspace/services/projectAssetFileHistory'
import { resolveResourcePath } from '../../features/workspace/model/scopedResourcePath'
import OcButton from '../base/OcButton.vue'
import OcCheckbox from '../base/OcCheckbox.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'
import {
  exportProjectIconPack,
  readProjectIconPack,
} from '../../features/workspace/services/projectIconPack'
import { inspectProjectIconFile } from '../../features/workspace/services/projectIconFileFacts'
import { mapWithConcurrency } from '../../shared/async/mapWithConcurrency'
import MonacoEditor from './MonacoEditor.vue'
import ProjectIconRegistrationDialog, {
  type ProjectIconImport,
  type ProjectIconRegistrationRequest,
} from './ProjectIconRegistrationDialog.vue'
import ProjectIconPackImportDialog, {
  type ProjectIconPackImportRequest,
} from './ProjectIconPackImportDialog.vue'
import ProjectIconRegistryWorkbench from './ProjectIconRegistryWorkbench.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'
import ProjectRegistryRepairEditor from './ProjectRegistryRepairEditor.vue'

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const projectStore = useProjectStore()
const document = ref<ProjectIconRegistryDocument | null>(null)
const registrationDialogOpen = ref(false)
const packImportDialogOpen = ref(false)
const pendingRemovalSeriesKey = ref<string>()
const cleanupOrphanedFiles = ref(true)
const cleanupBusy = ref(false)
const cleanupError = ref('')
const keyConflicts = ref<readonly ProjectIconKeyConflict[]>([])
const workbenchRef = ref<InstanceType<typeof ProjectIconRegistryWorkbench> | null>(null)
const { tasks, setTask, removeTask } = useShellProgressTasks()

const ICON_PACK_TASK_KEY = 'project-icon-pack'
/**
 * How many imported icons are read and probed at once. Probing a raster decodes it, so a large set
 * must not run strictly one icon after another; the cap keeps a several-hundred-icon import from
 * holding that many decoded images and file reads at the same time.
 */
const ICON_IMPORT_CONCURRENCY = 8
/**
 * Derived from the shared task registry rather than kept as component state: the shell rebuilds this
 * editor whenever the active file changes, so a local flag would come back reset and re-enable the
 * commands while the task was still running.
 */
const packTaskBusy = computed(() => tasks.value.some(task => task.key === ICON_PACK_TASK_KEY))

const themeId = computed(() => props.themeId ?? 'dark')
const themeOverrides = computed(() => props.themeOverrides ?? {})
const projectDirectory = computed(() => {
  const source = projectStore.projectPath.value || props.filePath
  const normalized = source.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized.endsWith(`/${PROJECT_ICON_REGISTRY_FILE_NAME}`)
    ? normalized.slice(0, -PROJECT_ICON_REGISTRY_FILE_NAME.length - 1)
    : normalized
})
const iconDirectory = computed(() => `${projectDirectory.value}/${PROJECT_INTERNAL_DIRECTORY_NAME}/${DEFAULT_PROJECT_ICON_DIRECTORY}`)
const pendingRemovalSeries = computed(() => document.value?.iconSeries?.find(series => (
  series.key === pendingRemovalSeriesKey.value
)) ?? null)
/**
 * Files the removal would orphan: they live in the managed icon folder and no remaining set refers to
 * them. A file another set still points at is never touched, so a hand-written shared reference is safe.
 */
const orphanedRemovalSources = computed(() => {
  const series = pendingRemovalSeries.value
  if (!series) return []
  const remainingSources = new Set((document.value?.iconSeries ?? [])
    .filter(candidate => candidate.key !== series.key)
    .flatMap(candidate => projectIconSources(candidate).map(source => source.toLocaleLowerCase())))
  const managedPrefix = `${PROJECT_INTERNAL_DIRECTORY_NAME}/${DEFAULT_PROJECT_ICON_DIRECTORY}/`.toLocaleLowerCase()
  return [...new Set(projectIconSources(series))]
    .filter(source => source.toLocaleLowerCase().startsWith(managedPrefix))
    .filter(source => !remainingSources.has(source.toLocaleLowerCase()))
})
const sharedRemovalSourceCount = computed(() => (
  new Set(pendingRemovalSeries.value ? projectIconSources(pendingRemovalSeries.value) : []).size
  - orphanedRemovalSources.value.length
))
const issueSnapshot = computed<EditorIssueSnapshot>(() => ({
  scopeKey: 'project-icon-registry',
  scopeOrder: ['project-icon-registry'],
  issues: keyConflicts.value.map((conflict): EditorIssue => {
    const series = document.value?.iconSeries?.[conflict.seriesIndex]
    const icon = conflict.kind === 'icon' ? series?.icons[conflict.iconIndex] : undefined
    return {
      id: `project-icon-key:${conflict.kind}:${conflict.seriesIndex}:${conflict.kind === 'icon' ? conflict.iconIndex : 'series'}`,
      type: conflict.kind === 'series'
        ? 'project-icon-registry.series.duplicate-key'
        : 'project-icon-registry.icon.duplicate-key',
      severity: 'error',
      locationText: conflict.kind === 'series'
        ? t('projectConfig.icons.seriesKeyLocation', { series: series?.name ?? conflict.key })
        : t('projectConfig.icons.iconKeyLocation', {
            series: series?.name ?? '',
            icon: icon?.name || icon?.iconKey || conflict.iconIndex + 1,
          }),
      description: t(conflict.kind === 'series'
        ? 'projectConfig.icons.duplicateSeriesKeyIssue'
        : 'projectConfig.icons.duplicateIconKeyIssue', { key: conflict.key }),
      navigationToken: {
        protocol: 'icon-registry',
        version: 1,
        target: conflict.kind === 'series'
          ? { kind: 'series-key', seriesIndex: conflict.seriesIndex, key: conflict.key }
          : {
              kind: 'icon-key',
              seriesIndex: conflict.seriesIndex,
              iconIndex: conflict.iconIndex,
              key: conflict.key,
            },
      },
    }
  }),
}))

watch(() => props.modelValue, content => {
  document.value = parseProjectIconRegistryText(content ?? '')
  if (!document.value) keyConflicts.value = []
}, { immediate: true })
watch(issueSnapshot, snapshot => emit('issue-snapshot', snapshot), { immediate: true })

function commit(next: ProjectIconRegistryDocument, history?: ContentHistoryOperationMeta): boolean {
  const previous = document.value
  try {
    const content = serializeProjectIconRegistry(next)
    document.value = parseProjectIconRegistryText(content)
    emit('update:modelValue', content, history)
    return true
  } catch (error) {
    document.value = previous
    reportAppError('OC-E3012', error)
    return false
  }
}

function updateIconSeries(
  iconSeries: ProjectIconSeries[],
  history?: ContentHistoryOperationMeta,
): void {
  commit(iconSeries.length > 0 ? { iconSeries } : {}, history)
}

let mounted = true
onBeforeUnmount(() => { mounted = false })

/**
 * Applies a finished icon-pack result to the session that owns this registry.
 *
 * The shell rebuilds the editor whenever the active file changes, and a vnode listener stops being
 * invoked once the emitting component unmounts — so a copy that finishes after the user navigates away
 * would write its files but silently never add the set. Recording against the session id instead uses
 * the same channel the editor host itself uses (`editorHistoryManager`, initialised by the session
 * store and keyed by session id), so the files and the registry entry stay together either way.
 */
function applyCompletedIconSeries(
  iconSeries: ProjectIconSeries[],
  history?: ContentHistoryOperationMeta,
): void {
  if (mounted) {
    updateIconSeries(iconSeries, history)
    return
  }
  const sessionId = props.sessionId
  if (!sessionId) return
  try {
    const content = serializeProjectIconRegistry(iconSeries.length > 0 ? { iconSeries } : {})
    document.value = parseProjectIconRegistryText(content)
    editorHistoryManager.recordContent(sessionId, content, history)
  } catch (error) {
    reportAppError('OC-E3012', error)
  }
}

function updateKeyConflicts(conflicts: readonly ProjectIconKeyConflict[]): void {
  keyConflicts.value = conflicts
}

function openCreatePackDialog(): void {
  if (!document.value || packTaskBusy.value) return
  registrationDialogOpen.value = true
}

function openImportPackDialog(): void {
  if (!document.value || packTaskBusy.value) return
  packImportDialogOpen.value = true
}

function closeRegistrationDialog(): void {
  registrationDialogOpen.value = false
}

function closeImportPackDialog(): void {
  packImportDialogOpen.value = false
}

/**
 * Runs one icon-pack file operation on the shell's global progress bar instead of blocking a dialog,
 * so the editor stays responsive and the outcome arrives as an instant message. Related commands are
 * disabled for the duration through `packTaskBusy`.
 */
async function runIconPackTask<T>(options: {
  title: string
  total: number
  errorCode: AppErrorCode
  run: (report: (completed: number, total?: number) => void) => Promise<T>
  success: (result: T) => string
}): Promise<void> {
  if (packTaskBusy.value) return
  let total = options.total
  const publish = (completed: number, nextTotal?: number) => {
    if (nextTotal !== undefined) total = nextTotal
    setTask({
      key: ICON_PACK_TASK_KEY,
      title: options.title,
      progress: total > 0 ? Math.min(1, completed / total) : 1,
      cancellable: false,
    })
  }
  // Registering the task is what makes `packTaskBusy` true, so the commands disable themselves.
  publish(0)
  try {
    notifySuccess(options.success(await options.run(publish)))
  } catch (error) {
    notifyAppError(options.errorCode, error)
  } finally {
    removeTask(ICON_PACK_TASK_KEY)
  }
}

function openSeriesRemovalDialog(seriesKey: string): void {
  if (!document.value?.iconSeries?.some(series => series.key === seriesKey)) return
  pendingRemovalSeriesKey.value = seriesKey
  cleanupOrphanedFiles.value = true
  cleanupError.value = ''
}

function closeSeriesRemovalDialog(): void {
  if (cleanupBusy.value) return
  pendingRemovalSeriesKey.value = undefined
  cleanupError.value = ''
}

/**
 * Drops a set from the registry, optionally moving its now-unused files to app storage so the whole
 * removal can be undone from history. Files another set still references are always kept.
 */
async function confirmSeriesRemoval(): Promise<void> {
  const series = pendingRemovalSeries.value
  if (!series || cleanupBusy.value || !document.value) return
  cleanupBusy.value = true
  cleanupError.value = ''
  let stagedFiles: Awaited<ReturnType<typeof stageProjectAssetFiles>> | undefined
  try {
    if (cleanupOrphanedFiles.value && orphanedRemovalSources.value.length) {
      const paths = orphanedRemovalSources.value.map(source => {
        const resolved = resolveResourcePath({
          scopeRootPath: projectDirectory.value,
          projectRootPath: projectDirectory.value,
          reference: source,
        })
        if (!resolved.ok) throw new Error(resolved.message)
        return resolved.value
      })
      stagedFiles = await stageProjectAssetFiles(paths, undefined, undefined, 'icon')
    }
    const next = (document.value.iconSeries ?? []).filter(candidate => candidate.key !== series.key)
    updateIconSeries(next, stagedFiles
      ? { mode: 'immediate', label: 'remove-project-icon-set', structural: true, resource: stagedFiles }
      : undefined)
    await nextTick()
    pendingRemovalSeriesKey.value = undefined
  } catch (error) {
    if (stagedFiles) {
      await stagedFiles.undo().catch(() => undefined)
      await Promise.resolve(stagedFiles.release()).catch(() => undefined)
    }
    cleanupError.value = t('projectConfig.icons.cleanupFailed', {
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    cleanupBusy.value = false
  }
}

async function registerIconSet(request: ProjectIconRegistrationRequest): Promise<void> {
  if (!document.value || packTaskBusy.value) return
  // The dialog already guarantees a unique Key, so closing it up front is safe: the copy itself
  // runs in the background and reports through the global progress bar.
  registrationDialogOpen.value = false
  await runIconPackTask({
    title: t('projectConfig.icons.creatingSet', { name: request.name }),
    // Preparation and copy each report once per icon, so the bar covers both halves.
    total: request.icons.length * 2,
    errorCode: 'OC-E3011',
    run: async report => {
      const icons = await writeIconSetFiles(request.icons, request.key, report)
      // Re-read so edits made while the files were copying are not clobbered.
      const iconSeries = [...(document.value?.iconSeries ?? [])]
      iconSeries.push({ name: request.name, key: request.key, icons })
      applyCompletedIconSeries(iconSeries)
      await nextTick()
      await workbenchRef.value?.selectSeries(request.key)
      return icons.length
    },
    success: count => t('projectConfig.icons.setCreated', { name: request.name, count }),
  })
}

/**
 * Copies every imported icon into the folder chosen for the set, storing each file under its icon Key
 * with its original extension, and deriving what the file itself decides (its tint, and whether a
 * raster is pixel art). Naming by Key rather than by the source file is what makes creating a set and
 * importing a pack produce the same layout, and it keeps references case-stable.
 *
 * The icons are prepared first and copied afterwards, in the order the user picked them. Reading and
 * probing is the slow half of an import: a raster has to be decoded before it is known whether it is
 * pixel art, so that runs through the shared bounded-concurrency map instead of strictly one file
 * after another. The copy stays sequential, so files keep the picked order and each name is still
 * claimed one at a time.
 *
 * Preparing up front also means a file that cannot be read aborts the import before anything is
 * written, instead of leaving already-copied files on disk with no registry entry.
 */
async function writeIconSetFiles(
  imports: readonly ProjectIconImport[],
  seriesKey: string,
  report: (completed: number, total?: number) => void,
): Promise<ProjectIcon[]> {
  // Preparation and copy both report, so the bar keeps moving through the slow half.
  report(0, imports.length * 2)
  const directory = await resolveIconSetDirectory(seriesKey)
  let prepared = 0
  const staged = await mapWithConcurrency(imports, ICON_IMPORT_CONCURRENCY, async item => {
    const bytes = await fileSystemService.readBinaryFile(item.sourcePath)
    const facts = await inspectProjectIconFile(item.sourcePath, bytes)
    prepared += 1
    report(prepared)
    return { item, bytes, facts }
  })

  const icons: ProjectIcon[] = []
  for (const { item, bytes, facts } of staged) {
    const extension = item.sourcePath.slice(item.sourcePath.lastIndexOf('.')).toLocaleLowerCase()
    const source = await writeManagedIconFile(directory, `${item.iconKey}${extension}`, bytes)
    icons.push({
      iconKey: item.iconKey,
      name: item.name,
      source,
      tint: facts.tint,
      ...(facts.pixelated === true ? { pixelated: true } : {}),
    })
    report(imports.length + icons.length)
  }
  return icons
}

/** Project-relative folder that names one icon set's files. */
function projectIconSetDirectory(seriesKey: string): string {
  return `${DEFAULT_PROJECT_ICON_DIRECTORY}/${seriesKey}`
}

/**
 * Picks the folder that will own a new set.
 *
 * One folder belongs to one set, so a folder left behind by an earlier set must not absorb a new set's
 * files: the leftovers would sit alongside them, indistinguishable from the new set's own files. The
 * folder name is suffixed rather than the file names inside it, which keeps every file in a set folder
 * named exactly after its icon Key and keeps creating a set producing the layout a pack import does.
 *
 * A folder that exists but holds no files is reused as-is. Removing a set with cleanup moves its files
 * out but leaves the folder behind, so suffixing there would rename the folder on every removal and
 * re-creation of the same set.
 */
async function resolveIconSetDirectory(seriesKey: string): Promise<string> {
  const base = projectIconSetDirectory(seriesKey)
  let directory = base
  let suffix = 2
  while (await iconSetDirectoryIsOccupied(directory)) {
    directory = `${base}-${suffix}`
    suffix += 1
  }
  return directory
}

async function iconSetDirectoryIsOccupied(directory: string): Promise<boolean> {
  const absolute = projectStore.resolveProjectInternalPath(directory)
  if (!await fileSystemService.fileExists(absolute)) return false
  try {
    return (await fileSystemService.readDirectory(absolute)).length > 0
  } catch {
    // An unreadable folder counts as occupied, so its contents are never mixed into a new set.
    return true
  }
}

async function importIconPack(request: ProjectIconPackImportRequest): Promise<void> {
  if (!document.value || packTaskBusy.value) return
  // The dialog already guarantees a unique Key, so the unpack runs in the background.
  packImportDialogOpen.value = false
  await runIconPackTask({
    title: t('projectConfig.icons.importingPack', { name: request.name }),
    total: 1,
    errorCode: 'OC-E3013',
    run: async report => {
      const iconPack = await readProjectIconPack(fileSystemService, request.packPath)
      const directory = await resolveIconSetDirectory(request.key)
      const icons: ProjectIcon[] = []
      // The manifest declares every file up front, so it sets the real progress total.
      report(0, iconPack.manifest.icons.length)
      for (const icon of iconPack.manifest.icons) {
        const bytes = iconPack.iconSources.get(icon.source)
        if (!bytes) throw new Error(`Icon pack is missing '${icon.source}'`)
        const extension = icon.source.slice(icon.source.lastIndexOf('.')).toLocaleLowerCase()
        icons.push({ ...icon, source: await writeManagedIconFile(directory, `${icon.iconKey}${extension}`, bytes) })
        report(icons.length)
      }
      const iconSeries = [...(document.value?.iconSeries ?? [])]
      iconSeries.push({ name: request.name, key: request.key, icons })
      applyCompletedIconSeries(iconSeries)
      await nextTick()
      await workbenchRef.value?.selectSeries(request.key)
      return icons.length
    },
    success: count => t('projectConfig.icons.packImported', { name: request.name, count }),
  })
}

async function exportIconPack(series: ProjectIconSeries): Promise<void> {
  if (packTaskBusy.value) return
  const outputPath = await fileSystemService.pickSavePath({
    defaultPath: `${projectDirectory.value}/${safeFileName(series.name)}.ociconpack`,
    title: t('projectConfig.icons.exportPack'),
    fileTypeName: t('projectConfig.icons.packFileType'),
    extensions: ['ociconpack'],
  })
  if (!outputPath) return
  await runIconPackTask({
    title: t('projectConfig.icons.exportingPack', { name: series.name }),
    total: series.icons.length,
    errorCode: 'OC-E3014',
    run: report => exportProjectIconPack({
      fs: fileSystemService,
      series,
      resolveSourcePath: source => projectStore.resolveResourcePathFromFile(props.filePath, source),
      outputPath,
      onProgress: report,
    }),
    success: path => t('projectConfig.icons.packExported', { name: savePathName(path) }),
  })
}

function savePathName(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/')
  return segments[segments.length - 1] ?? path
}

/**
 * Writes one icon file into a project icon folder, under an available name within that folder.
 *
 * The folder is chosen so that its files are already the set's own, so the fallback name only applies
 * if something appears in the folder while the copy runs; keeping it means a race can never overwrite
 * an existing file.
 */
async function writeManagedIconFile(
  directory: string,
  originalFileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const normalizedDirectory = directory.replace(/\\/g, '/').replace(/\/+$/, '')
  await fileSystemService.createDirectory(projectStore.resolveProjectInternalPath(normalizedDirectory))
  const dotIndex = originalFileName.lastIndexOf('.')
  const stem = dotIndex > 0 ? originalFileName.slice(0, dotIndex) : originalFileName
  const extension = dotIndex > 0 ? originalFileName.slice(dotIndex) : ''
  let candidateName = originalFileName
  let candidatePath = `${normalizedDirectory}/${candidateName}`
  let suffix = 2
  while (await fileSystemService.fileExists(projectStore.resolveProjectInternalPath(candidatePath))) {
    candidateName = `${stem} (${suffix})${extension}`
    candidatePath = `${normalizedDirectory}/${candidateName}`
    suffix += 1
  }
  await fileSystemService.writeBinaryFile(projectStore.resolveProjectInternalPath(candidatePath), bytes)
  return `${PROJECT_INTERNAL_DIRECTORY_NAME}/${candidatePath}`
}

function safeFileName(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '') || 'icon-pack'
}

function updateRawSource(content: string, history?: HistoryOperationMeta): void {
  emit('update:modelValue', content, history)
}

function save(): void {
  if (document.value && keyConflicts.value.length === 0) emit('save')
}

function isNavigationToken(token: SessionNavigationToken): token is {
  protocol: 'icon-registry'
  version: 1
  target:
    | { kind: 'series-key'; seriesIndex: number; key: string }
    | { kind: 'icon-key'; seriesIndex: number; iconIndex: number; key: string }
} {
  if (!token || typeof token !== 'object' || Array.isArray(token)) return false
  const candidate = token as Record<string, unknown>
  const target = candidate.target
  if (candidate.protocol !== 'icon-registry' || candidate.version !== 1
    || !target || typeof target !== 'object' || Array.isArray(target)) return false
  const value = target as Record<string, unknown>
  return (value.kind === 'series-key' || value.kind === 'icon-key')
    && Number.isInteger(value.seriesIndex)
    && typeof value.key === 'string'
    && (value.kind === 'series-key' || Number.isInteger(value.iconIndex))
}

async function navigate(token: SessionNavigationToken): Promise<EditorNavigationResult> {
  if (!isNavigationToken(token)) return 'invalid-token'
  await nextTick()
  const conflict: ProjectIconKeyConflict = token.target.kind === 'series-key'
    ? { kind: 'series', seriesIndex: token.target.seriesIndex, key: token.target.key }
    : {
        kind: 'icon',
        seriesIndex: token.target.seriesIndex,
        iconIndex: token.target.iconIndex,
        key: token.target.key,
      }
  return await workbenchRef.value?.navigateToKeyConflict(conflict) ? 'success' : 'not-found'
}

const presentation = computed<EditorPresentation>(() => ({
  title: t('iconRegistry.title'),
  description: t('iconRegistry.description'),
  icon: 'file.project-icon',
}))

const WORKSPACE_CREATE_PACK_ACTION_KEY = 'project-icon-registry.create-pack'
const WORKSPACE_IMPORT_PACK_ACTION_KEY = 'project-icon-registry.import-pack'

const workspaceActions = computed<ShellWorkspaceAction[]>(() => [
  {
    key: WORKSPACE_CREATE_PACK_ACTION_KEY,
    icon: 'action.add',
    hoverTip: t('projectConfig.icons.createPack'),
    disabled: !document.value || packTaskBusy.value,
  },
  {
    key: WORKSPACE_IMPORT_PACK_ACTION_KEY,
    icon: 'action.import',
    hoverTip: t('projectConfig.icons.importPack'),
    disabled: !document.value || packTaskBusy.value,
  },
])

async function runWorkspaceAction(actionKey: string): Promise<boolean> {
  if (actionKey === WORKSPACE_CREATE_PACK_ACTION_KEY) {
    openCreatePackDialog()
    return true
  }
  if (actionKey === WORKSPACE_IMPORT_PACK_ACTION_KEY) {
    openImportPackDialog()
    return true
  }
  return false
}

defineExpose({ save, navigate, workspaceActions, runWorkspaceAction, presentation })
</script>
