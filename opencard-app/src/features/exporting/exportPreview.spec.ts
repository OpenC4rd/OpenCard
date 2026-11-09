import { describe, expect, it, vi } from 'vitest'
import { createExportProfile, createExportRule } from '../workspace/model/projectExportProfile'
import { exportPreviewPageCount, renderExportPreviewPage } from './exportPreview'
import type { ExportFaceRenderer, ExportPageComposer, ExportPlan, ExportPlanEntry } from './exportTask'

const entry = (faceKey: 'front' | 'back'): ExportPlanEntry =>
  ({ sourcePath: 'a.ocdocument', outputPath: 'out', faceKey, render: {} as ExportPlanEntry['render'] })
const signal = new AbortController().signal
const bytes = new Uint8Array([1, 2, 3])

function fakes() {
  const renderer: ExportFaceRenderer = { render: vi.fn(async () => bytes), reset: vi.fn() }
  const composer: ExportPageComposer = {
    compose: vi.fn(async () => ({ width: 1, height: 1, pixelWidth: 1, pixelHeight: 1, jpeg: bytes })),
  }
  return { renderer, composer }
}

describe('export preview', () => {
  it('composes a PDF page at preview DPI and renders a repeated card once', async () => {
    const page = {
      width: 210, height: 297, cropMarks: [],
      placements: [0, 0].map(entryIndex => ({ entryIndex, x: 0, y: 0, width: 63, height: 88 })),
    }
    const plan: ExportPlan = {
      profile: { ...createExportProfile('Print'), rule: createExportRule('pdf') },
      entries: [entry('front')], outputDirectory: 'out', pdf: { outputPath: 'out.pdf', pages: [page] },
    }
    const { renderer, composer } = fakes()
    const blob = await renderExportPreviewPage(plan, 0, renderer, composer, signal)

    expect(exportPreviewPageCount(plan)).toBe(1)
    expect(renderer.render).toHaveBeenCalledTimes(1)
    expect(composer.compose).toHaveBeenCalledWith(page, expect.any(Map), 144, signal)
    expect(blob.type).toBe('image/jpeg')
  })

  it('treats each image entry as a page and keeps the real format', async () => {
    const profile = createExportProfile('Web')
    const plan: ExportPlan = {
      profile: { ...profile, rule: { kind: 'images', fileName: 'card', format: 'jpeg', quality: 0.5, dpi: 300, faces: 'both' } },
      entries: [entry('front'), entry('back')], outputDirectory: 'out',
    }
    const { renderer, composer } = fakes()
    const blob = await renderExportPreviewPage(plan, 1, renderer, composer, signal)

    expect(exportPreviewPageCount(plan)).toBe(2)
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({ faceKey: 'back', format: 'jpeg', quality: 0.5 }), signal)
    expect(composer.compose).not.toHaveBeenCalled()
    expect(blob.type).toBe('image/jpeg')
  })
})
