// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { RenderReadyCardFace } from '../card-rendering/render.types'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'
import { createCardRenderResourceContext } from '../card-rendering/cardRenderResources'
import { createExportProfile, createExportRule } from '../workspace/model/projectExportProfile'
import { runExportPlan } from './exportRunner'
import type { ExportDestination, ExportFaceRenderer, ExportPlan, ExportProgressEvent } from './exportTask'
import { ExportRenderDiagnosticsError } from './exportRenderingError'
import { createCardPipelineIssue } from '../card-rendering/cardPipelineIssue'

const face: RenderReadyCardFace = {
  type: 'card-face', id: 'front', faceKey: 'front', width: 540, height: 850, background: '#fff', children: [],
}
const backFace: RenderReadyCardFace = { ...face, id: 'back', faceKey: 'back' }
const render = {
  document: {
    type: 'card-document' as const,
    id: 'document', name: 'Document', version: '1', description: '', notes: '',
    faces: { front: face, back: backFace },
  },
  issues: [],
  resources: createCardRenderResourceContext({ projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG }),
}

function plan(errorPolicy: 'continue' | 'stop' = 'continue'): ExportPlan {
  return {
    profile: { ...createExportProfile('Test'), errorPolicy, output: { directory: 'D:/exports', conflict: 'replace' , openFolder: false } },
    outputDirectory: 'D:/exports',
    entries: [0, 1].map(index => ({
      key: String(index), sourcePath: 'cards/main.ocdocument',
      outputPath: `D:/exports/card_${index}.png`, faceKey: 'front' as const, render,
    })),
  }
}

const composer = { compose: vi.fn(async (page: { width: number; height: number }) => ({ width: page.width, height: page.height, pixelWidth: 1, pixelHeight: 1, jpeg: new Uint8Array([0xff]) })) }

function destination(overrides: Partial<ExportDestination> = {}): ExportDestination {
  return {
    exists: vi.fn(async () => false), ensureDirectory: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined), ...overrides,
  }
}

function renderer(render = vi.fn(async () => new Uint8Array([1]))): ExportFaceRenderer {
  return { render, reset: vi.fn() }
}

