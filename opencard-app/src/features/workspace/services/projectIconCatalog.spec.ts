import { describe, expect, it } from 'vitest'
import {
  buildProjectIconCatalog,
  EMPTY_PROJECT_ICON_CATALOG,
  findProjectIcon,
  createProjectIconStyle,
  findProjectIconSeries,
} from './projectIconCatalog'

const vectorSeries = {
  name: 'Outline icons',
  key: 'outline',
  icons: [
    { iconKey: 'warn', name: 'Warn', source: 'icons/warn.svg', tint: 'context' as const },
    { iconKey: 'logo', name: 'Logo', source: 'icons/logo.svg', tint: 'original' as const },
  ],
}

describe('projectIconCatalog', () => {
  it('assembles the catalog as plain data, without touching or measuring any icon file', () => {
    const catalog = buildProjectIconCatalog([vectorSeries], source => `asset://${source}`)

    expect(catalog.series).toEqual([{ name: 'Outline icons', key: 'outline' }])
    expect(catalog.entries).toEqual([
      { ...vectorSeries.icons[0], seriesKey: 'outline', src: 'asset://icons/warn.svg' },
      { ...vectorSeries.icons[1], seriesKey: 'outline', src: 'asset://icons/logo.svg' },
    ])
    // Size belongs to the file and is read when the icon is painted, not here.
    expect(catalog.entries[0]).not.toHaveProperty('imageWidth')
    expect(findProjectIcon(catalog, 'OUTLINE', 'WARN')).toMatchObject({ iconKey: 'warn' })
    expect(findProjectIconSeries(catalog, 'OUTLINE')).toEqual({ name: 'Outline icons', key: 'outline' })
  })

  it('treats an empty or missing series list as an empty catalog', () => {
    expect(buildProjectIconCatalog([], source => source)).toEqual(EMPTY_PROJECT_ICON_CATALOG)
    expect(buildProjectIconCatalog(null, source => source)).toEqual(EMPTY_PROJECT_ICON_CATALOG)
  })

  it('paints a sprite as the rectangle of its sheet, and the whole file for an uncropped raster', () => {
    const sheet = { iconKey: 'b', name: 'B', source: 'sheet.png', tint: 'original' as const, pixelated: true, crop: { x: 16, y: 32, w: 16, h: 16 } }
    const whole = { iconKey: 'w', name: 'W', source: 'w.png', tint: 'original' as const }
    const catalog = buildProjectIconCatalog([{ name: 'Pixel', key: 'pixel', icons: [sheet, whole] }], source => `asset://${source}`)
    const [sprite, plain] = catalog.entries

    // 64×64 sheet: the box shows a 16×16 window, which is a 400% background offset by crop/(sheet-crop).
    const style = createProjectIconStyle(sprite!, () => ({ width: 64, height: 64 }))
    expect(style).toMatchObject({
      width: '1em', height: '1em', imageRendering: 'pixelated',
      '--oc-project-icon-renderer': 'image',
      '--oc-project-icon-background-size': '400% 400%',
      '--oc-project-icon-background-position': `${(16 / 48) * 100}% ${(32 / 48) * 100}%`,
    })
    // Before the sheet is measured the whole file is shown, and the box is already the crop's shape.
    expect(createProjectIconStyle(sprite!)).toMatchObject({ '--oc-project-icon-background-size': '100% 100%', width: '1em' })
    // A raster without a crop keeps the whole-file paint.
    expect(createProjectIconStyle(plain!, () => ({ width: 32, height: 16 }))).toMatchObject({
      width: '2em', '--oc-project-icon-background-size': '100% 100%',
    })
  })
})
