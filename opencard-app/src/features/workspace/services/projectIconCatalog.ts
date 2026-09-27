/**
 * 模块说明：
 * - 组装项目图标目录，并按需产出项目图标的绘制样式
 * 职责边界：
 * - 只做纯数据组装与样式计算 不访问文件系统、不测量图标尺寸
 */
import type { ProjectIcon, ProjectIconSeries } from '../model/projectIcons'
import type { ProjectIconRenderer } from '../../../shared/ui/visual/projectIconStyle'

/**
 * The catalog is plain data, and carries no sizes. An icon's natural size belongs to its file: a
 * style function that is about to paint one icon asks for it through `requestDimensions` and falls
 * back to a square box until the answer arrives. Building the catalog therefore never touches the
 * file system, and opening a project costs nothing per icon.
 */
export type ProjectIconCatalogEntry = ProjectIcon & {
  seriesKey: string
  src: string
}

/** A set has no image of its own: every icon owns exactly one file. */
export type ProjectIconSeriesRuntime = {
  name: string
  key: string
}

export type ProjectIconCatalog = {
  series: readonly ProjectIconSeriesRuntime[]
  entries: readonly ProjectIconCatalogEntry[]
  /** Case-insensitive runtime indexes. Optional only for hand-authored test catalogs. */
  seriesByKey?: ReadonlyMap<string, ProjectIconSeriesRuntime>
  entriesByIdentity?: ReadonlyMap<string, ProjectIconCatalogEntry>
}

/**
 * Reads an entry's natural size, or `undefined` while it is still unknown.
 *
 * The catalog cannot hold the size: a catalog published through `ref` is deeply reactive and its
 * entries are readonly, and the size is a fact about the file rather than about the authored set. So
 * the size lives beside the catalog, and this is how a style function reaches it. Reading it is also
 * what makes the requesting consumer re-run once the size arrives.
 */
export type ProjectIconDimensionReader = (entry: ProjectIconCatalogEntry) => { width: number, height: number } | undefined

export const EMPTY_PROJECT_ICON_CATALOG: ProjectIconCatalog = {
  series: [],
  entries: [],
  seriesByKey: new Map(),
  entriesByIdentity: new Map(),
}

export function projectIconIdentity(seriesKey: string, iconKey: string): string {
  return `${seriesKey.toLowerCase()}\u0000${iconKey.toLowerCase()}`
}

export function buildProjectIconCatalog(
  seriesList: readonly ProjectIconSeries[] | null | undefined,
  resolveAssetSrc: (source: string) => string,
): ProjectIconCatalog {
  const series = seriesList ?? []
  const runtimeSeries: ProjectIconSeriesRuntime[] = series.map(item => ({ name: item.name, key: item.key }))
  const entries: ProjectIconCatalogEntry[] = []

  for (const item of series) {
    for (const icon of item.icons) {
      entries.push({ ...icon, seriesKey: item.key, src: resolveAssetSrc(icon.source) })
    }
  }

  return {
    series: runtimeSeries,
    entries,
    seriesByKey: new Map(runtimeSeries.map(item => [item.key.toLowerCase(), item])),
    entriesByIdentity: new Map(entries.map(entry => [projectIconIdentity(entry.seriesKey, entry.iconKey), entry])),
  }
}

export function findProjectIconSeries(
  catalog: ProjectIconCatalog | null | undefined,
  seriesKey: string,
): ProjectIconSeriesRuntime | null {
  return catalog?.seriesByKey?.get(seriesKey.toLowerCase())
    ?? catalog?.series.find(series => series.key.toLowerCase() === seriesKey.toLowerCase())
    ?? null
}

export function findProjectIcon(
  catalog: ProjectIconCatalog | null | undefined,
  seriesKey: string,
  iconKey: string,
): ProjectIconCatalogEntry | null {
  const identity = projectIconIdentity(seriesKey, iconKey)
  return catalog?.entriesByIdentity?.get(identity)
    ?? catalog?.entries.find(entry => projectIconIdentity(entry.seriesKey, entry.iconKey) === identity)
    ?? null
}

function isQuarterTurn(rotation: number | undefined): boolean {
  return rotation === 90 || rotation === 270
}

/**
 * The size to paint with: whatever the reader knows, or a square box for an icon nobody has measured
 * yet. A square is also what a square icon resolves to, so an unmeasured square icon is already right.
 */
function displayDimensions(
  entry: ProjectIconCatalogEntry,
  readDimensions?: ProjectIconDimensionReader,
): { width: number, height: number } {
  const measured = readDimensions?.(entry)
  const known = measured !== undefined
    && Number.isInteger(measured.width) && Number.isInteger(measured.height)
    && measured.width > 0 && measured.height > 0
  const width = known ? measured!.width : 1
  const height = known ? measured!.height : 1
  return isQuarterTurn(entry.rotation) ? { width: height, height: width } : { width, height }
}

