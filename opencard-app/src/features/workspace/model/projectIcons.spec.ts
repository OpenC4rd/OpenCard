import { describe, expect, it } from 'vitest'
import {
  createAvailableProjectIconKey,
  createAvailableProjectIconSeriesKey,
  duplicateProjectIcon,
  findProjectIconKeyConflicts,
  normalizeProjectIconDirectory,
  normalizeProjectIconSource,
  parseProjectIconSeries,
  guessProjectIconGridCell,
  parseProjectIconSetManifest,
  projectIconGridCellSizes,
  projectIconGridCells,
  serializeProjectIconSetManifest,
  type ProjectIconSeries,
} from './projectIcons'

const series: ProjectIconSeries = {
  name: 'Outline icons',
  key: 'outline',
  icons: [
    { iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'context' },
    { iconKey: 'logo', name: 'Logo', source: '.opencard/icons/outline/logo.png', tint: 'original', pixelated: true },
  ],
}

describe('projectIcons', () => {
  it('keeps the icon directory a safe project-relative path', () => {
    expect(normalizeProjectIconDirectory(' resources\\icons/ ')).toBe('resources/icons')
    expect(normalizeProjectIconDirectory('icons/outline')).toBe('icons/outline')
    expect(normalizeProjectIconDirectory('../icons')).toBeNull()
    expect(normalizeProjectIconDirectory('C:/icons')).toBeNull()
  })

  it('accepts every supported icon file and rejects escaping or unknown ones', () => {
    expect(normalizeProjectIconSource(' icons/warn.svg ')).toBe('icons/warn.svg')
    expect(normalizeProjectIconSource('.opencard/icons/outline/warn.svg')).toBe('.opencard/icons/outline/warn.svg')
    expect(normalizeProjectIconSource('icons/pixel.png')).toBe('icons/pixel.png')
    expect(normalizeProjectIconSource('icons/photo.jpg')).toBe('icons/photo.jpg')
    expect(normalizeProjectIconSource('icons/shot.webp')).toBe('icons/shot.webp')
    expect(normalizeProjectIconSource('icons/notes.txt')).toBeNull()
    expect(normalizeProjectIconSource('../warn.svg')).toBeNull()
    expect(normalizeProjectIconSource('C:/elsewhere/warn.svg')).toBeNull()
  })

  it('defaults an absent tint and drops unknown or superseded fields', () => {
    const parsed = parseProjectIconSeries([{
      ...series,
      grid: { snapToGrid: true, rows: 3, columns: 3, pixelated: false },
      icons: [{
        iconKey: 'warn', name: 'Warn', source: 'icons/warn.svg',
        x: 4, y: 4, width: 8, height: 8, atlasRotation: 90,
      }],
    }])
    expect(parsed).toEqual([{
      name: 'Outline icons',
      key: 'outline',
      icons: [{ iconKey: 'warn', name: 'Warn', source: 'icons/warn.svg', tint: 'context' }],
    }])
  })

  it('keeps what a file can use, drops what it cannot, and rejects unusable sources', () => {
    const icon = series.icons[0]!
    const raster = { ...icon, source: 'icons/warn.png', tint: 'context' as const }
    const parsedRaster = parseProjectIconSeries([{
      ...series, icons: [{ ...raster, pixelated: true, crop: { x: 16, y: 0, w: 16, h: 16 }, rotation: 270 as const }],
    }])
    // A raster keeps its own pixels (never tinted), may be pixelated, and may be a rectangle of its file.
    expect(parsedRaster?.[0]?.icons[0]).toEqual({
      ...raster, tint: 'original', pixelated: true, crop: { x: 16, y: 0, w: 16, h: 16 },
    })
    // A vector has no pixels to keep crisp and no stable pixel unit to crop in.
    expect(parseProjectIconSeries([{
      ...series, icons: [{ ...icon, pixelated: true, crop: { x: 0, y: 0, w: 4, h: 4 } }],
    }])?.[0]?.icons[0]).toEqual(icon)

    const reject = (patch: Record<string, unknown>) => parseProjectIconSeries([{
      ...series, icons: [{ ...icon, ...patch }],
    }])
    expect(reject({ tint: 'blue' })?.[0]?.icons[0]?.tint).toBe('context')
    expect(reject({ rotation: 45 })?.[0]?.icons[0]).not.toHaveProperty('rotation')
    expect(reject({ pixelated: 'yes' })).toBeNull()
    expect(reject({ source: 'icons/warn.png', crop: { x: 0, y: 0, w: 0, h: 16 } })).toBeNull()
    expect(reject({ source: 'icons/warn.svgx' })).toBeNull()
    expect(reject({ source: 7 })).toBeNull()
    expect(reject({ iconKey: 'Not Valid' })).toBeNull()
  })

  it('rejects a set that cannot yield a usable projection', () => {
    expect(parseProjectIconSeries([{ key: 'outline', icons: [] }])).toBeNull()
    expect(parseProjectIconSeries([{ name: 'Outline', icons: [] }])).toBeNull()
    expect(parseProjectIconSeries([{ name: '   ', key: 'outline', icons: [] }])).toBeNull()
    expect(parseProjectIconSeries([{ ...series, icons: 'nope' }])).toBeNull()
    expect(parseProjectIconSeries('nope')).toBeNull()
  })

  it('trims a display name and allows an empty set', () => {
    expect(parseProjectIconSeries([{ name: '  状态图标  ', key: 'status', icons: [] }]))
      .toEqual([{ name: '状态图标', key: 'status', icons: [] }])
  })

  it('creates case-insensitively unique icon and series Keys', () => {
    expect(createAvailableProjectIconKey('warn', [{ iconKey: 'warn' }, { iconKey: 'warn-2' }])).toBe('warn-3')
    expect(createAvailableProjectIconKey('Warn', [{ iconKey: 'warn' }])).toBe('warn-2')
    expect(createAvailableProjectIconSeriesKey('Outline.SVG', [])).toBe('outline')
    expect(createAvailableProjectIconSeriesKey('Outline.PNG', [series])).toBe('outline-2')
  })

  it('finds every case-insensitive key conflict in one projection', () => {
    expect(findProjectIconKeyConflicts([
      { ...series, icons: [{ iconKey: 'same', name: '', source: 'a.svg', tint: 'context' }, { iconKey: 'SAME', name: '', source: 'b.svg', tint: 'context' }] },
      { ...series, key: 'OUTLINE', icons: [] },
    ])).toEqual([
      { kind: 'series', seriesIndex: 0, key: 'outline' },
      { kind: 'series', seriesIndex: 1, key: 'OUTLINE' },
      { kind: 'icon', seriesIndex: 0, iconIndex: 0, key: 'same' },
      { kind: 'icon', seriesIndex: 0, iconIndex: 1, key: 'SAME' },
    ])
  })

  it('duplicates an icon beside its source with an available key', () => {
    const duplicated = duplicateProjectIcon(series, 0)
    expect(duplicated.icons).toEqual([
      series.icons[0],
      { ...series.icons[0], iconKey: 'warn-2' },
      series.icons[1],
    ])
    expect(duplicated.icons[1]).not.toBe(series.icons[0])
    expect(series.icons).toHaveLength(2)
    expect(duplicateProjectIcon(series, 99)).toBe(series)
  })

})

