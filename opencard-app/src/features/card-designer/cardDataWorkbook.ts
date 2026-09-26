import type { CardStoredValue, CardDocument, CardInstanceRecord } from '../../entities/card/model'
import { getPropertyFieldTypeOptions } from '../../entities/card/schema'
import type { PropertyEditorFieldDefinition } from '../../shared/ui/property-editor/propertyEditor.types'
import type {
  CdeDataTableCell,
  CdeDataTableColumn,
  CdeDataTableFaceGroup,
} from './useCdeDataTableModel'

const BLUEPRINT_CARD_ID = '__blueprint__'
const WORKSHEET_NAME = 'Card Data'
const METADATA_SHEET_NAME = '_OpenCard'
const FORMAT_NAME = 'opencard-data-table'
const FORMAT_VERSION = 1
const FIRST_DATA_COLUMN = 6
const FIRST_DATA_ROW = 3

type ExcelJsModule = typeof import('exceljs')

export type CardDataWorkbookExportInput = {
  document: CardDocument
  columns: readonly CdeDataTableColumn[]
  faceGroups: readonly CdeDataTableFaceGroup[]
  exportInstanceIds: readonly string[]
  labels: { face: string; block: string; field: string }
}

export type CardDataWorkbookUpdate = {
  cardId: string
  blockId: string
  fieldKey: string
  value?: CardStoredValue
  reset: boolean
}

export type CardDataWorkbookImportResult = {
  updates: CardDataWorkbookUpdate[]
  blockRenames: Array<{ blockId: string; previousName: string; nextName: string }>
  newInstances: CardInstanceRecord[]
  warnings: string[]
}

export class CardDataWorkbookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardDataWorkbookError'
  }
}

export async function exportCardDataWorkbook(
  input: CardDataWorkbookExportInput,
): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJs()
  const workbook = new ExcelJS.Workbook()
  workbook.calcProperties.fullCalcOnLoad = true

  const worksheet = workbook.addWorksheet(WORKSHEET_NAME)
  worksheet.views = [{ state: 'frozen', xSplit: FIRST_DATA_COLUMN - 1, ySplit: 2 }]
  worksheet.columns = [
    { key: 'blockId', width: 2, hidden: true },
    { key: 'fieldKey', width: 2, hidden: true },
    { key: 'face', width: 12 },
    { key: 'blockName', width: 28 },
    { key: 'fieldName', width: 28 },
  ]
  worksheet.getRow(1).hidden = true
  setCell(worksheet, 1, 1, 'blockId')
  setCell(worksheet, 1, 2, 'fieldKey')
  setCell(worksheet, 1, 3, 'face')
  setCell(worksheet, 1, 4, 'blockName')
  setCell(worksheet, 1, 5, 'fieldName')

  const includedColumns = input.columns.filter(column => (
    column.kind === 'blueprint' || input.exportInstanceIds.includes(column.key)
  ))
  includedColumns.forEach((column, index) => {
    const columnNumber = FIRST_DATA_COLUMN + index
    const worksheetColumn = worksheet.getColumn(columnNumber)
    worksheetColumn.width = 32
    worksheetColumn.protection = { locked: false }
    setCell(worksheet, 1, columnNumber, column.key)
    worksheet.getCell(1, columnNumber).protection = { locked: true }
    setCell(worksheet, 2, columnNumber, column.title)
    worksheet.getCell(2, columnNumber).protection = { locked: true }
  })
  const newInstanceColumnNumber = FIRST_DATA_COLUMN + includedColumns.length
  worksheet.getColumn(newInstanceColumnNumber).width = 32
  worksheet.getColumn(newInstanceColumnNumber).protection = { locked: false }
  setCell(worksheet, 2, 3, input.labels.face)
  setCell(worksheet, 2, 4, input.labels.block)
  setCell(worksheet, 2, 5, input.labels.field)

  let rowNumber = FIRST_DATA_ROW
  for (const face of input.faceGroups) {
    for (const block of face.blocks) {
      for (const field of block.fields) {
        setCell(worksheet, rowNumber, 1, block.key)
        setCell(worksheet, rowNumber, 2, field.key)
        setCell(worksheet, rowNumber, 3, face.title)
        setCell(worksheet, rowNumber, 4, block.title)
        worksheet.getCell(rowNumber, 4).protection = { locked: false }
        setCell(worksheet, rowNumber, 5, field.title)
        const cells = new Map(field.cells.map(cell => [cell.cardId, cell]))
        includedColumns.forEach((column, index) => {
          const columnNumber = FIRST_DATA_COLUMN + index
          const cell = cells.get(column.key)
          if (!cell) return
          writeExportCell(worksheet, rowNumber, columnNumber, cell, column.kind, field.definition)
        })
        applyCellValidation(worksheet.getCell(rowNumber, newInstanceColumnNumber), field.definition)
        rowNumber += 1
      }
    }
  }

  const metadata = workbook.addWorksheet(METADATA_SHEET_NAME)
  metadata.state = 'veryHidden'
  metadata.getCell('A1').value = 'format'
  metadata.getCell('B1').value = FORMAT_NAME
  metadata.getCell('A2').value = 'version'
  metadata.getCell('B2').value = FORMAT_VERSION
  metadata.getCell('A3').value = 'documentId'
  metadata.getCell('B3').value = input.document.id

  await worksheet.protect('', {
    insertColumns: true,
    selectLockedCells: true,
    selectUnlockedCells: true,
  })
  await metadata.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: false,
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
}

