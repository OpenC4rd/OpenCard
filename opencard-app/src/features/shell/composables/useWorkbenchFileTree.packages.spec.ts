import { createTestSession } from '../../editor-runtime/editorTestSession'
import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import { useWorkbenchFileTree } from './useWorkbenchFileTree'

const projectPath = 'D:/project'
const packagesRoot = `${projectPath}/.opencard/packages`
const archivePath = `${packagesRoot}/alice-icons-1.0.0.ocpack`

function createTree(activeSession = ref<EditorSession | null>(null)) {
  const openPreviewFile = vi.fn(async () => undefined)
  const tree = useWorkbenchFileTree({
    projectPath: ref(projectPath),
    indexedEntries: ref([
      { name: '.opencard/packages', isDirectory: true },
      { name: '.opencard/packages/alice-icons-1.0.0.ocpack', isDirectory: false },
      { name: '.opencard/packages/notes.txt', isDirectory: false },
    ]),
    sessions: ref<EditorSession[]>([]),
    formatSessionTitle: session => session.state.name,
    activeSession,
    isDirectoryExpanded: () => false,
    activateSession: () => undefined,
    openPreviewFile,
    translate: key => key,
    packageCoordinates: ref(new Map([[archivePath, 'alice/icons@1.0.0']])),
    packagePaths: ref([archivePath, `${packagesRoot}/notes.txt`]),
  })
  return { tree, openPreviewFile }
}

describe('useWorkbenchFileTree package navigation', () => {
  it('opens the package folder and each archive through its own path', async () => {
    const { tree, openPreviewFile } = createTree()

    await tree.handleProjectManagementSelect([packagesRoot])
    expect(openPreviewFile).toHaveBeenCalledWith(packagesRoot)

    await tree.handleProjectManagementSelect([archivePath])
    expect(openPreviewFile).toHaveBeenCalledWith(archivePath)
  })

  it('keeps the selected management entry in sync with the active package session', async () => {
    const activeSession = ref<EditorSession | null>(null)
    const { tree } = createTree(activeSession)

    activeSession.value = createTestSession({
      id: 'package-manifest',
      resourceKind: 'workspace',
      path: archivePath,
      fileTypeId: 'opencard-resource-package',
      name: 'alice-icons-1.0.0.ocpack',
      editorId: 'package-manifest',
      savedContent: '',
      draftContent: '',
      isDirty: false,
      isPreview: true,
    })
    await nextTick()

    expect(tree.selectedManagementKeys.value).toEqual([archivePath])
  })
})
