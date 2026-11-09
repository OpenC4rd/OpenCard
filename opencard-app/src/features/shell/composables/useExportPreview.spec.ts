import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExportProfile, type ExportProfile } from '../../workspace/model/projectExportProfile'
import type { ExportPlan, ExportPreparationResult } from '../../exporting/exportTask'
import { useExportPreview } from './useExportPreview'

const planOf = (profile: ExportProfile, pages: number): ExportPlan => ({
  profile, outputDirectory: 'out',
  entries: Array.from({ length: pages }, () => ({ sourcePath: 'a', outputPath: 'b', faceKey: 'front' as const, render: {} as never })),
})

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(300)
  await nextTick()
}

describe('useExportPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    let id = 0
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:${++id}`), revokeObjectURL: vi.fn() })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function setup(result: (profile: ExportProfile) => ExportPreparationResult) {
    const profile = ref<ExportProfile | null>(createExportProfile('A'))
    const active = ref(true)
    const plan = vi.fn(async (value: ExportProfile) => result(value))
    const renderPage = vi.fn(async () => new Blob())
    const release = vi.fn()
    const scope = effectScope()
    const spread = ref(false)
    const switched = ref(0)
    const preview = scope.run(() => useExportPreview({ profile, active, switched, spread, plan, renderPage, release }))!
    return { profile, active, switched, spread, plan, renderPage, release, preview, scope }
  }

  it('debounces edits and renders only the page being viewed', async () => {
    const { profile, plan, renderPage, preview } = setup(value => ({ ok: true, plan: planOf(value, 3) }))
    profile.value = { ...profile.value!, name: 'B' }
    await nextTick()
    profile.value = { ...profile.value!, name: 'C' }
    await settle()

    expect(plan).toHaveBeenCalledTimes(1)
    expect(renderPage).toHaveBeenCalledTimes(1)
    expect(preview.pageCount.value).toBe(3)
    expect(preview.imageUrls.value).toEqual(['blob:1'])
  })

  it('reuses a page it already rendered', async () => {
    const { renderPage, preview } = setup(value => ({ ok: true, plan: planOf(value, 2) }))
    await settle()
    preview.selectPage(1)
    await settle()
    preview.selectPage(0)
    await settle()

    expect(renderPage).toHaveBeenCalledTimes(2)
    expect(preview.imageUrls.value).toEqual(['blob:1'])
  })

  it('shows PDF pages in pairs when spread and keeps a lone last page', async () => {
    const pdfPlan = (value: ExportProfile, pages: number): ExportPlan => ({
      ...planOf(value, 0), pdf: { outputPath: 'a.pdf', pages: Array.from({ length: pages }, () => ({ width: 1, height: 1, placements: [], cropMarks: [] })) },
    })
    const { spread, preview, renderPage } = setup(value => ({ ok: true, plan: pdfPlan(value, 3) }))
    await settle()
    expect(preview.spreadAvailable.value).toBe(true)
    expect(preview.imageUrls.value).toHaveLength(1)

    spread.value = true
    await settle()
    expect(preview.pageStep.value).toBe(2)
    expect(preview.imageUrls.value).toHaveLength(2)

    preview.selectPage(3)
    await settle()
    expect(preview.pageIndex.value).toBe(0)
    preview.selectPage(2)
    await settle()
    expect(preview.imageUrls.value).toHaveLength(1)
    expect(renderPage).toHaveBeenCalledTimes(3)
  })

  it('never pairs image files', async () => {
    const { spread, preview } = setup(value => ({ ok: true, plan: planOf(value, 3) }))
    spread.value = true
    await settle()
    expect(preview.spreadAvailable.value).toBe(false)
    expect(preview.pageStep.value).toBe(1)
    expect(preview.imageUrls.value).toHaveLength(1)
  })

  it('stays on the current page across an edit and clamps when pages disappear', async () => {
    let pages = 3
    const { profile, preview } = setup(value => ({ ok: true, plan: planOf(value, pages) }))
    await settle()
    preview.selectPage(2)
    await settle()
    pages = 2
    profile.value = { ...profile.value!, name: 'B' }
    await settle()

    expect(preview.pageIndex.value).toBe(1)
  })

  it('shows the first issue instead of a stale image', async () => {
    let result: ExportPreparationResult = { ok: false, issues: [{ code: 'documents-required' }] }
    const { profile, preview } = setup(value => (result.ok ? { ok: true, plan: planOf(value, 1) } : result))
    await settle()
    expect(preview.issue.value?.code).toBe('documents-required')
    expect(preview.imageUrls.value).toEqual([])

    result = { ok: true, plan: planOf(profile.value!, 1) }
    profile.value = { ...profile.value!, name: 'B' }
    await settle()
    expect(preview.issue.value).toBeNull()
    expect(preview.imageUrls.value).toHaveLength(1)
  })

  it('reports a render failure as a preview issue', async () => {
    const { renderPage, preview } = setup(value => ({ ok: true, plan: planOf(value, 1) }))
    renderPage.mockRejectedValueOnce(new Error('boom'))
    await settle()

    expect(preview.issue.value).toMatchObject({ code: 'preview-failed', message: 'boom' })
    expect(preview.loading.value).toBe(false)
  })

  it('does nothing while another space is showing and releases its cache on leaving', async () => {
    const { active, plan, release, preview } = setup(value => ({ ok: true, plan: planOf(value, 1) }))
    await settle()
    active.value = false
    await nextTick()

    expect(preview.imageUrls.value).toEqual([])
    expect(release).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    plan.mockClear()
    await settle()
    expect(plan).not.toHaveBeenCalled()
  })
})
