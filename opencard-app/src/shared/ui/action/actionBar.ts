import { actionChildren, type OcActionBarItem, type OcActionDefinition, type OcActionMenuEntry } from './action.types'

export type FoldedActionBar = {
  visible: OcActionBarItem[]
  overflow: OcActionMenuEntry[]
}

/** 能被收进「更多」的项：普通操作。文字、分隔线与常显操作留在条上。 */
export function isFoldableAction(item: OcActionBarItem): item is OcActionDefinition {
  return typeof item !== 'string' && item.type !== 'divider' && !item.alwaysVisible
}

/**
 * 从末尾往前收：前 keep 个可收操作留在条上，其后的进「更多」。
 * 分隔线跟着它后面那段走；两侧落在边缘的分隔线去掉。
 */
export function foldActionBar(items: readonly OcActionBarItem[], keep: number): FoldedActionBar {
  const visible: OcActionBarItem[] = []
  const overflow: OcActionMenuEntry[] = []
  let kept = 0
  for (const item of items) {
    const folding = kept >= keep
    if (typeof item !== 'string' && item.type === 'divider') (folding ? overflow : visible).push(item)
    else if (!isFoldableAction(item)) visible.push(item)
    else if (folding) overflow.push(item)
    else { visible.push(item); kept += 1 }
  }
  return { visible: trimDividers(visible), overflow: trimDividers(overflow) }
}

/** 这一项自身或它的任一层子项是不是 key。 */
export function actionContains(entry: OcActionMenuEntry, key: string): boolean {
  if (entry.key === key) return true
  return entry.type !== 'divider' && actionChildren(entry).some(child => actionContains(child, key))
}

function trimDividers<T extends OcActionBarItem>(items: T[]): T[] {
  const isDivider = (item: T | undefined) => typeof item === 'object' && item.type === 'divider'
  while (isDivider(items[0])) items.shift()
  while (isDivider(items[items.length - 1])) items.pop()
  return items.filter((item, index) => !(isDivider(item) && isDivider(items[index - 1])))
}
