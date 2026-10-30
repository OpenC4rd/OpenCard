import {
  dictionaryLanguageKeyPattern,
  dictionaryRecordKeyPattern,
  type ProjectDictionary,
} from './projectDictionary'

const WORKSHEET_NAME = 'Dictionary'
const METADATA_SHEET_NAME = '_OpenCard'
const FORMAT_NAME = 'opencard-dictionary'
const FORMAT_VERSION = 1
const FIRST_DATA_ROW = 3
const BASE_COLUMN = 2

type ExcelJsModule = typeof import('exceljs')

type ProjectDictionaryWorkbookLabels = {
  key: string
  base: string
}

export type ProjectDictionaryWorkbookImportResult = {
  dictionary: ProjectDictionary
  addedRecords: string[]
  addedLanguages: string[]
  updatedCells: number
}

class ProjectDictionaryWorkbookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectDictionaryWorkbookError'
  }
}

export async function exportProjectDictionaryWorkbook(
  dictionary: ProjectDictionary,
  labels: ProjectDictionaryWorkbookLabels,
): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJs()
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME)
  const languages = Object.keys(dictionary.languages ?? {})

  worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
  worksheet.getColumn(1).width = 28
  worksheet.getColumn(BASE_COLUMN).width = 32
  worksheet.getRow(1).hidden = true
  setCell(worksheet, 1, 1, 'recordKey')
  setCell(worksheet, 1, BASE_COLUMN, '$base')
  setCell(worksheet, 2, 1, labels.key)
  setCell(worksheet, 2, BASE_COLUMN, labels.base)

  languages.forEach((language, index) => {
    const columnNumber = BASE_COLUMN + index + 1
    worksheet.getColumn(columnNumber).width = 32
    setCell(worksheet, 1, columnNumber, language)
    setCell(worksheet, 2, columnNumber, language)
  })

  Object.entries(dictionary.base ?? {}).forEach(([recordKey, baseValue], index) => {
    const rowNumber = FIRST_DATA_ROW + index
    setCell(worksheet, rowNumber, 1, recordKey)
    setCell(worksheet, rowNumber, BASE_COLUMN, baseValue)
    languages.forEach((language, languageIndex) => {
      const target = worksheet.getCell(rowNumber, BASE_COLUMN + languageIndex + 1)
      const overrides = dictionary.languages?.[language] ?? {}
      target.value = Object.prototype.hasOwnProperty.call(overrides, recordKey)
        ? overrides[recordKey] ?? ''
        : { formula: `$B${rowNumber}`, result: baseValue }
    })
  })

  const metadata = workbook.addWorksheet(METADATA_SHEET_NAME)
  metadata.state = 'veryHidden'
  metadata.getCell('A1').value = 'format'
  metadata.getCell('B1').value = FORMAT_NAME
  metadata.getCell('A2').value = 'version'
  metadata.getCell('B2').value = FORMAT_VERSION

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
}