describe('runExportPlan', () => {
  it('reports monotonic progress and a completed result', async () => {
    const events: ExportProgressEvent[] = []
    const result = await runExportPlan({
      plan: plan(), renderer: renderer(), composer, destination: destination(), signal: new AbortController().signal,
      report: event => events.push(event),
    })
    expect(result).toMatchObject({ status: 'completed', succeeded: 2, skipped: 0, failed: 0 })
    expect(events.map(event => event.completedUnits)).toEqual([...events.map(event => event.completedUnits)].sort((a, b) => a - b))
    expect(events[events.length - 1]?.phase).toBe('completed')
  })

  it('skips existing outputs before rendering', async () => {
    const render = vi.fn(async () => new Uint8Array([1]))
    const result = await runExportPlan({
      plan: { ...plan(), profile: { ...plan().profile, output: { directory: 'D:/exports', conflict: 'skip' , openFolder: false } } }, renderer: renderer(render), composer,
      destination: destination({ exists: vi.fn(async path => path.endsWith('_0.png')) }),
      signal: new AbortController().signal, report: () => undefined,
    })
    expect(result).toMatchObject({ succeeded: 1, skipped: 1, failed: 0 })
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('continues or stops after an item failure according to policy', async () => {
    for (const [policy, calls] of [['continue', 2], ['stop', 1]] as const) {
      const render = vi.fn()
        .mockRejectedValueOnce(new Error('render failed'))
        .mockResolvedValue(new Uint8Array([1]))
      const result = await runExportPlan({
        plan: plan(policy), renderer: renderer(render), composer, destination: destination(),
        signal: new AbortController().signal, report: () => undefined,
      })
      expect(render).toHaveBeenCalledTimes(calls)
      expect(result.failed).toBe(1)
      expect(result.status).toBe('failed')
    }
  })

  it('preserves runtime diagnostics on rendering failures and applies the error policy', async () => {
    const issue = createCardPipelineIssue({
      type: 'card-designer.render-parse.invalid-type',
      location: {
        documentId: 'document', instanceId: null, faceKey: 'front',
        owner: { kind: 'block', id: 'custom' }, blockId: 'custom', fieldKey: 'content',
      },
    })
    for (const [policy, calls] of [['continue', 2], ['stop', 1]] as const) {
      const renderFace = vi.fn()
        .mockRejectedValueOnce(new ExportRenderDiagnosticsError([issue]))
        .mockResolvedValue(new Uint8Array([1]))
      const result = await runExportPlan({
        plan: plan(policy), renderer: renderer(renderFace), composer, destination: destination(),
        signal: new AbortController().signal, report: () => undefined,
      })
      expect(renderFace).toHaveBeenCalledTimes(calls)
      expect(result.failures[0]).toMatchObject({
        stage: 'rendering',
        message: 'Rendering reported 1 runtime issue',
        runtimeIssues: [issue],
      })
    }
  })

  it('cancels safely after the current render without writing it', async () => {
    const controller = new AbortController()
    const output = destination()
    const result = await runExportPlan({
      plan: plan(),
      composer,
      renderer: renderer(vi.fn(async () => {
        controller.abort()
        return new Uint8Array([1])
      })),
      destination: output,
      signal: controller.signal,
      report: () => undefined,
    })
    expect(result.status).toBe('cancelled')
    expect(output.write).not.toHaveBeenCalled()
  })

  it('records write failures, continues, and always resets the renderer', async () => {
    const output = destination({
      write: vi.fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValue(undefined),
    })
    const exportRenderer = renderer()
    const result = await runExportPlan({
      plan: plan('continue'), renderer: exportRenderer, composer, destination: output,
      signal: new AbortController().signal, report: () => undefined,
    })
    expect(result).toMatchObject({ status: 'failed', succeeded: 1, failed: 1 })
    expect(result.failures[0]).toMatchObject({ stage: 'writing', message: 'disk full' })
    expect(exportRenderer.reset).toHaveBeenCalledOnce()
  })

  describe('PDF plans', () => {
    function pdfPlan(errorPolicy: 'continue' | 'stop' = 'continue', conflict: 'replace' | 'skip' = 'replace'): ExportPlan {
      const base = plan(errorPolicy)
      const placement = (entryIndex: number) => ({ entryIndex, x: 0, y: 0, width: 63, height: 88 })
      return {
        ...base,
        profile: { ...base.profile, rule: createExportRule('pdf'), output: { directory: 'D:/exports', conflict , openFolder: false } },
        pdf: {
          outputPath: 'D:/exports/sheet.pdf',
          pages: [
            { width: 210, height: 297, placements: [placement(0), placement(0), placement(1)], cropMarks: [] },
            { width: 210, height: 297, placements: [placement(1)], cropMarks: [] },
          ],
        },
      }
    }
    const run = (target: ExportPlan, render: ExportFaceRenderer, output: ExportDestination) => runExportPlan({
      plan: target, renderer: render, composer, destination: output,
      signal: new AbortController().signal, report: () => undefined,
    })

    it('renders each card once per page and writes a single PDF', async () => {
      const render = vi.fn(async () => new Uint8Array([1]))
      const output = destination()

      const result = await run(pdfPlan(), renderer(render), output)

      expect(result).toMatchObject({ status: 'completed', total: 1, succeeded: 1 })
      expect(render).toHaveBeenCalledTimes(3)
      expect(output.write).toHaveBeenCalledTimes(1)
      expect(vi.mocked(output.write).mock.calls[0]?.[0]).toBe('D:/exports/sheet.pdf')
      expect(new TextDecoder().decode(vi.mocked(output.write).mock.calls[0]?.[1].slice(0, 8))).toBe('%PDF-1.4')
    })

    it('skips an existing PDF without rendering', async () => {
      const render = vi.fn(async () => new Uint8Array([1]))
      const result = await run(pdfPlan('continue', 'skip'), renderer(render), destination({ exists: vi.fn(async () => true) }))

      expect(result).toMatchObject({ status: 'completed', skipped: 1, succeeded: 0 })
      expect(render).not.toHaveBeenCalled()
    })

    it('leaves failed cards blank when continuing and writes nothing when stopping', async () => {
      const failing = () => vi.fn(async () => { throw new Error('boom') })

      const continued = destination()
      expect(await run(pdfPlan('continue'), renderer(failing()), continued))
        .toMatchObject({ status: 'failed', succeeded: 1, failed: 2 })
      expect(continued.write).toHaveBeenCalledTimes(1)

      const stopped = destination()
      expect(await run(pdfPlan('stop'), renderer(failing()), stopped)).toMatchObject({ status: 'failed', succeeded: 0, failed: 1 })
      expect(stopped.write).not.toHaveBeenCalled()
    })
  })
})
