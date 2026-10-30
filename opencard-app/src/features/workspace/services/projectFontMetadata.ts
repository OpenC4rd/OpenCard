type NumericRange = { min: number; max: number }
type ProjectFontFaceStyle =
  | { kind: 'normal' }
  | { kind: 'italic' }
  | { kind: 'oblique', angle: NumericRange }

type InspectedProjectFontFace = {
  collectionIndex?: number
  familyName: string
  faceName: string
  weight: NumericRange
  stretch: NumericRange
  style: ProjectFontFaceStyle
}

type FontAxis = { min: number; default: number; max: number }
type FontKitFont = {
  familyName?: string | null
  fullName?: string | null
  subfamilyName?: string | null
  variationAxes?: Readonly<Record<string, FontAxis>>
  'OS/2'?: { usWeightClass?: number; usWidthClass?: number; fsSelection?: { italic?: boolean } }
  post?: { italicAngle?: number }
}
type FontKitCollection = { fonts: FontKitFont[] }

const widthClassPercentages = [50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200] as const

export async function inspectProjectFontSource(bytes: Uint8Array): Promise<InspectedProjectFontFace[]> {
  const { create } = await import('fontkit')
  const parsed = create(bytes as never) as unknown as FontKitFont | FontKitCollection
  const collection = 'fonts' in parsed
  const fonts = collection ? parsed.fonts : [parsed]
  return fonts.map((font, index) => inspectFont(font, collection ? index : undefined))
}

function inspectFont(font: FontKitFont, collectionIndex?: number): InspectedProjectFontFace {
  const axes = font.variationAxes ?? {}
  const weight = axisRange(axes.wght, 1, 1000)
    ?? fixedRange(clamp(font['OS/2']?.usWeightClass ?? 400, 1, 1000))
  const stretch = axisRange(axes.wdth, 0.01, 1000)
    ?? fixedRange(widthClassPercentages[clamp(
      Math.round(font['OS/2']?.usWidthClass ?? 5),
      1,
      widthClassPercentages.length,
    ) - 1] ?? 100)
  const slant = axes.slnt
  const italic = axes.ital
  const italicAngle = font.post?.italicAngle ?? 0
  const style: ProjectFontFaceStyle = slant
    ? { kind: 'oblique', angle: normalizedRange(slant.min, slant.max, -90, 90) }
    : italic && italic.max > 0
      ? { kind: 'italic' }
      : font['OS/2']?.fsSelection?.italic || /italic/i.test(font.subfamilyName ?? '')
        ? { kind: 'italic' }
        : italicAngle !== 0
          ? { kind: 'oblique', angle: fixedRange(clamp(-italicAngle, -90, 90)) }
          : { kind: 'normal' }
  return {
    ...(collectionIndex === undefined ? {} : { collectionIndex }),
    familyName: font.familyName?.trim() || font.fullName?.trim() || '',
    faceName: font.subfamilyName?.trim() || font.fullName?.trim() || '',
    weight,
    stretch,
    style,
  }
}

function axisRange(axis: FontAxis | undefined, minimum: number, maximum: number): NumericRange | null {
  return axis ? normalizedRange(axis.min, axis.max, minimum, maximum) : null
}

function normalizedRange(minimum: number, maximum: number, lower: number, upper: number): NumericRange {
  const min = clamp(Math.min(minimum, maximum), lower, upper)
  const max = clamp(Math.max(minimum, maximum), lower, upper)
  return { min, max }
}

function fixedRange(value: number): NumericRange {
  return { min: value, max: value }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}
