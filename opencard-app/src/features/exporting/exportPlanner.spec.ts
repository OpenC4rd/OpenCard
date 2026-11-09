// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'
import { createExportProfile, createExportRule, createExportWatermark, type ExportProfile, type ExportPdfRule } from '../workspace/model/projectExportProfile'
import { prepareExportTask } from './exportPlanner'
import { matchExportDocuments, validateExportProfile } from './exportTask'
import type { CardDocument } from '../../entities/card/model'

function cardDocument(amount = '1'): CardDocument {
  return {
    type: 'card-document', id: 'document', name: 'Card', version: '1', width: '63', height: '88',
    faces: {
      front: { type: 'card-face', id: 'front', background: '#fff', children: [] },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [{ type: 'card-instance', id: 'one', name: 'One', amount, data: {} }],
  }
}

function prepare(profile: ExportProfile, paths = ['cards/a.ocdocument', 'cards/b.ocdocument']) {
  return prepareExportTask({
    profile,
    source: {
      list: async () => paths,
      load: vi.fn(async (sourcePath: string) => {
        if (!paths.includes(sourcePath)) throw new Error('missing')
        return { sourcePath, resourceRootPath: '/project', sourceFilePath: `/project/${sourcePath}`, document: cardDocument('3') }
      }),
    },
    destination: { exists: async () => true, ensureDirectory: async () => undefined, write: async () => undefined },
    environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG },
  })
}

const baseProfile = (patch: Partial<ExportProfile> = {}): ExportProfile => ({
  ...createExportProfile('Test'),
  documents: ['cards/*.ocdocument'],
  selection: 'instances',
  output: { directory: '/out', conflict: 'replace', openFolder: false },
  ...patch,
})

function pdfRule(patch: Partial<ExportPdfRule> = {}): ExportPdfRule {
  return { ...createExportRule('pdf', 'sheet') as ExportPdfRule, ...patch }
}

describe('matchExportDocuments', () => {
  const paths = ['cards/hero.ocdocument', 'cards/deep/boss.ocdocument', 'other.ocdocument']

  it('keeps literal paths and expands wildcards in pattern order', () => {
    expect(matchExportDocuments(['other.ocdocument', 'cards/*.ocdocument'], paths))
      .toEqual(['other.ocdocument', 'cards/hero.ocdocument'])
    expect(matchExportDocuments(['cards/**/*.ocdocument'], paths))
      .toEqual(['cards/hero.ocdocument', 'cards/deep/boss.ocdocument'])
  })

  it('treats anything else as a folder of documents', () => {
    const inCards = ['cards/hero.ocdocument', 'cards/deep/boss.ocdocument']
    expect(matchExportDocuments(['cards'], paths)).toEqual(inCards)
    expect(matchExportDocuments(['cards/'], paths)).toEqual(inCards)
    expect(matchExportDocuments(['cards\\deep'], paths)).toEqual(['cards/deep/boss.ocdocument'])
    expect(matchExportDocuments(['nope'], paths)).toEqual([])
    expect(validateExportProfile(baseProfile({ documents: ['cards', 'te'] }))).toEqual([])
  })

  it('removes duplicates across overlapping patterns', () => {
    expect(matchExportDocuments(['cards/hero.ocdocument', 'CARDS/*.ocdocument'], paths)).toEqual(['cards/hero.ocdocument'])
  })
})

describe('validateExportProfile', () => {
  it('rejects paths that leave the project', () => {
    expect(validateExportProfile(baseProfile({ documents: ['../secret.ocdocument', '/abs', 'C:/cards'] })).map(issue => issue.code))
      .toEqual(['invalid-document-path', 'invalid-document-path', 'invalid-document-path'])
  })

  it('needs documents, an output folder and a PDF name', () => {
    const codes = validateExportProfile(baseProfile({
      documents: [], rule: pdfRule({ fileName: ' ' }), output: { directory: '', conflict: 'skip', openFolder: false },
    })).map(issue => issue.code)
    expect(codes).toEqual(['documents-required', 'invalid-file-name', 'output-required'])
  })
})

