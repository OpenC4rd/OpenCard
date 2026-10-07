import {
  dictionaryLanguageKeyPattern,
  dictionaryRecordKeyPattern,
  type ProjectDictionary,
} from './projectDictionary'

export const DICTIONARY_BASE_COLUMN_KEY = '$base'

export type DictionaryGridColumn = {
  key: string
  sourceKey?: string
  kind: 'base' | 'language'
  active: boolean
}

export type DictionaryGridCell = {
  columnKey: string
  recordKey: string
  value: string
  inherited: boolean
  overridden: boolean
}

export type DictionaryGridRow = {
  key: string
  cells: DictionaryGridCell[]
}

export type DictionaryGridProjection = {
  columns: DictionaryGridColumn[]
  rows: DictionaryGridRow[]
}

function identity(value: string): string {
  return value.toLocaleLowerCase()
}

function cloneDictionary(dictionary: ProjectDictionary): ProjectDictionary {
  return {
    ...(dictionary.active ? { active: dictionary.active } : {}),
    ...(dictionary.base ? { base: { ...dictionary.base } } : {}),
    ...(dictionary.languages ? {
      languages: Object.fromEntries(Object.entries(dictionary.languages).map(([key, overrides]) => (
        [key, { ...overrides }]
      ))),
    } : {}),
  }
}

function replaceEntryKey<T>(
  record: Record<string, T>,
  currentKey: string,
  nextKey: string,
): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => (
    [key === currentKey ? nextKey : key, value]
  )))
}

export function projectDictionaryGrid(dictionary: ProjectDictionary): DictionaryGridProjection {
  const base = dictionary.base ?? {}
  const languages = dictionary.languages ?? {}
  const columns: DictionaryGridColumn[] = [
    {
      key: DICTIONARY_BASE_COLUMN_KEY,
      kind: 'base',
      active: !dictionary.active,
    },
    ...Object.keys(languages).map(key => ({
      key,
      sourceKey: key,
      kind: 'language' as const,
      active: identity(dictionary.active ?? '') === identity(key),
    })),
  ]
  const rows = Object.keys(base).map(recordKey => ({
    key: recordKey,
    cells: columns.map(column => {
      if (column.kind === 'base') {
        return {
          columnKey: column.key,
          recordKey,
          value: base[recordKey] ?? '',
          inherited: false,
          overridden: true,
        }
      }
      const overrides = languages[column.sourceKey!] ?? {}
      const overridden = Object.prototype.hasOwnProperty.call(overrides, recordKey)
      return {
        columnKey: column.key,
        recordKey,
        value: overridden ? overrides[recordKey] ?? '' : base[recordKey] ?? '',
        inherited: !overridden,
        overridden,
      }
    }),
  }))
  return { columns, rows }
}

export function canUseDictionaryRecordKey(
  dictionary: ProjectDictionary,
  candidate: string,
  current?: string,
): boolean {
  const key = candidate.trim()
  return dictionaryRecordKeyPattern.test(key) && !Object.keys(dictionary.base ?? {}).some(existing => (
    identity(existing) === identity(key) && identity(existing) !== identity(current ?? '')
  ))
}

export function canUseDictionaryLanguageKey(
  dictionary: ProjectDictionary,
  candidate: string,
  current?: string,
): boolean {
  const key = candidate.trim()
  return dictionaryLanguageKeyPattern.test(key) && !Object.keys(dictionary.languages ?? {}).some(existing => (
    identity(existing) === identity(key) && identity(existing) !== identity(current ?? '')
  ))
}

export function addDictionaryRecord(dictionary: ProjectDictionary, candidate: string): ProjectDictionary {
  if (!canUseDictionaryRecordKey(dictionary, candidate)) return dictionary
  const key = candidate.trim()
  return { ...dictionary, base: { ...(dictionary.base ?? {}), [key]: '' } }
}

export function addDictionaryLanguage(dictionary: ProjectDictionary, candidate: string): ProjectDictionary {
  if (!canUseDictionaryLanguageKey(dictionary, candidate)) return dictionary
  const key = candidate.trim()
  return { ...dictionary, languages: { ...(dictionary.languages ?? {}), [key]: {} } }
}

