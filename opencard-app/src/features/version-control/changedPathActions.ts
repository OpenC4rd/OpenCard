/**
 * 模块说明：
 * - 给改动列表的节点补上交互：每行的勾选框，以及右键菜单里的放弃更改与各类忽略。
 * - 节点的标题、图标、状态徽标仍由改动路径投影给出，这里只加交互，不改呈现。
 * 职责边界：
 * - 只做投影：勾选状态由调用方判断，动作由调用方处理，这里不读写版本库。
 */
import type {
  OcNode,
  OcNodeAction,
  OcNodeCollection,
  OcNodeContextEntry,
  OcNodeKey,
} from '../../shared/ui/node/node.types'
import { normalizeNodeTail } from '../../shared/ui/node/node.types'
import { CHANGED_FOLDER_KEY_MARK } from './changedPathTree'
import { gitignorePatternForExtension, ignoreFolderLevelsFor } from './gitignorePatterns'
import type { GitStatusEntry } from './git.types'

export const CHANGE_SELECT_ACTION_KEY = 'changes.select'
export const CHANGE_DESELECT_ACTION_KEY = 'changes.deselect'
export const CHANGE_DISCARD_ACTION_KEY = 'changes.discard'
export const CHANGE_IGNORE_FILE_ACTION_KEY = 'changes.ignore-file'
export const CHANGE_IGNORE_EXTENSION_ACTION_KEY = 'changes.ignore-extension'
/** 忽略文件夹这一项本身（它只展开子菜单，被点击的是下面带路径的那些）。 */
export const CHANGE_IGNORE_FOLDER_ACTION_KEY = 'changes.ignore-folder'
/** 忽略某一层目录：key 的后面接着那一层的相对路径。 */
export const CHANGE_IGNORE_FOLDER_PREFIX = 'changes.ignore-folder:'

/** 点目录分组行与未跟踪目录行都是"一整块"：勾选与放弃作用在它整棵子树上。 */
function isContainerKey(key: OcNodeKey): boolean {
  return key.startsWith(CHANGED_FOLDER_KEY_MARK) || key.endsWith('/')
}

/** 一个节点代表的改动路径：容器行是它整棵子树，文件行就是它自己。 */
export function changedPathsUnder(collection: OcNodeCollection, key: OcNodeKey): string[] {
  const children = collection.children.get(key)
  if (!children || children.length === 0) return [key]
  return children.flatMap(child => changedPathsUnder(collection, child))
}

/** HEAD 里没有版本的内容：未跟踪的文件、未跟踪的整条目录，以及刚加进索引的新文件。 */
export function isNewChangePath(entry: GitStatusEntry | undefined): boolean {
  return Boolean(entry?.worktreeNew || entry?.indexNew)
}

/** 冲突中的条目要先解决冲突：放弃与忽略都不提供。 */
function isConflictedChangePath(entry: GitStatusEntry | undefined): boolean {
  return Boolean(entry?.conflicted)
}

/**
 * 一条"放弃更改"要处理的路径：HEAD 里有版本的按恢复处理，新增的按移入回收站处理；
 * 冲突中的路径两边都不进——放弃解决不了冲突。
 */
export function resolveDiscardTargets(
  collection: OcNodeCollection,
  statusEntries: readonly GitStatusEntry[],
  key: OcNodeKey,
): { tracked: string[], untracked: string[] } {
  const entries = new Map(statusEntries.map(entry => [entry.path, entry]))
  const tracked: string[] = []
  const untracked: string[] = []
  for (const path of changedPathsUnder(collection, key)) {
    const entry = entries.get(path)
    if (isConflictedChangePath(entry)) continue
    if (isNewChangePath(entry)) untracked.push(path)
    else tracked.push(path)
  }
  return { tracked, untracked }
}

export function decorateChangedPathTree(
  collection: OcNodeCollection,
  options: {
    statusEntries: readonly GitStatusEntry[]
    isSelected: (path: string) => boolean
    translate: (key: string, params?: Record<string, unknown>) => string
  },
): OcNodeCollection {
  const t = options.translate
  const entries = new Map(options.statusEntries.map(entry => [entry.path, entry]))
  const items = new Map<OcNodeKey, OcNode>()
  const selectAction: OcNodeAction = {
    key: CHANGE_SELECT_ACTION_KEY,
    title: t('sidebar.changesSelect'),
    icon: 'action.checkbox-blank',
  }
  const deselectAction: OcNodeAction = {
    key: CHANGE_DESELECT_ACTION_KEY,
    title: t('sidebar.changesDeselect'),
    icon: 'action.checkbox-marked',
  }
  const discardAction: OcNodeAction = {
    key: CHANGE_DISCARD_ACTION_KEY,
    title: t('sidebar.changesDiscard'),
    icon: 'action.discard',
    iconTone: 'danger',
  }

  for (const [key, node] of collection.items) {
    const container = isContainerKey(key)
    const paths = changedPathsUnder(collection, key)
    const selected = container
      ? paths.length > 0 && paths.every(path => options.isSelected(path))
      : options.isSelected(key)
    const contextActions: OcNodeContextEntry[] = []

    if (paths.some(path => !isConflictedChangePath(entries.get(path)))) {
      contextActions.push(discardAction)
    }
    if (!container) {
      if (isNewChangePath(entries.get(key))) {
        contextActions.push({
          key: CHANGE_IGNORE_FILE_ACTION_KEY,
          title: t('sidebar.changesIgnoreFile'),
          icon: 'status.eye-off',
        })
      }
      const extensionPattern = gitignorePatternForExtension(key)
      if (extensionPattern) {
        contextActions.push({
          key: CHANGE_IGNORE_EXTENSION_ACTION_KEY,
          title: t('sidebar.changesIgnoreExtension', { pattern: extensionPattern }),
          icon: 'status.eye-off',
        })
      }
    }
    const folderLevels = ignoreFolderLevelsFor(container ? paths : [key])
    if (folderLevels.length > 0) {
      contextActions.push({
        key: CHANGE_IGNORE_FOLDER_ACTION_KEY,
        title: t('sidebar.changesIgnoreFolder'),
        icon: 'status.eye-off',
        children: folderLevels.map(level => ({
          key: `${CHANGE_IGNORE_FOLDER_PREFIX}${level}`,
          title: level,
          icon: 'status.eye-off',
        })),
      })
    }

    items.set(key, {
      ...node,
      tail: [...normalizeNodeTail(node.tail), selected ? deselectAction : selectAction],
      ...(contextActions.length > 0 ? { contextActions } : {}),
    })
  }

  return { rootKeys: collection.rootKeys, items, children: collection.children }
}
