import { computed, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ExportTemplatePageContent from '../../project-templates/components/ExportTemplatePageContent.vue'
import { createTemplateExportForm } from '../../project-templates/composables/createTemplateExportForm'
import { useProjectStore } from '../../workspace/store/projectStore'
import { notifySuccess } from '../../notifications/titlebarNotices'
import type { SpacePage } from '../spacePage'
import type { createWorkbenchPage } from './createWorkbenchPage'
import { useShellNavigation } from './useShellNavigation'
import { useExportTemplatePageState } from './useExportTemplatePageState'
import { useShellProgressTasks } from './useShellProgressTasks'

export function createExportTemplatePage(tree: ReturnType<typeof createWorkbenchPage>['templateTree']) {
  const { t } = useI18n()
  const project = useProjectStore()
  const navigation = useShellNavigation()
  const form = createTemplateExportForm({
    projectPath: project.projectPath, onExported: path => notifySuccess(`${t('templateExport.status.exported')}: ${path}`),
  })
  const busy = form.isBusy
  const { setTask, removeTask } = useShellProgressTasks()
  watch(busy, value => {
    if (value) setTask({ key: 'export-template', title: t('templateExport.status.exporting'), progress: 0, weight: 1 })
    else removeTask('export-template')
  })
  onUnmounted(() => removeTask('export-template'))
  const feature = useExportTemplatePageState({
    projectPath: project.projectPath,
    projectFolderName: computed(() => project.projectPath.value.split(/[/\\]/).filter(Boolean).pop() ?? ''),
    busy, ...tree, translate: t, form,
  })
  const page: SpacePage = {
    key: 'export-template', content: ExportTemplatePageContent,
    contentProps: computed(() => ({ model: form })),
    sidebar: computed(() => feature.section.value.map(group => ({ ...group, onAction: navigation.returnFromFlow }))),
    header: computed(() => ({ title: t('templateExport.title'), titleLoading: false, actions: [] })),
  }
  async function open(): Promise<void> {
    if (!project.projectPath.value) return
    await form.reset()
    await project.readDirectoryEntries('')
    navigation.location.value = { base: navigation.location.value.base, flow: { type: 'export-template' } }
  }
  watch(project.projectPath, () => { void form.reset(false) })
  return { page, busy, open }
}
