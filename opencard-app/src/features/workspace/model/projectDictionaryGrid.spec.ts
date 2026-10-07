import { describe, expect, it } from 'vitest'
import type { ProjectDictionary } from './projectDictionary'
import {
  DICTIONARY_BASE_COLUMN_KEY,
  addDictionaryLanguage,
  addDictionaryRecord,
  canUseDictionaryLanguageKey,
  canUseDictionaryRecordKey,
  deleteDictionaryLanguages,
  deleteDictionaryRecords,
  projectDictionaryGrid,
  renameDictionaryLanguage,
  renameDictionaryRecord,
  resetDictionaryOverride,
  setDictionaryActiveLanguage,
  setDictionaryCellValue,
} from './projectDictionaryGrid'

const dictionary: ProjectDictionary = {
  active: 'en_US',
  base: { title: '默认标题', body: '默认正文' },
  languages: {
    en_US: { title: 'Title' },
    ja_JP: {},
  },
}

describe('projectDictionaryGrid', () => {
  it('projects insertion-ordered columns, rows, and explicit inheritance', () => {
    expect(projectDictionaryGrid(dictionary)).toEqual({
      columns: [
        { key: DICTIONARY_BASE_COLUMN_KEY, kind: 'base', active: false },
        { key: 'en_US', sourceKey: 'en_US', kind: 'language', active: true },
        { key: 'ja_JP', sourceKey: 'ja_JP', kind: 'language', active: false },
      ],
      rows: [
        {
          key: 'title',
          cells: [
            { columnKey: DICTIONARY_BASE_COLUMN_KEY, recordKey: 'title', value: '默认标题', inherited: false, overridden: true },
            { columnKey: 'en_US', recordKey: 'title', value: 'Title', inherited: false, overridden: true },
            { columnKey: 'ja_JP', recordKey: 'title', value: '默认标题', inherited: true, overridden: false },
          ],
        },
        {
          key: 'body',
          cells: [
            { columnKey: DICTIONARY_BASE_COLUMN_KEY, recordKey: 'body', value: '默认正文', inherited: false, overridden: true },
            { columnKey: 'en_US', recordKey: 'body', value: '默认正文', inherited: true, overridden: false },
            { columnKey: 'ja_JP', recordKey: 'body', value: '默认正文', inherited: true, overridden: false },
          ],
        },
      ],
    })
  })

  it('validates and appends keys without introducing row ids', () => {
    expect(canUseDictionaryRecordKey(dictionary, 'Title')).toBe(false)
    expect(canUseDictionaryRecordKey(dictionary, 'new.key')).toBe(true)
    expect(canUseDictionaryLanguageKey(dictionary, 'EN_us')).toBe(false)
    expect(canUseDictionaryLanguageKey(dictionary, 'zh_CN')).toBe(true)
    expect(addDictionaryRecord(dictionary, ' new.key ').base).toEqual({
      title: '默认标题', body: '默认正文', 'new.key': '',
    })
    expect(addDictionaryLanguage(dictionary, 'zh_CN').languages).toEqual({
      en_US: { title: 'Title' }, ja_JP: {}, zh_CN: {},
    })
  })

  it('writes base values and creates or resets language overrides immutably', () => {
    const withBase = setDictionaryCellValue(dictionary, DICTIONARY_BASE_COLUMN_KEY, 'title', '新标题')
    expect(withBase.base?.title).toBe('新标题')
    const withOverride = setDictionaryCellValue(dictionary, 'ja_JP', 'body', '本文')
    expect(withOverride.languages?.ja_JP).toEqual({ body: '本文' })
    expect(dictionary.languages?.ja_JP).toEqual({})
    expect(resetDictionaryOverride(withOverride, 'ja_JP', 'body').languages?.ja_JP).toEqual({})
  })

  it('renames records and languages in place while migrating references', () => {
    const renamedRecord = renameDictionaryRecord(dictionary, 'title', 'heading')
    expect(Object.keys(renamedRecord.base ?? {})).toEqual(['heading', 'body'])
    expect(renamedRecord.languages?.en_US).toEqual({ heading: 'Title' })

    const renamedLanguage = renameDictionaryLanguage(dictionary, 'en_US', 'en_GB')
    expect(Object.keys(renamedLanguage.languages ?? {})).toEqual(['en_GB', 'ja_JP'])
    expect(renamedLanguage.active).toBe('en_GB')
  })

  it('deletes multiple structures and clears active language when needed', () => {
    expect(deleteDictionaryRecords(dictionary, ['title']).base).toEqual({ body: '默认正文' })
    expect(deleteDictionaryRecords(dictionary, ['title']).languages?.en_US).toEqual({})
    expect(deleteDictionaryLanguages(dictionary, ['EN_us'])).toEqual({
      base: dictionary.base,
      languages: { ja_JP: {} },
    })
  })

  it('sets base or an existing language as the active source', () => {
    expect(setDictionaryActiveLanguage(dictionary, 'ja_JP').active).toBe('ja_JP')
    expect(setDictionaryActiveLanguage(dictionary, undefined)).not.toHaveProperty('active')
    expect(setDictionaryActiveLanguage(dictionary, 'fr_FR')).toBe(dictionary)
  })

})
