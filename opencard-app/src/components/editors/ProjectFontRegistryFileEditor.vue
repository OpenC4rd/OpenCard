<template>
  <MonacoEditor v-if="props.mode === 'diff'" :model-value="props.modelValue ?? ''" language="json"
    :mode="props.mode" :comparison="props.comparison" :theme-id="themeId" :theme-overrides="themeOverrides" />

  <ProjectRegistryEditorShell v-else content-mode="workspace" @keydown.ctrl.s.prevent="save">
    <ProjectFontRegistryEditor v-if="document" ref="workbenchRef" :families="document.families ?? []"
      :compositions="document.compositions ?? []"
      :resolve-asset-src="source => projectStore.resolveResourceAssetSrcFromFile(props.filePath, source)"
      :read-font-bytes="readFontBytes"
      :load-errors="projectStore.projectFontLoadErrors.value"
      :error="importError" @update:families="updateFamilies" @update:compositions="updateCompositions"
      @register-family="openRegistrationDialog" @configure-family="openRegistrationDialog"
      @remove-family="openFamilyRemovalDialog" @add-composition="openCompositionDialog"
      @configure-composition="openCompositionDialog" />

    <ProjectRegistryRepairEditor v-else :model-value="props.modelValue ?? ''" :theme-id="themeId"
      :theme-overrides="themeOverrides" :heading="t('fontRegistry.invalid')" :description="t('fontRegistry.repair')"
      @update:model-value="updateRawSource" @save="save" />

    <ProjectFontRegistrationDialog :open="registrationDialogOpen" :registry="fontRegistry"
      :reserved-keys="(document?.compositions ?? []).map(composition => composition.key)"
      :original-key="registrationOriginalKey" :busy="importBusy" :error="importError"
      :default-open-path="fontDirectory" :get-managed-font-source="getManagedFontSource"
      :resolve-import-conflict="projectStore.getProjectFontImportConflict"
      @close="closeRegistrationDialog" @submit="registerFont" />
    <ProjectFontCompositionDialog :open="compositionDialogOpen" :families="document?.families ?? []"
      :compositions="document?.compositions ?? []" :original-key="compositionOriginalKey"
      @close="closeCompositionDialog" @submit="saveComposition" />
    <OcDialog :open="Boolean(pendingRemovalFamily)" :title="t('projectConfig.fonts.removeFamilyTitle')"
      size="sm" close-on-backdrop :dismissible="!cleanupBusy" @request-close="closeFamilyRemovalDialog">
      <OcText>{{ t('projectConfig.fonts.removeFamilyDescription', { name: pendingRemovalFamily?.name ?? '' }) }}</OcText>
      <OcCheckbox v-if="orphanedRemovalSources.length" v-model:checked="cleanupOrphanedFiles">
        {{ t('projectConfig.fonts.cleanupOrphanedFiles', { count: orphanedRemovalSources.length }) }}
      </OcCheckbox>
      <OcText v-if="sharedRemovalSourceCount" tone="muted" size="sm">
        {{ t('projectConfig.fonts.sharedFilesPreserved', { count: sharedRemovalSourceCount }) }}
      </OcText>
      <OcText v-if="cleanupError" tone="danger" size="sm" role="alert">{{ cleanupError }}</OcText>
      <template #footer>
        <OcButton :disabled="cleanupBusy" @click="closeFamilyRemovalDialog">
          {{ t('projectConfig.fonts.cancel') }}
        </OcButton>
        <OcButton variant="solid" :disabled="cleanupBusy" @click="confirmFamilyRemoval">
          {{ t('projectConfig.fonts.remove') }}
        </OcButton>
      </template>
    </OcDialog>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MonacoEditor from './MonacoEditor.vue'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { ContentHistoryOperationMeta } from '../../features/editor-runtime/history/contentHistory'
