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
const SHEET_LAST_ROW = 1_048_576
const THEME_ACCENT_TOKEN = '--oc-accent'
const THEME_ACCENT_TEXT_TOKEN = '--oc-accent-fg'
const THEME_FONT_TOKEN = '--oc-font-sans'
const FALLBACK_ACCENT = '#9045F9'
const FALLBACK_ACCENT_TEXT = '#F5F2FF'
const FALLBACK_FONT_NAME = 'Microsoft YaHei UI'
const MIN_COLUMN_WIDTH = 10
const MAX_COLUMN_WIDTH = 42
const MIN_TYPING_COLUMN_WIDTH = 24

type ExcelJsModule = typeof import('exceljs')

type CardDataWorkbookExportInput = {
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

class CardDataWorkbookError extends Error {
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

  const palette = createWorkbookPalette()
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME)
  worksheet.views = [
    { state: 'frozen', xSplit: FIRST_DATA_COLUMN - 1, ySplit: 2, showGridLines: false },
  ]
  worksheet.properties.tabColor = { argb: palette.accent }
  worksheet.columns = [
    { key: 'blockId', width: 2, hidden: true },
    { key: 'fieldKey', width: 2, hidden: true },
    { key: 'face', width: 12 },
    { key: 'blockName', width: 24 },
    { key: 'fieldName', width: 24 },
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
    setCell(worksheet, 1, columnNumber, column.key)
    setCell(worksheet, 2, columnNumber, column.title)
    if (column.kind !== 'blueprint') {
      worksheet.getCell(2, columnNumber).protection = { locked: false }
    }
  })
  const newInstanceColumnNumber = FIRST_DATA_COLUMN + includedColumns.length
  worksheet.getCell(2, newInstanceColumnNumber).protection = { locked: false }
  setCell(worksheet, 2, 3, input.labels.face)
  setCell(worksheet, 2, 4, input.labels.block)
  setCell(worksheet, 2, 5, input.labels.field)
  for (let columnNumber = 1; columnNumber <= newInstanceColumnNumber; columnNumber += 1) {
    styleHeaderCell(worksheet.getCell(2, columnNumber), palette)
  }
  worksheet.getRow(2).height = 26

  let rowNumber = FIRST_DATA_ROW
  const numericRows = new Set<number>()
  // 每行属于第几个卡面、第几个 Block，用来按三层节奏交替底色
  const rowFaces: number[] = []
  const rowBlocks: number[] = []
  let faceIndex = -1
  let blockIndex = -1
  for (const face of input.faceGroups) {
    faceIndex += 1
    for (const block of face.blocks) {
      blockIndex += 1
      for (const field of block.fields) {
        if (field.definition.fieldType === 'number') numericRows.add(rowNumber)
        rowFaces.push(faceIndex)
        rowBlocks.push(blockIndex)
        setCell(worksheet, rowNumber, 1, block.key)
        setCell(worksheet, rowNumber, 2, field.key)
        setCell(worksheet, rowNumber, 3, face.title)
        setCell(worksheet, rowNumber, 4, block.title)
        setCell(worksheet, rowNumber, 5, field.title)
        const cells = new Map(field.cells.map(cell => [cell.cardId, cell]))
        includedColumns.forEach((column, index) => {
          const columnNumber = FIRST_DATA_COLUMN + index
          const cell = cells.get(column.key)
          if (!cell) return
          writeExportCell(worksheet, rowNumber, columnNumber, cell, column.kind, field.definition)
        })
        const newInstanceCell = worksheet.getCell(rowNumber, newInstanceColumnNumber)
        newInstanceCell.protection = { locked: false }
        applyCellValidation(newInstanceCell, field.definition)
        rowNumber += 1
      }
    }
  }

  // 数据行下面空一行，再下一行当注释行：左边写驱动说明，最后一列提示还能向右加列
  const tableEndRow = rowNumber - 1
  const noteRow = tableEndRow + 2
  worksheet.getRow(tableEndRow + 1).height = 8
  const noteFont = { name: palette.fontName, size: 10, color: { argb: palette.mutedText } }
  const noteCell = worksheet.getCell(noteRow, 3)
  noteCell.value = 'OpenCard 驱动'
  noteCell.font = noteFont
  noteCell.alignment = { vertical: 'middle' }
  const hintCell = worksheet.getCell(noteRow, newInstanceColumnNumber)
  hintCell.value = '你可以向右拓展更多列以在导入时创建新实例'
  hintCell.font = noteFont
  hintCell.alignment = { vertical: 'middle' }

  // 注释行以下是锁定的空白区，用淡淡的斜线画出来；条件格式能一直铺到表格末尾，不产生单元格
  worksheet.addConditionalFormatting({
    ref: `A${noteRow + 1}:${worksheet.getColumn(newInstanceColumnNumber).letter}${SHEET_LAST_ROW}`,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`ROW()>${noteRow}`],
        style: { fill: { type: 'pattern', pattern: 'lightUp', bgColor: { argb: palette.hatch } } },
      },
    ],
  })

  // 表格外观：三层交替底色 —— 第 1 列按卡面、第 2 列按 Block、第 3 列起按行；格子本身是主题色田字边框
  const blockBounds: Array<{ blockId: string; startRow: number; endRow: number }> = []
  for (let dataRow = FIRST_DATA_ROW; dataRow <= tableEndRow; dataRow += 1) {
    const blockId = readString(worksheet.getCell(dataRow, 1).value)
    const bounds = blockBounds[blockBounds.length - 1]
    if (bounds?.blockId === blockId) bounds.endRow = dataRow
    else blockBounds.push({ blockId, startRow: dataRow, endRow: dataRow })
  }
  const bandFor = (index: number): string => (index % 2 === 0 ? palette.bandTint : 'FFFFFFFF')
  for (let dataRow = FIRST_DATA_ROW; dataRow <= tableEndRow; dataRow += 1) {
    const rowIndex = dataRow - FIRST_DATA_ROW
    worksheet.getRow(dataRow).height = 20
    const faceFill = bandFor(rowFaces[rowIndex] ?? 0)
    const blockFill = bandFor(rowBlocks[rowIndex] ?? 0)
    const rowFill = bandFor(rowIndex)
    for (let columnNumber = 1; columnNumber <= newInstanceColumnNumber; columnNumber += 1) {
      const cell = worksheet.getCell(dataRow, columnNumber)
      if (columnNumber >= FIRST_DATA_COLUMN) cell.protection = { locked: false }
      const fill = columnNumber === 3 ? faceFill : columnNumber === 4 ? blockFill : rowFill
      styleBodyCell(cell, columnNumber, palette, { fill, numeric: numericRows.has(dataRow) })
    }
  }
  const faceBounds: Array<{ faceIndex: number; startRow: number; endRow: number }> = []
  for (let dataRow = FIRST_DATA_ROW; dataRow <= tableEndRow; dataRow += 1) {
    const rowFaceIndex = rowFaces[dataRow - FIRST_DATA_ROW] ?? 0
    const bounds = faceBounds[faceBounds.length - 1]
    if (bounds?.faceIndex === rowFaceIndex) bounds.endRow = dataRow
    else faceBounds.push({ faceIndex: rowFaceIndex, startRow: dataRow, endRow: dataRow })
  }
  // 先把合并区里重复的从属格清空，再合并：合并后从属格与主格是同一个对象，那时再清会把文字一起抹掉
  const mergeColumn = (
    columnNumber: number,
    ranges: ReadonlyArray<{ startRow: number; endRow: number }>,
  ): void => {
    for (const range of ranges) {
      if (range.endRow <= range.startRow) continue
      for (let dataRow = range.startRow + 1; dataRow <= range.endRow; dataRow += 1) {
        worksheet.getCell(dataRow, columnNumber).value = null
      }
      worksheet.mergeCells(range.startRow, columnNumber, range.endRow, columnNumber)
    }
  }
  // 卡面整段合并，块名按 Block 合并
  mergeColumn(3, faceBounds)
  mergeColumn(4, blockBounds)

  // 列宽按内容量出来：Excel 没有可写的“自动列宽”，只能在导出时算一遍
  const valueColumnNumbers = Array.from(
    { length: includedColumns.length },
    (_, index) => FIRST_DATA_COLUMN + index,
  )
  fitColumnWidths(worksheet, [3, 4, 5, ...valueColumnNumbers], tableEndRow)
  const instanceWidths = valueColumnNumbers
    .filter((_, index) => includedColumns[index]?.kind === 'instance')
    .map(columnNumber => worksheet.getColumn(columnNumber).width ?? MIN_TYPING_COLUMN_WIDTH)
  worksheet.getColumn(newInstanceColumnNumber).width = Math.min(
    MAX_COLUMN_WIDTH,
    Math.max(MIN_TYPING_COLUMN_WIDTH, ...instanceWidths),
  )

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

    // 块名只写在合并区的首行，其余行为空；空表示“这一行没有改名的意见”
    const exportedBlockTitle = blockTitles.get(blockId)
    const workbookBlockTitle = readString(worksheet.getCell(rowNumber, 4).value)
    if (workbookBlockTitle && workbookBlockTitle !== exportedBlockTitle) {
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
    // 只有带字段身份的行才是数据行，表格下方的注释行之类不算
    if (!readString(worksheet.getCell(rowNumber, 1).value)) continue
    if (!readString(worksheet.getCell(rowNumber, 2).value)) continue
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

type WorkbookPalette = {
  accent: string
  accentText: string
  bandTint: string
  hatch: string
  text: string
  mutedText: string
  fontName: string
}

/** 直接读 :root 上生效的主题变量，用户自定义的 accent 也能跟着走。 */
function readThemeColor(token: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

/** 取主题字体栈里第一个族名，让表格里的字和界面一致。 */
function readThemeFontName(): string {
  if (typeof document === 'undefined') return FALLBACK_FONT_NAME
  const stack = getComputedStyle(document.documentElement).getPropertyValue(THEME_FONT_TOKEN).trim()
  const family = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '')
  return family || FALLBACK_FONT_NAME
}

function mixWithWhite(color: string, amount: number): string {
  const channels = [1, 3, 5].map(offset => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16)
    return Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0')
  })
  return `#${channels.join('')}`
}

