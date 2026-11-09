import { describe, expect, it } from 'vitest'
import type { PropertyCompletionResult } from '../../shared/ui/property-editor/propertyEditor.types'
import { formatPropertyFieldReadonlyValue } from '../../shared/ui/property-editor/propertyFieldRegistry'
import { matchExportDocuments } from './exportTask'
import { createExportProfile, createExportRule, parseExportProfiles, type ExportProfile } from '../workspace/model/projectExportProfile'
import {
  applyExportProfileField,
  countHiddenExportChanges,
  createExportDocumentProvider,
  createExportProfileInput,
  createExportVariableProviders,
} from './exportProfileProperties'

const t = (key: string) => key
const variables = createExportVariableProviders(t)
const provider = () => ({ replaceStart: 0, replaceEnd: 0, items: [] })
const pdfProfile = (): ExportProfile => ({ ...createExportProfile('Print'), rule: createExportRule('pdf', 'Print') })

describe('export profile properties', () => {
  it('shows paper fields only for the PDF rule and custom sizes only when chosen', () => {
    const images = createExportProfileInput(createExportProfile('Web'), [], false, provider, variables, { advanced: true, region: 'cb' }, t)
    expect(images.fields.size).toBeUndefined()
    expect(images.fields.format).toBeDefined()

    const pdf = pdfProfile()
    expect(createExportProfileInput(pdf, [], false, provider, variables, { advanced: true, region: 'cb' }, t).fields.width).toBeUndefined()
    const custom = applyExportProfileField(pdf, 'size', 'custom')
    expect(createExportProfileInput(custom, [], false, provider, variables, { advanced: true, region: 'cb' }, t).fields.width).toBeDefined()
  })

  it('shows duplex only when both faces are exported', () => {
    const pdf = pdfProfile()
    expect(createExportProfileInput(pdf, [], false, provider, variables, { advanced: true, region: 'cb' }, t).fields.duplex).toBeUndefined()
    const both = applyExportProfileField(pdf, 'faces', 'both')
    expect(createExportProfileInput(both, [], false, provider, variables, { advanced: true, region: 'cb' }, t).fields.duplex).toBeDefined()
  })

  it('projects values the way the fields expect and locks them while busy', () => {
    const input = createExportProfileInput({ ...pdfProfile(), documents: ['a.ocdocument'] }, [], true, provider, variables, { advanced: true, region: 'cb' }, t)
    expect(input.record.marginTop).toBe('10')
    expect(input.record.cropMarks).toBe('true')
    expect(input.record.documents).toEqual(['a.ocdocument'])
    expect(input.record.paper).toBeUndefined()
    expect(Object.entries(input.fields).every(([key, field]) => key === 'pageRegion' || field.isReadonly)).toBe(true)
  })

  it('suggests folders as wildcards and skips documents already added', async () => {
    const profile = { ...createExportProfile('Web'), documents: ['cards/a.ocdocument'] }
    const documents = ['cards/a.ocdocument', 'cards/b.ocdocument']
    const result = await createExportDocumentProvider(() => ({ profile, documents }), t)({ value: 'car', cursor: 3 })
    expect(result?.items.map(item => item.insertText)).toEqual(['cards/**/*.ocdocument', 'cards/b.ocdocument'])
    expect(result?.replaceEnd).toBe(3)
  })

  it('writes each flat field back to where it lives', () => {
    const pdf = pdfProfile()
    expect(applyExportProfileField(pdf, 'name', 'New').name).toBe('New')
    expect(applyExportProfileField(pdf, 'directory', 'out').output.directory).toBe('out')
    expect(applyExportProfileField(pdf, 'dpi', '450').rule.dpi).toBe(450)
    const paper = applyExportProfileField(pdf, 'gapX', '2').rule
    expect(paper.kind === 'pdf' && paper.paper.gapX).toBe(2)
    const crop = applyExportProfileField(pdf, 'cropMarks', 'false').rule
    expect(crop.kind === 'pdf' && crop.paper.cropMarks).toBe(false)
    const jpeg = applyExportProfileField(createExportProfile('Web'), 'quality', '80').rule
    expect(jpeg.kind === 'images' && jpeg.quality).toBe(0.8)
  })

  it('keeps the shared rule settings when switching rule and ignores unfinished numbers', () => {
    const profile = { ...createExportProfile('Web'), rule: { ...createExportRule('images'), dpi: 450 } }
    const switched = applyExportProfileField(profile, 'kind', 'pdf')
    expect(switched.rule).toMatchObject({ kind: 'pdf', dpi: 450, faces: 'both', fileName: 'Web' })
    expect(applyExportProfileField(profile, 'dpi', '')).toBe(profile)
  })

  it('offers variables only inside an open token and replaces just the expression', () => {
    expect(variables.path({ value: 'cards', cursor: 5 })).toBeNull()
    expect(variables.path({ value: '{{date}}-', cursor: 9 })).toBeNull()
    expect(variables.path({ value: 'a-{{da}}', cursor: 6 })).toMatchObject({
      replaceStart: 4, replaceEnd: 6, items: [{ key: 'date', insertText: 'date' }],
    })
    expect(variables.path({ value: 'a-{{da', cursor: 6 })).toMatchObject({ items: [{ insertText: 'date}}' }] })
  })

  it('offers document variables only for an image file name', () => {
    const keys = (provider: typeof variables.path) => (provider({ value: '{{card', cursor: 6 }) as PropertyCompletionResult).items.map(item => item.key)
    expect(keys(variables.path)).toEqual([])
    expect(keys(variables.file)).toEqual(['card:name', 'card:amount'])
  })

  it('gives images a per-file template and pdf the profile name when switching rule', () => {
    const profile = createExportProfile('Web')
    const pdf = applyExportProfileField(profile, 'kind', 'pdf')
    expect(pdf.rule.fileName).toBe('Web')
    expect(applyExportProfileField(pdf, 'kind', 'images').rule.fileName).toBe(createExportRule('images').fileName)
  })

  it('writes the open folder switch to the output', () => {
    expect(applyExportProfileField(createExportProfile('Web'), 'openFolder', 'true').output.openFolder).toBe(true)
  })

  it('derives presets from the real values and offers custom only when nothing matches', () => {
    const input = (profile: ExportProfile) => createExportProfileInput(profile, [], false, provider, variables, { advanced: true, region: 'cb' }, t)
    const options = (profile: ExportProfile, key: string) => (input(profile).fields[key] as unknown as { options: string[] }).options

    expect(input(pdfProfile()).record).toMatchObject({ dpiPreset: 'standard', layoutPreset: 'compact' })
    expect(options(pdfProfile(), 'layoutPreset')).toEqual(['standard', 'compact', 'distributed'])

    const edited = applyExportProfileField(applyExportProfileField(pdfProfile(), 'dpi', '450'), 'gapX', '1')
    expect(input(edited).record).toMatchObject({ dpiPreset: 'custom', layoutPreset: 'custom' })
    expect(options(edited, 'dpiPreset')).toContain('custom')
    expect(options(edited, 'layoutPreset')).toContain('custom')
  })

  it('applies a whole preset and ignores the custom state', () => {
    const profile = pdfProfile()
    const standard = applyExportProfileField(applyExportProfileField(profile, 'layoutPreset', 'standard'), 'dpiPreset', 'print')

    expect(standard.rule).toMatchObject({ dpi: 600, paper: { marginTop: 10, gapX: 3, gapY: 3, cropMarks: true } })
    expect(applyExportProfileField(profile, 'layoutPreset', 'distributed').rule).toMatchObject({ paper: { placement: 'distribute', marginTop: 10 } })
    const distributed = applyExportProfileField(applyExportProfileField(profile, 'gapX', '5'), 'placement', 'distribute')
    expect(distributed.rule).toMatchObject({ paper: { placement: 'distribute', gapX: 0, gapY: 0 } })
    const { fields, record } = createExportProfileInput(distributed, [], false, provider, variables, { advanced: true, region: 'cb' }, t)
    expect(fields.gapX).toBeUndefined()
    expect(record.layoutPreset).toBe('distributed')
    expect(applyExportProfileField(profile, 'layoutPreset', 'custom')).toBe(profile)
    expect(applyExportProfileField(profile, 'dpiPreset', 'custom')).toBe(profile)
  })

  it('keeps the advanced choice in the profile', () => {
    expect(createExportProfile('Web').advanced).toBe(false)
    expect(parseExportProfiles([{ advanced: true }])[0]!.advanced).toBe(true)
    expect(parseExportProfiles([{}])[0]!.advanced).toBe(false)
  })

  it('hides advanced fields until asked and counts what they hide', () => {
    const profile = { ...pdfProfile(), rule: { ...pdfProfile().rule, faces: 'both' } } as ExportProfile
    const visible = (advanced: boolean) => Object.entries(createExportProfileInput(profile, [], false, provider, variables, { advanced, region: 'cb' }, t).fields)
      .filter(([, field]) => !field.isHidden).map(([key]) => key)

    expect(visible(false)).toEqual(expect.arrayContaining(['dpiPreset', 'layoutPreset', 'directory', 'size']))
    for (const key of ['dpi', 'marginTop', 'duplex', 'cropMarks', 'conflict', 'errorPolicy']) {
      expect(visible(false)).not.toContain(key)
      expect(visible(true)).toContain(key)
    }

    expect(countHiddenExportChanges(profile)).toBe(0)
    expect(countHiddenExportChanges({ ...profile, errorPolicy: 'stop', output: { ...profile.output, conflict: 'skip' } })).toBe(2)
  })

  it('edits the selected page region with its own alignment', () => {
    const content = applyExportProfileField(pdfProfile(), 'region:rt:content', 'Page {{page}}')
    const aligned = applyExportProfileField(content, 'region:rt:verticalAlign', 'bottom')
    const input = (profile: ExportProfile, advanced: boolean) => createExportProfileInput(profile, [], false, provider, variables, { advanced, region: 'rt' }, t)

    expect(aligned.rule).toMatchObject({ paper: { regions: { rt: { content: 'Page {{page}}', textAlign: 'end', verticalAlign: 'bottom' } } } })
    expect(input(aligned, true).record).toMatchObject({ 'region:rt:content': 'Page {{page}}', 'region:rt:verticalAlign': 'bottom' })
    expect(input(aligned, true).fields['region:rt:textAlign']).toBeDefined()
    expect(input(aligned, false).fields['region:rt:content']).toBeUndefined()
    expect(createExportProfileInput(createExportProfile('Web'), [], false, provider, variables, { advanced: true, region: 'rt' }, t).fields.pageRegion).toBeUndefined()
    expect(countHiddenExportChanges(aligned)).toBe(1)
  })

  it('edits the watermark as rich text with variables for the rule', () => {
    const on = applyExportProfileField(pdfProfile(), 'watermark:enabled', 'true')
    const field = createExportProfileInput(on, [], false, provider, variables, { advanced: false, region: 'cb' }, t).fields['watermark:text']!
    expect(field.fieldType).toBe('richText')
    expect(field.completion?.provider).toBe(variables.page)
  })

  it('keeps the region grid usable in a read-only profile', () => {
    const input = createExportProfileInput(pdfProfile(), [], true, provider, variables, { advanced: true, region: 'cb' }, t)
    expect(input.fields.pageRegion!.isReadonly).toBe(false)
    expect(input.fields.name!.isReadonly).toBe(true)
  })

  it('reads enums, lists and units the way they are edited', () => {
    const { fields, record } = createExportProfileInput({ ...pdfProfile(), documents: ['a.ocdocument', 'b.ocdocument'] }, [], true, provider, variables, { advanced: true, region: 'cb' }, t)
    expect(formatPropertyFieldReadonlyValue(fields.selection!, record.selection)).toBe('projectExport.selectionAll')
    expect(formatPropertyFieldReadonlyValue(fields.documents!, record.documents)).toBe('a.ocdocument\nb.ocdocument')
    expect(formatPropertyFieldReadonlyValue(fields.marginTop!, record.marginTop)).toBe('10 mm')
  })

  it('shows only the watermark switch and content outside advanced', () => {
    const on = applyExportProfileField(pdfProfile(), 'watermark:enabled', 'true')
    const visible = (advanced: boolean) => Object.entries(createExportProfileInput(on, [], false, provider, variables, { advanced, region: 'cb' }, t).fields)
      .filter(([key, field]) => key.startsWith('watermark:') && !field.isHidden).map(([key]) => key)

    expect(visible(false)).toEqual(['watermark:enabled', 'watermark:text'])
    expect(visible(true)).toContain('watermark:angle')
  })

  it('defaults new profiles to every document and opening the folder', () => {
    expect(createExportProfile('Web')).toMatchObject({ documents: ['**/*.ocdocument'], output: { openFolder: true } })
    expect(matchExportDocuments(createExportProfile('Web').documents, ['a.ocdocument', 'cards/deep/b.ocdocument', 'c.png']))
      .toEqual(['a.ocdocument', 'cards/deep/b.ocdocument'])
  })

  it('drops blank document rows so a new row does not fail validation', () => {
    const profile = createExportProfile('Web')
    expect(applyExportProfileField(profile, 'documents', ['a.ocdocument', ' ']).documents).toEqual(['a.ocdocument'])
  })
})
