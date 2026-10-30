import { createTestSession } from '../../editor-runtime/editorTestSession'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../workspace/services/projectIconCatalog'
import { useProjectExport } from './useProjectExport'
import { fileSystemService } from '../../workspace/services/fileSystemService'

const notificationMocks = vi.hoisted(() => ({
  notifyAppError: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}))

vi.mock('../../notifications/titlebarNotices', () => notificationMocks)
vi.mock('../../card-rendering/export/renderFaceToPng', () => ({
  renderFaceToPng: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function content(width: string): string {
  return JSON.stringify({
    type: 'card-document', id: 'document', name: 'Card', version: '1',
    width, height: '850', instances: [],
    faces: {
      front: { type: 'card-face', id: 'front', background: '#fff', children: [] },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
  })
}

function createAdapter(
  sessions: EditorSession[],
  readProjectFile = vi.fn(async () => content('640')),
  refresh = vi.fn(async (_paths?: readonly string[]) => undefined),
) {
  return {
    adapter: useProjectExport({
      sessions: ref(sessions),
      renderEnvironment: ref({
        project: null,
        dictionary: null,
        projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG,
        projectResourceEnvironment: {
          kind: 'project' as const, namespace: 'test', rootPath: 'D:/project',
          fontDocument: {}, fonts: {}, iconDocument: {},
          iconCatalog: EMPTY_PROJECT_ICON_CATALOG, refresh,
        },
      }),
      readProjectFile,
      resolveProjectPath: path => `D:/project/${path}`,
      getRelativeProjectPath: path => path.replace('D:/project/', ''),
      translate: key => key,
    }),
    readProjectFile,
  }
}

describe('useProjectExport document source', () => {
  it('snapshots an open workspace draft instead of reading disk', async () => {
    const session: EditorSession = createTestSession({
      id: 'session', resourceKind: 'workspace', path: 'D:/project/cards/main.ocdocument',
      fileTypeId: 'opencard', editorId: 'card-designer', name: 'main.ocdocument',
      savedContent: content('540'), draftContent: content('1080'), isDirty: true, isPreview: false,
    })
    const { adapter, readProjectFile } = createAdapter([session])
    const snapshot = await adapter.loadDocumentSnapshot('cards/main.ocdocument')
    session.updateContent(content('2160'))
    expect(snapshot.document.width).toBe('1080')
    expect(snapshot.resourceRootPath).toBe('D:/project')
    expect(readProjectFile).not.toHaveBeenCalled()
  })

  it('reads unopened documents from the project source', async () => {
    const { adapter, readProjectFile } = createAdapter([])
    const snapshot = await adapter.loadDocumentSnapshot('cards/main.ocdocument')
    expect(snapshot.document.width).toBe('640')
    expect(readProjectFile).toHaveBeenCalledWith('cards/main.ocdocument')
  })

  it('preserves unknown document block data on an export snapshot', async () => {
    const source = JSON.parse(content('640'))
    source.faces.front.children = [{ block: { type: 'future-block' }, location: {} }]
    const { adapter } = createAdapter([], vi.fn(async () => JSON.stringify(source)))

    const snapshot = await adapter.loadDocumentSnapshot('cards/main.ocdocument')
    expect(snapshot.document.faces.front.children).toEqual(source.faces.front.children)
  })
})

it('cancels single-card rendering and waits for its active resource step before releasing', async () => {
  const { prepareCardRender } = await import('../../card-rendering/renderPipeline')
  const { parseCardDocument } = await import('../../../entities/card/storage')
  let complete!: () => void
  const resources = new Promise<void>(resolve => { complete = resolve })
  const render = prepareCardRender({ document: parseCardDocument(JSON.parse(content('100'))), instance: null, resourceRootPath: null, sourceFilePath: null, environment: {
    projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG, projectResourceEnvironment: { kind: 'project', namespace: 'test', rootPath: null, fontDocument: {}, fonts: {}, iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG, waitForResources: () => resources },
  } })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  const { adapter } = createAdapter([])
  const exporting = adapter.renderCardImages(render, ['front'], 1)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  let released = false
  const closing = adapter.cancelAndWait().then(() => { released = true })
  await Promise.resolve()
  expect(released).toBe(false)
  complete()
  expect(await exporting).toBeNull()
  await closing
  expect(adapter.isRunning.value).toBe(false)
  vi.unstubAllGlobals()
})

it('invalidates written files only when they land inside the project', async () => {
  const { prepareCardRender } = await import('../../card-rendering/renderPipeline')
  const { parseCardDocument } = await import('../../../entities/card/storage')
  const refresh = vi.fn(async (_paths?: readonly string[]) => undefined)
  const render = prepareCardRender({ document: parseCardDocument(JSON.parse(content('100'))), instance: null, resourceRootPath: 'D:/project', sourceFilePath: null, environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG } })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  const write = vi.spyOn(fileSystemService, 'writeBinaryFile').mockResolvedValue(undefined)
  const { adapter } = createAdapter([], undefined, refresh)
  try {
    await adapter.renderCardImages(render, ['front'], 1, new Map([['front', 'D:/exports/front.png']]))
    expect(refresh).not.toHaveBeenCalled()

    await adapter.renderCardImages(render, ['front'], 1, new Map([['front', 'D:/project/exports/front.png']]))
    expect(refresh).toHaveBeenCalledWith(['D:/project/exports/front.png'])
  } finally { write.mockRestore(); vi.unstubAllGlobals() }
})

it('reports a single-card write failure and waits for an ongoing write on cancellation', async () => {
  const { prepareCardRender } = await import('../../card-rendering/renderPipeline')
  const { parseCardDocument } = await import('../../../entities/card/storage')
  const render = prepareCardRender({ document: parseCardDocument(JSON.parse(content('100'))), instance: null, resourceRootPath: null, sourceFilePath: null, environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG } })
  const write = vi.spyOn(fileSystemService, 'writeBinaryFile').mockRejectedValueOnce(new Error('disk full'))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  const { adapter } = createAdapter([])
  try {
    expect(await adapter.renderCardImages(render, ['front'], 1, new Map([['front', '/out/front.png']]))).toBeNull()
    expect(notificationMocks.notifyAppError).toHaveBeenCalledWith('OC-E5006', expect.objectContaining({ message: 'disk full' }))
    let finish!: () => void
    write.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const exporting = adapter.renderCardImages(render, ['front'], 1, new Map([['front', '/out/front.png']]))
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2))
    let released = false
    const closing = adapter.cancelAndWait().then(() => { released = true })
    await Promise.resolve()
    expect(released).toBe(false)
    finish(); await exporting; await closing
    expect(adapter.isRunning.value).toBe(false)
  } finally { write.mockRestore(); vi.unstubAllGlobals() }
})