import type { EditorIssue, EditorIssueSnapshot, EditorNavigationResult, SessionNavigationToken } from '../../features/editor-runtime/model/editorIssue'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { reportAppError } from '../../features/logging/appErrorCatalog'
import {
  buildProjectFontRegistry,
  parseProjectFontRegistryText,
  PROJECT_FONT_REGISTRY_FILE_NAME,
  serializeProjectFontRegistry,
  type ProjectFontComposition,
  type ProjectFont,
  projectFontSources,
  type ProjectFontRegistryDocument,
} from '../../features/workspace/model/projectFontRegistry'
import { findProjectFontRegistryIssues } from '../../features/workspace/model/projectFonts'
import { DEFAULT_PROJECT_FONT_DIRECTORY } from '../../features/workspace/model/projectFonts'
import { PROJECT_INTERNAL_DIRECTORY_NAME } from '../../features/workspace/model/projectStructure'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { stageProjectAssetFiles } from '../../features/workspace/services/projectAssetFileHistory'
import { resolveResourcePath } from '../../features/workspace/model/scopedResourcePath'
import ProjectFontRegistrationDialog, {
  type ProjectFontFamilyRegistrationRequest,
  type ProjectFontSlotKey,
} from './ProjectFontRegistrationDialog.vue'
import ProjectFontRegistryEditor from './ProjectFontRegistryEditor.vue'
import ProjectFontCompositionDialog, {
  type ProjectFontCompositionRequest,
} from './ProjectFontCompositionDialog.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'
import ProjectRegistryRepairEditor from './ProjectRegistryRepairEditor.vue'
import OcButton from '../base/OcButton.vue'
import OcCheckbox from '../base/OcCheckbox.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const projectStore = useProjectStore()
const document = ref<ProjectFontRegistryDocument | null>(null)
const importBusy = ref(false)
const importError = ref('')
const registrationDialogOpen = ref(false)
const registrationOriginalKey = ref<string>()
const compositionDialogOpen = ref(false)
const compositionOriginalKey = ref<string>()
const workbenchRef = ref<InstanceType<typeof ProjectFontRegistryEditor> | null>(null)
const pendingRemovalKey = ref<string>()
const cleanupOrphanedFiles = ref(true)
const cleanupBusy = ref(false)
const cleanupError = ref('')

