import { describe, expect, it } from 'vitest'
import type { CardDocument } from '../../entities/card/model'
import type { CdeDataTableFaceGroup, CdeDataTableColumn } from './useCdeDataTableModel'
import {
  exportCardDataWorkbook,
  importCardDataWorkbook,
} from './cardDataWorkbook'

function createDocument(): CardDocument {
  return {
    type: 'card-document',

    id: 'document-1',
    name: 'Export test',
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: { type: 'card-face', id: 'front', background: '#fff', children: [] },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [{
      type: 'card-instance',
      id: 'instance-1',
      name: 'Instance 1',
      amount: '1',
      data: { 'block-1': { content: 'Override' } },
    }],
  }
}

function createColumns(): CdeDataTableColumn[] {
  return [
    { key: '__blueprint__', kind: 'blueprint', title: 'Blueprint', exported: true },
    { key: 'instance-1', kind: 'instance', title: 'Instance 1', exported: true },
  ]
}

function createFaceGroups(): CdeDataTableFaceGroup[] {
  return [{
    key: 'front',
    title: 'Front',
    blocks: [{
      key: 'block-1',
      title: 'Title Block',
      type: 'text-block',
      depth: 0,
      fields: [{
        key: 'content',
        title: 'Content',
        definition: { fieldType: 'string', title: 'Content' },
        resettable: false,
        definitionEditable: false,
        cells: [
          { identity: 'blueprint', cardId: '__blueprint__', kind: 'blueprint', value: 'Blueprint', readonly: false, inherited: false, overridden: false },
          { identity: 'instance', cardId: 'instance-1', kind: 'instance', value: 'Override', readonly: false, inherited: false, overridden: true },
        ],
      }],
    }],
  }]
}

