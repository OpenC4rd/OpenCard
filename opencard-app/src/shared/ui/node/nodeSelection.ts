/**
 * 模块说明：
 * - 定义节点视图共用的选择意图解析（替换 / 切换 / 区间）
 * 职责边界：
 * - 只由「当前选择 + 触发键 + 手势」算出新的选择与锚点是否移动，不持有状态、不发事件
 */
import type { OcNodeKey } from './node.types'

export type OcNodeSelectionMode = 'none' | 'single' | 'multiple'

export type OcNodeSelectionIntent = {
  /** 一次能选中几个键。 */
  mode: OcNodeSelectionMode
  /** 当前渲染出来的条目，按视觉顺序；区间选择沿着这个顺序展开。 */
  orderedEntries: readonly { key: OcNodeKey }[]
  selectedKeys: readonly OcNodeKey[]
  triggerKey: OcNodeKey
  /** 上一次手势留下的锚点；已不在渲染结果里时忽略。 */
  anchorKey: OcNodeKey | null
  toggle: boolean
  range: boolean
}

export type OcNodeSelectionResolution = {
  selectedKeys: OcNodeKey[]
  /** 这次手势是否成为下一个锚点：替换与切换会，区间不会。 */
  movesAnchor: boolean
}

/** 一次点击或按键产生的选择；`none` 模式下返回 `null`，调用方据此不发事件。 */
export function resolveNodeSelection(intent: OcNodeSelectionIntent): OcNodeSelectionResolution | null {
  const { mode, orderedEntries, selectedKeys, triggerKey, anchorKey, toggle, range } = intent
  if (mode === 'none') return null

  if (mode === 'multiple' && range) {
    const resolvedAnchor = anchorKey && orderedEntries.some(entry => entry.key === anchorKey)
      ? anchorKey
      : selectedKeys[0] ?? triggerKey
    const anchorIndex = orderedEntries.findIndex(entry => entry.key === resolvedAnchor)
    const targetIndex = orderedEntries.findIndex(entry => entry.key === triggerKey)
    const rangeKeys = anchorIndex < 0 || targetIndex < 0
      ? [triggerKey]
      : orderedEntries
        .slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
        .map(entry => entry.key)
    const selectedSet = new Set(toggle ? [...selectedKeys, ...rangeKeys] : rangeKeys)
    return {
      selectedKeys: orderedEntries.filter(entry => selectedSet.has(entry.key)).map(entry => entry.key),
      movesAnchor: false,
    }
  }

  if (mode === 'multiple' && toggle) {
    const nextKeys = [...selectedKeys]
    const index = nextKeys.indexOf(triggerKey)
    if (index >= 0) nextKeys.splice(index, 1)
    else nextKeys.push(triggerKey)
    return { selectedKeys: nextKeys, movesAnchor: true }
  }

  return { selectedKeys: [triggerKey], movesAnchor: true }
}
