/**
 * 模块说明：
 * - 把改动路径投影成列表树：节点标题优先只显示文件名，位于点开头目录中的文件各自收进一个子节点。
 * - 同一层里出现同名文件时，只给重名的那些补上"够区分的最近一级目录"，避免标题重复、又不把标题拉长。
 * 职责边界：
 * - 只负责路径到节点结构的投影；图标、徽章等节点内容由调用方给出。
 */
import type { OcNode, OcNodeCollection } from '../../shared/ui/node/node.types'

/** 点目录分组节点 key 里固定出现的一段，便于调用方识别分组。 */
export const CHANGED_FOLDER_KEY_MARK = 'folder:'

export type ChangedPathEntry = {
  /** 项目相对路径，例如 `.opencard/icons/logo.svg`。 */
  path: string
  /** 该文件在树里显示的内容（图标、徽章等）；标题由这里统一改写。 */
  node: OcNode
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

/**
 * 文件节点 key：没有前缀时就是相对路径本身，调用方可以直接把它当路径用；
 * 提交清单里同一个文件会在多个提交下出现，那时才需要加上提交 id 做前缀。
 */
function nodeKey(keyPrefix: string, path: string): string {
  return keyPrefix ? `${keyPrefix}:${path}` : path
}

/**
 * 找出路径里第一个点开头的目录名；文件名自身以点开头（如 `.gitignore`）不算目录。
 * 返回 null 表示这个文件不属于任何点目录，直接挂在根上。
 */
function dotFolderOf(path: string): string | null {
  const segments = path.split('/')
  return segments.slice(0, -1).find(segment => segment.startsWith('.')) ?? null
}

/** 分组内显示的相对路径：去掉所属点目录之前的部分（含目录本身）。 */
function relativeToFolder(path: string, folder: string): string {
  const segments = path.split('/')
  const folderIndex = segments.indexOf(folder)
  return segments.slice(folderIndex + 1).join('/') || fileName(path)
}

/**
 * 同一层的标题：默认就是文件名，只有重名的那几个才补上级目录，
 * 直到能区分开为止（例如 `icons/logo.svg` 与 `photos/logo.svg`）。
 */
export function uniqueChangedLabels(relativePaths: readonly string[]): string[] {
  const names = relativePaths.map(fileName)
  const occurrences = new Map<string, number>()
  for (const name of names) occurrences.set(name, (occurrences.get(name) ?? 0) + 1)

  return relativePaths.map((path, index) => {
    const name = names[index]!
    if ((occurrences.get(name) ?? 0) <= 1) return name
    const segments = path.split('/')
    for (let depth = 2; depth <= segments.length; depth += 1) {
      const candidate = segments.slice(-depth).join('/')
      const distinguishable = relativePaths.every((other, otherIndex) => otherIndex === index
        || (other !== candidate && !other.endsWith(`/${candidate}`)))
      if (distinguishable) return candidate
    }
    return path
  })
}

export function createChangedPathTree(
  entries: readonly ChangedPathEntry[],
  keyPrefix: string,
): OcNodeCollection {
  const items = new Map<string, OcNode>()
  const children = new Map<string, readonly string[]>()
  const rootKeys: string[] = []
  const rootEntries: ChangedPathEntry[] = []
  const groups = new Map<string, { folder: string; entries: ChangedPathEntry[]; keys: string[] }>()

  for (const entry of entries) {
    const key = nodeKey(keyPrefix, entry.path)
    const folder = dotFolderOf(entry.path)
    if (!folder) {
      rootEntries.push(entry)
      rootKeys.push(key)
      continue
    }
    // 分组节点排在根上；同一目录下的文件按出现顺序挂在它下面。
    const groupKey = `${keyPrefix ? `${keyPrefix}:` : ''}${CHANGED_FOLDER_KEY_MARK}${folder}`
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { folder, entries: [], keys: [] })
      items.set(groupKey, {
        label: folder,
        visual: { type: 'icon', icon: 'folder.open' },
      })
      rootKeys.push(groupKey)
    }
    const group = groups.get(groupKey)!
    group.entries.push(entry)
    group.keys.push(key)
    children.set(groupKey, group.keys)
  }

  const applyLabels = (list: readonly ChangedPathEntry[], folder: string | null): void => {
    const labels = uniqueChangedLabels(list.map(entry => (folder ? relativeToFolder(entry.path, folder) : entry.path)))
    list.forEach((entry, index) => {
      items.set(nodeKey(keyPrefix, entry.path), { ...entry.node, label: labels[index]! })
    })
  }

  applyLabels(rootEntries, null)
  for (const group of groups.values()) applyLabels(group.entries, group.folder)

  return { rootKeys, items, children }
}
