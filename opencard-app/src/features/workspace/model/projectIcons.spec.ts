import { describe, expect, it } from 'vitest'
import {
  createAvailableProjectIconKey,
  createAvailableProjectIconSeriesKey,
  DEFAULT_PROJECT_ICON_DIRECTORY,
  DEFAULT_PROJECT_ICON_TINT,
  duplicateProjectIcon,
  findProjectIconKeyConflicts,
  isRasterProjectIconSource,
  normalizeProjectIconDirectory,
  normalizeProjectIconSource,
  parseProjectIconSeries,
  type ProjectIconSeries,
} from './projectIcons'

const series: ProjectIconSeries = {
  name: 'Outline icons',
  key: 'outline',
  icons: [
    { iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'theme' },
    { iconKey: 'logo', name: 'Logo', source: '.opencard/icons/outline/logo.png', tint: 'original', pixelated: true },
  ],
}

describe('projectIcons', () => {
  it('keeps the icon directory a safe project-relative path', () => {
    expect(DEFAULT_PROJECT_ICON_DIRECTORY).toBe('icons')
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

  it('distinguishes raster sources from vector ones', () => {
    expect(isRasterProjectIconSource('icons/pixel.png')).toBe(true)
    expect(isRasterProjectIconSource('icons/photo.webp')).toBe(true)
    expect(isRasterProjectIconSource('icons/warn.svg')).toBe(false)
  })

  it('round-trips a set of standalone icon files', () => {
    expect(parseProjectIconSeries([series])).toEqual([series])
  })

  it('defaults an absent tint and drops unknown or superseded fields', () => {
    expect(DEFAULT_PROJECT_ICON_TINT).toBe('theme')
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
      icons: [{ iconKey: 'warn', name: 'Warn', source: 'icons/warn.svg', tint: 'theme' }],
    }])
  })

  it('keeps optional pixelated and rotation and rejects invalid values', () => {
    const icon = series.icons[0]!
    const withPixelated = parseProjectIconSeries([{
      ...series, icons: [{ ...icon, pixelated: true, rotation: 270 as const }],
    }])
    expect(withPixelated?.[0]?.icons[0]).toEqual({ ...icon, pixelated: true, rotation: 270 })

    const reject = (patch: Record<string, unknown>) => parseProjectIconSeries([{
      ...series, icons: [{ ...icon, ...patch }],
    }])
    expect(reject({ tint: 'blue' })).toBeNull()
    expect(reject({ rotation: 45 })).toBeNull()
    expect(reject({ pixelated: 'yes' })).toBeNull()
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
      { ...series, icons: [{ iconKey: 'same', name: '', source: 'a.svg', tint: 'theme' }, { iconKey: 'SAME', name: '', source: 'b.svg', tint: 'theme' }] },
      { ...series, key: 'OUTLINE', icons: [] },
    ])).toEqual([
      { kind: 'series', seriesIndex: 0, key: 'outline' },
      { kind: 'series', seriesIndex: 1, key: 'OUTLINE' },
      { kind: 'icon', seriesIndex: 0, iconIndex: 0, key: 'same' },
      { kind: 'icon', seriesIndex: 0, iconIndex: 1, key: 'SAME' },
    ])
  })

  it('reads each icon key once when checking a 400-icon set', () => {
    let keyReads = 0
    const icons = Array.from({ length: 400 }, (_, index) => new Proxy({
      iconKey: `icon-${index}`, name: '', source: 'a.svg', tint: 'theme' as const,
    }, {
      get(target, property, receiver) {
        if (property === 'iconKey') keyReads += 1
        return Reflect.get(target, property, receiver)
      },
    }))
    expect(findProjectIconKeyConflicts([{ ...series, icons }])).toEqual([])
    expect(keyReads).toBe(400)
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