const themeId = computed(() => props.themeId ?? 'dark')
const themeOverrides = computed(() => props.themeOverrides ?? {})
const fontRegistry = computed(() => buildProjectFontRegistry(document.value ?? {}))
const pendingRemovalFamily = computed(() => document.value?.families?.find(family => (
  family.key === pendingRemovalKey.value
)) ?? null)
const orphanedRemovalSources = computed(() => {
  const family = pendingRemovalFamily.value
  if (!family) return []
  const remainingSources = new Set((document.value?.families ?? [])
    .filter(candidate => candidate.key !== family.key)
    .flatMap(candidate => projectFontSources(candidate).map(source => source.toLocaleLowerCase())))
  return [...new Set(projectFontSources(family))]
    .filter(source => source.toLocaleLowerCase().startsWith(`${PROJECT_INTERNAL_DIRECTORY_NAME}/${DEFAULT_PROJECT_FONT_DIRECTORY}/`))
    .filter(source => !remainingSources.has(source.toLocaleLowerCase()))
})
const sharedRemovalSourceCount = computed(() => (
  new Set(pendingRemovalFamily.value ? projectFontSources(pendingRemovalFamily.value) : []).size - orphanedRemovalSources.value.length
))
const projectDirectory = computed(() => {
  const source = projectStore.projectPath.value || props.filePath
  const normalized = source.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized.endsWith(`/${PROJECT_FONT_REGISTRY_FILE_NAME}`)
    ? normalized.slice(0, -PROJECT_FONT_REGISTRY_FILE_NAME.length - 1)
    : normalized
})
const fontDirectory = computed(() => `${projectDirectory.value}/${PROJECT_INTERNAL_DIRECTORY_NAME}/${DEFAULT_PROJECT_FONT_DIRECTORY}`)
const readFontBytes = (source: string) => fileSystemService.readBinaryFile(
  projectStore.resolveResourcePathFromFile(props.filePath, source),
)
const issueSnapshot = computed<EditorIssueSnapshot>(() => {
  const families = document.value?.families ?? []
  const compositions = document.value?.compositions ?? []
  const registryIssues: EditorIssue[] = document.value
    ? findProjectFontRegistryIssues({ families, compositions }).map((issue, index) => ({
        id: `project-font-registry:${issue.kind}:${index}`,
        type: `project-font-registry.${issue.kind}`,
        severity: issue.kind === 'empty-font' || issue.kind === 'empty-composition' ? 'warning' : 'error',
        locationText: issue.kind === 'empty-font'
          ? t('projectConfig.fonts.fontIssueLocation', { font: issue.fontKey })
          : t('projectConfig.fonts.fontSetIssueLocation', { set: issue.compositionKey }),
        description: issue.kind === 'empty-font'
          ? t('projectConfig.fonts.emptyFamilyIssue')
          : issue.kind === 'empty-composition'
          ? t('projectConfig.fonts.emptySetIssue')
          : t('projectConfig.fonts.missingReferenceIssue', { key: issue.fontKey }),
        navigationToken: {
          protocol: 'font-registry',
          version: 1,
          target: issue.kind === 'empty-font'
            ? { kind: 'family', key: issue.fontKey }
            : { kind: 'composition', key: issue.compositionKey },
        },
      }))
    : []
  const loadIssues: EditorIssue[] = projectStore.projectFontLoadErrors.value.map((error, index) => ({
    id: `project-font-load:${error.fontKey}:${index}`,
    type: 'project-font-registry.load-failed',
    severity: 'error',
    locationText: t('projectConfig.fonts.fontIssueLocation', { font: error.fontKey }),
    description: t('projectConfig.fonts.loadFailed', { message: error.message }),
    navigationToken: { protocol: 'font-registry', version: 1, target: { kind: 'family', key: error.fontKey } },
  }))
  return { scopeKey: 'project-font-registry', scopeOrder: ['project-font-registry'], issues: [...registryIssues, ...loadIssues] }
})

watch(() => props.modelValue, content => {
  document.value = parseProjectFontRegistryText(content ?? '')
}, { immediate: true })
watch(issueSnapshot, snapshot => emit('issue-snapshot', snapshot), { immediate: true })

function commit(next: ProjectFontRegistryDocument, history?: ContentHistoryOperationMeta): boolean {
  const previous = document.value
  try {
    const content = serializeProjectFontRegistry(next)
    document.value = parseProjectFontRegistryText(content)
    emit('update:modelValue', content, history)
    return true
  } catch (error) {
    document.value = previous
    reportAppError('OC-E3012', error)
    return false
  }
}

function updateFamilies(families: readonly ProjectFont[]): void {
  commit({ ...(families.length ? { families } : {}), ...(document.value?.compositions?.length ? { compositions: document.value.compositions } : {}) })
}

function updateCompositions(compositions: readonly ProjectFontComposition[]): void {
  commit({ ...(document.value?.families?.length ? { families: document.value.families } : {}), ...(compositions.length ? { compositions } : {}) })
}

function openRegistrationDialog(originalKey?: string): void {
  if (!document.value || importBusy.value) return
  if (originalKey && !document.value.families?.some(family => family.key === originalKey)) return
  importError.value = ''
  registrationOriginalKey.value = originalKey
  registrationDialogOpen.value = true
}

function closeRegistrationDialog(): void {
  if (importBusy.value) return
  registrationDialogOpen.value = false
  registrationOriginalKey.value = undefined
  importError.value = ''
}

function openCompositionDialog(originalKey?: string): void {
  if (!document.value) return
  if (originalKey && !document.value.compositions?.some(composition => composition.key === originalKey)) return
  compositionOriginalKey.value = originalKey
  compositionDialogOpen.value = true
}

function closeCompositionDialog(): void {
  compositionDialogOpen.value = false
  compositionOriginalKey.value = undefined
}