describe('prepareExportTask', () => {
  it('plans one file per face with the chosen format', async () => {
    const result = await prepare(baseProfile({ rule: { ...createExportRule('images'), format: 'jpeg', faces: 'both' } as ExportProfile['rule'] }))
    if (!result.ok) throw new Error('expected a plan')

    expect(result.plan.entries).toHaveLength(4)
    expect(result.plan.entries.every(entry => entry.outputPath.endsWith('.jpg'))).toBe(true)
    expect(new Set(result.plan.entries.map(entry => entry.outputPath)).size).toBe(4)
  })

  it('repeats cards by amount in a single PDF', async () => {
    const result = await prepare(baseProfile({ rule: pdfRule() }))
    if (!result.ok) throw new Error('expected a plan')

    expect(result.plan.pdf?.outputPath).toBe('/out/sheet.pdf')
    expect(result.plan.pdf?.pages.flatMap(page => page.placements)).toHaveLength(6)
  })

  it('ignores amount when asked and pairs faces for duplex printing', async () => {
    const paper = { ...pdfRule().paper, duplex: 'long-edge' as const }
    const result = await prepare(baseProfile({ rule: pdfRule({ useAmount: false, faces: 'both', paper }) }))
    if (!result.ok) throw new Error('expected a plan')

    const [front, back] = result.plan.pdf!.pages
    expect(front!.placements.map(card => result.plan.entries[card.entryIndex]!.faceKey)).toEqual(['front', 'front'])
    expect(back!.placements.map(card => result.plan.entries[card.entryIndex]!.faceKey)).toEqual(['back', 'back'])
    expect(result.plan.pdf!.pages).toHaveLength(2)
  })

  it('reports paper that cannot hold the cards', async () => {
    const paper = { ...pdfRule().paper, size: 'custom' as const, width: 10, height: 10 }
    expect(await prepare(baseProfile({ rule: pdfRule({ paper }) })))
      .toEqual({ ok: false, issues: [{ code: 'paper-too-small' }] })
  })

  it('names image files from the template and numbers repeats', async () => {
    const rule = (fileName: string) => ({ ...createExportRule('images', fileName), faces: 'front' }) as ExportProfile['rule']
    const named = await prepare(baseProfile({ rule: rule('{{document:file}}-{{card:name}}-{{face:key}}') }))
    const repeated = await prepare(baseProfile({ rule: rule('card') }))
    const unknown = await prepare(baseProfile({ rule: rule('{{card:nope}}') }))

    expect(named.ok && named.plan.entries.map(entry => entry.outputPath)).toEqual(['/out/a-One-front.png', '/out/b-One-front.png'])
    expect(repeated.ok && repeated.plan.entries.map(entry => entry.outputPath)).toEqual(['/out/card.png', '/out/card_2.png'])
    expect(unknown).toMatchObject({ ok: false, issues: [{ code: 'unknown-variable', path: '{{card:nope}}' }] })
  })

  it('lays page info over each page with its own numbers', async () => {
    const base = pdfRule()
    const rule = { ...base, paper: { ...base.paper, columns: 1, rows: 1, regions: { cb: { content: '{{page}}/{{pages}}', textAlign: 'end' as const, verticalAlign: 'top' as const } } } }
    const result = await prepare(baseProfile({ rule }))
    if (!result.ok) throw new Error('expected a plan')

    const { pages } = result.plan.pdf!
    const overlays = pages.map(page => page.placements[page.placements.length - 1]!)
    expect(overlays[0]).toMatchObject({ x: 0, y: 0, width: 210, height: 297 })
    const content = (index: number) => result.plan.entries[overlays[index]!.entryIndex]!.render.document.faces.front.children[0]!
    expect(JSON.stringify(content(1))).toContain(`2/${pages.length}`)
  })

  it('renders the watermark through the page overlay for PDF and the card face for images', async () => {
    const watermark = { ...createExportWatermark(), enabled: true, text: '{{page}}/{{pages}}' }
    const pdf = await prepare(baseProfile({ rule: pdfRule(), watermark }))
    if (!pdf.ok) throw new Error('expected a plan')
    const { pages } = pdf.plan.pdf!
    const overlayIndex = pages[0]!.placements[pages[0]!.placements.length - 1]!.entryIndex
    expect(JSON.stringify(pdf.plan.entries[overlayIndex]!.render.document.faces.front.children)).toContain(`1/${pages.length}`)

    const rule = { ...createExportRule('images'), faces: 'front' } as ExportProfile['rule']
    const images = await prepare(baseProfile({ rule, watermark: { ...watermark, text: '{{card:name}}' } }))
    if (!images.ok) throw new Error('expected a plan')
    expect(JSON.stringify(images.plan.entries[0]!.render.document.faces.front.children)).toContain('One')
    expect(images.plan.pdf).toBeUndefined()

    const unknown = await prepare(baseProfile({ rule, watermark: { ...watermark, text: '{{page}}' } }))
    expect(!unknown.ok && unknown.issues[0]).toMatchObject({ code: 'unknown-variable', path: '{{page}}' })
  })

  it('reports a page variable it does not know', async () => {
    const base = pdfRule()
    const rule = { ...base, paper: { ...base.paper, regions: { cb: { content: '{{nope}}', textAlign: 'center' as const, verticalAlign: 'center' as const } } } }
    expect(await prepare(baseProfile({ rule }))).toMatchObject({ ok: false, issues: [{ code: 'unknown-variable', path: '{{nope}}' }] })
  })

  it('reports a variable it does not know', async () => {
    const result = await prepare(baseProfile({ rule: pdfRule({ fileName: '{{nope}}' }) }))
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'unknown-variable', path: '{{nope}}' }] })
  })

  it('reports documents that no longer exist', async () => {
    const result = await prepare(baseProfile({ documents: ['cards/missing.ocdocument'] }))
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'document-unavailable', path: 'cards/missing.ocdocument' }] })
  })

  it('reports a wildcard that matches nothing', async () => {
    expect(await prepare(baseProfile({ documents: ['none/*.ocdocument'] })))
      .toEqual({ ok: false, issues: [{ code: 'empty-plan' }] })
  })
})
