import { computed, type ComputedRef, type Ref } from 'vue'
import type { OcNodeActionEvent, OcNodeCollection } from '../../../shared/ui/node/node.types'
import type { ShellListGroup } from '../shell.types'
import {
  PROJECT_FILES_LIST_KEY,
  TEMPLATE_COVERS_LIST_KEY,
  TEMPLATE_ENTRIES_LIST_KEY,
} from '../shellSidebarConfig'

type Translate = (key: string, fallback?: string) => string

export interface ExportTemplateSectionOptions {
  translate: Translate
  busy: Readonly<Ref<boolean>>
  projectFolderName: Readonly<Ref<string>>
  projectTreeData: Readonly<Ref<OcNodeCollection>>
  selectedProjectEntryKeys: Readonly<Ref<string[]>>
  expandedKeys: Readonly<Ref<string[]>>
  entryTreeData: Readonly<Ref<OcNodeCollection>>
  coverTreeData: Readonly<Ref<OcNodeCollection>>
  onProjectAction: (event: OcNodeActionEvent) => void
  onSelectionAction: (event: OcNodeActionEvent) => void
  captureProjectTree: (instance: unknown) => void
}

export function createExportTemplateSection(options: ExportTemplateSectionOptions): ComputedRef<ShellListGroup[]> {
  return computed(() => {
    const projectContent = {
      type: 'tree' as const,
      data: options.projectTreeData.value,
      selectedKeys: options.selectedProjectEntryKeys.value,
      expandedKeys: options.expandedKeys.value,
      role: 'tree' as const,
      selectionMode: 'single' as const,
      activationMode: 'none' as const,
      onAction: options.onProjectAction,
      captureInstance: options.captureProjectTree,
    }
    return [{
      key: 'primary',
      transitionKey: 'flow:export-template',
      title: '',
      headButtons: [{
        key: 'return-primary-page',
        icon: 'nav.arrow-left',
        title: options.translate('app.shell.back'),
        disabled: options.busy.value,
      }],
      lists: [
        {
          key: PROJECT_FILES_LIST_KEY,
          title: options.projectFolderName.value || options.translate('sidebar.files'),
          placeholder: options.translate('sidebar.emptyProject', 'Folder is empty'),
          actions: [],
          content: projectContent,
        },
        {
          key: TEMPLATE_ENTRIES_LIST_KEY,
          title: options.translate('projectTemplates.fields.entry'),
          placeholder: options.translate('templateExport.noSelectedEntries'),
          actions: [],
          content: {
            type: 'tree' as const,
            data: options.entryTreeData.value,
            selectedKeys: [],
            role: 'listbox' as const,
            selectionMode: 'none' as const,
            activationMode: 'none' as const,
            onAction: options.onSelectionAction,
          },
        },
        {
          key: TEMPLATE_COVERS_LIST_KEY,
          title: options.translate('projectTemplates.fields.covers'),
          placeholder: options.translate('templateExport.noSelectedCovers'),
          actions: [],
          content: {
            type: 'tree' as const,
            data: options.coverTreeData.value,
            selectedKeys: [],
            role: 'listbox' as const,
            selectionMode: 'none' as const,
            activationMode: 'none' as const,
            onAction: options.onSelectionAction,
          },
        },
      ],
    }]
  })
}
