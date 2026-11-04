import { describe, expect, it } from 'vitest'
import type { OcActionBarItem } from './action.types'
import { foldActionBar } from './actionBar'

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
})