function toArgb(color: string): string {
  return `FF${color.replace('#', '').toUpperCase()}`
}

function createWorkbookPalette(): WorkbookPalette {
  const accent = readThemeColor(THEME_ACCENT_TOKEN, FALLBACK_ACCENT)
  return {
    accent: toArgb(accent),
    accentText: toArgb(readThemeColor(THEME_ACCENT_TEXT_TOKEN, FALLBACK_ACCENT_TEXT)),
    bandTint: toArgb(mixWithWhite(accent, 0.93)),
    hatch: toArgb(mixWithWhite(accent, 0.9)),
    text: 'FF23232B',
    mutedText: 'FF71717A',
    fontName: readThemeFontName(),
  }
}

function styleHeaderCell(cell: import('exceljs').Cell, palette: WorkbookPalette): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.accent } }
  cell.font = {
    name: palette.fontName,
    bold: true,
    size: 11,
    color: { argb: palette.accentText },
  }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
}

function styleBodyCell(
  cell: import('exceljs').Cell,
  columnNumber: number,
  palette: WorkbookPalette,
  options: { fill: string; numeric: boolean },
): void {
  const identity = columnNumber < FIRST_DATA_COLUMN
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } }
  cell.font = {
    name: palette.fontName,
    size: 11,
    color: { argb: identity ? palette.mutedText : palette.text },
  }
  cell.alignment = {
    vertical: 'middle',
    horizontal: identity ? 'center' : options.numeric ? 'right' : undefined,
  }
  // 田字格：每个格子四边都是同一条主题色细线，合并后的格子只留外圈
  const line = { style: 'thin' as const, color: { argb: palette.accent } }
  cell.border = { top: line, bottom: line, left: line, right: line }
}

const WIDE_CHARACTER = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe6]/

/** 一列里最长的一条内容占几个西文字符宽，用来估算列宽。 */
function fitColumnWidths(
  worksheet: import('exceljs').Worksheet,
  columnNumbers: readonly number[],
  lastRow: number,
): void {
  for (const columnNumber of columnNumbers) {
    let widest = 0
    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      const value = worksheet.getCell(rowNumber, columnNumber).value
      widest = Math.max(widest, displayWidth(readCellText(value)))
    }
    worksheet.getColumn(columnNumber).width = Math.min(
      MAX_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, widest + 2),
    )
  }
}

function displayWidth(text: string): number {
  let width = 0
  for (const character of text) {
    width += WIDE_CHARACTER.test(character) ? 2 : 1
  }
  return width
}

function readCellText(value: import('exceljs').CellValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object' && 'result' in value) {
    return readCellText((value as { result?: import('exceljs').CellValue }).result ?? null)
  }
  return ''
}
