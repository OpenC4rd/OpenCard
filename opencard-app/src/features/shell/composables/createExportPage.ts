/** 导出空间：侧栏是配置树，内容区编辑当前配置并运行。 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ExportPageContent from '../../exporting/components/ExportPageContent.vue'
import type { OcNode, OcNodeAction, OcNodeActionEvent, OcNodeCollection, OcNodeSelectionEvent } from '../../../shared/ui/node/node.types'
import { useAppStateStore } from '../../app-state/store/appStateStore'
import { createResourcePropertyCapabilities } from '../../workspace/services/propertyResourceCapabilities'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { useProjectStore } from '../../workspace/store/projectStore'
import type { SpacePage } from '../spacePage'
import { useExportPreview, type ExportPreviewOptions } from './useExportPreview'
import { useExportSpace, type ExportSpaceOptions } from './useExportSpace'
import { useShellNavigation } from './useShellNavigation'

const NEW_PROFILE_KEY = 'new-profile'
const DUPLICATE_ACTION_KEY = 'duplicate-profile'
const DELETE_ACTION_KEY = 'delete-profile'
const SUBMIT_ACTION_KEY = 'export.submit'

type ExportPageOptions = Omit<ExportSpaceOptions, 'newProfileName'> & {
  planPreview: ExportPreviewOptions['plan']
  renderPreviewPage: ExportPreviewOptions['renderPage']
  releasePreview: ExportPreviewOptions['release']
}

export function createExportPage(options: ExportPageOptions) {
  const { t } = useI18n()
  const project = useProjectStore()
  const appState = useAppStateStore()
  const navigation = useShellNavigation()
  const space = useExportSpace({ ...options, newProfileName: () => t('projectExport.newProfile') })
  const preview = useExportPreview({
    profile: space.activeProfile,
    active: navigation.isExport,
    spread: computed(() => appState.state.value.layout.exportSpread),
    plan: options.planPreview,
    renderPage: options.renderPreviewPage,
    release: options.releasePreview,
  })

  watch([navigation.isExport, project.projectPath], ([active, path]) => {
    if (active && path) void space.load()
  }, { immediate: true })

  /** 配置里的富文本和卡片共用一套资源：项目图标、字体、图片都从这里选。 */
  const capabilities = computed(() => createResourcePropertyCapabilities({
    projectLabel: t('propertyEditor.references.project'),
    rootPath: project.projectPath.value || null,
    fs: fileSystemService,
    resourceEnvironment: project.projectResourceEnvironment.value,
  }))

  const treeData = computed<OcNodeCollection>(() => {
    const actions: readonly OcNodeAction[] = [
      { key: DUPLICATE_ACTION_KEY, title: t('projectExport.duplicateProfile'), icon: 'mdiContentCopy' },
      { key: DELETE_ACTION_KEY, title: t('projectExport.deleteProfile'), icon: 'mdiTrashCanOutline', iconTone: 'danger' },
    ]
    const profiles = space.profiles.value
    return {
      rootKeys: profiles.map(profile => profile.id),
      items: new Map(profiles.map((profile): [string, OcNode] => [profile.id, {
        label: profile.name || t('projectExport.newProfile'),
        tail: space.busy.value ? [] : [...actions],
        visual: { type: 'icon', icon: profile.rule.kind === 'pdf' ? 'mdiFileImageOutline' : 'mdiImageOutline' },
      }])),
      children: new Map(),
    }
  })

  function handleTreeAction(event: OcNodeActionEvent): void {
    if (space.busy.value) return
    if (event.actionKey === DUPLICATE_ACTION_KEY) space.duplicate(String(event.key))
    else if (event.actionKey === DELETE_ACTION_KEY) space.remove(String(event.key))
  }

  const page: SpacePage = {
    key: 'export',
    navigation: {
      key: 'export', icon: 'mdiPrinter', labelKey: 'app.shell.space.export',
      available: computed(() => Boolean(project.projectPath.value)), unavailableHintKey: 'app.shell.space.needsProject',
    },
    content: ExportPageContent,
    contentProps: computed(() => ({
      profile: space.activeProfile.value, documents: space.documents.value,
      busy: space.busy.value, issue: space.issues.value[0] ?? preview.issue.value,
      capabilities: capabilities.value,
      preview: {
        imageUrls: preview.imageUrls.value, pageIndex: preview.pageIndex.value, pageStep: preview.pageStep.value,
        pageCount: preview.pageCount.value, loading: preview.loading.value,
        spreadAvailable: preview.spreadAvailable.value, spread: appState.state.value.layout.exportSpread,
      },
      onSetSpread: (exportSpread: boolean) => appState.updateLayout({ exportSpread }),
      onUpdate: space.update, onSelectPage: preview.selectPage, editing: space.editing.value, onEdit: space.beginEdit, onCancel: space.cancel,
      onSave: () => { void space.save() }, onSubmit: () => { void space.submit() },
    })),
    sidebar: computed(() => [{
      key: 'export',
      title: t('app.shell.space.export'),
      icon: 'mdiPrinter',
      onAction: key => { if (key === NEW_PROFILE_KEY && !space.busy.value) space.add() },
      headButtons: [{ key: NEW_PROFILE_KEY, icon: 'mdiPlus', title: t('projectExport.newProfile') }],
      lists: [{
        key: 'export-profiles',
        title: t('projectExport.profiles'),
        placeholder: t('projectExport.noProfiles'),
        actions: [],
        content: {
          type: 'tree',
          data: treeData.value,
          selectedKeys: space.activeProfile.value ? [space.activeProfile.value.id] : [],
          role: 'tree',
          selectionMode: 'single',
          onSelectionChange: (event: OcNodeSelectionEvent) => {
            const id = event.selectedKeys[0]
            if (id !== undefined) space.select(String(id))
          },
          onAction: handleTreeAction,
        },
      }],
    }]),
    header: computed(() => ({
      title: space.activeProfile.value?.name || t('app.shell.space.export'),
      titleLoading: false, icon: 'mdiPrinter',
      actions: space.activeProfile.value ? [{
        key: SUBMIT_ACTION_KEY, icon: 'mdiExport', title: t(space.busy.value ? 'projectExport.preparing' : 'projectExport.submit'),
        disabled: space.busy.value || Boolean(preview.issue.value),
      }] : [],
      onAction: (key: string) => { if (key === SUBMIT_ACTION_KEY) void space.submit() },
    })),
  }

  return page
}
