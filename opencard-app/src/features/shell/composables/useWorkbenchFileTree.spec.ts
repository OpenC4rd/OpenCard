import { createTestSession } from '../../editor-runtime/editorTestSession'
import { nextTick, ref, type Ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { useWorkbenchFileTree } from './useWorkbenchFileTree'

function createTree(options: {
  projectPath?: string
  entries?: readonly { name: string; isDirectory?: boolean }[]
  sessions?: Ref<EditorSession[]>
  activeSession?: Ref<EditorSession | null>
  openPreviewFile?: (path: string) => Promise<unknown>
} = {}) {
  return useWorkbenchFileTree({
    projectPath: ref(options.projectPath ?? 'D:/project'),
    indexedEntries: ref(options.entries ?? []),
    sessions: options.sessions ?? ref<EditorSession[]>([]),
    formatSessionTitle: session => session.state.name,
    activeSession: options.activeSession ?? ref<EditorSession | null>(null),
    translate: key => key,
    isDirectoryExpanded: () => false,
    activateSession: () => undefined,
    openPreviewFile: options.openPreviewFile ?? (async () => undefined),
  })
}

function workspaceSession(path: string): EditorSession {
  return createTestSession({
    id: 'session-1',
    resourceKind: 'workspace',
    path,
    fileTypeId: 'opencard',
    name: path.split('/').pop()!,
    editorId: 'card-designer',
    savedContent: '{}',
    draftContent: '{}',
    isDirty: false,
    isPreview: false,
  })
}

describe('useWorkbenchFileTree', () => {
  it('hides dot-prefixed files and directories by default', () => {
    const projectPath = 'D:/project'
    const tree = createTree({
      projectPath,
      entries: [
        { name: '.opencard', isDirectory: true },
        { name: '.opencard/project.json', isDirectory: false },
        { name: '.opencard/fonts', isDirectory: true },
        { name: '.opencard/fonts/Brand.otf', isDirectory: false },
        { name: '.env', isDirectory: false },
        { name: 'notes.txt', isDirectory: false },
      ],
    })

    expect(tree.projectTreeData.value.rootKeys).toEqual([`${projectPath}/notes.txt`])
    expect([...tree.projectTreeData.value.items.keys()]).toEqual([`${projectPath}/notes.txt`])
  })

  it('treats .opencard like an ordinary directory when dot entries are visible', () => {
    const projectPath = 'D:/project'
    const tree = useWorkbenchFileTree({
      projectPath: ref(projectPath),
      indexedEntries: ref([
        { name: '.opencard', isDirectory: true },
        { name: '.opencard/project.json', isDirectory: false },
        { name: '.env', isDirectory: false },
      ]),
      hideDotFiles: ref(false),
      sessions: ref<EditorSession[]>([]),
      formatSessionTitle: session => session.state.name,
      activeSession: ref(null),
      translate: key => key,
      isDirectoryExpanded: () => false,
      activateSession: () => undefined,
      openPreviewFile: async () => undefined,
    })

    expect(tree.projectTreeData.value.rootKeys).toEqual([
      `${projectPath}/.opencard`,
      `${projectPath}/.env`,
    ])
    expect(tree.projectTreeData.value.children.get(`${projectPath}/.opencard`))
      .toEqual([`${projectPath}/.opencard/project.json`])
  })

  it('opens the file a project-management entry names', async () => {
    const projectPath = 'D:/project'
    const openPreviewFile = vi.fn(async () => undefined)
    const tree = createTree({ projectPath, openPreviewFile })

    for (const fileName of [
      '.opencard/project.json',
      '.opencard/locale.json',
      '.opencard/fonts/fonts.json',
      '.opencard/icons/icons.json',
    ]) {
      openPreviewFile.mockClear()
      await tree.handleProjectManagementSelect([`${projectPath}/${fileName}`])
      expect(openPreviewFile).toHaveBeenCalledWith(`${projectPath}/${fileName}`)
    }
  })

  it('keeps selection references stable when active editor content changes', async () => {
    const path = 'D:/project/card.ocdocument'
    const session = workspaceSession(path)
    const activeSession = ref<EditorSession | null>(session)
    const tree = createTree({
      entries: [{ name: 'card.ocdocument', isDirectory: false }],
      sessions: ref([session]),
      activeSession,
    })
    const selectedFiles = tree.selectedProjectEntryKeys.value
    const selectedEditors = tree.openedEditorSelectedKeys.value

    session.updateContent('{"changed":true}')
    await nextTick()

    expect(tree.selectedProjectEntryKeys.value).toBe(selectedFiles)
    expect(tree.openedEditorSelectedKeys.value).toBe(selectedEditors)
  })

  it('opens a font file through its dedicated preview session', async () => {
    const path = 'D:/project/assets/fonts/Brand.otf'
    const openPreviewFile = vi.fn(async () => undefined)
    const tree = createTree({
      entries: [{ name: 'assets/fonts/Brand.otf', isDirectory: false }],
      openPreviewFile,
    })

    await tree.handleFileTreeSelect([path])

    expect(tree.selectedProjectEntryKeys.value).toEqual([path])
    expect(openPreviewFile).toHaveBeenCalledWith(path)
  })

  it('preserves multi-selection across a resource refresh without opening previews', async () => {
    const indexedEntries = ref([{ name: 'a.png' }, { name: 'b.png' }])
    const openPreviewFile = vi.fn(async () => undefined)
    const tree = useWorkbenchFileTree({
      projectPath: ref('D:/project'),
      indexedEntries,
      sessions: ref<EditorSession[]>([]),
      formatSessionTitle: session => session.state.name,
      activeSession: ref(null),
      translate: key => key,
      isDirectoryExpanded: () => false,
      activateSession: () => undefined,
      openPreviewFile,
    })
    await tree.handleFileTreeSelect(['D:/project/a.png', 'D:/project/b.png'])
    indexedEntries.value = [...indexedEntries.value, { name: 'c.png' }]
    await nextTick()
    expect(tree.selectedProjectEntryKeys.value).toEqual(['D:/project/a.png', 'D:/project/b.png'])
    expect(openPreviewFile).not.toHaveBeenCalled()

    indexedEntries.value = [{ name: 'a.png' }]
    await nextTick()
    expect(tree.selectedProjectEntryKeys.value).toEqual(['D:/project/a.png'])
  })
})
