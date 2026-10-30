import type { UnicodeRange } from '../model/projectFontRegistry'
import { unicodeRangeContains } from '../model/projectFonts'

type ProjectFontPreviewRun = {
  text: string
  familyKey: string | null
  faceKey: string | null
}

export type ProjectFontPreviewCandidate = {
  familyKey: string
  faceKey?: string
  ranges?: readonly UnicodeRange[]
}

type FontKitFont = {
  characterSet: number[]
}

type FontKitCollection = {
  fonts: FontKitFont[]
}

const ignoredCoverageCodePoints = new Set([
  0x0009,
  0x000a,
  0x000d,
  0x200d,
  0xfe0e,
  0xfe0f,
])

export async function readProjectFontCharacterSet(bytes: Uint8Array): Promise<ReadonlySet<number>> {
  const { create } = await import('fontkit')
  const parsed = create(bytes as never) as unknown as FontKitFont | FontKitCollection
  const font = 'characterSet' in parsed ? parsed : parsed.fonts[0]
  if (!font) throw new Error('Font collection does not contain a font')
  return new Set(font.characterSet)
}

export function characterSetToUnicodeRanges(
  characterSet: ReadonlySet<number>,
  allowedRanges?: readonly UnicodeRange[],
): UnicodeRange[] {
  const codePoints = [...characterSet]
    .filter(codePoint => Number.isInteger(codePoint)
      && codePoint >= 0
      && codePoint <= 0x10ffff
      && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      && unicodeRangeContains(allowedRanges, codePoint))
    .sort((left, right) => left - right)
  const ranges: UnicodeRange[] = []
  for (const codePoint of codePoints) {
    const previous = ranges[ranges.length - 1]
    if (previous && codePoint <= previous.end + 1) previous.end = Math.max(previous.end, codePoint)
    else ranges.push({ start: codePoint, end: codePoint })
  }
  return ranges
}

export function subtractUnicodeRanges(
  source: readonly UnicodeRange[],
  excluded: readonly UnicodeRange[],
): UnicodeRange[] {
  let remaining = source.map(range => ({ ...range }))
  for (const blocked of excluded) {
    remaining = remaining.flatMap(range => {
      if (blocked.end < range.start || blocked.start > range.end) return [range]
      const pieces: UnicodeRange[] = []
      if (blocked.start > range.start) pieces.push({ start: range.start, end: blocked.start - 1 })
      if (blocked.end < range.end) pieces.push({ start: blocked.end + 1, end: range.end })
      return pieces
    })
  }
  return remaining
}

export function mergeUnicodeRanges(ranges: readonly UnicodeRange[]): UnicodeRange[] {
  const sorted = ranges.map(range => ({ ...range }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: UnicodeRange[] = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end)
    else merged.push(range)
  }
  return merged
}

export function createProjectFontPreviewRuns(
  text: string,
  candidates: readonly ProjectFontPreviewCandidate[],
  characterSets: ReadonlyMap<string, ReadonlySet<number>>,
): ProjectFontPreviewRun[] {
  const runs: ProjectFontPreviewRun[] = []
  for (const segment of splitGraphemes(text)) {
    const codePoints = [...segment]
      .map(character => character.codePointAt(0))
      .filter((codePoint): codePoint is number => (
        codePoint !== undefined && !ignoredCoverageCodePoints.has(codePoint)
      ))
    const candidate = codePoints.length === 0
      ? candidates.find(item => item.faceKey === runs[runs.length - 1]?.faceKey)
        ?? candidates[0]
      : candidates.find(candidate => {
          const characterSet = characterSets.get(candidate.faceKey ?? candidate.familyKey)
          return characterSet !== undefined && codePoints.every(codePoint => (
            unicodeRangeContains(candidate.ranges, codePoint) && characterSet.has(codePoint)
          ))
        })
    const familyKey = candidate?.familyKey ?? null
    const faceKey = candidate?.faceKey ?? null
    const previous = runs[runs.length - 1]
    if (previous?.familyKey === familyKey && previous.faceKey === faceKey) previous.text += segment
    else runs.push({ text: segment, familyKey, faceKey })
  }
  return runs
}

function splitGraphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => {
      segment: (value: string) => Iterable<{ segment: string }>
    }
  }).Segmenter
  if (!Segmenter) return [...text]
  return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
    .map(segment => segment.segment)
}
