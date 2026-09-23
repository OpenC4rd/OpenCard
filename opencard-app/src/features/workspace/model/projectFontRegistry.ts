export { PROJECT_FONT_REGISTRY_FILE_NAME } from './projectStructure'
import { isRecord } from '../../../shared/model/record'
import { referenceSyntaxIsValid } from './scopedResourcePath'

export const projectFontKeyPattern = /^[a-z0-9][a-z0-9._-]*$/
export const projectFontIdPattern = projectFontKeyPattern
export const projectFontSourcePattern = /\.(?:woff2?|ttf|otf)$/i

export const projectFontWeights = ['light', 'normal', 'bold'] as const
export const projectFontStyles = ['upright', 'italic'] as const
export const projectFontWeightValues = { light: 300, normal: 400, bold: 700 } as const
export type ProjectFontWeight = typeof projectFontWeights[number]
export type ProjectFontStyle = typeof projectFontStyles[number]

export type ProjectFontWeightFiles = {
  upright?: string
  italic?: string
}

export type ProjectFontFiles = Partial<Record<ProjectFontWeight, ProjectFontWeightFiles>>

export type ProjectFont = {
  key: string
  name: string
  files: ProjectFontFiles
}
export type ProjectFontFamily = ProjectFont

export type UnicodeRange = {
  start: number
  end: number
}

export type ProjectFontCompositionMember = {
  fontKey: string
  ranges?: readonly UnicodeRange[]
}

export type ProjectFontComposition = {
  key: string
  name: string
  members: readonly ProjectFontCompositionMember[]
}

export type ProjectFontRegistryDocument = {
  families?: readonly ProjectFont[]
  compositions?: readonly ProjectFontComposition[]
}

export type ProjectFontRegistryEntry =
  | { kind: 'family', name: string, family: ProjectFont }
  | { kind: 'composition', name: string, composition: ProjectFontComposition }

export type ProjectFontRegistry = Readonly<Record<string, ProjectFontRegistryEntry>>

const MAX_UNICODE_CODE_POINT = 0x10ffff
const SURROGATE_START = 0xd800
const SURROGATE_END = 0xdfff

function normalizeKey(value: unknown): string | null {
  return typeof value === 'string' && projectFontKeyPattern.test(value) ? value : null
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim()
}

function normalizeSource(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const source = value.trim()
  return referenceSyntaxIsValid(source) && projectFontSourcePattern.test(source) ? source : null
}

export function projectFontSources(font: Pick<ProjectFont, 'files'>): string[] {
  return projectFontWeights.flatMap(weight => projectFontStyles.flatMap(style => {
    const source = font.files[weight]?.[style]
    return source ? [source] : []
  }))
}

export function projectFontFileEntries(font: Pick<ProjectFont, 'files'>): Array<{
  weight: ProjectFontWeight
  style: ProjectFontStyle
  source: string
}> {
  return projectFontWeights.flatMap(weight => projectFontStyles.flatMap(style => {
    const source = font.files[weight]?.[style]
    return source ? [{ weight, style, source }] : []
  }))
}

function normalizeFontFiles(value: unknown): ProjectFontFiles | null {
  if (!isRecord(value)) return null
  const files: ProjectFontFiles = {}
  for (const weight of projectFontWeights) {
    const candidate = value[weight]
    if (!isRecord(candidate)) continue
    const upright = normalizeSource(candidate.upright)
    const italic = normalizeSource(candidate.italic)
    if (upright || italic) files[weight] = {
      ...(upright ? { upright } : {}),
      ...(italic ? { italic } : {}),
    }
  }
  return Object.keys(files).length ? files : null
}

function normalizeFont(value: unknown): ProjectFont | null {
  if (!isRecord(value)) return null
  const key = normalizeKey(value.key)
  const name = normalizeName(value.name)
  const files = normalizeFontFiles(value.files)
  return key && name && files ? { key, name, files } : null
}

export function normalizeUnicodeRanges(value: unknown): UnicodeRange[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const ranges: UnicodeRange[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)
      || !Number.isInteger(candidate.start)
      || !Number.isInteger(candidate.end)
      || (candidate.start as number) < 0
      || (candidate.end as number) > MAX_UNICODE_CODE_POINT
      || (candidate.start as number) > (candidate.end as number)) return null
    const start = candidate.start as number
    const end = candidate.end as number
    if (start < SURROGATE_START) ranges.push({ start, end: Math.min(end, SURROGATE_START - 1) })
    if (end > SURROGATE_END) ranges.push({ start: Math.max(start, SURROGATE_END + 1), end })
  }
  ranges.sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: UnicodeRange[] = []
  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }
  return merged.length ? merged : null
}

function normalizeCompositionMember(value: unknown): ProjectFontCompositionMember | null {
  if (!isRecord(value)) return null
  const fontKey = normalizeKey(value.fontKey)
  if (!fontKey) return null
  if (value.ranges === undefined) return { fontKey }
  const ranges = normalizeUnicodeRanges(value.ranges)
  return ranges ? { fontKey, ranges } : null
}

function normalizeComposition(value: unknown): ProjectFontComposition | null {
  if (!isRecord(value)) return null
  const key = normalizeKey(value.key)
  const name = normalizeName(value.name)
  if (!key || !name) return null
  const members = value.members === undefined
    ? []
    : Array.isArray(value.members)
      ? value.members.map(normalizeCompositionMember)
        .filter((member): member is ProjectFontCompositionMember => Boolean(member))
      : null
  return members ? { key, name, members } : null
}

export function buildProjectFontRegistry(document: ProjectFontRegistryDocument): ProjectFontRegistry {
  return Object.fromEntries([
    ...(document.families ?? []).map(font => [font.key, {
      kind: 'family' as const,
      name: font.name,
      family: font,
    }] as const),
    ...(document.compositions ?? []).map(composition => [composition.key, {
      kind: 'composition' as const,
      name: composition.name,
      composition,
    }] as const),
  ])
}

export function parseProjectFontRegistry(value: unknown): ProjectFontRegistryDocument | null {
  if (!isRecord(value)) return null
  if (value.families !== undefined && !Array.isArray(value.families)) return null
  if (value.compositions !== undefined && !Array.isArray(value.compositions)) return null
  const fonts = (value.families ?? []).map(normalizeFont)
    .filter((font): font is ProjectFont => Boolean(font))
  const compositions = (value.compositions ?? []).map(normalizeComposition)
    .filter((composition): composition is ProjectFontComposition => Boolean(composition))
  const keys = new Set<string>()
  const uniqueFonts = fonts.filter(font => {
    const key = font.key.toLocaleLowerCase()
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
  const uniqueCompositions = compositions.filter(composition => {
    const key = composition.key.toLocaleLowerCase()
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
  return {
    ...(uniqueFonts.length ? { families: uniqueFonts } : {}),
    ...(uniqueCompositions.length ? { compositions: uniqueCompositions } : {}),
  }
}

export function parseProjectFontRegistryText(content: string): ProjectFontRegistryDocument | null {
  try {
    return parseProjectFontRegistry(JSON.parse(content))
  } catch {
    return null
  }
}

export function serializeProjectFontRegistry(document: ProjectFontRegistryDocument): string {
  const normalized = parseProjectFontRegistry(document)
  if (!normalized) throw new Error('Invalid project font registry')
  return JSON.stringify(normalized, null, 2)
}
