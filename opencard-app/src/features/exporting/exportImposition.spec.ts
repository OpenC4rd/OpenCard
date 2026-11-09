// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createExportPaper, type ExportPaper } from '../workspace/model/projectExportProfile'
import { imposeCards, resolvePaperSheet } from './exportImposition'

const cards = (count: number, offset = 0) => Array.from({ length: count }, (_, index) => ({ key: index + offset, width: 63, height: 88 }))
const paper = (patch: Partial<ExportPaper> = {}): ExportPaper => ({ ...createExportPaper(), cropMarks: false, ...patch })

describe('imposeCards', () => {
  it('fits a standard card nine-up on A4 and centers the grid', () => {
    const pages = imposeCards(paper(), cards(10), null)!

    expect(pages).toHaveLength(2)
    expect(pages[0]!.placements).toHaveLength(9)
    expect(pages[1]!.placements).toHaveLength(1)
    expect(pages[0]!.placements[0]).toMatchObject({ x: 10.5, y: 16.5, width: 63, height: 88 })
  })

  it('honours explicit grids, gaps and top-left placement', () => {
    const [page] = imposeCards(paper({ columns: 2, rows: 1, gapX: 5, placement: 'top-left' }), cards(3), null)!

    expect(page!.placements.map(card => card.x)).toEqual([10, 78])
    expect(page!.placements.map(card => card.y)).toEqual([10, 10])
  })

  it('swaps sides for landscape and keeps custom sizes', () => {
    expect(resolvePaperSheet(paper({ orientation: 'landscape' }))).toEqual({ width: 297, height: 210 })
    expect(resolvePaperSheet(paper({ size: 'custom', width: 100, height: 200 }))).toEqual({ width: 100, height: 200 })
  })

  it('mirrors columns on long-edge backs and rows on short-edge backs', () => {
    const columnsOf = (duplex: ExportPaper['duplex']) => {
      const [front, back] = imposeCards(paper({ duplex, columns: 3, rows: 2 }), cards(2), cards(2, 10))!
      return { front: front!.placements, back: back!.placements }
    }

    const longEdge = columnsOf('long-edge')
    expect(longEdge.back[0]!.x).toBe(longEdge.front[0]!.x + 2 * 63)
    expect(longEdge.back[0]!.y).toBe(longEdge.front[0]!.y)

    const shortEdge = columnsOf('short-edge')
    expect(shortEdge.back[0]!.x).toBe(shortEdge.front[0]!.x)
    expect(shortEdge.back[0]!.y).toBe(shortEdge.front[0]!.y + 88)
  })

  it('flips backs across the sheet so uncentered grids still line up', () => {
    const backOf = (patch: Partial<ExportPaper>) => {
      const [front, back] = imposeCards(paper({ placement: 'top-left', marginLeft: 20, marginTop: 15, ...patch }), cards(4), cards(4, 10))!
      return { front: front!.placements, back: back!.placements }
    }

    const longEdge = backOf({ duplex: 'long-edge' })
    longEdge.front.forEach((card, index) => {
      expect(longEdge.back[index]!.x + longEdge.back[index]!.width).toBeCloseTo(210 - card.x)
      expect(longEdge.back[index]!.y).toBe(card.y)
    })

    const shortEdge = backOf({ duplex: 'short-edge' })
    shortEdge.front.forEach((card, index) => {
      expect(shortEdge.back[index]!.x).toBe(card.x)
      expect(shortEdge.back[index]!.y + shortEdge.back[index]!.height).toBeCloseTo(297 - card.y)
    })
  })

  it('spreads the leftover space between cards when distributed', () => {
    const small = Array.from({ length: 10 }, (_, key) => ({ key, width: 52, height: 73 }))
    const [page, last] = imposeCards(paper({ placement: 'distribute' }), small, null)!
    const { placements } = page!

    expect(placements.map(card => card.x).slice(0, 3)).toEqual([10, 79, 148])
    expect(placements[2]!.x + 52).toBe(200)
    expect([placements[0]!.y, placements[3]!.y, placements[6]!.y]).toEqual([10, 112, 214])
    expect(placements[8]!.y + 73).toBe(287)
    expect(last!.placements[0]).toMatchObject({ x: 10, y: 10 })
  })

  it('ignores gaps when distributed and centers a lone row or column', () => {
    const [ignored] = imposeCards(paper({ placement: 'distribute', gapX: 100, columns: 3 }), cards(3), null)!
    expect(ignored!.placements.map(card => card.x)).toEqual([10, 73.5, 137])

    const [lone] = imposeCards(paper({ placement: 'distribute', columns: 1, rows: 1 }), cards(1), null)!
    expect(lone!.placements[0]).toMatchObject({ x: 73.5, y: 104.5 })
  })

  it('still lines backs up when distributed', () => {
    const [front, back] = imposeCards(paper({ placement: 'distribute', duplex: 'long-edge', marginLeft: 20 }), cards(2), cards(2, 10))!
    expect(back!.placements[0]!.x + 63).toBeCloseTo(210 - front!.placements[0]!.x)
  })

  it('draws eight marks per card when crop marks are on', () => {
    const [page] = imposeCards(paper({ cropMarks: true, gapX: 10, gapY: 10 }), cards(2), null)!
    expect(page!.cropMarks).toHaveLength(16)
  })

  it('never prints a crop mark over a neighbouring card', () => {
    const [page] = imposeCards(paper({ cropMarks: true }), cards(9), null)!

    expect(page!.cropMarks.length).toBeGreaterThan(0)
    for (const [x1, y1, x2, y2] of page!.cropMarks) {
      const inside = page!.placements.some(card => Math.max(x1, x2) > card.x && Math.min(x1, x2) < card.x + card.width
        && Math.max(y1, y2) > card.y && Math.min(y1, y2) < card.y + card.height)
      expect(inside).toBe(false)
    }
  })

  it('reports a sheet that cannot hold a card', () => {
    expect(imposeCards(paper({ size: 'custom', width: 50, height: 50 }), cards(1), null)).toBeNull()
    expect(imposeCards(paper({ columns: 9 }), cards(1), null)).toBeNull()
  })

  it('keeps equal sizes together and gives each size its own pages and cell', () => {
    const large = (key: number) => ({ key, width: 63, height: 88 })
    const small = (key: number) => ({ key, width: 52, height: 73 })
    const pages = imposeCards(paper(), [small(0), large(1), small(2)], null)!

    expect(pages.map(page => page.placements.map(card => card.entryIndex))).toEqual([[0, 2], [1]])
    expect(pages[0]!.placements[1]!.x - pages[0]!.placements[0]!.x).toBe(52)
    expect(pages[1]!.placements[0]).toMatchObject({ x: 10.5, y: 16.5 })
  })

  it('reports the sheet when one of the sizes does not fit', () => {
    const mixed = [{ key: 0, width: 63, height: 88 }, { key: 1, width: 300, height: 88 }]
    expect(imposeCards(paper(), mixed, null)).toBeNull()
  })

  it('centers a smaller back behind its front', () => {
    const front = { key: 0, width: 63, height: 88 }
    const back = { key: 1, width: 43, height: 68 }
    const [frontPage, backPage] = imposeCards(paper({ duplex: 'long-edge', columns: 1, rows: 1 }), [front], [back])!

    expect(backPage!.placements[0]!.x - frontPage!.placements[0]!.x).toBe(10)
    expect(backPage!.placements[0]!.y - frontPage!.placements[0]!.y).toBe(10)
  })
})
