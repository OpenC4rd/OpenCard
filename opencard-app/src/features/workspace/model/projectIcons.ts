import { createAvailableKey } from '../../../shared/model/keySlug'
import { isRecord } from '../../../shared/model/record'
import { referenceSyntaxIsValid } from './scopedResourcePath'
import { projectIconSetDirectory } from './projectStructure'
import type { IconCrop } from '../../../shared/model/iconGeometry'
export const projectIconKeyPattern = /^[a-z0-9][a-z0-9._-]*$/
/** Every standalone icon file format a set may hold: vector sources and raster sources alike. */
export const projectIconSourcePattern = /\.(?:svg|png|jpe?g|webp)$/i
/** 同一个清单喂养文件选择器与打开对话框：能选的文件格式只有这一处。 */
export const PROJECT_ICON_FILE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'webp'] as const
export const projectIconVectorSourcePattern = /\.svg$/i
export const DEFAULT_PROJECT_ICON_DIRECTORY = 'icons'
export const PROJECT_ICON_TINTS = ['context', 'original'] as const

export type ProjectIconTint = typeof PROJECT_ICON_TINTS[number]

/**
 * Tint of an icon whose persisted field is absent. `context` is the default because an icon set exists
 * to be recolored by the surrounding context; importers persist the tint they detect.
 */
const DEFAULT_PROJECT_ICON_TINT: ProjectIconTint = 'context'

/** A rectangle of the icon's file, in the file's own pixels. */
export type ProjectIconCrop = IconCrop

/**
 * One icon of a set: a file in the set's own folder, or for a bitmap a rectangle of that file (`crop`).
 *
 * The file decides what an icon may say. A vector is tinted through its alpha mask (`tint`). A bitmap
 * keeps its own pixels (`tint` is always `original`), may be `pixelated` so scaling stays crisp, and may
 * be cropped: one image cut into many icons is just several icons cropping one file, so there is no
 * separate sprite kind. A vector has no crop because it has no stable pixel unit to crop in: its size is
 * whatever the file declares, and the card painter redraws it at a far higher resolution. Parsing
 * enforces all this, so a field that means nothing never reaches the model.
 *
 * A set still has no sheet of its own: merging vector files into one atlas would rewrite every internal
 * `id` and `url(#…)`, which is why the earlier whole-set atlas was removed. Cropping one file needs none.
 */
export type ProjectIcon = {
  iconKey: string
  name: string
  source: string
  tint: ProjectIconTint
  /** Nearest-neighbour scaling. Raster only, for pixel art where smooth scaling would blur the art. */
  pixelated?: boolean
  /** Bitmap only: the part of the file this icon is. Absent means the whole file. */
  crop?: ProjectIconCrop
  /**
   * Natural size of the icon's own file, filled in the first time the icon is painted. It is a fact
   * about the file rather than part of the authored model, so a registry never stores it.
   */
  imageWidth?: number
  imageHeight?: number
}

export type ProjectIconSeries = {
  name: string
  key: string
  icons: readonly ProjectIcon[]
}

export type ProjectIconKeyConflict =
  | { kind: 'series'; seriesIndex: number; key: string }
  | { kind: 'icon'; seriesIndex: number; iconIndex: number; key: string }

function isProjectIconTint(value: unknown): value is ProjectIconTint {
  return PROJECT_ICON_TINTS.includes(value as ProjectIconTint)
}

export function normalizeProjectIconDirectory(value: string): string | null {
  const directory = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const segments = directory.split('/')
  if (!directory || /^[a-z]:\//i.test(directory) || directory.startsWith('//')
    || segments.some(segment => segment === '.' || segment === '..' || /[\u0000-\u001f\u007f]/.test(segment))) {
    return null
  }
  return directory
}

/** Accepts every supported icon file, checking the reference's shape rather than what it points at. */
export function normalizeProjectIconSource(value: string): string | null {
  const source = value.trim()
  return referenceSyntaxIsValid(source) && projectIconSourcePattern.test(source) ? source : null
}

export function isRasterProjectIconSource(source: string): boolean {
  return !projectIconVectorSourcePattern.test(source)
}

/** Every project-relative file a set owns, which is exactly one file per icon. */
export function projectIconSources(series: ProjectIconSeries): string[] {
  return series.icons.map(icon => icon.source)
}

function parseProjectIconCrop(value: unknown): ProjectIconCrop | null {
  if (!isRecord(value)) return null
  const { x, y, w, h } = value
  const isCoordinate = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0
  const isExtent = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0
  return isCoordinate(x) && isCoordinate(y) && isExtent(w) && isExtent(h) ? { x, y, w, h } : null
}