export async function importCardDataWorkbook(
  bytes: Uint8Array,
  document: CardDocument,
  faceGroups: readonly CdeDataTableFaceGroup[],
): Promise<CardDataWorkbookImportResult> {
  const ExcelJS = await loadExcelJs()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  validateMetadata(workbook, document)

  const worksheet = workbook.getWorksheet(WORKSHEET_NAME)
  if (!worksheet) throw new CardDataWorkbookError(`Missing worksheet: ${WORKSHEET_NAME}`)

  const visibleFields = new Set<string>()
  const blockSamples = new Map<string, unknown>()
  const currentCells = new Map<string, CdeDataTableCell>()
  for (const face of faceGroups) {
    for (const block of face.blocks) {
      for (const field of block.fields) {
        const key = `${block.key}\u0000${field.key}`
        visibleFields.add(key)
        const blueprintCell = field.cells.find(cell => cell.cardId === BLUEPRINT_CARD_ID)
        blockSamples.set(key, blueprintCell?.value)
        for (const cell of field.cells) currentCells.set(`${key}\u0000${cell.cardId}`, cell)
      }
    }
  }

  const currentInstanceIds = new Set(document.instances.map(instance => instance.id))
  const columnTargets = readColumnTargets(worksheet, currentInstanceIds)
  const warnings = columnTargets.warnings
  const updates: CardDataWorkbookUpdate[] = []
  const newInstanceIds = new Set(columnTargets.newInstances.map(instance => instance.id))
  const seenFields = new Set<string>()
  const blockTitles = new Map<string, string>()
  for (const face of faceGroups) {
    for (const block of face.blocks) blockTitles.set(block.key, block.title)
  }
  const renameCandidates = new Map<string, Set<string>>()
  function appendUpdate(update: CardDataWorkbookUpdate): void {
    if (newInstanceIds.has(update.cardId)) {
      if (!update.reset) updates.push(update)
      return
    }
    const current = currentCells.get(`${update.blockId}\u0000${update.fieldKey}\u0000${update.cardId}`)
    if (!current) {
      updates.push(update)
      return
    }
    if (update.reset) {
      if (current.overridden) updates.push(update)
      return
    }
    if (update.value === undefined) return
    if (update.cardId !== BLUEPRINT_CARD_ID && current.inherited) {
      updates.push(update)
      return
    }
    if (!storedValuesEqual(current.value, update.value)) updates.push(update)
  }

  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const blockId = readString(worksheet.getCell(rowNumber, 1).value)
    const fieldKey = readString(worksheet.getCell(rowNumber, 2).value)
    if (!blockId && !fieldKey) continue
    if (!blockId || !fieldKey) {
      throw new CardDataWorkbookError(`Row ${rowNumber} has an incomplete field identity`)
    }
    const fieldIdentity = `${blockId}\u0000${fieldKey}`
    if (seenFields.has(fieldIdentity)) {
      throw new CardDataWorkbookError(`Workbook contains duplicate field ${blockId}.${fieldKey}`)
    }
    seenFields.add(fieldIdentity)
    if (!visibleFields.has(fieldIdentity)) {
      throw new CardDataWorkbookError(`Field ${blockId}.${fieldKey} is not visible in the Data Table`)
    }

    const exportedBlockTitle = blockTitles.get(blockId)
    const workbookBlockTitle = readString(worksheet.getCell(rowNumber, 4).value)
    if (exportedBlockTitle !== undefined && workbookBlockTitle !== exportedBlockTitle) {
      const candidates = renameCandidates.get(blockId) ?? new Set<string>()
      candidates.add(workbookBlockTitle)
      renameCandidates.set(blockId, candidates)
    }

    const sample = blockSamples.get(fieldIdentity)
    columnTargets.columns.forEach(({ columnNumber, cardId }) => {
      const cell = worksheet.getCell(rowNumber, columnNumber)
      const formula = cell.formula
      if (formula !== undefined) {
        if (cardId === BLUEPRINT_CARD_ID) {
          throw new CardDataWorkbookError(`Blueprint cell ${cell.address} cannot contain an inherit formula`)
        }
        if (normalizeFormula(formula) === `F${rowNumber}`) {
          appendUpdate({ cardId, blockId, fieldKey, reset: true })
          return
        }
        throw new CardDataWorkbookError(`Unsupported formula in ${cell.address}`)
      }
      if (cardId !== BLUEPRINT_CARD_ID && (cell.value === null || cell.value === undefined || cell.value === '')) {
        appendUpdate({ cardId, blockId, fieldKey, reset: true })
        return
      }
      const decodedValue = decodeCellValue(cell.value, sample, cell.address)
      appendUpdate({
        cardId,
        blockId,
        fieldKey,
        value: decodedValue,
        reset: false,
      })
    })
  }

  const blockRenames = Array.from(renameCandidates, ([blockId, candidates]) => {
    if (candidates.size > 1) {
      throw new CardDataWorkbookError(`Workbook contains conflicting names for Block ${blockId}`)
    }
    return {
      blockId,
      previousName: blockTitles.get(blockId) ?? blockId,
      nextName: Array.from(candidates)[0] ?? '',
    }
  })

  return { updates, blockRenames, newInstances: columnTargets.newInstances, warnings }
}