async function registerFont(request: ProjectFontFamilyRegistrationRequest): Promise<void> {
  if (!document.value || importBusy.value) return
  importError.value = ''
  importBusy.value = true
  try {
    const families = document.value.families ?? []
    const compositions = document.value.compositions ?? []
    const originalKeys = new Set(request.families
      .map(family => family.originalKey?.toLocaleLowerCase())
      .filter((key): key is string => Boolean(key)))
    const reservedKeys = new Set([...families, ...compositions]
      .map(entry => entry.key.toLocaleLowerCase())
      .filter(key => !originalKeys.has(key)))
    const requestedKeys = request.families.map(family => family.key.toLocaleLowerCase())
    if (new Set(requestedKeys).size !== requestedKeys.length
      || requestedKeys.some(key => reservedKeys.has(key))) {
      importError.value = t('projectConfig.fonts.keyExists')
      return
    }
    const importedFamilies = await Promise.all(request.families.map(async requestedFamily => ({
      key: requestedFamily.key,
      name: requestedFamily.name,
      files: await (async () => {
        const files: ProjectFont['files'] = {}
        for (const [slotKey, slot] of Object.entries(requestedFamily.slots) as [ProjectFontSlotKey, NonNullable<typeof requestedFamily.slots[ProjectFontSlotKey]>][]) {
          const sources = slot.originalSource && slot.sourcePath === slot.originalSource
          ? [slot.originalSource]
          : (await projectStore.importProjectFontFiles(
              slot.sourcePath,
              slot.conflictResolution,
              slot.collectionIndex === undefined ? undefined : [slot.collectionIndex],
            )).sources
          const [weight, style] = slotKey.split('.') as [keyof typeof files, 'upright' | 'italic']
          const source = sources[0]
          if (source) files[weight] = { ...(files[weight] ?? {}), [style]: source }
        }
        return files
      })(),
    })))
    const replacements = new Map(request.families.flatMap((family, index) => family.originalKey
      ? [[family.originalKey.toLocaleLowerCase(), importedFamilies[index]!] as const]
      : []))
    const nextFamilies = [
      ...families.map(family => replacements.get(family.key.toLocaleLowerCase()) ?? family),
      ...request.families.flatMap((family, index) => family.originalKey ? [] : [importedFamilies[index]!]),
    ]
    const renamedKeys = new Map(request.families.flatMap(family => (
      family.originalKey && family.originalKey.toLocaleLowerCase() !== family.key.toLocaleLowerCase()
        ? [[family.originalKey.toLocaleLowerCase(), family.key] as const]
        : []
    )))
    const nextCompositions = renamedKeys.size
      ? compositions.map(composition => ({
          ...composition,
          members: composition.members.map(member => {
            const nextKey = renamedKeys.get(member.fontKey.toLocaleLowerCase())
            return nextKey ? { ...member, fontKey: nextKey } : member
          }),
        }))
      : compositions
    commit({ families: nextFamilies, ...(nextCompositions.length ? { compositions: nextCompositions } : {}) })
    registrationDialogOpen.value = false
    registrationOriginalKey.value = undefined
  } catch (error) {
    reportAppError('OC-E3007', error)
    importError.value = error instanceof Error
      ? t('projectConfig.fonts.registrationFailedWithReason', { message: error.message })
      : t('projectConfig.fonts.registrationFailed')
  } finally {
    importBusy.value = false
  }
}

function getManagedFontSource(path: string): string | null {
  const relative = projectStore.getRelativeProjectPathIfInside(path)?.replace(/\\/g, '/')
  if (!relative) return null
  const prefix = `${PROJECT_INTERNAL_DIRECTORY_NAME}/${DEFAULT_PROJECT_FONT_DIRECTORY}/`
  return relative.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
    ? relative
    : null
}

function openFamilyRemovalDialog(key: string): void {
  const family = document.value?.families?.find(candidate => candidate.key === key)
  if (!family || document.value?.compositions?.some(composition => (
    composition.members.some(member => member.fontKey.toLocaleLowerCase() === key.toLocaleLowerCase())
  ))) return
  pendingRemovalKey.value = key
  cleanupOrphanedFiles.value = true
  cleanupError.value = ''
}

