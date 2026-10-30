import { isRecord } from '../../../shared/model/record'
export { PROJECT_DICTIONARY_FILE_NAME } from './projectStructure'

export type ProjectDictionary = {
  active?: string
  base?: Record<string, string>
  languages?: Record<string, Record<string, string>>
}

type ResolvedProjectDictionary = Record<string, string>

type DictionaryResolution = {
  values: ResolvedProjectDictionary
  warning: 'active-language-missing' | null
}

export const dictionaryRecordKeyPattern = /^(?![0-9])[A-Za-z0-9_.-]+$/
export const dictionaryLanguageKeyPattern = /^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{2,8})*$/

function hasCaseInsensitiveDuplicates(keys: readonly string[]): boolean {
  const identities = keys.map(key => key.toLocaleLowerCase())
  return new Set(identities).size !== identities.length
}

function parseStringRecord(value: unknown, keyPattern: RegExp): Record<string, string> | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (hasCaseInsensitiveDuplicates(entries.map(([key]) => key))) return null
  if (entries.some(([key, child]) => !keyPattern.test(key) || typeof child !== 'string')) return null
  return Object.fromEntries(entries) as Record<string, string>
}

export function parseProjectDictionary(value: unknown): ProjectDictionary | null {
  if (!isRecord(value)) return null
  const allowedKeys = new Set(['active', 'base', 'languages'])
  if (Object.keys(value).some(key => !allowedKeys.has(key))) return null
  if (value.active !== undefined && typeof value.active !== 'string') return null
  if (typeof value.active === 'string' && value.active !== ''
    && !dictionaryLanguageKeyPattern.test(value.active)) return null
  if (value.base !== undefined && !isRecord(value.base)) return null
  if (value.languages !== undefined && !isRecord(value.languages)) return null

  const base = value.base === undefined ? {} : parseStringRecord(value.base, dictionaryRecordKeyPattern)
  if (!base) return null

  const languageEntries = Object.entries(value.languages ?? {})
  const languageKeys = languageEntries.map(([key]) => key)
  if (hasCaseInsensitiveDuplicates(languageKeys)) return null
  if (languageKeys.some(key => !dictionaryLanguageKeyPattern.test(key))) return null

  const baseIdentities = new Map(Object.keys(base).map(key => [key.toLocaleLowerCase(), key]))
  const languages: Record<string, Record<string, string>> = {}
  for (const [languageKey, rawOverrides] of languageEntries) {
    const overrides = parseStringRecord(rawOverrides, dictionaryRecordKeyPattern)
    if (!overrides) return null
    if (Object.keys(overrides).some(key => !baseIdentities.has(key.toLocaleLowerCase()))) return null
    languages[languageKey] = Object.fromEntries(Object.entries(overrides).map(([key, child]) => (
      [baseIdentities.get(key.toLocaleLowerCase())!, child]
    )))
  }

  const dictionary: ProjectDictionary = {}
  if (value.active) dictionary.active = value.active
  if (Object.keys(base).length > 0) dictionary.base = base
  if (languageEntries.length > 0) dictionary.languages = languages
  return dictionary
}

export function parseProjectDictionaryText(content: string): ProjectDictionary | null {
  try {
    return parseProjectDictionary(JSON.parse(content))
  } catch {
    return null
  }
}

export function serializeProjectDictionary(dictionary: ProjectDictionary): string {
  const normalized = parseProjectDictionary(dictionary)
  if (!normalized) throw new Error('Invalid project dictionary')
  return JSON.stringify(normalized, null, 2)
}

export function resolveProjectDictionary(dictionary: ProjectDictionary): DictionaryResolution {
  const base = dictionary.base ?? {}
  if (!dictionary.active) return { values: { ...base }, warning: null }

  const languageEntry = Object.entries(dictionary.languages ?? {}).find(
    ([key]) => key.toLocaleLowerCase() === dictionary.active!.toLocaleLowerCase(),
  )
  if (!languageEntry) {
    return { values: { ...base }, warning: 'active-language-missing' }
  }
  return { values: { ...base, ...languageEntry[1] }, warning: null }
}
