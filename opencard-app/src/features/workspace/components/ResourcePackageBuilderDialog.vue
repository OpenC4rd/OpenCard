<template>
  <OcDialog :open="open" :title="t('resourcePackage.builderTitle')" as="form" size="xl"
    height-mode="fixed" height="workspace" :padded="false" :scrollable="false"
    :dismissible="!busy" :close-on-backdrop="!busy" :aria-busy="busy"
    @request-close="close" @submit.prevent="build">
    <div class="resource-package-builder" :inert="busy ? true : undefined">
      <div class="resource-package-builder__workspace">
        <section class="resource-package-builder__selection" aria-labelledby="resource-package-selection-title">
          <div class="resource-package-builder__section-heading">
            <div>
              <OcText id="resource-package-selection-title" as="h3" size="sm">{{ t('resourcePackage.contents') }}</OcText>
              <OcText size="xs" tone="muted">{{ t('resourcePackage.contentsDescription') }}</OcText>
            </div>
          </div>
          <OcPanel fill padding="none" overflow="auto">
            <OcTree v-if="treeData.rootKeys.length" fill :data="treeData"
              :expanded-keys="expandedKeys" :virtualized="true" selection-mode="none" action-visibility="always"
              :aria-label="t('resourcePackage.contents')"
              @expansion-change="handleTreeExpansionChange" @action="handleTreeAction" />
            <OcEmpty v-else tone="muted" inset="comfortable">{{ t('resourcePackage.noCandidates') }}</OcEmpty>
          </OcPanel>
        </section>

        <aside class="resource-package-builder__summary" aria-labelledby="resource-package-summary-title">
          <div class="resource-package-builder__section-heading">
            <div>
              <OcText id="resource-package-summary-title" as="h3" size="sm">{{ t('resourcePackage.packagePreview') }}</OcText>
              <OcText size="xs" tone="muted">{{ t('resourcePackage.packagePreviewDescription') }}</OcText>
            </div>
            <OcIcon name="file.package" size="lg" tone="file-opencard" />
          </div>
          <div class="resource-package-builder__fields">
            <label>
              <OcText as="span" size="sm">{{ t('resourcePackage.name') }}</OcText>
              <OcFieldInput variant="underline" full-width autofocus :value="name" :disabled="busy"
                @input="name = ($event.target as HTMLInputElement).value" />
            </label>
            <label>
              <OcText as="span" size="sm">{{ t('resourcePackage.displayName') }}</OcText>
              <OcFieldInput variant="underline" full-width :value="displayName" :disabled="busy"
                @input="displayName = ($event.target as HTMLInputElement).value" />
            </label>
            <label>
              <OcText as="span" size="sm">{{ t('resourcePackage.author') }}</OcText>
              <OcFieldInput variant="underline" full-width mono :value="author" :disabled="busy"
                @input="author = ($event.target as HTMLInputElement).value" />
            </label>
            <label>
              <OcText as="span" size="sm">{{ t('resourcePackage.version') }}</OcText>
              <OcFieldInput variant="underline" full-width mono :value="version" :disabled="busy"
                @input="version = ($event.target as HTMLInputElement).value" />
            </label>
            <label class="resource-package-builder__cover">
              <OcText as="span" size="sm">{{ t('resourcePackage.cover') }}</OcText>
              <OcFieldInput variant="underline" full-width mono readonly
                :value="projectCover?.relativePath ?? t('resourcePackage.coverNone')" :disabled="busy" />
            </label>
          </div>
          <div v-if="contentSummary.length" class="resource-package-builder__contents">
            <OcText v-for="row in contentSummary" :key="row.label" as="div" size="xs">
              <span class="resource-package-builder__contents-label">{{ row.label }}</span>
              <span class="resource-package-builder__contents-value">{{ row.value }}</span>
            </OcText>
          </div>
          <OcText v-if="!packageCoordinate" class="resource-package-builder__contents" size="xs" tone="muted">
            {{ t('resourcePackage.identityHint') }}
          </OcText>
          <OcText v-if="errorText" class="resource-package-builder__error" tone="danger" role="alert">{{ errorText }}</OcText>
        </aside>
      </div>
    </div>
    <template #footer>
      <OcButton type="button" :disabled="busy" @click="close">{{ t('resourcePackage.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" icon="file.package" :disabled="busy || buildTaskBusy || !canBuild">
        {{ busy ? t('resourcePackage.building') : t('resourcePackage.build') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcEmpty from '../../../components/base/OcEmpty.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcPanel from '../../../components/base/OcPanel.vue'
import OcText from '../../../components/base/OcText.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import OcTree from '../../../components/standard/OcTree.vue'
import { resolveEntryIcon } from '../model/fileTypes'
import { formatPackageCoordinate, parsePackageCoordinate } from '../model/packageCoordinate'
import { toKeySlug } from '../../../shared/model/keySlug'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import type { ProjectPackageBuilderState } from '../../settings/model/appSettings'
import { findProjectWorkspaceState, updateProjectWorkspaceState, type ProjectWorkspaceStateRead } from '../../settings/model/workspaceState'
import type {
  OcNode,
  OcNodeAction,
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
} from '../../../shared/ui/node/node.types'
import { buildResourcePackageFromProject } from '../services/buildResourcePackage'
import { fileSystemService } from '../services/fileSystemService'
import { readProjectCover } from '../services/projectCoverService'
import type { ProjectCover } from '../model/projectCover'
import { useProjectStore } from '../store/projectStore'
import { packageScopeRoots } from '../services/projectResourceEnvironment'
import { notifyError, notifySuccess } from '../../notifications/titlebarNotices'
import { useShellProgressTasks } from '../../shell/composables/useShellProgressTasks'
import { listen } from '@tauri-apps/api/event'

/** Rust 侧打包时按文件回报的事件名，与 resource_package_builder.rs 保持一致。 */
const PACKAGE_BUILD_PROGRESS_EVENT = 'resource-package-build-progress'

const props = defineProps<{ open: boolean, projectRootPath: string, projectName: string, entries: readonly string[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const projectStore = useProjectStore()
const appSettingsStore = useAppSettingsStore()
const name = ref('')
const displayName = ref('')
const author = ref('')
const version = ref('1.0.0')
const selectedFamilyKeys = ref<Set<string>>(new Set())
const selectedCompositionKeys = ref<Set<string>>(new Set())
const selectedIconSeriesKeys = ref<Set<string>>(new Set())
const selectedCustomBlockKeys = ref<Set<string>>(new Set())
const busy = ref(false)
const errorText = ref('')
const projectCover = ref<ProjectCover | null>(null)

const { tasks, setTask, removeTask } = useShellProgressTasks()
const PACKAGE_BUILD_TASK_KEY = 'resource-package-build'
/**
 * A running build owns the global progress bar. Reopening the builder while one is in flight must not
 * let a second build reuse that key, so the submit is held until the first one settles.
 */
const buildTaskBusy = computed(() => tasks.value.some(task => task.key === PACKAGE_BUILD_TASK_KEY))

/** Everything the background build needs, captured before the dialog closes. */
type PackageBuildRequest = {
  outputPath: string
  author: string
  name: string
  title: string
  version: string
  familyKeys: readonly string[]
  compositionKeys: readonly string[]
  iconSeriesKeys: readonly string[]
  customBlockKeys: readonly string[]
  otherPaths: readonly string[]
}

type PackageCandidate = {
  id: string
  label: string
  detail?: string
}

function projectRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '')
  const root = props.projectRootPath.replace(/\\/g, '/').replace(/\/+$/g, '')
  if (!root) return null
  const absolute = normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)
  const relative = absolute
    ? normalized.toLocaleLowerCase().startsWith(`${root.toLocaleLowerCase()}/`)
      ? normalized.slice(root.length + 1)
      : ''
    : normalized
  const segments = relative.split('/')
  return relative && !/^[a-z]:/i.test(relative)
    && segments.every(segment => segment && segment !== '.' && segment !== '..')
    ? relative
    : null
}

/** A remembered build with no selection at all still counts as remembered, so it must not fall back to "all". */
function restoreSelection(available: readonly string[], cached: readonly string[] | undefined): Set<string> {
  if (!cached) return new Set(available)
  const next = new Set(available)
  for (const key of next) {
    if (!cached.includes(key)) next.delete(key)
  }
  return next
}

const otherCandidates = computed<readonly PackageCandidate[]>(() => [
  ...props.entries.map(projectRelativePath)
    .filter((relative): relative is string => Boolean(relative))
    .filter(relative => {
      const lower = relative.toLocaleLowerCase()
      const hasHiddenPart = relative.split('/').some(part => part.startsWith('.') && part.length > 1)
      return !lower.startsWith('.git/') && lower !== '.git'
        && !lower.startsWith('.opencard/')
        && (!(appSettingsStore.settings.value.workspace?.hideDotFiles ?? true) || !hasHiddenPart)
    })
    .map(relative => ({ id: `file:${relative}`, label: relative.split('/').pop() ?? relative, detail: relative })),
])
const selectedOtherPaths = ref<Set<string>>(new Set())
const expandedKeys = computed(() => [...expandedKeySet.value])
const expandedKeySet = ref<Set<string>>(new Set())
const packageCoordinate = computed(() => {
  const parsed = parsePackageCoordinate(`${author.value.trim()}/${name.value.trim()}@${version.value.trim()}`)
  return parsed ? formatPackageCoordinate(parsed) : ''
})
const selectedCount = computed(() => selectedFamilyKeys.value.size
  + selectedCompositionKeys.value.size + selectedIconSeriesKeys.value.size
  + selectedCustomBlockKeys.value.size
  + selectedOtherPaths.value.size)
const canBuild = computed(() => Boolean(packageCoordinate.value && selectedCount.value > 0))

/** 包摘要只列数量：具体带了哪些在左边那棵树里看得见。 */
const contentSummary = computed<readonly { label: string, value: string }[]>(() => [
  { label: t('resourcePackage.projectFonts'), count: selectedFamilyKeys.value.size },
  { label: t('resourcePackage.fontCompositions'), count: selectedCompositionKeys.value.size },
  { label: t('resourcePackage.icons'), count: selectedIconSeriesKeys.value.size },
  { label: t('resourcePackage.customBlocks'), count: selectedCustomBlockKeys.value.size },
  { label: t('resourcePackage.otherFiles'), count: selectedOtherPaths.value.size },
].filter(row => row.count > 0).map(row => ({ label: row.label, value: String(row.count) })))

const treeData = computed<OcNodeCollection>(() => {
  const items = new Map<string, OcNode>()
  const children = new Map<string, string[]>()
  const rootKeys: string[] = []
  const selectAction: OcNodeAction = { key: 'select', title: t('resourcePackage.select'), icon: 'action.checkbox-blank' }
  const deselectAction: OcNodeAction = { key: 'deselect', title: t('resourcePackage.deselect'), icon: 'action.checkbox-marked' }
  const toggleSelection = (selected: boolean): readonly OcNodeAction[] => [selected ? deselectAction : selectAction]
  const addChild = (parentKey: string, childKey: string): void => {
    const existing = children.get(parentKey) ?? []
    if (!existing.includes(childKey)) children.set(parentKey, [...existing, childKey])
  }
  const families = projectStore.projectFontFamilies.value
  const compositions = projectStore.projectFontCompositions.value
  {
    const categoryKey = 'category:fonts'
    const familyGroupKey = 'font-group:families'
    const compositionGroupKey = 'font-group:compositions'
    rootKeys.push(categoryKey)
    items.set(categoryKey, {
      label: t('resourcePackage.fonts'), visual: { type: 'icon', icon: 'file.font', iconTone: 'file-config' },
    })
    items.set(familyGroupKey, {
      label: t('resourcePackage.projectFonts'), visual: { type: 'icon', icon: 'file.font' },
    })
    items.set(compositionGroupKey, {
      label: t('resourcePackage.fontCompositions'), visual: { type: 'icon', icon: 'data.layers' },
    })
    children.set(categoryKey, [familyGroupKey, compositionGroupKey])
    children.set(familyGroupKey, families.map(family => {
      const key = `font-family:${family.key}`
      const selected = selectedFamilyKeys.value.has(family.key)
      items.set(key, {
        label: family.name, tail: [family.key, ...toggleSelection(selected)],
        visual: { type: 'icon', icon: 'file.font', iconTone: selected ? 'active' : 'muted' },
        contextActions: toggleSelection(selected),
      })
      return key
    }))
    children.set(compositionGroupKey, compositions.map(composition => {
      const key = `font-composition:${composition.key}`
      const selected = selectedCompositionKeys.value.has(composition.key)
      items.set(key, {
        label: composition.name, tail: [composition.key, ...toggleSelection(selected)],
        visual: { type: 'icon', icon: 'data.layers', iconTone: selected ? 'active' : 'muted' },
        contextActions: toggleSelection(selected),
      })
      return key
    }))
  }
  const iconSeries = projectStore.projectIconSeries.value
  if (iconSeries.length > 0) {
    const categoryKey = 'category:icons'
    rootKeys.push(categoryKey)
    items.set(categoryKey, {
      label: t('resourcePackage.icons'), visual: { type: 'icon', icon: 'file.project-icon', iconTone: 'file-config' },
    })
    children.set(categoryKey, iconSeries.map(series => {
      const key = `icon-series:${series.key}`
      const selected = selectedIconSeriesKeys.value.has(series.key)
      items.set(key, {
        label: series.name, tail: [series.key, ...toggleSelection(selected)],
        visual: { type: 'icon', icon: 'file.project-icon', iconTone: selected ? 'active' : 'muted' },
        contextActions: toggleSelection(selected),
      })
      return key
    }))
  }
  const customBlocks = Object.values(projectStore.projectCustomBlockRegistry?.value ?? {})
  {
    const categoryKey = 'category:custom-blocks'
    rootKeys.push(categoryKey)
    items.set(categoryKey, { label: t('resourcePackage.customBlocks'), visual: { type: 'icon', icon: 'entity.block-custom', iconTone: 'file-config' } })
    children.set(categoryKey, customBlocks.map(block => {
      const key = `custom-block:${block.key}`
      const selected = selectedCustomBlockKeys.value.has(block.key)
      items.set(key, {
        label: block.name, tail: [block.key, ...toggleSelection(selected)],
        visual: { type: 'icon', icon: 'entity.block-custom', iconTone: selected ? 'active' : 'muted' },
        contextActions: toggleSelection(selected),
      })
      return key
    }))
  }
  {
    const categoryKey = 'category:other-files'
    rootKeys.push(categoryKey)
    items.set(categoryKey, { label: t('resourcePackage.otherFiles'), visual: { type: 'icon', icon: 'file.generic', iconTone: 'file-config' } })
    for (const entry of otherCandidates.value) {
      const segments = (entry.detail ?? entry.label).split('/')
      let parentKey = categoryKey
      let folderPath = ''
      for (const segment of segments.slice(0, -1)) {
        folderPath = folderPath ? `${folderPath}/${segment}` : segment
        const folderKey = `folder:other-files:${folderPath}`
        if (!items.has(folderKey)) items.set(folderKey, { label: segment, visual: { type: 'icon', icon: 'folder.generic', iconTone: 'muted' } })
        addChild(parentKey, folderKey)
        parentKey = folderKey
      }
      const selected = selectedOtherPaths.value.has(entry.detail ?? '')
      const fileType = resolveEntryIcon(entry.detail ?? entry.label, false, false, props.projectRootPath)
      items.set(entry.id, {
        label: segments[segments.length - 1] ?? entry.label,
        visual: { type: 'icon', icon: fileType.icon, iconTone: selected ? 'active' : fileType.tone },
        tail: toggleSelection(selected), contextActions: toggleSelection(selected),
      })
      addChild(parentKey, entry.id)
    }
  }
  return { rootKeys, items, children }
})

watch(() => props.open, open => {
  if (!open) return
  const cached = packageBuilderCache()
  name.value = cached?.name || props.projectName
  displayName.value = cached?.title || name.value
  // 作者默认取项目作者，不再和设置里的作者 ID 联动。
  author.value = cached?.author || projectStore.projectProfile.value?.author || ''
  version.value = cached?.version || '1.0.0'
  selectedFamilyKeys.value = restoreSelection(
    projectStore.projectFontFamilies.value.map(family => family.key),
    cached?.fontFamilyKeys,
  )
  selectedCompositionKeys.value = restoreSelection(
    projectStore.projectFontCompositions.value.map(composition => composition.key),
    cached?.fontCompositionKeys,
  )
  selectedIconSeriesKeys.value = restoreSelection(
    projectStore.projectIconSeries.value.map(series => series.key),
    cached?.iconSeriesKeys,
  )
  selectedCustomBlockKeys.value = restoreSelection(
    Object.keys(projectStore.projectCustomBlockRegistry?.value ?? {}),
    cached?.customBlockKeys,
  )
  selectedOtherPaths.value = restoreSelection(
    otherCandidates.value.map(candidate => candidate.detail ?? candidate.label),
    cached?.otherPaths ?? cached?.imagePaths,
  )
  expandedKeySet.value = new Set([
    'category:fonts', 'font-group:families', 'font-group:compositions', 'category:icons', 'category:custom-blocks', 'category:other-files',
    ...otherCandidates.value.flatMap(candidate => {
      const segments = (candidate.detail ?? candidate.label).split('/')
      return segments.slice(0, -1).map((_, index) => `folder:other-files:${segments.slice(0, index + 1).join('/')}`)
    }),
  ])
  errorText.value = ''
  void refreshProjectCover()
}, { immediate: true })

/** 包封面自动沿用项目封面，这里只做只读展示。 */
async function refreshProjectCover(): Promise<void> {
  projectCover.value = await readProjectCover({
    fs: fileSystemService,
    projectRootPath: props.projectRootPath,
  })
}

function close(): void {
  if (!busy.value) emit('close')
}
function packageBuilderCache(): ProjectWorkspaceStateRead['packageBuilder'] {
  return findProjectWorkspaceState(
    appSettingsStore.settings.value.projectCreation.workspaceStates,
    props.projectRootPath,
  )?.packageBuilder
}
function handleTreeExpansionChange(event: OcNodeExpansionEvent): void {
  const next = new Set(expandedKeySet.value)
  if (event.expanded) next.add(event.key)
  else next.delete(event.key)
  expandedKeySet.value = next
}
function handleTreeAction(event: OcNodeActionEvent): void {
  const selected = event.actionKey === 'select'
  if (!selected && event.actionKey !== 'deselect') return
  if (event.key.startsWith('font-family:')) {
    const familyKey = event.key.slice('font-family:'.length)
    const nextFamilies = new Set(selectedFamilyKeys.value)
    if (selected) nextFamilies.add(familyKey)
    else nextFamilies.delete(familyKey)
    selectedFamilyKeys.value = nextFamilies
    return
  }
  if (event.key.startsWith('font-composition:')) {
    const compositionKey = event.key.slice('font-composition:'.length)
    const nextCompositions = new Set(selectedCompositionKeys.value)
    if (selected) nextCompositions.add(compositionKey)
    else nextCompositions.delete(compositionKey)
    selectedCompositionKeys.value = nextCompositions
    return
  }
  if (event.key.startsWith('icon-series:')) {
    const seriesKey = event.key.slice('icon-series:'.length)
    const nextSeries = new Set(selectedIconSeriesKeys.value)
    if (selected) nextSeries.add(seriesKey)
    else nextSeries.delete(seriesKey)
    selectedIconSeriesKeys.value = nextSeries
    return
  }
  if (event.key.startsWith('custom-block:')) {
    const blockKey = event.key.slice('custom-block:'.length)
    const nextBlocks = new Set(selectedCustomBlockKeys.value)
    if (selected) nextBlocks.add(blockKey)
    else nextBlocks.delete(blockKey)
    selectedCustomBlockKeys.value = nextBlocks
    return
  }
  if (event.key.startsWith('file:')) {
    const path = event.key.slice('file:'.length)
    const next = new Set(selectedOtherPaths.value)
    if (selected) next.add(path)
    else next.delete(path)
    selectedOtherPaths.value = next
    return
  }
}

/**
 * Settles the build inputs and asks for the destination. Only the destination picker runs before the
 * handoff, so cancelling it returns the user to their selection; once a path is chosen the dialog
 * closes and the packing itself continues on the global progress bar.
 */
async function build(): Promise<void> {
  if (!canBuild.value || busy.value || buildTaskBusy.value) return
  busy.value = true
  errorText.value = ''
  let request: PackageBuildRequest | null = null
  try {
    const outputPath = await fileSystemService.pickSavePath({
      defaultPath: `${toKeySlug(name.value.trim(), 'package')}.ocpack`, fileTypeName: t('resourcePackage.fileType'),
      extensions: ['ocpack'], title: t('resourcePackage.buildTitle'),
    })
    rememberBuildInputs()
    if (!outputPath) return
    request = {
      outputPath,
      author: author.value.trim(),
      name: name.value.trim(),
      title: displayName.value.trim() || name.value.trim(),
      version: version.value.trim(),
      familyKeys: [...selectedFamilyKeys.value],
      compositionKeys: [...selectedCompositionKeys.value],
      iconSeriesKeys: [...selectedIconSeriesKeys.value],
      customBlockKeys: [...selectedCustomBlockKeys.value],
      otherPaths: [...selectedOtherPaths.value],
    }
  } catch (cause) {
    errorText.value = cause instanceof Error ? cause.message : String(cause)
    return
  } finally {
    busy.value = false
  }
  if (!request) return
  emit('close')
  await runPackageBuild(request)
}

/**
 * Packs on the shell's global progress bar instead of freezing this dialog, so the workspace stays
 * usable and the outcome arrives as an instant message. The destination is already chosen, so the
 * dialog has nothing left to collect and can stay closed for the whole build.
 */
async function runPackageBuild(request: PackageBuildRequest): Promise<void> {
  setTask({
    key: PACKAGE_BUILD_TASK_KEY,
    title: t('resourcePackage.building'),
    progress: 0,
    cancellable: false,
  })
  // 打包在 Rust 侧按文件回报进度，这样进度条会走而不是一直停在 0。
  const unlisten = await listen<{ done: number, total: number }>(PACKAGE_BUILD_PROGRESS_EVENT, event => {
    if (event.payload.total <= 0) return
    setTask({
      key: PACKAGE_BUILD_TASK_KEY,
      title: t('resourcePackage.building'),
      progress: event.payload.done / event.payload.total,
      cancellable: false,
    })
  })
  try {
    const result = await buildResourcePackageFromProject({
      fs: fileSystemService, projectRootPath: props.projectRootPath,
      author: request.author,
      name: request.name,
      version: request.version,
      title: request.title,
      packageRoots: packageScopeRoots(projectStore.projectResourceEnvironment.value.packages),
      fontSelection: {
        familyKeys: request.familyKeys,
        compositionKeys: request.compositionKeys,
      },
      iconSelection: { seriesKeys: request.iconSeriesKeys },
      blockSelection: { keys: request.customBlockKeys },
      otherSelection: { paths: request.otherPaths },
      outputPath: request.outputPath,
    })
    const builtPath = result.outputPath ?? request.outputPath
    notifySuccess(t('resourcePackage.built', { name: builtPath.split(/[\\/]/).pop() ?? builtPath }))
  } catch (cause) {
    notifyError(cause instanceof Error ? cause.message : String(cause))
  } finally {
    unlisten()
    removeTask(PACKAGE_BUILD_TASK_KEY)
  }
}

function rememberBuildInputs(): void {
  const cache: ProjectPackageBuilderState = {
    name: name.value.trim(),
    title: displayName.value.trim(),
    author: author.value.trim(),
    version: version.value.trim(),
    fontFamilyKeys: [...selectedFamilyKeys.value],
    fontCompositionKeys: [...selectedCompositionKeys.value],
    iconSeriesKeys: [...selectedIconSeriesKeys.value],
    customBlockKeys: [...selectedCustomBlockKeys.value],
    otherPaths: [...selectedOtherPaths.value],
    imagePaths: [],
  }
  appSettingsStore.updateProjectCreation({
    workspaceStates: updateProjectWorkspaceState(
      appSettingsStore.settings.value.projectCreation.workspaceStates,
      props.projectRootPath,
      (current) => {
        current.packageBuilder = cache
        return current
      },
    ),
  })
}
</script>

<style scoped>
.resource-package-builder { display: grid; grid-template-rows: minmax(0, 1fr); height: 100%; min-width: 0; min-height: 0; background: var(--oc-bg-inset); }
.resource-package-builder__fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(8rem, 1fr); gap: var(--oc-space-3); }
.resource-package-builder__fields label { display: grid; gap: var(--oc-space-1); min-width: 0; }
.resource-package-builder__workspace { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(18rem, .8fr); min-height: 0; }
.resource-package-builder__selection, .resource-package-builder__summary { min-width: 0; min-height: 0; overflow: hidden; }
.resource-package-builder__selection { display: grid; grid-template-rows: auto minmax(0, 1fr); border-right: var(--oc-border-width) solid var(--oc-border-muted); background: var(--oc-bg-base); }
.resource-package-builder__summary { padding: var(--oc-space-6); background: var(--oc-bg-inset); }
.resource-package-builder__summary .resource-package-builder__fields { grid-template-columns: 1fr; margin-top: var(--oc-space-5); }
.resource-package-builder__section-heading { display: flex; align-items: flex-start; gap: var(--oc-space-3); padding: var(--oc-space-4) var(--oc-space-5); border-bottom: var(--oc-border-width) solid var(--oc-border-muted); }
.resource-package-builder__section-heading > div { display: grid; gap: var(--oc-space-1); min-width: 0; }
.resource-package-builder__section-heading h3 { margin: 0; }
.resource-package-builder__error { margin-top: var(--oc-space-5); }
.resource-package-builder__contents { display: grid; gap: var(--oc-space-2); margin-top: var(--oc-space-5); }
.resource-package-builder__contents > * { display: flex; justify-content: space-between; gap: var(--oc-space-3); min-width: 0; }
.resource-package-builder__contents-label { color: var(--oc-fg-muted); }
.resource-package-builder__contents-value { min-width: 0; text-align: right; overflow-wrap: anywhere; }
@media (max-width: 760px) { .resource-package-builder__fields, .resource-package-builder__workspace { grid-template-columns: 1fr; } .resource-package-builder__workspace { overflow: auto; } .resource-package-builder__selection { min-height: 22rem; border-right: 0; border-bottom: var(--oc-border-width) solid var(--oc-border-muted); } }
</style>