export async function importProjectDictionaryWorkbook(
  bytes: Uint8Array,
  current: ProjectDictionary,
): Promise<ProjectDictionaryWorkbookImportResult> {
  const ExcelJS = await loadExcelJs()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  validateMetadata(workbook)
  const worksheet = workbook.getWorksheet(WORKSHEET_NAME)
  if (!worksheet) throw new ProjectDictionaryWorkbookError(`Missing worksheet: ${WORKSHEET_NAME}`)
  if (readString(worksheet.getCell(1, BASE_COLUMN).value) !== '$base') {
    throw new ProjectDictionaryWorkbookError('Missing base dictionary column')
  }

  const languages = readLanguages(worksheet)
  const nextBase = { ...(current.base ?? {}) }
  const nextLanguages = Object.fromEntries(Object.entries(current.languages ?? {}).map(
    ([language, values]) => [language, { ...values }],
  ))
  const addedLanguages = languages.filter(language => !Object.keys(nextLanguages).some(
    currentLanguage => currentLanguage.toLocaleLowerCase() === language.toLocaleLowerCase(),
  ))
  for (const language of addedLanguages) nextLanguages[language] = {}

  const seenRecords = new Set<string>()
  const addedRecords: string[] = []
  let updatedCells = 0
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const recordKey = readString(worksheet.getCell(rowNumber, 1).value).trim()
    if (!recordKey) continue
    const identity = recordKey.toLocaleLowerCase()
    if (!dictionaryRecordKeyPattern.test(recordKey)) {
      throw new ProjectDictionaryWorkbookError(`Invalid record key in row ${rowNumber}: ${recordKey}`)
    }
    if (seenRecords.has(identity)) {
      throw new ProjectDictionaryWorkbookError(`Duplicate record key in row ${rowNumber}: ${recordKey}`)
    }
    seenRecords.add(identity)
    const existingKey = Object.keys(nextBase).find(key => key.toLocaleLowerCase() === identity)
    const targetKey = existingKey ?? recordKey
    if (!existingKey) addedRecords.push(recordKey)

    const baseValue = readEditableCell(worksheet.getCell(rowNumber, BASE_COLUMN), rowNumber, false) ?? ''
    if (nextBase[targetKey] !== baseValue) updatedCells += 1
    nextBase[targetKey] = baseValue
    languages.forEach((language, index) => {
      const values = nextLanguages[language]!
      const cell = worksheet.getCell(rowNumber, BASE_COLUMN + index + 1)
      const value = readEditableCell(cell, rowNumber, true)
      const previous = values[targetKey]
      if (value === null) {
        if (Object.prototype.hasOwnProperty.call(values, targetKey)) {
          delete values[targetKey]
          updatedCells += 1
        }
      } else if (previous !== value) {
        values[targetKey] = value
        updatedCells += 1
      }
    })
  }

  const dictionary: ProjectDictionary = {
    ...(current.active ? { active: current.active } : {}),
    ...(Object.keys(nextBase).length ? { base: nextBase } : {}),
    ...(Object.keys(nextLanguages).length ? { languages: nextLanguages } : {}),
  }
  return { dictionary, addedRecords, addedLanguages, updatedCells }
}

function readLanguages(worksheet: import('exceljs').Worksheet): string[] {
  const languages: string[] = []
  const identities = new Set<string>()
  for (let columnNumber = BASE_COLUMN + 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
    const language = (readString(worksheet.getCell(1, columnNumber).value)
      || readString(worksheet.getCell(2, columnNumber).value)).trim()
    if (!language && !columnHasValues(worksheet, columnNumber)) continue
    if (!dictionaryLanguageKeyPattern.test(language)) {
      throw new ProjectDictionaryWorkbookError(`Invalid language key in column ${columnNumber}: ${language}`)
    }
    const identity = language.toLocaleLowerCase()
    if (identities.has(identity)) throw new ProjectDictionaryWorkbookError(`Duplicate language key: ${language}`)
    identities.add(identity)
    languages.push(language)
  }
  return languages
}

function readEditableCell(cell: import('exceljs').Cell, rowNumber: number, inherited: boolean): string | null {
  if (cell.formula !== undefined) {
    if (inherited && normalizeFormula(cell.formula) === `B${rowNumber}`) return null
    throw new ProjectDictionaryWorkbookError(`Unsupported formula in ${cell.address}`)
  }
  if (inherited && (cell.value === null || cell.value === undefined || cell.value === '')) return null
  return readString(cell.value)
}

function validateMetadata(workbook: import('exceljs').Workbook): void {
  const metadata = workbook.getWorksheet(METADATA_SHEET_NAME)
  if (!metadata || readString(metadata.getCell('B1').value) !== FORMAT_NAME
    || Number(metadata.getCell('B2').value) !== FORMAT_VERSION) {
    throw new ProjectDictionaryWorkbookError('Unsupported OpenCard dictionary workbook')
  }
}

function columnHasValues(worksheet: import('exceljs').Worksheet, columnNumber: number): boolean {
  for (let row = FIRST_DATA_ROW; row <= worksheet.rowCount; row += 1) {
    if (worksheet.getCell(row, columnNumber).value != null) return true
  }
  return false
}

function normalizeFormula(formula: string): string {
  return formula.replace(/\$/g, '').replace(/^=/, '').toLocaleUpperCase()
}

function readString(value: import('exceljs').CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if ('richText' in value) return value.richText.map(part => part.text).join('')
  if ('text' in value) return value.text
  return ''
}

function setCell(worksheet: import('exceljs').Worksheet, row: number, column: number, value: string): void {
  worksheet.getCell(row, column).value = value
}

async function loadExcelJs(): Promise<ExcelJsModule> {
  return await import('exceljs')
}