describe('card data workbook', () => {
  it('exports hidden identity metadata and an inherit formula', async () => {
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document,
      columns: createColumns(),
      faceGroups: createFaceGroups(),
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const worksheet = workbook.getWorksheet('Card Data')!

    // The identity row and column drive import; hiding them keeps the sheet readable.
    expect(worksheet.getRow(1).hidden).toBe(true)
    expect(worksheet.getColumn(1).hidden).toBe(true)
    expect(worksheet.getCell('A3').value).toBe('block-1')
    expect(worksheet.getCell('B3').value).toBe('content')
    expect(worksheet.getCell('F1').value).toBe('__blueprint__')
    expect(worksheet.getCell('G1').value).toBe('instance-1')
    expect(worksheet.getCell('G3').value).toBe('Override')
    // Only instance cells stay editable; the identity cells and labels are protected.
    expect(worksheet.getCell('F1').protection?.locked).not.toBe(false)
    expect(worksheet.getCell('A3').protection?.locked).not.toBe(false)
    expect(worksheet.getCell('G2').protection.locked).toBe(false)
    expect(worksheet.getCell('G3').protection.locked).toBe(false)
    expect(worksheet.getCell('H2').protection.locked).toBe(false)
    expect(worksheet.getCell('H3').protection.locked).toBe(false)
    expect(readSheetProtection(worksheet)?.sheet).toBe(true)
    expect(workbook.getWorksheet('_OpenCard')!.state).toBe('veryHidden')
  })

  it('merges identity cells of a multi-field Block without changing what imports', async () => {
    const groups = createFaceGroups()
    const block = groups[0]!.blocks[0]!
    const inherited = {
      identity: 'instance' as const,
      cardId: 'instance-1',
      kind: 'instance' as const,
      value: 'Blueprint',
      readonly: false,
      inherited: true,
      overridden: false,
    }
    groups[0]!.blocks[0] = {
      ...block,
      fields: [
        block.fields[0]!,
        { ...block.fields[0]!, key: 'opacity', title: 'Opacity', cells: [block.fields[0]!.cells[0]!, inherited] },
      ],
    }
    const bytes = await exportCardDataWorkbook({
      document: createDocument(),
      columns: createColumns(),
      faceGroups: groups,
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const worksheet = workbook.getWorksheet('Card Data')!
    expect(worksheet.model.merges).toEqual(['C3:C4', 'D3:D4'])
    expect(worksheet.getCell('C3').value).toBe('Front')
    expect(worksheet.getCell('D3').value).toBe('Title Block')
    // 田字边框：每格四边都是主题色细线，合并后只保留外圈
    expect(worksheet.getCell('E3').border?.top?.style).toBe('thin')
    expect(worksheet.getCell('E3').border?.right?.style).toBe('thin')
    expect(worksheet.getCell('C3').border?.bottom?.style).toBe('thin')

    const result = await importCardDataWorkbook(bytes, createDocument(), groups)
    expect(result.blockRenames).toEqual([])
    expect(result.updates).toEqual([])
  })

  it('imports a renamed Block and a new instance column', async () => {
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document,
      columns: createColumns(),
      faceGroups: createFaceGroups(),
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block Name', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const worksheet = workbook.getWorksheet('Card Data')!
    worksheet.getCell('D3').value = 'Renamed Block'
    worksheet.getCell('H2').value = 'Instance 2'
    worksheet.getCell('H3').value = 'New value'
    const modified = await workbook.xlsx.writeBuffer()

    const result = await importCardDataWorkbook(new Uint8Array(modified), document, createFaceGroups())
    expect(result.blockRenames).toEqual([{
      blockId: 'block-1',
      previousName: 'Title Block',
      nextName: 'Renamed Block',
    }])
    expect(result.newInstances).toHaveLength(1)
    expect(result.newInstances[0]).toMatchObject({ name: 'Instance 2', amount: '1', data: {} })
    expect(result.updates).toContainEqual({
      cardId: result.newInstances[0]!.id,
      blockId: 'block-1',
      fieldKey: 'content',
      value: 'New value',
      reset: false,
    })
  })

  it('imports exact Blueprint references as reset operations', async () => {
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document,
      columns: createColumns(),
      faceGroups: [{
        ...createFaceGroups()[0]!,
        blocks: [{
          ...createFaceGroups()[0]!.blocks[0]!,
          fields: [{
            ...createFaceGroups()[0]!.blocks[0]!.fields[0]!,
            cells: [createFaceGroups()[0]!.blocks[0]!.fields[0]!.cells[0]!, {
              identity: 'instance',
              cardId: 'instance-1',
              kind: 'instance',
              value: 'Blueprint',
              readonly: false,
              inherited: true,
              overridden: false,
            }],
          }],
        }],
      }],
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    expect(workbook.getWorksheet('Card Data')!.getCell('G3').formula).toBe('$F3')
    const result = await importCardDataWorkbook(bytes, document, createFaceGroups())
    expect(result.warnings).toEqual([])
    expect(result.updates).toContainEqual({
      cardId: 'instance-1',
      blockId: 'block-1',
      fieldKey: 'content',
      reset: true,
    })
  })

  it('treats an empty existing Instance cell as no override', async () => {
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document,
      columns: createColumns(),
      faceGroups: createFaceGroups(),
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block Name', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    workbook.getWorksheet('Card Data')!.getCell('G3').value = null
    const modified = await workbook.xlsx.writeBuffer()

    const result = await importCardDataWorkbook(new Uint8Array(modified), document, createFaceGroups())
    expect(result.updates).toContainEqual({
      cardId: 'instance-1',
      blockId: 'block-1',
      fieldKey: 'content',
      reset: true,
    })
  })

  it('rejects imports for another document', async () => {
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document,
      columns: createColumns(),
      faceGroups: createFaceGroups(),
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block', field: 'Field' },
    })
    document.id = 'different-document'
    await expect(importCardDataWorkbook(bytes, document, createFaceGroups()))
      .rejects.toThrow('Workbook belongs to a different card document')
  })

  it('rejects formulas other than the generated Blueprint reference', async () => {
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document,
      columns: createColumns(),
      faceGroups: createFaceGroups(),
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    workbook.getWorksheet('Card Data')!.getCell('G3').value = {
      formula: 'SUM(F3)',
      result: 'Blueprint',
    }
    const modified = await workbook.xlsx.writeBuffer()

    await expect(importCardDataWorkbook(new Uint8Array(modified), document, createFaceGroups()))
      .rejects.toThrow('Unsupported formula in G3')
  })

  it('rejects duplicate hidden card identities', async () => {
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document,
      columns: createColumns(),
      faceGroups: createFaceGroups(),
      exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    workbook.getWorksheet('Card Data')!.getCell('H1').value = 'instance-1'
    const modified = await workbook.xlsx.writeBuffer()

    await expect(importCardDataWorkbook(new Uint8Array(modified), document, createFaceGroups()))
      .rejects.toThrow('Workbook contains duplicate card column instance-1')
  })

  it('imports field values without pre-empting binding or render diagnostics', async () => {
    const groups = createFaceGroups()
    groups[0]!.blocks[0]!.fields[0]!.definition = {
      title: 'Fit', fieldType: 'string', options: ['cover', 'contain'],
    }
    const document = createDocument()
    const bytes = await exportCardDataWorkbook({
      document, columns: createColumns(), faceGroups: groups, exportInstanceIds: ['instance-1'],
      labels: { face: 'Face', block: 'Block', field: 'Field' },
    })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    workbook.getWorksheet('Card Data')!.getCell('G3').value = 'unexpected'
    const modified = await workbook.xlsx.writeBuffer()

    const result = await importCardDataWorkbook(new Uint8Array(modified), document, groups)
    expect(result.updates).toContainEqual(expect.objectContaining({
      cardId: 'instance-1', blockId: 'block-1', fieldKey: 'content', value: 'unexpected',
    }))
    expect(result.warnings).toEqual([])
  })
})

function readSheetProtection(
  worksheet: import('exceljs').Worksheet,
): { sheet?: boolean; insertColumns?: boolean } | null {
  return (worksheet as unknown as {
    sheetProtection: { sheet?: boolean; insertColumns?: boolean } | null
  }).sheetProtection
}
