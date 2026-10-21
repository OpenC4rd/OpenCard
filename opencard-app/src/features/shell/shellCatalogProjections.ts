import type { ProjectTemplate, TemplateCatalogWarning } from '../project-templates/model/projectTemplate'
import { resolveProjectTemplateName } from '../project-templates/model/projectTemplate'
import type { StoredResourcePackage, StoredResourcePackageWarning } from '../workspace/model/storedResourcePackage'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type { OcNode, OcNodeAction, OcNodeCollection, OcNodeTailPart } from '../../shared/ui/node/node.types'

export const TEMPLATE_REMOVE_ACTION_KEY = 'template.remove'
export const ATTACH_RESOURCE_PACKAGE_ACTION_KEY = 'resource-package.attach'
export const ATTACHED_RESOURCE_PACKAGE_ACTION_KEY = 'resource-package.attached'
export const REMOVE_RESOURCE_PACKAGE_ACTION_KEY = 'resource-package.remove'
export const RECENT_PROJECT_OPEN_ACTION_KEY = 'recent-project.open'
export const RECENT_PROJECT_REVEAL_ACTION_KEY = 'recent-project.reveal'
export const RECENT_PROJECT_RELOCATE_ACTION_KEY = 'recent-project.relocate'
export const RECENT_PROJECT_REMOVE_ACTION_KEY = 'recent-project.remove'
export const TEMPLATE_EXCLUDE_ACTION_KEY = 'template.exclude'
export const TEMPLATE_INCLUDE_ACTION_KEY = 'template.include'
export const TEMPLATE_COVER_ADD_ACTION_KEY = 'template.cover.add'
export const TEMPLATE_COVER_REMOVE_ACTION_KEY = 'template.cover.remove'
export const TEMPLATE_ENTRY_ADD_ACTION_KEY = 'template.entry.add'
export const TEMPLATE_ENTRY_REMOVE_ACTION_KEY = 'template.entry.remove'
export const TEMPLATE_ENTRY_TREE_PREFIX = 'template-entry:'
export const TEMPLATE_COVER_TREE_PREFIX = 'template-cover:'

export type ShellCatalogLabels = (key: string, params?: Record<string, unknown>) => string

function unusableCatalogItem(warning: { path: string; reason: string }, remove?: OcNodeAction): OcNode {
  return {
    label: warning.path.split(/[/\\]/).filter(Boolean).pop() ?? warning.path,
    tone: 'danger', disabled: true, disabledReason: warning.reason,
    visual: { type: 'icon', icon: 'mdiAlertCircleOutline', iconTone: 'danger' },
    ...(remove ? { tail: [remove] } : {}),
  }
}

export function createTemplateTreeData(
  builtinTemplates: readonly ProjectTemplate[],
  userTemplates: readonly ProjectTemplate[],
  locale: string,
  translate: ShellCatalogLabels,
  groups: { builtin: string; user: string },
  warnings: readonly TemplateCatalogWarning[],
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const children = new Map<string, readonly string[]>()
  for (const [groupKey, templates, removable, emptyLabel] of [
    [groups.builtin, builtinTemplates, false, 'projectTemplates.status.noBuiltinTemplates'],
    [groups.user, userTemplates, true, 'projectTemplates.status.noUserTemplates'],
  ] as const) {
    items.set(groupKey, { label: translate(groupKey === groups.builtin ? 'projectTemplates.sections.builtinTemplates' : 'projectTemplates.sections.userTemplates'), visual: { type: 'icon', icon: 'mdiZipBoxOutline' } })
    const unusable = removable ? warnings : []
    if (!templates.length && !unusable.length) {
      const emptyKey = `${groupKey}:empty`
      items.set(emptyKey, { label: translate(emptyLabel), visual: { type: 'icon', icon: 'mdiFileOutline' }, disabled: true })
      children.set(groupKey, [emptyKey])
      continue
    }
    children.set(groupKey, [...templates.map(template => template.key), ...unusable.map(warning => warning.path)])
    for (const warning of unusable) items.set(warning.path, unusableCatalogItem(warning, {
      key: TEMPLATE_REMOVE_ACTION_KEY, title: translate('projectTemplates.actions.delete'), icon: 'mdiTrashCanOutline', iconTone: 'danger', alwaysVisible: true,
    }))
    for (const template of templates) items.set(template.key, {
      label: resolveProjectTemplateName(template, locale),
      visual: { type: 'icon', icon: 'mdiZipBoxOutline' },
      ...(removable ? { tail: [{ key: TEMPLATE_REMOVE_ACTION_KEY, title: translate('projectTemplates.actions.delete'), icon: 'mdiTrashCanOutline', iconTone: 'danger' } satisfies OcNodeAction] } : {}),
    })
  }
  return { rootKeys: [groups.builtin, groups.user], items, children }
}