/**
 * One icon from its stored fields. `null` when the entry cannot be an icon; fields that do not apply
 * to the file are dropped rather than rejected, so a vector that claims `pixelated` still loads.
 */
function parseProjectIcon(icon: Record<string, unknown>, iconKey: unknown, source: unknown): ProjectIcon | null {
  if (typeof iconKey !== 'string' || !projectIconKeyPattern.test(iconKey)) return null
  if (typeof icon.name !== 'string' || typeof source !== 'string') return null
  const normalized = normalizeProjectIconSource(source)
  if (!normalized) return null
  if (icon.pixelated !== undefined && typeof icon.pixelated !== 'boolean') return null
  const base = { iconKey, name: icon.name, source: normalized }
  if (!isRasterProjectIconSource(normalized)) {
    return { ...base, tint: isProjectIconTint(icon.tint) ? icon.tint : DEFAULT_PROJECT_ICON_TINT }
  }
  const crop = icon.crop === undefined ? undefined : parseProjectIconCrop(icon.crop)
  if (crop === null) return null
  return {
    ...base,
    tint: 'original',
    ...(icon.pixelated !== undefined ? { pixelated: icon.pixelated } : {}),
    ...(crop ? { crop } : {}),
  }
}

export function parseProjectIconSeries(value: unknown): ProjectIconSeries[] | null {
  if (!Array.isArray(value)) return null
  const result: ProjectIconSeries[] = []

  for (const candidate of value) {
    if (!isRecord(candidate)) return null
    if (typeof candidate.name !== 'string' || candidate.name.trim() === '') return null
    if (typeof candidate.key !== 'string' || !projectIconKeyPattern.test(candidate.key)) return null
    if (!Array.isArray(candidate.icons)) return null

    const icons: ProjectIcon[] = []
    for (const icon of candidate.icons) {
      if (!isRecord(icon)) return null
      const parsed = parseProjectIcon(icon, icon.iconKey, icon.source)
      if (!parsed) return null
      icons.push(parsed)
    }
    result.push({ name: candidate.name.trim(), key: candidate.key, icons })
  }
  return result
}

/** The part of `source` inside the set's folder, or null when it points anywhere else. */
function sourceWithinSet(seriesKey: string, source: string): string | null {
  const prefix = `${projectIconSetDirectory(seriesKey)}/`
  return source.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()) ? source.slice(prefix.length) : null
}

/**
 * Reads one set's `icon-set.json`. The folder name is the set's key and every `source` is relative to
 * that folder, so the set is self-contained: it can be copied to another project as it is. Entries
 * that cannot be icons are left out instead of failing the whole set; `null` means the file is not a set.
 */
export function parseProjectIconSetManifest(seriesKey: string, value: unknown): ProjectIconSeries | null {
  if (!isRecord(value) || typeof value.name !== 'string' || value.name.trim() === '') return null
  const icons: ProjectIcon[] = []
  for (const entry of Array.isArray(value.icons) ? value.icons : []) {
    if (!isRecord(entry) || typeof entry.source !== 'string') continue
    const segments = entry.source.split('/')
    if (entry.source.includes('\\') || segments.some(segment => segment === '' || segment === '.' || segment === '..' || segment.includes('#'))) continue
    const icon = parseProjectIcon(entry, entry.key, `${projectIconSetDirectory(seriesKey)}/${entry.source}`)
    if (icon) icons.push(icon)
  }
  return { name: value.name.trim(), key: seriesKey, icons }
}

/** The inverse of `parseProjectIconSetManifest`; throws when an icon's file is outside the set's folder. */
export function serializeProjectIconSetManifest(series: ProjectIconSeries): string {
  const icons = series.icons.map((icon) => {
    const source = sourceWithinSet(series.key, icon.source)
    if (source === null) throw new Error(`Icon file is outside its set folder: ${icon.source}`)
    return {
      key: icon.iconKey,
      name: icon.name,
      source,
      ...(isRasterProjectIconSource(source) ? {} : { tint: icon.tint }),
      ...(icon.pixelated ? { pixelated: true } : {}),
      ...(icon.crop ? { crop: icon.crop } : {}),
    }
  })
  return JSON.stringify({ name: series.name, icons }, null, 2)
}

/** A sheet cut into more cells than this is almost certainly a wrong cell size, not a real icon set. */
export const MAX_PROJECT_ICON_SPRITE_CELLS = 4096

/**
 * The cell lengths worth offering along one side of a sheet: whole divisors, so no cell hangs over the
 * edge, from 4 pixels up and cutting that side into at most 64 cells, so no choice can ask for more
 * than `MAX_PROJECT_ICON_SPRITE_CELLS` icons. Always offers something: the side itself.
 */
