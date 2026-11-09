// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CardDocument, CardInstanceRecord } from '../../entities/card/model'
import { createExportProfile, createExportRule, type ExportProfile } from '../workspace/model/projectExportProfile'
import { createExportFileVariables, expandExportRichText, expandExportTemplate, expandExportVariables, findExportVariable } from './exportVariables'

const project = { name: 'A/B 卡牌', version: '1.2.0', author: 'Pop' }
const now = new Date(2026, 10, 7, 9, 5, 3)

function profile(fileName: string, directory = 'Output'): ExportProfile {
  return {
    ...createExportProfile('打印'),
    rule: createExportRule('pdf', fileName),
    output: { directory, conflict: 'replace', openFolder: false },
  }
}

describe('expandExportVariables', () => {
  it('expands project, profile and time variables', () => {
    const { rule } = expandExportVariables(profile('{{project:name}}-{{ project:version }}-{{profile:name}}-{{date}}-{{time}}'), project, now)
    expect(rule.kind === 'pdf' && rule.fileName).toBe('A_B_卡牌-1.2.0-打印-2026-11-07-09-05-03')
  })

  it('keeps a variable inside one directory segment', () => {
    const expanded = expandExportVariables(profile('cards', 'Output/{{project:name}}/{{date}}'), project, now)
    expect(expanded.output.directory).toBe('Output/A_B_卡牌/2026-11-07')
  })

  it('cannot climb out of the directory through a value', () => {
    const expanded = expandExportVariables(profile('cards', 'Output/{{project:name}}'), { ...project, name: '..' }, now)
    expect(expanded.output.directory).toBe('Output/')
  })

  it('expands watermark text without path cleaning', () => {
    const base = profile('cards')
    const expanded = expandExportVariables({ ...base, watermark: { ...base.watermark, text: '{{project:name}} {{date}}' } }, project, now)
    expect(expanded.watermark.text).toBe('A/B 卡牌 2026-11-07')
  })

  it('leaves unknown variables for validation', () => {
    const { rule } = expandExportVariables(profile('{{nope}}'), project, now)
    expect(rule.kind === 'pdf' && rule.fileName).toBe('{{nope}}')
    expect(findExportVariable('a-{{nope}}')).toBe('{{nope}}')
    expect(findExportVariable('plain')).toBeNull()
    expect(() => expandExportVariables(profile('{{constructor}}'), project, now)).not.toThrow()
  })

  it('keeps page info values intact and safe for markup', () => {
    expect(expandExportRichText('{{project:name}} / {{page}}', { 'project:name': 'A/B @x', page: '2' })).toBe('A/B \\@x / 2')
  })

  it('resolves card variables like card bindings do', () => {
    const document = { name: '锦囊', version: '1', width: '52' } as unknown as CardDocument
    const instance = { id: 'one', name: '杀', amount: '3' } as unknown as CardInstanceRecord
    const template = '{{document:file}}-{{document:name}}-{{card:name}}-{{card:amount}}-{{card:width}}-{{face:key}}'

    expect(expandExportTemplate(template, createExportFileVariables(document, instance, 'cards/牌.ocdocument', 'back')))
      .toBe('牌-锦囊-杀-3-52-back')
    expect(expandExportTemplate('{{card:name}}', createExportFileVariables(document, null, 'a.ocdocument', 'front'))).toBe('锦囊')
  })
})