export function createRecentProjectTreeData(
  paths: readonly string[],
  availability: ReadonlyMap<string, boolean>,
  recentProjectKey: (path: string) => string,
  translate: ShellCatalogLabels,
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const rootKeys = paths.map(path => {
    const key = recentProjectKey(path)
    const isMissing = availability.get(key) === false
    const actions: OcNodeAction[] = [isMissing
      ? { key: RECENT_PROJECT_RELOCATE_ACTION_KEY, title: translate('sidebar.relocateRecentProject'), icon: 'mdiFolderOpenOutline' }
      : { key: RECENT_PROJECT_OPEN_ACTION_KEY, title: translate('sidebar.openRecentProject'), icon: 'mdiPlayOutline', iconTone: 'success' }]
    if (!isMissing) actions.push({ key: RECENT_PROJECT_REVEAL_ACTION_KEY, title: translate('sidebar.fileActions.reveal'), icon: 'mdiFolderOpenOutline' })
    actions.push({ key: RECENT_PROJECT_REMOVE_ACTION_KEY, title: translate('sidebar.removeRecentProject'), icon: 'mdiClose' })
    items.set(key, {
      label: path.split(/[/\\]/).filter(Boolean).pop() || path,
      tail: [path, ...actions],
      visual: { type: 'icon', icon: isMissing ? 'mdiFolderAlertOutline' : 'mdiFolderOpenOutline', ...(isMissing ? { iconTone: 'warning' as const } : {}) },
    })
    return key
  })
  return { rootKeys, items, children: new Map() }
}

export function createResourcePackageTreeData(
  builtinPacks: readonly StoredResourcePackage[],
  storedPacks: readonly StoredResourcePackage[],
  attachedPaths: readonly string[],
  translate: ShellCatalogLabels,
  groups: { builtin: string; stored: string },
  warnings: { builtin: readonly StoredResourcePackageWarning[]; stored: readonly StoredResourcePackageWarning[] },
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const children = new Map<string, readonly string[]>()
  const removeAction: OcNodeAction = { key: REMOVE_RESOURCE_PACKAGE_ACTION_KEY, title: translate('projectTemplates.actions.removeResourcePackage'), icon: 'mdiTrashCanOutline', iconTone: 'danger' }
  for (const [groupKey, label, packs, removable] of [
    [groups.builtin, translate('projectTemplates.sections.builtinPackages'), builtinPacks, false],
    [groups.stored, translate('projectTemplates.sections.storedPackages'), storedPacks, true],
  ] as const) {
    items.set(groupKey, { label, visual: { type: 'icon', icon: 'mdiPackageVariantClosed' } })
    const unusable = removable ? warnings.stored : warnings.builtin
    if (packs.length === 0 && unusable.length === 0) {
      const emptyKey = `${groupKey}:empty`
      items.set(emptyKey, { label: translate(removable ? 'projectTemplates.status.noStoredResourcePackages' : 'projectTemplates.status.noBuiltinResourcePackages'), visual: { type: 'icon', icon: 'mdiFileOutline' }, disabled: true })
      children.set(groupKey, [emptyKey])
      continue
    }
    children.set(groupKey, [...packs.map(pack => pack.path), ...unusable.map(warning => warning.path)])
    for (const warning of unusable) items.set(warning.path, unusableCatalogItem(warning, removable ? { ...removeAction, alwaysVisible: true } : undefined))
    for (const pack of packs) {
      const isAttached = attachedPaths.includes(pack.path)
      items.set(pack.path, {
        label: pack.title,
        visual: { type: 'icon', icon: 'mdiPackageVariantClosed' },
        tail: [isAttached
          ? { key: ATTACHED_RESOURCE_PACKAGE_ACTION_KEY, title: translate('projectTemplates.actions.detachResourcePackage'), icon: 'mdiCheck', iconTone: 'success', alwaysVisible: true }
          : { key: ATTACH_RESOURCE_PACKAGE_ACTION_KEY, title: translate('projectTemplates.actions.attachResourcePackage'), icon: 'mdiPlus', alwaysVisible: true },
        ...(removable ? [removeAction] : [])],
      })
    }
  }
  return { rootKeys: [groups.builtin, groups.stored], items, children }
}

