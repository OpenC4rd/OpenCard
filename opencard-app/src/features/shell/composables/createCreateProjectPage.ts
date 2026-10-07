import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { createProjectForm } from '../../project-templates/composables/createProjectForm'
import CreateProjectWorkspace from '../../project-templates/components/CreateProjectWorkspace.vue'
import type { CreatedProject, ProjectTemplateKey } from '../../project-templates/model/projectTemplate'
import { useProjectStore } from '../../workspace/store/projectStore'
import { requestConfirmation } from '../services/appConfirmation'
import type { SpacePage } from '../spacePage'
import type { useShellProjectLifecycle } from './useShellProjectLifecycle'
import { useShellNavigation } from './useShellNavigation'
import { useShellCreateProjectFeature } from './useShellCreateProjectFeature'

export function createCreateProjectPage(lifecycle: ReturnType<typeof useShellProjectLifecycle>) {
  const { t } = useI18n()
  const { isCreateProject, returnFromFlow } = useShellNavigation()
  const feature = useShellCreateProjectFeature({
    projectStore: useProjectStore(), isCreateProjectMode: isCreateProject, isActivatingProject: lifecycle.isActivating,
    requestConfirmation, enterCreateProject: lifecycle.enterCreateProject,
    onTemplateImport: () => form.beginImport(),
  })
  async function created(project: CreatedProject): Promise<void> {
    if (await lifecycle.activateCreatedProject(project)) await feature.installAttachedResourcePackages()
  }
  const form = createProjectForm({
    selectedKey: feature.selectedTemplateKey, externalBusy: lifecycle.isActivating, onCreated: created,
    onBusy: busy => { feature.isCreateProjectOperationBusy.value = busy },
  })
  const page: SpacePage = {
    key: 'create-project', content: CreateProjectWorkspace,
    contentProps: computed(() => ({
      model: form, attachedResourcePackages: feature.attachedResourcePackages.value,
    })),
    sidebar: computed(() => feature.section.value.map(group => ({ ...group, onAction: returnFromFlow,
      lists: group.lists.map(list => ({ ...list, onAction: key => feature.handleListAction(list.key, key) })),
    }))),
    sidebarLayout: { persistenceKey: computed(() => ''), expandOnNarrowViewport: true },
    header: computed(() => ({ title: t('projectTemplates.title'), titleLoading: false, actions: [] })),
  }
  function reset(): void {
    feature.selectedTemplateKey.value = feature.templateStore.templates.value[0]?.key ?? null
    feature.attachedResourcePackagePaths.value = []
    feature.selectedResourcePackageKeys.value = []
    form.reset()
  }
  return { page, reset, busy: feature.isProjectTemplateBusy, importDroppedResourcePackage: feature.importDroppedResourcePackage,
    selectTemplate: (key: ProjectTemplateKey) => { feature.selectedTemplateKey.value = key } }
}