async function loadExcelJs(): Promise<ExcelJsModule> {
  return await import('exceljs')
}

function writeExportCell(
  worksheet: import('exceljs').Worksheet,
  rowNumber: number,
  columnNumber: number,
  cell: CdeDataTableCell,
  kind: CdeDataTableColumn['kind'],
  definition: PropertyEditorFieldDefinition,
): void {
  const target = worksheet.getCell(rowNumber, columnNumber)
  target.protection = { locked: false }
  applyCellValidation(target, definition)
  if (kind === 'instance' && cell.inherited) {
    const blueprintColumn = worksheet.getColumn(FIRST_DATA_COLUMN).letter
    target.value = { formula: `$${blueprintColumn}${rowNumber}`, result: encodeCellValue(cell.value) }
    return
  }
  target.value = encodeCellValue(cell.value)
}

function validateMetadata(workbook: import('exceljs').Workbook, document: CardDocument): void {
  const metadata = workbook.getWorksheet(METADATA_SHEET_NAME)
  if (!metadata) throw new CardDataWorkbookError('Missing OpenCard workbook metadata')
  if (readString(metadata.getCell('B1').value) !== FORMAT_NAME) {
    throw new CardDataWorkbookError('Unsupported OpenCard workbook format')
  }
  if (Number(metadata.getCell('B2').value) !== FORMAT_VERSION) {
    throw new CardDataWorkbookError('Unsupported OpenCard workbook version')
  }
  if (readString(metadata.getCell('B3').value) !== document.id) {
    throw new CardDataWorkbookError('Workbook belongs to a different card document')
  }
}

