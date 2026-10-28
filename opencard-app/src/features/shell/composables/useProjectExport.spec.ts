import { createTestSession } from '../../editor-runtime/editorTestSession'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../workspace/services/projectIconCatalog'
import { inlineProjectIconSources, useProjectExport } from './useProjectExport'
import { fileSystemService } from '../../workspace/services/fileSystemService'

const notificationMocks = vi.hoisted(() => ({
  notifyAppError: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}))

vi.mock('dom-to-image-more', () => ({
  default: { toPng: vi.fn(async () => 'data:image/png;base64,AQ==') },
}))
vi.mock('../../notifications/titlebarNotices', () => notificationMocks)

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
  exportRendererRef = ref<{
    getCanvasElement?: () => HTMLElement | undefined
  }>(),
  refresh = vi.fn(async (_paths?: readonly string[]) => undefined),
) {
  return {
    adapter: useProjectExport({
      sessions: ref(sessions),
      exportRendererRef,
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

describe('useProjectExport project icon assets', () => {
  it('temporarily replaces icon source URLs stored in project-icon CSS variables', async () => {
    const root = document.createElement('div')
    const icon = document.createElement('span')
    icon.className = 'oc-project-icon'
    icon.style.setProperty('--oc-project-icon-background-image', 'url("asset://atlas.png")')
    icon.style.setProperty('--oc-project-icon-mask-image', 'url("asset://warn.svg")')
    root.appendChild(icon)
    vi.stubGlobal('fetch', vi.fn(async (source: string) => ({
      ok: true,
      blob: async () => new Blob([source], { type: 'image/png' }),
    })))

    const restore = await inlineProjectIconSources(root)

    expect(icon.style.getPropertyValue('--oc-project-icon-background-image')).toMatch(/^url\("data:image\/png;base64,/)
    expect(icon.style.getPropertyValue('--oc-project-icon-mask-image')).toMatch(/^url\("data:image\/png;base64,/)
    expect(fetch).toHaveBeenCalledTimes(2)
    restore()
    expect(icon.style.getPropertyValue('--oc-project-icon-background-image')).toBe('url("asset://atlas.png")')
    expect(icon.style.getPropertyValue('--oc-project-icon-mask-image')).toBe('url("asset://warn.svg")')
    vi.unstubAllGlobals()
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
  const canvas = document.createElement('div')
  const { adapter } = createAdapter([], undefined, ref({ getCanvasElement: () => canvas }))
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
  const { adapter } = createAdapter([], undefined, ref({ getCanvasElement: () => document.createElement('div') }), refresh)
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
  const { adapter } = createAdapter([], undefined, ref({ getCanvasElement: () => document.createElement('div') }))
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
