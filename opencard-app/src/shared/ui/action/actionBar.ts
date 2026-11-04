import {
  actionChildren,
  type OcActionBarItem,
  type OcActionDefinition,
  type OcActionDivider,
  type OcActionMenuEntry,
} from './action.types'

/** 能折叠的序列里除了操作，还可能有不参与折叠的只读项（树行尾部的状态徽标）。 */
type FoldInput = OcActionBarItem | { type: 'badge' }

export type FoldedActionBar<T extends FoldInput = OcActionBarItem> = {
  visible: T[]
  overflow: OcActionMenuEntry[]
}

function isDivider(item: FoldInput | undefined): item is OcActionDivider {
  return typeof item === 'object' && item.type === 'divider'
}

/** 能被收进「更多」的项：普通操作。文字、徽标、分隔线与常显操作留在条上。 */
export function isFoldableAction(item: FoldInput): item is OcActionDefinition {
  return typeof item !== 'string' && item.type !== 'divider' && item.type !== 'badge' && !item.alwaysVisible
}

/** 固定预算下留多少：不超过预算全部留下；超过时留 budget - 1 个，把最后一格让给「更多」。 */
export function budgetKeep(items: readonly FoldInput[], budget: number): number {
  const foldable = items.filter(isFoldableAction).length
  return foldable <= budget ? foldable : Math.max(0, budget - 1)
}

/**
 * 从末尾往前收：前 keep 个可收操作留在条上，其后的进「更多」。
 * 分隔线跟着它后面那段走；两侧落在边缘的分隔线去掉。
 */
export function foldActionBar<T extends FoldInput>(items: readonly T[], keep: number): FoldedActionBar<T> {
  const visible: T[] = []
  const overflow: OcActionMenuEntry[] = []
  let kept = 0
  for (const item of items) {
    const folding = kept >= keep
    if (isFoldableAction(item)) {
      if (folding) overflow.push(item)
      else { visible.push(item); kept += 1 }
    } else if (isDivider(item) && folding) overflow.push(item)
    else visible.push(item)
  }
  return { visible: trimDividers(visible), overflow: trimDividers(overflow) }
}

/** 这一项自身或它的任一层子项是不是 key。 */
export function actionContains(entry: OcActionMenuEntry, key: string): boolean {
  if (entry.key === key) return true
  return entry.type !== 'divider' && actionChildren(entry).some(child => actionContains(child, key))
}

function trimDividers<T extends FoldInput>(items: T[]): T[] {
  while (isDivider(items[0])) items.shift()
  while (isDivider(items[items.length - 1])) items.pop()
  return items.filter((item, index) => !(isDivider(item) && isDivider(items[index - 1])))
}