export function projectIconGridCellSizes(length: number): number[] {
  const sizes: number[] = []
  for (let size = 4; size <= length; size += 1) if (length % size === 0 && length / size <= 64) sizes.push(size)
  return sizes.length > 0 ? sizes : [Math.max(1, length)]
}

/** Cell sizes icon sheets are overwhelmingly drawn on, most likely first. */
const COMMON_SPRITE_CELLS = [32, 16, 64, 24, 48, 128, 8, 12, 20, 40]

/**
 * The cell a sheet most likely holds, so the choice starts on a good answer: a square cell on a common
 * size that fits both sides, else the largest square that fits, else each side's own best divisor.
 */
export function guessProjectIconGridCell(sheet: { width: number, height: number }): { width: number, height: number } {
  const widths = projectIconGridCellSizes(sheet.width)
  const heights = projectIconGridCellSizes(sheet.height)
  const shared = widths.filter(size => heights.includes(size))
  const square = COMMON_SPRITE_CELLS.find(size => shared.includes(size)) ?? shared[shared.length - 1]
  if (square !== undefined) return { width: square, height: square }
  const best = (sizes: number[]) => COMMON_SPRITE_CELLS.find(size => sizes.includes(size)) ?? sizes[sizes.length - 1]!
  return { width: best(widths), height: best(heights) }
}

/**
 * The cells of a sprite sheet cut into a grid, row by row from the top left. Cells that would hang over
 * the sheet's edge are left out. Empty when the cell size is not a positive whole number that fits the
 * sheet, or would produce more than `MAX_PROJECT_ICON_SPRITE_CELLS`.
 */
export function projectIconGridCells(
  sheet: { width: number, height: number },
  cell: { width: number, height: number },
): ProjectIconCrop[] {
  if (![cell.width, cell.height].every(Number.isInteger) || cell.width < 1 || cell.height < 1) return []
  const columns = Math.floor(sheet.width / cell.width)
  const rows = Math.floor(sheet.height / cell.height)
  if (columns * rows > MAX_PROJECT_ICON_SPRITE_CELLS) return []
  return Array.from({ length: columns * rows }, (_, index) => ({
    x: (index % columns) * cell.width,
    y: Math.floor(index / columns) * cell.height,
    w: cell.width,
    h: cell.height,
  }))
}

function collectDuplicateLocations<T>(
  entries: readonly T[],
  keyOf: (entry: T) => string,
): number[] {
  const locationsByKey = new Map<string, number[]>()
  for (const [index, entry] of entries.entries()) {
    const identity = keyOf(entry).toLocaleLowerCase()
    const locations = locationsByKey.get(identity)
    if (locations) locations.push(index)
    else locationsByKey.set(identity, [index])
  }
  return [...locationsByKey.values()].filter(locations => locations.length > 1).flat()
}

export function findProjectIconKeyConflicts(
  seriesList: readonly ProjectIconSeries[] | null | undefined,
): ProjectIconKeyConflict[] {
  const series = seriesList ?? []
  const conflicts: ProjectIconKeyConflict[] = collectDuplicateLocations(series, item => item.key)
    .map(seriesIndex => ({ kind: 'series', seriesIndex, key: series[seriesIndex]!.key }))

  for (const [seriesIndex, item] of series.entries()) {
    conflicts.push(...collectDuplicateLocations(item.icons, icon => icon.iconKey).map(iconIndex => ({
      kind: 'icon' as const,
      seriesIndex,
      iconIndex,
      key: item.icons[iconIndex]!.iconKey,
    })))
  }
  return conflicts
}

export function createAvailableProjectIconKey(
  base: string,
  icons: readonly { iconKey: string }[],
): string {
  return createAvailableKey(base, icons.map(icon => icon.iconKey), 'icon')
}

export function createAvailableProjectIconSeriesKey(
  base: string,
  seriesList: readonly ProjectIconSeries[],
): string {
  return createAvailableKey(
    base.replace(/\.(?:svg|png|jpe?g|webp)$/i, ''),
    seriesList.map(series => series.key),
    'icons',
  )
}

export function duplicateProjectIcon(
  series: ProjectIconSeries,
  index: number,
): ProjectIconSeries {
  const source = series.icons[index]
  if (!source) return series
  const duplicate: ProjectIcon = {
    ...source,
    iconKey: createAvailableProjectIconKey(source.iconKey, series.icons),
  }
  const icons = [...series.icons]
  icons.splice(index + 1, 0, duplicate)
  return { ...series, icons }
}