function createProjectIconPaint(entry: ProjectIconCatalogEntry): Record<string, string> {
  const image = `url(${JSON.stringify(entry.src)})`
  return entry.tint === 'theme'
    ? {
        '--oc-project-icon-mask-image': image,
        '--oc-project-icon-mask-size': '100% 100%',
        '--oc-project-icon-mask-position': 'center',
        '--oc-project-icon-background-color': 'currentColor',
      }
    : {
        '--oc-project-icon-background-image': image,
        '--oc-project-icon-background-size': '100% 100%',
        '--oc-project-icon-background-position': 'center',
      }
}

function rendererOf(entry: ProjectIconCatalogEntry): ProjectIconRenderer {
  return entry.tint === 'theme' ? 'mask' : 'image'
}

/**
 * Emits the shared contract every project icon paints through: the box the paint maps onto, the
 * rotation, and the paint itself. A theme-tinted icon paints `currentColor` through its own alpha;
 * an original icon keeps its own colors.
 */
function createProjectIconRenderStyle(
  entry: ProjectIconCatalogEntry,
  unit: number,
  dimensions: { width: number, height: number },
): Record<string, string> {
  return {
    backgroundImage: 'none',
    imageRendering: entry.pixelated === true ? 'pixelated' : 'auto',
    '--oc-project-icon-renderer': rendererOf(entry),
    '--oc-project-icon-source-width': `${dimensions.width / unit}em`,
    '--oc-project-icon-source-height': `${dimensions.height / unit}em`,
    '--oc-project-icon-image-rendering': entry.pixelated === true ? 'pixelated' : 'auto',
    '--oc-project-icon-transform': `rotate(${entry.rotation ?? 0}deg)`,
    ...createProjectIconPaint(entry),
  }
}

function toCssPropertyName(property: string): string {
  return property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)
}

export function createProjectIconStyle(
  entry: ProjectIconCatalogEntry,
  readDimensions?: ProjectIconDimensionReader,
): Record<string, string> {
  const dimensions = displayDimensions(entry, readDimensions)
  const unit = dimensions.height
  return {
    width: `${dimensions.width / unit}em`,
    height: '1em',
    ...createProjectIconRenderStyle(entry, unit, dimensions),
  }
}

export function createProjectIconPreviewStyle(
  entry: ProjectIconCatalogEntry,
  readDimensions?: ProjectIconDimensionReader,
): Record<string, string> {
  const dimensions = displayDimensions(entry, readDimensions)
  const unit = Math.max(dimensions.width, dimensions.height)
  return {
    width: `${dimensions.width / unit}em`,
    height: `${dimensions.height / unit}em`,
    ...createProjectIconRenderStyle(entry, unit, dimensions),
  }
}

export type ProjectIconBlockFit = 'contain' | 'cover' | 'fill'

function projectIconBlockDimensions(
  dimensions: { width: number, height: number },
  fit: ProjectIconBlockFit,
): { width: string, height: string } {
  if (fit === 'fill') return { width: '100cqw', height: '100cqh' }
  const operation = fit === 'cover' ? 'max' : 'min'
  return {
    width: `${operation}(100cqw, ${100 * dimensions.width / dimensions.height}cqh)`,
    height: `${operation}(${100 * dimensions.height / dimensions.width}cqw, 100cqh)`,
  }
}

export function createProjectIconBlockStyle(
  entry: ProjectIconCatalogEntry,
  fit: ProjectIconBlockFit,
  readDimensions?: ProjectIconDimensionReader,
): Record<string, string> {
  const dimensions = projectIconBlockDimensions(displayDimensions(entry, readDimensions), fit)
  const quarterTurn = isQuarterTurn(entry.rotation)
  return {
    backgroundImage: 'none',
    imageRendering: entry.pixelated === true ? 'pixelated' : 'auto',
    '--oc-project-icon-renderer': rendererOf(entry),
    '--oc-project-icon-display-width': dimensions.width,
    '--oc-project-icon-display-height': dimensions.height,
    '--oc-project-icon-source-width': quarterTurn
      ? 'var(--oc-project-icon-display-height)'
      : 'var(--oc-project-icon-display-width)',
    '--oc-project-icon-source-height': quarterTurn
      ? 'var(--oc-project-icon-display-width)'
      : 'var(--oc-project-icon-display-height)',
    '--oc-project-icon-image-rendering': entry.pixelated === true ? 'pixelated' : 'auto',
    '--oc-project-icon-transform': `rotate(${entry.rotation ?? 0}deg)`,
    ...createProjectIconPaint(entry),
  }
}

export function createProjectIconCssProperties(
  entry: ProjectIconCatalogEntry,
  readDimensions?: ProjectIconDimensionReader,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(createProjectIconStyle(entry, readDimensions))
      .map(([property, value]) => [toCssPropertyName(property), value]),
  )
}
