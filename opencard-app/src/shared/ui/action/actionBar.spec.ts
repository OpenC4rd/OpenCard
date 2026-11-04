import { describe, expect, it } from 'vitest'
import type { OcActionBarItem } from './action.types'
import { budgetKeep, foldActionBar } from './actionBar'

const keys = (items: readonly OcActionBarItem[]) =>
  items.map(item => typeof item === 'string' ? `"${item}"` : item.type === 'divider' ? '|' : item.key)

const ITEMS: OcActionBarItem[] = [
  { key: 'a' }, { key: 'b' }, { type: 'divider', key: 'd1' }, '100%', { key: 'c' }, { key: 'd' },
]

describe('foldActionBar', () => {
  it('keeps everything when nothing needs to fold', () => {
    expect(keys(foldActionBar(ITEMS, Number.POSITIVE_INFINITY).visible)).toEqual(['a', 'b', '|', '"100%"', 'c', 'd'])
    expect(foldActionBar(ITEMS, 4).overflow).toEqual([])
  })

  it('folds from the end and keeps text on the bar', () => {
    const folded = foldActionBar(ITEMS, 1)
    expect(keys(folded.visible)).toEqual(['a', '"100%"'])
    expect(keys(folded.overflow)).toEqual(['b', '|', 'c', 'd'])
  })

  it('never folds always-visible actions and does not count them against keep', () => {
    const folded = foldActionBar([{ key: 'a' }, { key: 'pin', alwaysVisible: true }, { key: 'b' }], 0)
    expect(keys(folded.visible)).toEqual(['pin'])
    expect(keys(folded.overflow)).toEqual(['a', 'b'])
  })

  it('drops dividers left on either edge', () => {
    const folded = foldActionBar([{ key: 'a' }, { type: 'divider', key: 'd' }, { key: 'b' }], 1)
    expect(keys(folded.visible)).toEqual(['a'])
    expect(keys(folded.overflow)).toEqual(['b'])
  })

  it('leaves read-only tail parts such as badges on the row', () => {
    const badge = { type: 'badge' as const, icon: 'mdiPlus' as const, label: 'Synced' }
    const folded = foldActionBar([badge, 'hint', { key: 'a' }, { key: 'b' }], 0)
    expect(folded.visible).toEqual([badge, 'hint'])
    expect(folded.overflow.map(entry => entry.key)).toEqual(['a', 'b'])
  })
})

describe('budgetKeep', () => {
  const actions = (count: number) => Array.from({ length: count }, (_, index) => ({ key: `a${index}` }))

  it('shows everything that fits the budget', () => {
    expect(budgetKeep(actions(1), 1)).toBe(1)
    expect(budgetKeep(actions(3), 3)).toBe(3)
  })

  it('gives the last slot to the more button once over budget', () => {
    expect(budgetKeep(actions(2), 1)).toBe(0)
    expect(budgetKeep(actions(5), 3)).toBe(2)
  })

  it('does not count always-visible actions or text', () => {
    expect(budgetKeep(['text', { key: 'pin', alwaysVisible: true }, { key: 'a' }], 1)).toBe(1)
  })
})