describe('icon set manifest', () => {
  const manifest = {
    name: 'Pixel UI',
    icons: [
      { key: 'sword', name: 'Sword', source: 'sheet.png', pixelated: true, crop: { x: 0, y: 0, w: 16, h: 16 } },
      { key: 'logo', name: 'Logo', source: 'logo.svg', tint: 'original' },
      { key: 'bad', name: 'Escapes', source: '../outside.png' },
      { key: 'Bad Key', name: 'Broken', source: 'x.png' },
    ],
  }

  it('reads sources relative to the set folder and leaves out entries that cannot be icons', () => {
    expect(parseProjectIconSetManifest('pixel-ui', manifest)).toEqual({
      name: 'Pixel UI',
      key: 'pixel-ui',
      icons: [
        { iconKey: 'sword', name: 'Sword', source: '.opencard/icons/pixel-ui/sheet.png', tint: 'original', pixelated: true, crop: { x: 0, y: 0, w: 16, h: 16 } },
        { iconKey: 'logo', name: 'Logo', source: '.opencard/icons/pixel-ui/logo.svg', tint: 'original' },
      ],
    })
    expect(parseProjectIconSetManifest('pixel-ui', { icons: [] })).toBeNull()
  })

  it('writes back what it read, relative to the folder, and refuses files outside it', () => {
    const series = parseProjectIconSetManifest('pixel-ui', manifest)!
    expect(JSON.parse(serializeProjectIconSetManifest(series))).toEqual({
      name: 'Pixel UI',
      icons: [
        { key: 'sword', name: 'Sword', source: 'sheet.png', pixelated: true, crop: { x: 0, y: 0, w: 16, h: 16 } },
        { key: 'logo', name: 'Logo', source: 'logo.svg', tint: 'original' },
      ],
    })
    expect(() => serializeProjectIconSetManifest({
      ...series, icons: [{ ...series.icons[0]!, source: '.opencard/icons/other/sheet.png' }],
    })).toThrow('outside its set folder')
  })
})

