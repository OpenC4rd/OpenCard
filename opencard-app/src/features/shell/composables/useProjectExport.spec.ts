import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../workspace/services/projectIconCatalog'
import { inlineProjectIconSources, useProjectExport } from './useProjectExport'

const notificationMocks = vi.hoisted(() => ({
  notifyAppError: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}))

vi.mock('dom-to-image-more', () => ({
  default: { toPng: vi.fn(async () => 'data:image/png;base64,AQ==') },
}))
vi.mock('../../workspace/services/projectFontLoader', () => ({
  waitForProjectFonts: vi.fn(async () => undefined),
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
) {
  return {
    adapter: useProjectExport({
      sessions: ref(sessions),
      exportRendererRef,
      renderEnvironment: ref({
        project: null,
        dictionary: null,
        projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG,
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
    const session: EditorSession = {
      id: 'session', resourceKind: 'workspace', path: 'D:/project/cards/main.ocdocument',
      fileTypeId: 'opencard', editorId: 'card-designer', name: 'main.ocdocument',
      savedContent: content('540'), draftContent: content('1080'), isDirty: true, isPreview: false,
    }
    const { adapter, readProjectFile } = createAdapter([session])
    const snapshot = await adapter.loadDocumentSnapshot('cards/main.ocdocument')
    session.draftContent = content('2160')
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

