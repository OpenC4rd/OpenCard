import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeSelectionEvent,
} from '../../../shared/ui/node/node.types'
import type { ProjectTemplateKey } from '../../project-templates/model/projectTemplate'
import type { StoredResourcePackageStore } from '../../workspace/store/storedResourcePackageStore'
import type { ShellListGroup } from '../shell.types'
import {
  DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
  IMPORT_RESOURCE_PACKAGE_ACTION_KEY,
  RESOURCE_PACKAGES_LIST_KEY,
  TEMPLATES_LIST_KEY,
  USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
  USER_TEMPLATES_GROUP_KEY,
} from '../shellSidebarConfig'

type Translate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string

export interface CreateProjectSectionOptions {
  translate: Translate
  busy: Readonly<Ref<boolean>>
  templateTreeData: Readonly<Ref<OcNodeCollection>>
  selectedTemplateKey: Readonly<Ref<ProjectTemplateKey | null>>
  templateExpandedKeys?: Readonly<Ref<readonly string[]>>
  onTemplateExpansionChange?: (event: OcNodeExpansionEvent) => void
  onTemplateSelectionChange: (event: OcNodeSelectionEvent) => Promise<void>
  onTemplateAction: (event: OcNodeActionEvent) => Promise<void>
  resourcePackageStore: Pick<StoredResourcePackageStore, 'isLoading'>
  resourcePackageTreeData: Readonly<Ref<OcNodeCollection>>
  resourcePackageExpandedKeys?: Readonly<Ref<readonly string[]>>
  onResourcePackageExpansionChange?: (event: OcNodeExpansionEvent) => void
  resourcePackageSelection?: {
    selectedKeys: Readonly<Ref<readonly string[]>>
    canUse: Readonly<Ref<boolean>>
    canDisable: Readonly<Ref<boolean>>
    onChange: (event: OcNodeSelectionEvent) => void
  }
  onResourcePackageAction: (event: OcNodeActionEvent) => void
}

export function createCreateProjectSection(options: CreateProjectSectionOptions): ComputedRef<ShellListGroup[]> {
  return computed(() => [{
    key: 'primary',
    transitionKey: 'flow:create-project',
    title: '',
    headButtons: [{
      key: 'return-primary-page',
      icon: 'nav.arrow-left',
      title: options.translate('app.shell.back'),
      disabled: options.busy.value,
    }],
    lists: [
      {
        key: TEMPLATES_LIST_KEY,
        title: options.translate('projectTemplates.sections.templates'),
        placeholder: '',
        actions: [],
        content: {
          type: 'tree' as const,
          data: options.templateTreeData.value,
          selectedKeys: options.selectedTemplateKey.value ? [options.selectedTemplateKey.value] : [],
          expandedKeys: options.templateExpandedKeys?.value ?? [USER_TEMPLATES_GROUP_KEY],
          role: 'tree' as const,
          selectionMode: 'single' as const,
          activationMode: 'none' as const,
          onSelectionChange: options.onTemplateSelectionChange,
          onExpansionChange: options.onTemplateExpansionChange,
          onAction: options.onTemplateAction,
        },
      },
      {
        key: RESOURCE_PACKAGES_LIST_KEY,
        title: options.translate('projectTemplates.sections.resourcePackages'),
        placeholder: options.resourcePackageStore.isLoading.value
          ? options.translate('projectTemplates.status.loadingResourcePackages')
          : options.translate('projectTemplates.status.noResourcePackages'),
        actions: [
          {
            key: IMPORT_RESOURCE_PACKAGE_ACTION_KEY,
            icon: 'action.import',
            hoverTip: options.translate('projectTemplates.actions.importResourcePackage'),
            disabled: options.busy.value || options.resourcePackageStore.isLoading.value,
          },
          {
            key: USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
            icon: 'action.check',
            hoverTip: options.translate('projectTemplates.actions.useSelectedResourcePackages'),
            disabled: options.busy.value || options.resourcePackageStore.isLoading.value
              || options.resourcePackageSelection?.canUse.value !== true,
          },
          {
            key: DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
            icon: 'action.close',
            hoverTip: options.translate('projectTemplates.actions.disableSelectedResourcePackages'),
            disabled: options.busy.value || options.resourcePackageStore.isLoading.value
              || options.resourcePackageSelection?.canDisable.value !== true,
          },
        ],
        content: {
          type: 'tree' as const,
          data: options.resourcePackageTreeData.value,
          expandedKeys: options.resourcePackageExpandedKeys?.value ?? [],
          role: 'listbox' as const,
          selectionMode: options.resourcePackageSelection ? 'multiple' : 'none',
          selectedKeys: options.resourcePackageSelection?.selectedKeys.value ?? [],
          activationMode: 'none' as const,
          onSelectionChange: options.resourcePackageSelection?.onChange,
          onExpansionChange: options.onResourcePackageExpansionChange,
          onAction: options.onResourcePackageAction,
        },
      },
    ],
  }])
}
