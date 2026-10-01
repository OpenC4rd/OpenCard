import type { ProjectTemplate } from '../project-templates/model/projectTemplate'
import { resolveProjectTemplateName } from '../project-templates/model/projectTemplate'
import type { StoredResourcePackage } from '../workspace/model/storedResourcePackage'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type { OcNode, OcNodeAction, OcNodeCollection, OcNodeTailPart } from '../../shared/ui/node/node.types'

export const IMPORT_TEMPLATE_ACTION_KEY = 'import-template'
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

export function createTemplateItems(
  templates: readonly ProjectTemplate[],
  removable: boolean,
  locale: string,
  translate: ShellCatalogLabels,
): Map<string, OcNode> {
  const removeAction: OcNodeAction = {
    key: TEMPLATE_REMOVE_ACTION_KEY,
    title: translate('projectTemplates.actions.delete'),
    icon: 'action.delete',
    iconTone: 'danger',
  }
  return new Map(templates.map(template => [template.key, {
    label: resolveProjectTemplateName(template, locale),
    visual: { type: 'icon' as const, icon: 'file.opencard' as const },
    ...(removable ? { tail: [removeAction] } : {}),
  }]))
}

export function createEmptyCatalogItem(key: string, label: string): [string, OcNode] {
  return [key, { label, visual: { type: 'icon', icon: 'file.generic' }, disabled: true }]
}

export function createTemplateTreeData(
  builtinTemplates: readonly ProjectTemplate[],
  userTemplates: readonly ProjectTemplate[],
  locale: string,
  translate: ShellCatalogLabels,
  groups: { builtin: string; user: string },
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const children = new Map<string, readonly string[]>()
  for (const [groupKey, templates, removable, actions, emptyLabel] of [
    [groups.builtin, builtinTemplates, false, [] as OcNodeAction[], 'projectTemplates.status.noBuiltinTemplates'],
    [groups.user, userTemplates, true, [{ key: IMPORT_TEMPLATE_ACTION_KEY, title: translate('projectTemplates.actions.import'), icon: 'action.import' }], 'projectTemplates.status.noUserTemplates'],
  ] as const) {
    items.set(groupKey, { label: translate(groupKey === groups.builtin ? 'projectTemplates.sections.builtinTemplates' : 'projectTemplates.sections.user'), visual: { type: 'icon', icon: 'file.package' }, ...(actions.length ? { tail: actions } : {}) })
    if (!templates.length) {
      const [emptyKey, emptyNode] = createEmptyCatalogItem(`${groupKey}:empty`, translate(emptyLabel))
      items.set(emptyKey, emptyNode)
      children.set(groupKey, [emptyKey])
      continue
    }
    children.set(groupKey, templates.map(template => template.key))
    for (const [key, node] of createTemplateItems(templates, removable, locale, translate)) items.set(key, node)
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
      ? { key: RECENT_PROJECT_RELOCATE_ACTION_KEY, title: translate('sidebar.relocateRecentProject'), icon: 'status.folder-open' }
      : { key: RECENT_PROJECT_OPEN_ACTION_KEY, title: translate('sidebar.openRecentProject'), icon: 'action.play', iconTone: 'success' }]
    if (!isMissing) actions.push({ key: RECENT_PROJECT_REVEAL_ACTION_KEY, title: translate('sidebar.fileActions.reveal'), icon: 'status.folder-open' })
    actions.push({ key: RECENT_PROJECT_REMOVE_ACTION_KEY, title: translate('sidebar.removeRecentProject'), icon: 'action.close' })
    items.set(key, {
      label: path.split(/[/\\]/).filter(Boolean).pop() || path,
      tail: [path, ...actions],
      visual: { type: 'icon', icon: isMissing ? 'status.folder-alert' : 'status.folder-open', ...(isMissing ? { iconTone: 'warning' as const } : {}) },
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
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const children = new Map<string, readonly string[]>()
  const removeAction: OcNodeAction = { key: REMOVE_RESOURCE_PACKAGE_ACTION_KEY, title: translate('projectTemplates.actions.removeResourcePackage'), icon: 'action.delete', iconTone: 'danger' }
  for (const [groupKey, label, packs, removable] of [
    [groups.builtin, translate('projectTemplates.sections.builtinPackages'), builtinPacks, false],
    [groups.stored, translate('projectTemplates.sections.userPackages'), storedPacks, true],
  ] as const) {
    items.set(groupKey, { label, visual: { type: 'icon', icon: 'file.package' } })
    if (packs.length === 0) {
      const emptyKey = `${groupKey}:empty`
      items.set(emptyKey, { label: translate(removable ? 'projectTemplates.status.noStoredResourcePackages' : 'projectTemplates.status.noBuiltinResourcePackages'), visual: { type: 'icon', icon: 'file.generic' }, disabled: true })
      children.set(groupKey, [emptyKey])
      continue
    }
    children.set(groupKey, packs.map(pack => pack.path))
    for (const pack of packs) {
      const isAttached = attachedPaths.includes(pack.path)
      items.set(pack.path, {
        label: pack.title,
        visual: { type: 'icon', icon: 'file.package' },
        tail: [isAttached
          ? { key: ATTACHED_RESOURCE_PACKAGE_ACTION_KEY, title: translate('projectTemplates.actions.detachResourcePackage'), icon: 'action.check', iconTone: 'success' }
          : { key: ATTACH_RESOURCE_PACKAGE_ACTION_KEY, title: translate('projectTemplates.actions.attachResourcePackage'), icon: 'action.add' },
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
      icon: isExcluded ? 'status.eye' : 'status.eye-off',
    })
    if (!isExcluded && fileType(key) === 'image') actions.push({
      key: selection.covers.includes(path) ? TEMPLATE_COVER_REMOVE_ACTION_KEY : TEMPLATE_COVER_ADD_ACTION_KEY,
      title: translate(selection.covers.includes(path) ? 'templateExport.tree.removeCover' : 'templateExport.tree.addCover'),
      icon: selection.covers.includes(path) ? 'action.image-minus' : 'action.image-plus',
    })
    if (!isExcluded && path.toLowerCase().endsWith(cardSuffix)) actions.push({
      key: selection.entries.includes(path) ? TEMPLATE_ENTRY_REMOVE_ACTION_KEY : TEMPLATE_ENTRY_ADD_ACTION_KEY,
      title: translate(selection.entries.includes(path) ? 'templateExport.tree.removeEntry' : 'templateExport.tree.addEntry'),
      icon: selection.entries.includes(path) ? 'action.file-minus' : 'action.file-plus',
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
