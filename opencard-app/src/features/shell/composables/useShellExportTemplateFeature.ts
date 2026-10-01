import { computed, ref, type Ref } from 'vue'
import type { OcNodeActionEvent, OcNodeCollection } from '../../../shared/ui/node/node.types'
import type { TemplateExportSelection } from '../../project-templates/model/projectTemplate'
import ExportTemplateWorkspace from '../../project-templates/components/ExportTemplateWorkspace.vue'
import { resolveFileType } from '../../workspace/model/fileTypes'
import { CARD_DOCUMENT_SUFFIX } from '../../workspace/model/fileTypes'
import { normalizeNodeTail } from '../../../shared/ui/node/node.types'
import {
  TEMPLATE_COVER_ADD_ACTION_KEY,
  TEMPLATE_COVER_REMOVE_ACTION_KEY,
  TEMPLATE_COVER_TREE_PREFIX,
  TEMPLATE_ENTRY_ADD_ACTION_KEY,
  TEMPLATE_ENTRY_REMOVE_ACTION_KEY,
  TEMPLATE_ENTRY_TREE_PREFIX,
  TEMPLATE_EXCLUDE_ACTION_KEY,
  TEMPLATE_INCLUDE_ACTION_KEY,
  createExportSelectionTreeData,
  createExportTemplateTreeData,
} from '../shellCatalogProjections'
import { createExportTemplateSection } from '../sections/exportTemplateSection'

export function useShellExportTemplateFeature(options: {
  projectPath: Readonly<Ref<string>>
  projectFolderName: Readonly<Ref<string>>
  busy: Ref<boolean>
  projectTreeData: Readonly<Ref<OcNodeCollection>>
  selectedProjectEntryKeys: Readonly<Ref<string[]>>
  translate: (key: string, params?: Record<string, unknown> | string) => string
  workspaceRef: Ref<InstanceType<typeof ExportTemplateWorkspace> | null>
  captureProjectTree: (instance: unknown) => void
}) {
  const selection = ref<TemplateExportSelection>({ excludedPaths: [], entries: [], entryNames: {}, covers: [] })
  const busy = options.busy
  function normalizeTreePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/+$/, '') }
  function relativePath(key: string): string {
    const root = normalizeTreePath(options.projectPath.value)
    const normalized = normalizeTreePath(key)
    return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized
  }
  const treeData = computed(() => createExportTemplateTreeData(
    options.projectTreeData.value, selection.value, relativePath,
    key => resolveFileType(key).id, options.translate, CARD_DOCUMENT_SUFFIX, normalizeNodeTail,
  ))
  const expandedKeys = computed(() => [...options.projectTreeData.value.children.keys()])
  const entryTreeData = computed(() => createExportSelectionTreeData(
    selection.value.entries, TEMPLATE_ENTRY_TREE_PREFIX, 'file.opencard',
    { key: TEMPLATE_ENTRY_REMOVE_ACTION_KEY, title: options.translate('templateExport.tree.removeEntry'), icon: 'action.file-minus' },
    selection.value.entryNames,
  ))
  const coverTreeData = computed(() => createExportSelectionTreeData(
    selection.value.covers, TEMPLATE_COVER_TREE_PREFIX, 'file.image',
    { key: TEMPLATE_COVER_REMOVE_ACTION_KEY, title: options.translate('templateExport.tree.removeCover'), icon: 'action.image-minus' },
  ))
  function reset(): void { selection.value = { excludedPaths: [], entries: [], entryNames: {}, covers: [] } }
  function handleProjectAction(event: OcNodeActionEvent): void {
    const path = relativePath(event.key)
    if (event.actionKey === TEMPLATE_EXCLUDE_ACTION_KEY || event.actionKey === TEMPLATE_INCLUDE_ACTION_KEY) options.workspaceRef.value?.togglePathIncluded(path)
    else if (event.actionKey === TEMPLATE_COVER_ADD_ACTION_KEY || event.actionKey === TEMPLATE_COVER_REMOVE_ACTION_KEY) options.workspaceRef.value?.toggleCover(path)
    else if (event.actionKey === TEMPLATE_ENTRY_ADD_ACTION_KEY || event.actionKey === TEMPLATE_ENTRY_REMOVE_ACTION_KEY) options.workspaceRef.value?.toggleEntry(path)
  }
  function handleSelectionAction(event: OcNodeActionEvent): void {
    if (event.key.startsWith(TEMPLATE_ENTRY_TREE_PREFIX)) options.workspaceRef.value?.toggleEntry(event.key.slice(TEMPLATE_ENTRY_TREE_PREFIX.length))
    else if (event.key.startsWith(TEMPLATE_COVER_TREE_PREFIX)) options.workspaceRef.value?.toggleCover(event.key.slice(TEMPLATE_COVER_TREE_PREFIX.length))
  }
  const section = createExportTemplateSection({
    translate: options.translate,
    busy,
    projectFolderName: options.projectFolderName,
    projectTreeData: treeData,
    selectedProjectEntryKeys: options.selectedProjectEntryKeys,
    expandedKeys,
    entryTreeData,
    coverTreeData,
    onProjectAction: handleProjectAction,
    onSelectionAction: handleSelectionAction,
    captureProjectTree: options.captureProjectTree,
  })
  return { section, selection, busy, treeData, expandedKeys, entryTreeData, coverTreeData, reset, handleProjectAction, handleSelectionAction }
}
