import { describe, expect, it } from 'vitest'
import {
  buildProjectIconCatalog,
  EMPTY_PROJECT_ICON_CATALOG,
  findProjectIcon,
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
})
