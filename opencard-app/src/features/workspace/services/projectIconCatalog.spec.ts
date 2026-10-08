import { describe, expect, it, vi } from 'vitest'
import {
  buildProjectIconCatalog,
  createProjectIconBlockStyle,
  createProjectIconCssProperties,
  createProjectIconPreviewStyle,
  createProjectIconStyle,
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

/** Sizes as the resolver would report them once these icons have been painted. */
const measuredSizes: Readonly<Record<string, { width: number, height: number }>> = {
  'icons/warn.svg': { width: 24, height: 24 },
  'icons/logo.svg': { width: 24, height: 12 },
  'icons/coin.png': { width: 8, height: 24 },
}
const readSize = (entry: { source: string }) => measuredSizes[entry.source]

describe('projectIconCatalog', () => {
  it('assembles the catalog as plain data, without touching any icon file', () => {
    const resolveAssetSrc = vi.fn((source: string) => `asset://${source}`)
    const catalog = buildProjectIconCatalog([vectorSeries], resolveAssetSrc)

    expect(catalog.series).toEqual([{ name: 'Outline icons', key: 'outline' }])
    expect(catalog.entries).toEqual([
      { ...vectorSeries.icons[0], seriesKey: 'outline', src: 'asset://icons/warn.svg' },
      { ...vectorSeries.icons[1], seriesKey: 'outline', src: 'asset://icons/logo.svg' },
    ])
    expect(catalog.entries[0]).not.toHaveProperty('imageWidth')
    expect(findProjectIcon(catalog, 'OUTLINE', 'WARN')).toMatchObject({ iconKey: 'warn' })
    expect(findProjectIconSeries(catalog, 'OUTLINE')).toEqual({ name: 'Outline icons', key: 'outline' })
  })

  it('reads an icon\u2019s size through the reader rather than measuring it itself', () => {
    const catalog = buildProjectIconCatalog([vectorSeries], src => `asset://${src}`)
    const readDimensions = vi.fn(() => undefined)

    createProjectIconStyle(catalog.entries[0]!, readDimensions)

    expect(readDimensions).toHaveBeenCalledTimes(1)
    expect(readDimensions).toHaveBeenCalledWith(catalog.entries[0])
  })

  it('paints from whatever the reader knows, for every style shape', () => {
    const catalog = buildProjectIconCatalog([vectorSeries], src => `asset://${src}`)

    expect(createProjectIconStyle(catalog.entries[1]!, readSize)).toMatchObject({ width: '2em', height: '1em' })
    expect(createProjectIconPreviewStyle(catalog.entries[1]!, readSize)).toMatchObject({ width: '1em', height: '0.5em' })
    expect(createProjectIconBlockStyle(catalog.entries[1]!, 'contain', readSize)).toMatchObject({
      '--oc-project-icon-display-width': 'min(100cqw, 200cqh)',
    })
  })

  it('paints an unmeasured icon as a square, which is what a square icon measures anyway', () => {
    const catalog = buildProjectIconCatalog([vectorSeries], src => `asset://${src}`)

    expect(createProjectIconStyle(catalog.entries[1]!)).toMatchObject({ width: '1em', height: '1em' })
    expect(createProjectIconPreviewStyle(catalog.entries[1]!)).toMatchObject({ width: '1em', height: '1em' })
  })

  it('paints a theme-tinted icon through a mask and an original icon through the background', () => {
    const catalog = buildProjectIconCatalog([vectorSeries], src => `asset://${src}`)

    const masked = createProjectIconStyle(catalog.entries[0]!, readSize)
    expect(masked).toMatchObject({
      width: '1em',
      height: '1em',
      '--oc-project-icon-renderer': 'mask',
      '--oc-project-icon-mask-image': 'url("asset://icons/warn.svg")',
      '--oc-project-icon-mask-size': '100% 100%',
      '--oc-project-icon-mask-position': 'center',
      '--oc-project-icon-background-color': 'currentColor',
      '--oc-project-icon-source-width': '1em',
      '--oc-project-icon-source-height': '1em',
    })
    expect(masked).not.toHaveProperty('--oc-project-icon-background-image')

    const painted = createProjectIconStyle(catalog.entries[1]!, readSize)
    expect(painted).toMatchObject({
      width: '2em',
      '--oc-project-icon-renderer': 'image',
      '--oc-project-icon-background-image': 'url("asset://icons/logo.svg")',
      '--oc-project-icon-background-size': '100% 100%',
      '--oc-project-icon-background-position': 'center',
    })
    expect(painted).not.toHaveProperty('--oc-project-icon-mask-image')
  })

  it('sizes a preview by the longer edge and a block by the container', () => {
    const catalog = buildProjectIconCatalog([vectorSeries], src => `asset://${src}`)

    // A 24×12 icon in a preview box one unit on its longer edge.
    expect(createProjectIconPreviewStyle(catalog.entries[1]!, readSize)).toMatchObject({ width: '1em', height: '0.5em' })
    expect(createProjectIconBlockStyle(catalog.entries[1]!, 'contain', readSize)).toMatchObject({
      '--oc-project-icon-renderer': 'image',
      '--oc-project-icon-display-width': 'min(100cqw, 200cqh)',
      '--oc-project-icon-display-height': 'min(50cqw, 100cqh)',
      '--oc-project-icon-source-width': 'var(--oc-project-icon-display-width)',
      '--oc-project-icon-source-height': 'var(--oc-project-icon-display-height)',
    })
    expect(createProjectIconBlockStyle(catalog.entries[1]!, 'fill', readSize)).toMatchObject({
      '--oc-project-icon-display-width': '100cqw',
      '--oc-project-icon-display-height': '100cqh',
    })
  })


  it('emits css property names for an inline style attribute', () => {
    const catalog = buildProjectIconCatalog([vectorSeries], src => `asset://${src}`)

    expect(createProjectIconCssProperties(catalog.entries[0]!, readSize)).toMatchObject({
      '--oc-project-icon-mask-image': 'url("asset://icons/warn.svg")',
      '--oc-project-icon-source-width': '1em',
    })
  })

  it('treats an empty or missing series list as an empty catalog', () => {
    expect(buildProjectIconCatalog([], src => src)).toEqual(EMPTY_PROJECT_ICON_CATALOG)
    expect(buildProjectIconCatalog(null, src => src)).toEqual(EMPTY_PROJECT_ICON_CATALOG)
  })
})
