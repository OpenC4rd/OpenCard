import { createAvailableKey } from '../../../shared/model/keySlug'
import { isRecord } from '../../../shared/model/record'
import { referenceSyntaxIsValid } from './scopedResourcePath'
export const projectIconKeyPattern = /^[a-z0-9][a-z0-9._-]*$/
/** Every standalone icon file format a set may hold: vector sources and raster sources alike. */
export const projectIconSourcePattern = /\.(?:svg|png|jpe?g|webp)$/i
/** 同一个清单喂养文件选择器与打开对话框：能选的文件格式只有这一处。 */
export const PROJECT_ICON_FILE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'webp'] as const
export const projectIconVectorSourcePattern = /\.svg$/i
export const DEFAULT_PROJECT_ICON_DIRECTORY = 'icons'
export const PROJECT_ICON_ROTATIONS = [0, 90, 180, 270] as const
export const PROJECT_ICON_TINTS = ['theme', 'original'] as const

export type ProjectIconRotation = typeof PROJECT_ICON_ROTATIONS[number]
export type ProjectIconTint = typeof PROJECT_ICON_TINTS[number]

/**
 * Tint of an icon whose persisted field is absent. `theme` is the default because an icon set exists
 * to be recolored by the surrounding theme; importers persist the tint they detect.
 */
export const DEFAULT_PROJECT_ICON_TINT: ProjectIconTint = 'theme'

/**
 * One icon of a set: exactly one project-relative file. A vector source is tinted through its alpha
 * mask; a raster source keeps its own pixels, and `pixelated` keeps them crisp when scaled up.
 *
 * This model deliberately has no spritesheet, no crop rectangle, and no per-set `source`, and those
 * must not be reintroduced: merging standalone icons into one atlas means rewriting every internal
 * `id`, `url(#…)`, and `<style>` reference inside the files, and an atlas cannot be painted as a mask
 * over `currentColor`, so it would permanently lose theme tinting for vector icons. An earlier revision
 * of this model did carry the atlas and was removed on purpose — its absence is the decision, not an
 * oversight.
 */
export type ProjectIcon = {
  iconKey: string
  name: string
  source: string
  tint: ProjectIconTint
  /** Nearest-neighbour scaling. Set for pixel art, where smooth scaling would blur the art. */
  pixelated?: boolean
  rotation?: ProjectIconRotation
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

function isProjectIconRotation(value: unknown): value is ProjectIconRotation {
  return PROJECT_ICON_ROTATIONS.includes(value as ProjectIconRotation)
}

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
      if (typeof icon.iconKey !== 'string' || !projectIconKeyPattern.test(icon.iconKey)) return null
      if (typeof icon.name !== 'string' || typeof icon.source !== 'string') return null
      const source = normalizeProjectIconSource(icon.source)
      if (!source) return null
      if ((icon.rotation !== undefined && !isProjectIconRotation(icon.rotation))
        || (icon.tint !== undefined && !isProjectIconTint(icon.tint))
        || (icon.pixelated !== undefined && typeof icon.pixelated !== 'boolean')) return null
      icons.push({
        iconKey: icon.iconKey,
        name: icon.name,
        source,
        tint: icon.tint ?? DEFAULT_PROJECT_ICON_TINT,
        ...(icon.pixelated !== undefined ? { pixelated: icon.pixelated } : {}),
        ...(icon.rotation !== undefined ? { rotation: icon.rotation } : {}),
      })
    }
    result.push({ name: candidate.name.trim(), key: candidate.key, icons })
  }
  return result
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

export function moveProjectIcon(
  series: ProjectIconSeries,
  fromIndex: number,
  toIndex: number,
): ProjectIconSeries {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || fromIndex >= series.icons.length
    || toIndex < 0 || toIndex >= series.icons.length || fromIndex === toIndex) return series
  const icons = [...series.icons]
  const [moved] = icons.splice(fromIndex, 1)
  icons.splice(toIndex, 0, moved!)
  return { ...series, icons }
}
