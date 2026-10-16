import { convertFileSrc } from '@tauri-apps/api/core'
import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  TemplateServiceError,
  resolveProjectTemplateDescription,
  resolveProjectTemplateName,
  resolveTemplateEntries,
  validateProjectName,
  type CreatedProject,
  type ProjectTemplate,
  type ProjectTemplateKey,
} from '../model/projectTemplate'
import { useAppStateStore } from '../../app-state/store/appStateStore'
import { useProjectTemplateStore } from '../store/projectTemplateStore'
import { notifyError } from '../../notifications/titlebarNotices'
import { publishAppOutput } from '../../logging/appOutput'
import { reportCatalogWarnings } from '../../logging/catalogWarningReporter'

export function createProjectForm(options: {
  selectedKey: Ref<ProjectTemplateKey | null>
  externalBusy: Readonly<Ref<boolean>>
  onBusy: (busy: boolean) => void
  onCreated: (project: CreatedProject) => Promise<boolean>
}) {
  const { t, locale } = useI18n()
  const store = useProjectTemplateStore()
  const appStateStore = useAppStateStore()

  const projectName = ref(t('projectTemplates.defaults.projectName'))
  const selectedEntry = ref('')
  const parentPath = ref(appStateStore.state.value.projects.lastParentPath)
  const isCreating = ref(false)
  const isImporting = ref(false)
  const isChoosingParent = ref(false)
  const selectedTemplate = computed(() => options.selectedKey.value ? store.findTemplate(options.selectedKey.value) : null)
  const selectedTemplateEntries = computed(() => (
    selectedTemplate.value ? resolveTemplateEntries(selectedTemplate.value) : []
  ))
  const selectedEntryOptions = computed(() => [
    { value: '', label: t('projectTemplates.status.noInitialPage') },
    ...selectedTemplateEntries.value.map(entry => ({
      value: entry,
      label: selectedTemplateEntryName(entry),
    })),
  ])
  function selectedTemplateEntryName(entry: string): string {
    return entry
      ? selectedTemplate.value?.entryNames?.[entry] ?? entry
      : t('projectTemplates.status.noInitialPage')
  }
  function localizedTemplateName(template: ProjectTemplate): string {
    return resolveProjectTemplateName(template, locale.value)
  }
  function localizedTemplateDescription(template: ProjectTemplate): string {
    return resolveProjectTemplateDescription(template, locale.value)
  }
  const selectedCoverSources = computed(() => (
    selectedTemplate.value?.coverPaths.map((path) => convertFileSrc(path)) ?? []
  ))
  const projectNameError = computed(() => projectName.value.length > 0 && validateProjectName(projectName.value) !== null)
  const localBusy = computed(() => (
    isCreating.value
    || isImporting.value
    || isChoosingParent.value
  ))
  const isBusy = computed(() => localBusy.value || options.externalBusy.value === true)
  const targetPreview = computed(() => {
    if (!parentPath.value || !projectName.value.trim()) return ''
    const separator = parentPath.value.includes('\\') ? '\\' : '/'
    const parent = parentPath.value.replace(/[\\/]+$/, '')
    return parent
      ? `${parent}${separator}${projectName.value.trim()}`
      : `${separator}${projectName.value.trim()}`
  })
  const canCreate = computed(() => Boolean(
    selectedTemplate.value
    && (selectedTemplateEntries.value.length === 0 || selectedEntry.value)
    && parentPath.value
    && projectName.value.trim()
    && !projectNameError.value
    && !isBusy.value,
  ))
  watch(() => options.selectedKey.value, () => {
    selectedEntry.value = selectedTemplateEntries.value[0] ?? ''
  }, { immediate: true })

  watch(localBusy, options.onBusy, { immediate: true, flush: 'sync' })

  onMounted(async () => {
    await loadTemplateCatalog()
  })

  async function loadTemplateCatalog(): Promise<void> {
    try {
      await store.load()
      // 模板目录里用不了的模板只上报一次，具体原因留在输出里。
      reportCatalogWarnings({
        warnings: store.warnings.value,
        summaryKey: 'projectTemplates.status.skippedTemplates',
        itemKey: 'projectTemplates.status.skippedTemplate',
        translate: t,
      })
    } catch (cause) {
      reportFailure(cause)
    }
  }

  async function chooseParentDirectory(): Promise<void> {
    if (isBusy.value) return
    isChoosingParent.value = true
    try {
      const selected = await store.pickProjectParentDirectory(t('projectTemplates.dialogs.chooseParent'))
      if (selected) {
        parentPath.value = selected
        appStateStore.updateProjects({ lastParentPath: selected })
      }
    } catch (cause) {
      reportFailure(cause)
    } finally {
      isChoosingParent.value = false
    }
  }

  async function beginImport(): Promise<void> {
    if (isBusy.value || store.isLoading.value) return
    isImporting.value = true
    try {
      const sourcePath = await store.pickTemplateSourceFile(t('projectTemplates.dialogs.chooseTemplatePackage'))
      if (!sourcePath) return
      const imported = await store.importUserTemplate(sourcePath)
      options.selectedKey.value = imported.key
    } catch (cause) {
      reportFailure(cause)
    } finally {
      isImporting.value = false
    }
  }

  async function createProject(): Promise<boolean> {
    if (!canCreate.value || !selectedTemplate.value) return false
    isCreating.value = true
    try {
      const project = await store.createProject({
        template: selectedTemplate.value,
        parentPath: parentPath.value,
        projectName: projectName.value,
        entry: selectedEntry.value || undefined,
      })
      return await options.onCreated(project)
    } catch (cause) {
      reportFailure(cause)
      return false
    } finally {
      isCreating.value = false
    }
  }

  /** 一次性失败交给即时信息，具体原因留在输出里，页面不再长期挂一段过期报错。 */
  function reportFailure(cause: unknown): void {
    const message = resolveErrorMessage(cause)
    notifyError(message)
    publishAppOutput({ severity: 'error', message, detail: describeFailure(cause) })
  }

  function describeFailure(cause: unknown): string {
    if (cause instanceof TemplateServiceError) return `${cause.code}: ${cause.message}`
    return cause instanceof Error ? cause.message : String(cause)
  }

  function resolveErrorMessage(cause: unknown): string {
    if (!(cause instanceof TemplateServiceError)) return t('projectTemplates.errors.unknown')
    const keyByCode: Record<TemplateServiceError['code'], string> = {
      'invalid-catalog': 'invalidCatalog',
      'invalid-manifest': 'invalidManifest',
      'invalid-project-name': 'invalidProjectName',
      'invalid-template-name': 'invalidTemplateName',
      'description-too-long': 'descriptionTooLong',
      'source-not-project': 'sourceNotProject',
      'source-not-template': 'sourceNotTemplate',
      'source-has-symlink': 'sourceHasSymlink',
      'entry-not-found': 'entryNotFound',
      'cover-not-found': 'coverNotFound',
      'template-exists': 'templateExists',
      'parent-not-found': 'parentNotFound',
      'target-exists': 'targetExists',
      'builtin-delete-forbidden': 'builtinDeleteForbidden',
      'copy-failed': 'copyFailed',
      'invalid-package': 'invalidPackage',
      'archive-failed': 'archiveFailed',
    }
    return t(`projectTemplates.errors.${keyByCode[cause.code]}`)
  }

  function reset(): void {
    projectName.value = t('projectTemplates.defaults.projectName')
    parentPath.value = appStateStore.state.value.projects.lastParentPath
    selectedEntry.value = selectedTemplateEntries.value[0] ?? ''
  }

  return { store, projectName, selectedEntry, parentPath, isCreating, selectedTemplate, selectedEntryOptions, selectedTemplateEntryName, localizedTemplateName, localizedTemplateDescription, selectedCoverSources, projectNameError, isBusy, targetPreview, canCreate, chooseParentDirectory, beginImport, createProject, reset }
}
