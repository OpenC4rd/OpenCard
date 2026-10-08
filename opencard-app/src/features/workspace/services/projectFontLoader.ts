import type {
  ProjectFontComposition,
  ProjectFont,
  UnicodeRange,
} from '../model/projectFontRegistry'
import { projectFontFileEntries, projectFontWeightValues } from '../model/projectFontRegistry'
import {
  createProjectFontCompositionCssFamily,
  createProjectFontCssFamily,
} from '../model/projectFonts'
import {
  characterSetToUnicodeRanges,
  mergeUnicodeRanges,
  subtractUnicodeRanges,
} from './projectFontCoverage'
import { reportAppError } from '../../logging/appErrorCatalog'

export type ProjectFontLoadError = {
  fontKey: string
  source: string
  message: string
}

export type ProjectFontLoadResult = {
  current: boolean
  errors: readonly ProjectFontLoadError[]
}

export type ProjectFontCharacterSetLoader = (source: string) => Promise<ReadonlySet<number>>

function cssUnicodeRanges(ranges: readonly UnicodeRange[]): string {
  return ranges.map(range => range.start === range.end
    ? `U+${range.start.toString(16).toUpperCase()}`
    : `U+${range.start.toString(16).toUpperCase()}-${range.end.toString(16).toUpperCase()}`)
    .join(', ')
}

function slotDescriptorKey(weight: string, style: string): string {
  return `${weight}:${style}`
}

function createFaceRule(
  cssFamily: string,
  source: string,
  weight: keyof typeof projectFontWeightValues,
  style: 'upright' | 'italic',
  unicodeRanges?: readonly UnicodeRange[],
): string {
  const descriptors = [
    `font-family: ${JSON.stringify(cssFamily)}`,
    `src: url(${JSON.stringify(source)})`,
    `font-weight: ${projectFontWeightValues[weight]}`,
    `font-style: ${style === 'upright' ? 'normal' : 'italic'}`,
    ...(unicodeRanges?.length ? [`unicode-range: ${cssUnicodeRanges(unicodeRanges)}`] : []),
  ]
  return `@font-face { ${descriptors.join('; ')}; }`
}

export async function createProjectFontCss(
  fonts: readonly ProjectFont[] | null | undefined,
  compositions: readonly ProjectFontComposition[] | null | undefined,
  resolveAssetSrc: (source: string) => string,
  loadCharacterSet?: ProjectFontCharacterSetLoader,
  family: (key: string) => string = createProjectFontCssFamily,
  compositionFamily: (key: string) => string = createProjectFontCompositionCssFamily,
): Promise<{ cssText: string, errors: ProjectFontLoadError[] }> {
  const rules: string[] = []
  const errors: ProjectFontLoadError[] = []
  const fontsByKey = new Map((fonts ?? []).map(font => [font.key.toLocaleLowerCase(), font]))
  const characterSets = new Map<string, Promise<ReadonlySet<number>>>()

  for (const font of fonts ?? []) {
    for (const slot of projectFontFileEntries(font)) {
      try {
        rules.push(createFaceRule(family(font.key), resolveAssetSrc(slot.source), slot.weight, slot.style))
      } catch (error) { errors.push({ fontKey: font.key, source: slot.source, message: String(error) }) }
    }
  }

  if (loadCharacterSet) {
    for (const composition of compositions ?? []) {
      const claimedByDescriptor = new Map<string, UnicodeRange[]>()
      for (const member of composition.members) {
        const font = fontsByKey.get(member.fontKey.toLocaleLowerCase())
        if (!font) continue
        for (const slot of projectFontFileEntries(font)) {
          try {
            let pending = characterSets.get(slot.source)
            if (!pending) {
              pending = loadCharacterSet(slot.source)
              characterSets.set(slot.source, pending)
            }
            const available = characterSetToUnicodeRanges(await pending, member.ranges)
            const descriptorKey = slotDescriptorKey(slot.weight, slot.style)
            const claimed = claimedByDescriptor.get(descriptorKey) ?? []
            const effective = subtractUnicodeRanges(available, claimed)
            if (effective.length === 0) continue
            claimedByDescriptor.set(descriptorKey, mergeUnicodeRanges([...claimed, ...effective]))
            rules.push(createFaceRule(
              compositionFamily(composition.key),
              resolveAssetSrc(slot.source),
              slot.weight,
              slot.style,
              effective,
            ))
          } catch (error) {
            errors.push({
              fontKey: font.key,
              source: slot.source,
              message: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }
    }
  }
  return { cssText: rules.join('\n'), errors }
}

/** Each environment owns only its own style and readiness. */
export function createResourceFontLoader(family: (key: string) => string) {
  let generation = 0
  let style: HTMLStyleElement | null = null
  let readiness: Promise<ProjectFontLoadResult> = Promise.resolve({ current: true, errors: [] })
  function dispose() { generation++; style?.remove(); style = null }
  return {
    dispose,
    wait: async () => { await readiness },
    sync(fonts: readonly ProjectFont[], compositions: readonly ProjectFontComposition[], resolveAssetSrc: (source: string) => string, loadCharacterSet: ProjectFontCharacterSetLoader) {
      const request = ++generation
      readiness = (async () => {
        const result = await createProjectFontCss(fonts, compositions, resolveAssetSrc, loadCharacterSet, family, family)
        if (request !== generation) return { current: false, errors: [] }
        style?.remove()
        if (typeof document !== 'undefined' && result.cssText) {
          style = document.createElement('style')
          style.dataset.opencardResourceFonts = family('')
          style.textContent = result.cssText
          document.head.appendChild(style)
          for (const key of [...fonts.map(font => font.key), ...compositions.map(item => item.key)]) {
            if (request !== generation) return { current: false, errors: [] }
            try {
              const faces = await document.fonts?.load(`16px ${JSON.stringify(family(key))}`)
              if (faces && !faces.length) throw new Error('Font face did not load')
            } catch (error) {
              if (request !== generation) return { current: false, errors: [] }
              result.errors.push({ fontKey: key, source: '', message: String(error) })
              reportAppError('OC-E3005', { id: key, error })
            }
          }
        }
        return { current: request === generation, errors: result.errors }
      })()
      return readiness
    },
  }
}