function closeFamilyRemovalDialog(): void {
  if (cleanupBusy.value) return
  pendingRemovalKey.value = undefined
  cleanupError.value = ''
}

async function confirmFamilyRemoval(): Promise<void> {
  const family = pendingRemovalFamily.value
  if (!family || cleanupBusy.value || !document.value) return
  cleanupBusy.value = true
  cleanupError.value = ''
  let stagedFiles: Awaited<ReturnType<typeof stageProjectAssetFiles>> | undefined
  try {
    if (cleanupOrphanedFiles.value && orphanedRemovalSources.value.length) {
      const paths = orphanedRemovalSources.value.map(source => {
        const resolved = resolveResourcePath(projectDirectory.value, props.filePath, source)
        if (!resolved.ok) throw new Error(resolved.message)
        return resolved.value
      })
      stagedFiles = await stageProjectAssetFiles(paths, undefined, undefined, 'font')
    }
    const nextFamilies = (document.value.families ?? []).filter(candidate => candidate.key !== family.key)
    const committed = commit({
      ...(nextFamilies.length ? { families: nextFamilies } : {}),
      ...(document.value.compositions?.length ? { compositions: document.value.compositions } : {}),
    }, stagedFiles ? { mode: 'immediate', label: 'remove-project-font', structural: true, resource: stagedFiles } : undefined)
    if (!committed) {
      await stagedFiles?.undo()
      await stagedFiles?.release()
      return
    }
    pendingRemovalKey.value = undefined
  } catch (error) {
    if (stagedFiles) {
      await stagedFiles.undo().catch(() => undefined)
      await Promise.resolve(stagedFiles.release()).catch(() => undefined)
    }
    cleanupError.value = t('projectConfig.fonts.cleanupFailed', {
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    cleanupBusy.value = false
  }
}

function saveComposition(request: ProjectFontCompositionRequest): void {
  if (!document.value) return
  const families = document.value.families ?? []
  const compositions = document.value.compositions ?? []
  const originalIdentity = request.originalKey?.toLocaleLowerCase()
  if ([...families, ...compositions].some(entry => (
    entry.key.toLocaleLowerCase() === request.key.toLocaleLowerCase()
    && entry.key.toLocaleLowerCase() !== originalIdentity
  ))) return
  const nextEntry = { key: request.key, name: request.name, members: request.members }
  const nextCompositions = request.originalKey
    ? compositions.map(composition => composition.key === request.originalKey ? nextEntry : composition)
    : [...compositions, nextEntry]
  commit({ ...(families.length ? { families } : {}), compositions: nextCompositions })
  compositionDialogOpen.value = false
  compositionOriginalKey.value = undefined
}

function updateRawSource(content: string, history?: ContentHistoryOperationMeta): void {
  emit('update:modelValue', content, history)
}

function save(): void {
  if (document.value) emit('save')
}

function isNavigationToken(token: SessionNavigationToken): token is {
  protocol: 'font-registry'; version: 1; target: { kind: 'family' | 'composition'; key: string }
} {
  if (!token || typeof token !== 'object' || Array.isArray(token)) return false
  const candidate = token as Record<string, unknown>
  const target = candidate.target
  if (candidate.protocol !== 'font-registry' || candidate.version !== 1 || !target || typeof target !== 'object' || Array.isArray(target)) return false
  const value = target as Record<string, unknown>
  return (value.kind === 'family' || value.kind === 'composition') && typeof value.key === 'string'
}

async function navigate(token: SessionNavigationToken): Promise<EditorNavigationResult> {
  if (!isNavigationToken(token)) return 'invalid-token'
  await nextTick()
  return await workbenchRef.value?.navigateToFont(token.target.kind, token.target.key) ? 'success' : 'not-found'
}

const presentation = computed<EditorPresentation>(() => ({
  title: t('fontRegistry.title'),
  description: t('fontRegistry.description'),
  icon: 'file.font',
}))

defineExpose({ save, navigate, presentation })
</script>