function readColumnTargets(
  worksheet: import('exceljs').Worksheet,
  currentInstanceIds: ReadonlySet<string>,
): {
  columns: Array<{ columnNumber: number; cardId: string }>
  newInstances: CardInstanceRecord[]
  warnings: string[]
} {
  const columns: Array<{ columnNumber: number; cardId: string }> = []
  const newInstances: CardInstanceRecord[] = []
  const warnings: string[] = []
  const seenCardIds = new Set<string>()
  for (let columnNumber = FIRST_DATA_COLUMN; columnNumber <= worksheet.columnCount; columnNumber += 1) {
    const cardId = readString(worksheet.getCell(1, columnNumber).value)
    if (!cardId) {
      const instanceName = readString(worksheet.getCell(2, columnNumber).value)
      if (!instanceName) {
        if (columnHasData(worksheet, columnNumber)) {
          throw new CardDataWorkbookError(`Column ${worksheet.getColumn(columnNumber).letter} has data but no instance name`)
        }
        continue
      }
      const newInstance: CardInstanceRecord = {
        type: 'card-instance',
        id: `instance-${crypto.randomUUID()}`,
        name: instanceName,
        amount: '1',
        data: {},
      }
      newInstances.push(newInstance)
      columns.push({ columnNumber, cardId: newInstance.id })
      continue
    }
    if (seenCardIds.has(cardId)) {
      throw new CardDataWorkbookError(`Workbook contains duplicate card column ${cardId}`)
    }
    seenCardIds.add(cardId)
    if (cardId === BLUEPRINT_CARD_ID || currentInstanceIds.has(cardId)) {
      columns.push({ columnNumber, cardId })
    } else {
      warnings.push(`Instance ${cardId} is no longer present and was skipped`)
    }
  }
  if (!columns.some(column => column.cardId === BLUEPRINT_CARD_ID)) {
    throw new CardDataWorkbookError('Workbook is missing the Blueprint column')
  }
  return { columns, newInstances, warnings }
}

function columnHasData(worksheet: import('exceljs').Worksheet, columnNumber: number): boolean {
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const value = worksheet.getCell(rowNumber, columnNumber).value
    if (value !== null && value !== undefined && value !== '') return true
  }
  return false
}

function applyCellValidation(
  cell: import('exceljs').Cell,
  definition: PropertyEditorFieldDefinition,
): void {
  const values = definition.fieldType === 'boolean'
    ? ['true', 'false']
    : definition.fieldType === 'string'
      ? definition.options
      : getPropertyFieldTypeOptions(definition.fieldType.replace(/\[\]$/, '') as Parameters<typeof getPropertyFieldTypeOptions>[0])
  if (!values?.length) return
  cell.dataValidation = {
    type: 'list',
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'information',
    formulae: [`"${values.join(',').replace(/"/g, '""')}"`],
  }
}

function encodeCellValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  const serialized = JSON.stringify(value)
  return serialized === undefined ? '' : serialized
}

function decodeCellValue(value: unknown, sample: unknown, address: string): CardStoredValue {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    if (Array.isArray(sample) || (sample !== null && typeof sample === 'object')) {
      try {
        const parsed = JSON.parse(value) as unknown
        if (isStoredValue(parsed)) return parsed
      } catch {
        // Fall through to the same useful validation error below.
      }
      throw new CardDataWorkbookError(`Cell ${address} must contain valid JSON`)
    }
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new CardDataWorkbookError(`Cell ${address} contains an unsupported value`)
}

function isStoredValue(value: unknown): value is CardStoredValue {
  if (typeof value === 'string') return true
  if (Array.isArray(value)) return value.every(isStoredValue)
  if (!value || typeof value !== 'object') return false
  return Object.values(value).every(isStoredValue)
}

function storedValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizeFormula(formula: string): string {
  return formula.replace(/^=/, '').replace(/\$/g, '').replace(/\s+/g, '').toUpperCase()
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function setCell(
  worksheet: import('exceljs').Worksheet,
  rowNumber: number,
  columnNumber: number,
  value: string,
): void {
  worksheet.getCell(rowNumber, columnNumber).value = value
}