it('shares preloaded CanvasAssetStore across multi-card faces in a batch export', async () => {
  const renderFaceToPngModule = await import('../../card-rendering/export/renderFaceToPng')
  const renderSpy = vi.spyOn(renderFaceToPngModule, 'renderFaceToPng').mockImplementation(async () => {
    return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  })
  const { prepareCardRender } = await import('../../card-rendering/renderPipeline')
  const { parseCardDocument } = await import('../../../entities/card/storage')

  const render = prepareCardRender({
    document: parseCardDocument(JSON.parse(content('200'))),
    instance: null,
    resourceRootPath: null,
    sourceFilePath: null,
    environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG },
  })

  const { adapter } = createAdapter([])
  try {
    await adapter.renderCardImages(render, ['front', 'back'], 1)

    expect(renderSpy).toHaveBeenCalledTimes(2)
    const firstAssets = renderSpy.mock.calls[0]?.[1]?.assets
    const secondAssets = renderSpy.mock.calls[1]?.[1]?.assets

    expect(firstAssets).toBeDefined()
    expect(secondAssets).toBeDefined()
    expect(firstAssets).toBe(secondAssets)
  } finally {
    renderSpy.mockRestore()
  }
})

it('clears the shared CanvasAssetStore on export completion, cancellation, and error', async () => {
  const renderFaceToPngModule = await import('../../card-rendering/export/renderFaceToPng')
  let sharedAssetsInstance: import('../../card-rendering/painter/canvasAssetStore').CanvasAssetStore | null = null
  const renderSpy = vi.spyOn(renderFaceToPngModule, 'renderFaceToPng').mockImplementation(async (_scene, options) => {
    sharedAssetsInstance = options?.assets ?? null
    return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  })

  const { prepareCardRender } = await import('../../card-rendering/renderPipeline')
  const { parseCardDocument } = await import('../../../entities/card/storage')

  const render = prepareCardRender({
    document: parseCardDocument(JSON.parse(content('200'))),
    instance: null,
    resourceRootPath: null,
    sourceFilePath: null,
    environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG },
  })

  const { adapter } = createAdapter([])

  try {
    // 1. Success case
    await adapter.renderCardImages(render, ['front'], 1)
    expect(sharedAssetsInstance).not.toBeNull()
    const clearSpy = vi.spyOn(sharedAssetsInstance!, 'clear')

    // Run another export to verify clear is called in finally block
    await adapter.renderCardImages(render, ['front'], 1)
    expect(clearSpy).toHaveBeenCalled()

    // 2. Cancellation case
    clearSpy.mockClear()
    let pauseResolve!: () => void
    const pausePromise = new Promise<void>(res => { pauseResolve = res })
    renderSpy.mockImplementationOnce(async (_scene, options) => {
      sharedAssetsInstance = options?.assets ?? null
      await pausePromise
      if (options?.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    })

    const pendingExport = adapter.renderCardImages(render, ['front'], 1)
    await Promise.resolve()
    adapter.cancel()
    pauseResolve()
    await pendingExport
    expect(clearSpy).toHaveBeenCalled()

    // 3. Error case
    clearSpy.mockClear()
    renderSpy.mockImplementationOnce(async () => {
      throw new Error('Rendering engine failure')
    })
    await adapter.renderCardImages(render, ['front'], 1)
    expect(clearSpy).toHaveBeenCalled()
  } finally {
    renderSpy.mockRestore()
  }
})

