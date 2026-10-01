import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createCreateProjectSection } from '../sections/createProjectSection'
import { notifyAppError, notifyError, notifySuccess } from '../../notifications/titlebarNotices'
import { publishAppOutput } from '../../logging/appOutput'
import { reportCatalogWarnings } from '../../logging/catalogWarningReporter'
import { loadBuiltinResourcePackages } from '../../workspace/services/builtinResourcePackageCatalog'
import { useProjectTemplateStore } from '../../project-templates/store/projectTemplateStore'
import { useStoredResourcePackageStore } from '../../workspace/store/storedResourcePackageStore'
import type { useProjectStore } from '../../workspace/store/projectStore'
import type { ProjectTemplateKey } from '../../project-templates/model/projectTemplate'
import type { StoredResourcePackage } from '../../workspace/model/storedResourcePackage'
import type {
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeSelectionEvent,
} from '../../../shared/ui/node/node.types'
import {
  ATTACH_RESOURCE_PACKAGE_ACTION_KEY,
  ATTACHED_RESOURCE_PACKAGE_ACTION_KEY,
  IMPORT_TEMPLATE_ACTION_KEY,
  REMOVE_RESOURCE_PACKAGE_ACTION_KEY,
  TEMPLATE_REMOVE_ACTION_KEY,
  createResourcePackageTreeData,
  createTemplateTreeData,
} from '../shellCatalogProjections'
import {
  BUILTIN_RESOURCE_PACKAGES_GROUP_KEY,
  BUILTIN_TEMPLATES_GROUP_KEY,
  STORED_RESOURCE_PACKAGES_GROUP_KEY,
  USER_TEMPLATES_GROUP_KEY,
  RESOURCE_PACKAGES_LIST_KEY,
  IMPORT_RESOURCE_PACKAGE_ACTION_KEY,
  USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
  DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
} from '../shellSidebarConfig'

type ProjectStore = ReturnType<typeof useProjectStore>