export function createExportSelectionTreeData(
  paths: readonly string[],
  prefix: string,
  icon: IconToken,
  removeAction: OcNodeAction,
  labels: Readonly<Record<string, string>> = {},
): OcNodeCollection {
  return {
    rootKeys: paths.map(path => `${prefix}${path}`),
    items: new Map(paths.map(path => [`${prefix}${path}`, { label: labels[path] ?? path, visual: { type: 'icon', icon }, tail: [removeAction] }])),
    children: new Map(),
  }
}

export function createExportTemplateTreeData(
  projectTree: OcNodeCollection,
  selection: { excludedPaths: readonly string[]; covers: readonly string[]; entries: readonly string[] },
  relativePath: (key: string) => string,
  fileType: (key: string) => string,
  translate: ShellCatalogLabels,
  cardSuffix: string,
  normalizeTail: (tail: OcNode['tail']) => readonly OcNodeTailPart[],
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  for (const [key, item] of projectTree.items) {
    const path = relativePath(key)
    const isProjectFile = ['project.json', 'locale.json', 'fonts/fonts.json', 'icons/icons.json'].includes(path)
    const isRuntimeCache = path === '.opencard-cache' || path.startsWith('.opencard-cache/')
    const isExcluded = isRuntimeCache
      || selection.excludedPaths.some(excluded => path === excluded || path.startsWith(`${excluded}/`))
    const actions: OcNodeAction[] = []
    if (!isProjectFile && !isRuntimeCache) actions.push({
      key: isExcluded ? TEMPLATE_INCLUDE_ACTION_KEY : TEMPLATE_EXCLUDE_ACTION_KEY,
      title: translate(isExcluded ? 'templateExport.tree.include' : 'templateExport.tree.exclude'),
      icon: isExcluded ? 'mdiEyeOutline' : 'mdiEyeOffOutline',
    })
    if (!isExcluded && fileType(key) === 'image') actions.push({
      key: selection.covers.includes(path) ? TEMPLATE_COVER_REMOVE_ACTION_KEY : TEMPLATE_COVER_ADD_ACTION_KEY,
      title: translate(selection.covers.includes(path) ? 'templateExport.tree.removeCover' : 'templateExport.tree.addCover'),
      icon: selection.covers.includes(path) ? 'mdiImageMinusOutline' : 'mdiImagePlusOutline',
    })
    if (!isExcluded && path.toLowerCase().endsWith(cardSuffix)) actions.push({
      key: selection.entries.includes(path) ? TEMPLATE_ENTRY_REMOVE_ACTION_KEY : TEMPLATE_ENTRY_ADD_ACTION_KEY,
      title: translate(selection.entries.includes(path) ? 'templateExport.tree.removeEntry' : 'templateExport.tree.addEntry'),
      icon: selection.entries.includes(path) ? 'mdiFileMinusOutline' : 'mdiFilePlusOutline',
    })
    items.set(key, {
      ...item,
      visual: isExcluded && item.visual?.type === 'icon' ? { ...item.visual, iconTone: 'muted' } : item.visual,
      disabled: isRuntimeCache,
      disabledReason: isRuntimeCache ? translate('templateExport.tree.runtimeCache') : undefined,
      tail: [...normalizeTail(item.tail), ...actions],
    })
  }
  return { rootKeys: projectTree.rootKeys, items, children: projectTree.children }
}