export function setDictionaryCellValue(
  dictionary: ProjectDictionary,
  columnKey: string,
  recordKey: string,
  value: string,
): ProjectDictionary {
  if (!Object.prototype.hasOwnProperty.call(dictionary.base ?? {}, recordKey)) return dictionary
  if (columnKey === DICTIONARY_BASE_COLUMN_KEY) {
    return { ...dictionary, base: { ...(dictionary.base ?? {}), [recordKey]: value } }
  }
  if (!Object.prototype.hasOwnProperty.call(dictionary.languages ?? {}, columnKey)) return dictionary
  return {
    ...dictionary,
    languages: {
      ...(dictionary.languages ?? {}),
      [columnKey]: { ...(dictionary.languages?.[columnKey] ?? {}), [recordKey]: value },
    },
  }
}

export function resetDictionaryOverride(
  dictionary: ProjectDictionary,
  languageKey: string,
  recordKey: string,
): ProjectDictionary {
  if (!Object.prototype.hasOwnProperty.call(dictionary.languages?.[languageKey] ?? {}, recordKey)) {
    return dictionary
  }
  const next = cloneDictionary(dictionary)
  delete next.languages![languageKey]![recordKey]
  return next
}

export function setDictionaryActiveLanguage(
  dictionary: ProjectDictionary,
  languageKey?: string,
): ProjectDictionary {
  if (!languageKey) {
    const next = { ...dictionary }
    delete next.active
    return next
  }
  if (!Object.keys(dictionary.languages ?? {}).some(key => identity(key) === identity(languageKey))) {
    return dictionary
  }
  return { ...dictionary, active: languageKey }
}

export function renameDictionaryRecord(
  dictionary: ProjectDictionary,
  recordKey: string,
  candidate: string,
): ProjectDictionary {
  if (!Object.prototype.hasOwnProperty.call(dictionary.base ?? {}, recordKey)
    || !canUseDictionaryRecordKey(dictionary, candidate, recordKey)) return dictionary
  const nextKey = candidate.trim()
  const next = cloneDictionary(dictionary)
  next.base = replaceEntryKey(next.base ?? {}, recordKey, nextKey)
  for (const [language, overrides] of Object.entries(next.languages ?? {})) {
    next.languages![language] = replaceEntryKey(overrides, recordKey, nextKey)
  }
  return next
}

export function renameDictionaryLanguage(
  dictionary: ProjectDictionary,
  languageKey: string,
  candidate: string,
): ProjectDictionary {
  if (!Object.prototype.hasOwnProperty.call(dictionary.languages ?? {}, languageKey)
    || !canUseDictionaryLanguageKey(dictionary, candidate, languageKey)) return dictionary
  const nextKey = candidate.trim()
  const next = cloneDictionary(dictionary)
  next.languages = replaceEntryKey(next.languages ?? {}, languageKey, nextKey)
  if (identity(next.active ?? '') === identity(languageKey)) next.active = nextKey
  return next
}

export function deleteDictionaryRecords(
  dictionary: ProjectDictionary,
  recordKeys: readonly string[],
): ProjectDictionary {
  const selected = new Set(recordKeys)
  if (!Object.keys(dictionary.base ?? {}).some(key => selected.has(key))) return dictionary
  const next = cloneDictionary(dictionary)
  next.base = Object.fromEntries(Object.entries(next.base ?? {}).filter(([key]) => !selected.has(key)))
  for (const [language, overrides] of Object.entries(next.languages ?? {})) {
    next.languages![language] = Object.fromEntries(Object.entries(overrides).filter(([key]) => !selected.has(key)))
  }
  if (Object.keys(next.base).length === 0) delete next.base
  return next
}

export function deleteDictionaryLanguages(
  dictionary: ProjectDictionary,
  languageKeys: readonly string[],
): ProjectDictionary {
  const selectedIdentities = new Set(languageKeys.map(identity))
  if (!Object.keys(dictionary.languages ?? {}).some(key => selectedIdentities.has(identity(key)))) return dictionary
  const next = cloneDictionary(dictionary)
  next.languages = Object.fromEntries(Object.entries(next.languages ?? {}).filter(
    ([key]) => !selectedIdentities.has(identity(key)),
  ))
  if (Object.keys(next.languages).length === 0) delete next.languages
  if (selectedIdentities.has(identity(next.active ?? ''))) delete next.active
  return next
}