export function useShellCreateProjectFeature(options: {
  projectStore: ProjectStore
  isCreateProjectMode: Readonly<Ref<boolean>>
  isActivatingProject: Readonly<Ref<boolean>>
  requestConfirmation: (options: { title: string; message: string; confirmLabel: string }) => Promise<boolean>
  enterCreateProject: () => void
  onTemplateImport?: () => Promise<void> | void
}) {
  const { t, locale } = useI18n()
  const templateStore = useProjectTemplateStore()
  const resourcePackageStore = useStoredResourcePackageStore()
  const selectedTemplateKey = ref<ProjectTemplateKey | null>(null)
  const attachedResourcePackagePaths = ref<string[]>([])
  const builtinResourcePackages = ref<readonly StoredResourcePackage[]>([])
  const selectedResourcePackageKeys = ref<readonly string[]>([])
  const templateExpandedKeys = ref<string[]>([BUILTIN_TEMPLATES_GROUP_KEY, USER_TEMPLATES_GROUP_KEY])
  const resourcePackageExpandedKeys = ref<string[]>([
    BUILTIN_RESOURCE_PACKAGES_GROUP_KEY,
    STORED_RESOURCE_PACKAGES_GROUP_KEY,
  ])
  const isCreateProjectOperationBusy = ref(false)
  const isImportingResourcePackage = ref(false)
  const allResourcePackages = computed(() => [...builtinResourcePackages.value, ...resourcePackageStore.packs.value])
  const selectedResourcePackagePaths = computed(() => {
    const paths = new Set(allResourcePackages.value.map(pack => pack.path))
    return selectedResourcePackageKeys.value.filter(key => paths.has(key))
  })
  const attachedResourcePackages = computed(() => attachedResourcePackagePaths.value
    .map(path => allResourcePackages.value.find(pack => pack.path === path))
    .filter((pack): pack is StoredResourcePackage => Boolean(pack)))
  const isProjectTemplateBusy = computed(() => (
    options.isActivatingProject.value || isCreateProjectOperationBusy.value || isImportingResourcePackage.value
  ))
  const templateTreeData = computed<OcNodeCollection>(() => createTemplateTreeData(
    templateStore.builtinTemplates.value,
    templateStore.userTemplates.value,
    locale.value,
    t,
    { builtin: BUILTIN_TEMPLATES_GROUP_KEY, user: USER_TEMPLATES_GROUP_KEY },
  ))
  const resourcePackageTreeData = computed<OcNodeCollection>(() => createResourcePackageTreeData(
    builtinResourcePackages.value,
    resourcePackageStore.packs.value,
    attachedResourcePackagePaths.value,
    t,
    { builtin: BUILTIN_RESOURCE_PACKAGES_GROUP_KEY, stored: STORED_RESOURCE_PACKAGES_GROUP_KEY },
  ))

  function describeCause(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause)
  }
  function reportFailure(message: string, cause: unknown): void {
    notifyError(message)
    publishAppOutput({ severity: 'error', message, detail: describeCause(cause) })
  }
  async function removeUserTemplate(key: ProjectTemplateKey): Promise<void> {
    const template = templateStore.findTemplate(key)
    if (!template) return
    if (!await options.requestConfirmation({
      title: t('projectTemplates.actions.delete'),
      message: t('projectTemplates.confirmDelete'),
      confirmLabel: t('projectTemplates.actions.delete'),
    })) return
    try {
      await templateStore.deleteUserTemplate(template)
      if (selectedTemplateKey.value === template.key) selectedTemplateKey.value = templateStore.templates.value[0]?.key ?? null
    } catch (cause) {
      reportFailure(t('projectTemplates.errors.unknown'), cause)
    }
  }
  async function handleTemplateAction(event: OcNodeActionEvent): Promise<void> {
    if (isProjectTemplateBusy.value) return
    if (event.actionKey === TEMPLATE_REMOVE_ACTION_KEY) {
      await removeUserTemplate(event.key as ProjectTemplateKey)
      return
    }
    if (event.key === USER_TEMPLATES_GROUP_KEY && event.actionKey === IMPORT_TEMPLATE_ACTION_KEY
      && !templateStore.isLoading.value) {
      options.onTemplateImport?.()
    }
  }
  async function handleTemplateSelectionChange(event: OcNodeSelectionEvent): Promise<void> {
    const key = event.selectedKeys[0] as ProjectTemplateKey | undefined
    if (key && templateStore.findTemplate(key)) selectedTemplateKey.value = key
  }
  function handleTemplateExpansionChange(event: OcNodeExpansionEvent): void {
    templateExpandedKeys.value = event.expanded
      ? [...templateExpandedKeys.value, event.key]
      : templateExpandedKeys.value.filter(key => key !== event.key)
  }
  async function handleResourcePackageSelectionChange(event: OcNodeSelectionEvent): Promise<void> {
    selectedResourcePackageKeys.value = event.selectedKeys
  }
  function handleResourcePackageExpansionChange(event: OcNodeExpansionEvent): void {
    resourcePackageExpandedKeys.value = event.expanded
      ? [...resourcePackageExpandedKeys.value, event.key]
      : resourcePackageExpandedKeys.value.filter(key => key !== event.key)
  }
  async function removeStoredResourcePackage(pack: StoredResourcePackage): Promise<void> {
    if (!await options.requestConfirmation({
      title: t('projectTemplates.sections.resourcePackages'),
      message: t('projectTemplates.confirmRemoveResourcePackage', { name: pack.title }),
      confirmLabel: t('projectTemplates.actions.removeResourcePackage'),
    })) return
    try {
      await resourcePackageStore.removePackage(pack.path)
      attachedResourcePackagePaths.value = attachedResourcePackagePaths.value.filter(path => path !== pack.path)
    } catch (cause) {
      reportFailure(t('projectTemplates.errors.resourcePackageRemoveFailed'), cause)
    }
  }
  function handleResourcePackageAction(event: OcNodeActionEvent): void {
    if (isProjectTemplateBusy.value) return
    const path = event.key
    const pack = allResourcePackages.value.find(candidate => candidate.path === path)
    if (!pack) return
    if (event.actionKey === ATTACH_RESOURCE_PACKAGE_ACTION_KEY) {
      if (!attachedResourcePackagePaths.value.includes(path)) attachedResourcePackagePaths.value = [...attachedResourcePackagePaths.value, path]
    } else if (event.actionKey === ATTACHED_RESOURCE_PACKAGE_ACTION_KEY) {
      attachedResourcePackagePaths.value = attachedResourcePackagePaths.value.filter(candidate => candidate !== path)
    } else if (event.actionKey === REMOVE_RESOURCE_PACKAGE_ACTION_KEY) {
      const stored = resourcePackageStore.findPackage(path)
      if (stored) void removeStoredResourcePackage(stored)
    }
  }
  async function importStoredResourcePackage(): Promise<void> {
    if (isImportingResourcePackage.value) return
    isImportingResourcePackage.value = true
    try {
      const sourcePath = await resourcePackageStore.pickSourceFile(t('projectTemplates.dialogs.chooseResourcePackage'))
      if (!sourcePath) return
      const imported = await resourcePackageStore.importPackage(sourcePath)
      notifySuccess(t('projectTemplates.status.resourcePackageImported', { name: imported.title }))
    } catch (cause) {
      reportFailure(t('projectTemplates.errors.resourcePackageImportFailed', { message: describeCause(cause) }), cause)
    } finally {
      isImportingResourcePackage.value = false
    }
  }
  async function importDroppedResourcePackage(path: string): Promise<void> {
    const imported = await resourcePackageStore.importPackage(path).catch((cause: unknown) => {
      reportFailure(t('projectTemplates.errors.resourcePackageImportFailed', { message: describeCause(cause) }), cause)
      return null
    })
    if (!imported) return
    notifySuccess(t('projectTemplates.status.resourcePackageImported', { name: imported.title }))
    if (!options.isCreateProjectMode.value) options.enterCreateProject()
    if (!attachedResourcePackagePaths.value.includes(imported.path)) {
      attachedResourcePackagePaths.value = [...attachedResourcePackagePaths.value, imported.path]
    }
  }
  async function loadStoredResourcePackages(): Promise<void> {
    const builtin = await loadBuiltinResourcePackages().catch(() => null)
    if (builtin) {
      builtinResourcePackages.value = builtin.packs
      reportCatalogWarnings({ warnings: builtin.warnings, summaryKey: 'projectTemplates.status.unreadableResourcePackages', itemKey: 'projectTemplates.status.unreadableResourcePackage', translate: t })
    }
    try {
      await resourcePackageStore.load()
      reportCatalogWarnings({ warnings: resourcePackageStore.warnings.value, summaryKey: 'projectTemplates.status.unreadableResourcePackages', itemKey: 'projectTemplates.status.unreadableResourcePackage', translate: t })
    } catch {
      notifyError(t('projectTemplates.errors.resourcePackageLibraryUnavailable'))
    }
  }
  async function installAttachedResourcePackages(): Promise<void> {
    for (const pack of attachedResourcePackages.value) {
      try { await options.projectStore.installResourcePackageFile(pack.path) }
      catch (error) { notifyAppError('OC-E3016', { path: pack.path, error }, locale.value) }
    }
    attachedResourcePackagePaths.value = []
  }
  watch(() => templateStore.templates.value, templates => {
    if (!selectedTemplateKey.value || !templates.some(template => template.key === selectedTemplateKey.value)) selectedTemplateKey.value = templates[0]?.key ?? null
  }, { immediate: true })
  watch(() => resourcePackageStore.packs.value, packs => {
    attachedResourcePackagePaths.value = attachedResourcePackagePaths.value.filter(path => packs.some(pack => pack.path === path))
  }, { immediate: true })
  watch(options.isCreateProjectMode, active => { if (active) void loadStoredResourcePackages() }, { immediate: true })

  const canUseSelectedResourcePackages = computed(() => selectedResourcePackagePaths.value.some(path => !attachedResourcePackagePaths.value.includes(path)))
  const canDisableSelectedResourcePackages = computed(() => selectedResourcePackagePaths.value.some(path => attachedResourcePackagePaths.value.includes(path)))
  async function handleListAction(listKey: string, actionKey: string): Promise<void> {
    if (!options.isCreateProjectMode.value || isProjectTemplateBusy.value || listKey !== RESOURCE_PACKAGES_LIST_KEY) return
    if (actionKey === IMPORT_RESOURCE_PACKAGE_ACTION_KEY) return importStoredResourcePackage()
    if (actionKey === USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY) {
      attachedResourcePackagePaths.value = [...new Set([...attachedResourcePackagePaths.value, ...selectedResourcePackagePaths.value])]
    } else if (actionKey === DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY) {
      const disabled = new Set(selectedResourcePackagePaths.value)
      attachedResourcePackagePaths.value = attachedResourcePackagePaths.value.filter(path => !disabled.has(path))
    }
  }
  const section = createCreateProjectSection({
    translate: t,
    busy: isProjectTemplateBusy,
    templateTreeData,
    selectedTemplateKey,
    templateExpandedKeys,
    onTemplateExpansionChange: handleTemplateExpansionChange,
    onTemplateSelectionChange: handleTemplateSelectionChange,
    onTemplateAction: handleTemplateAction,
    resourcePackageStore,
    resourcePackageTreeData,
    resourcePackageExpandedKeys,
    onResourcePackageExpansionChange: handleResourcePackageExpansionChange,
    resourcePackageSelection: {
      selectedKeys: selectedResourcePackageKeys,
      canUse: canUseSelectedResourcePackages,
      canDisable: canDisableSelectedResourcePackages,
      onChange: handleResourcePackageSelectionChange,
    },
    onResourcePackageAction: handleResourcePackageAction,
  })
  return {
    section,
    handleListAction,
    templateStore,
    resourcePackageStore,
    selectedTemplateKey,
    attachedResourcePackagePaths,
    attachedResourcePackages,
    selectedResourcePackagePaths,
    selectedResourcePackageKeys,
    templateExpandedKeys,
    resourcePackageExpandedKeys,
    isCreateProjectOperationBusy,
    isImportingResourcePackage,
    isProjectTemplateBusy,
    templateTreeData,
    resourcePackageTreeData,
    handleTemplateSelectionChange,
    handleTemplateExpansionChange,
    handleTemplateAction,
    handleResourcePackageSelectionChange,
    handleResourcePackageExpansionChange,
    handleResourcePackageAction,
    importStoredResourcePackage,
    importDroppedResourcePackage,
    installAttachedResourcePackages,
    canUseSelectedResourcePackages,
    canDisableSelectedResourcePackages,
  }
}