describe('projectIconGridCells', () => {
  it('cuts the sheet row by row and leaves out cells that would hang over the edge', () => {
    expect(projectIconGridCells({ width: 40, height: 20 }, { width: 16, height: 16 })).toEqual([
      { x: 0, y: 0, w: 16, h: 16 },
      { x: 16, y: 0, w: 16, h: 16 },
    ])
    expect(projectIconGridCells({ width: 32, height: 32 }, { width: 16, height: 16 }).map(({ x, y }) => [x, y]))
      .toEqual([[0, 0], [16, 0], [0, 16], [16, 16]])
  })

  it('gives nothing for a cell size that cannot be a grid', () => {
    const sheet = { width: 64, height: 64 }
    for (const width of [0, -4, 1.5, Number.NaN]) expect(projectIconGridCells(sheet, { width, height: 16 })).toEqual([])
    expect(projectIconGridCells(sheet, { width: 65, height: 16 })).toEqual([])
    expect(projectIconGridCells({ width: 4096, height: 4096 }, { width: 8, height: 8 })).toEqual([])
  })
})

describe('sprite cell suggestions', () => {
  it('offers whole divisors that keep a side to at most 64 cells, and always something', () => {
    expect(projectIconGridCellSizes(64)).toEqual([4, 8, 16, 32, 64])
    expect(projectIconGridCellSizes(96)).toEqual([4, 6, 8, 12, 16, 24, 32, 48, 96])
    expect(projectIconGridCellSizes(1024)).toEqual([16, 32, 64, 128, 256, 512, 1024])
    expect(projectIconGridCellSizes(61)).toEqual([61])
    expect(projectIconGridCellSizes(2)).toEqual([2])
  })

  it('starts on a square common cell that fits both sides', () => {
    expect(guessProjectIconGridCell({ width: 256, height: 256 })).toEqual({ width: 32, height: 32 })
    expect(guessProjectIconGridCell({ width: 48, height: 16 })).toEqual({ width: 16, height: 16 })
    expect(guessProjectIconGridCell({ width: 64, height: 64 })).toEqual({ width: 32, height: 32 })
  })

  it('falls back to the largest shared square, then to each side on its own', () => {
    expect(guessProjectIconGridCell({ width: 28, height: 28 })).toEqual({ width: 28, height: 28 })
    // 45 has no common size, so each side picks its own best divisor: 32 for the width, 45 itself for the height.
    expect(guessProjectIconGridCell({ width: 64, height: 45 })).toEqual({ width: 32, height: 45 })
  })
})