it('resolves export DPI from options, document or default 300', async () => {
  const renderFaceToPngModule = await import('../../card-rendering/export/renderFaceToPng')
  const renderSpy = vi.spyOn(renderFaceToPngModule, 'renderFaceToPng').mockImplementation(async () => {
    return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  })
  const { prepareCardRender } = await import('../../card-rendering/renderPipeline')
  const { parseCardDocument } = await import('../../../entities/card/storage')

  const renderDefault = prepareCardRender({
    document: parseCardDocument(JSON.parse(content('100'))),
    instance: null,
    resourceRootPath: null,
    sourceFilePath: null,
    environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG },
  })

  const { adapter } = createAdapter([])
  try {
    await adapter.renderCardImages(renderDefault, ['front'], 1)
    expect(renderSpy.mock.calls[0]?.[1]?.dpi).toBe(300)

    const docWithDpi = { ...JSON.parse(content('100')), dpi: 450 }
    const renderWithDpi = prepareCardRender({
      document: parseCardDocument(docWithDpi),
      instance: null,
      resourceRootPath: null,
      sourceFilePath: null,
      environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG },
    })

    await adapter.renderCardImages(renderWithDpi, ['front'], 1)
    expect(renderSpy.mock.calls[1]?.[1]?.dpi).toBe(450)

    await adapter.renderCardImages(renderDefault, ['front'], 1, undefined, 600)
    expect(renderSpy.mock.calls[2]?.[1]?.dpi).toBe(600)
  } finally {
    renderSpy.mockRestore()
  }
})
