import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { isNodeTailAction, normalizeNodeTail, type OcNode } from '../../../shared/ui/node/node.types'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { resolveFileType } from '../../workspace/model/fileTypes'
import {
  PROJECT_ENTRY_MORE_ACTION_KEY,
  PROJECT_PACKAGE_ADD_ACTION_KEY,
  useShellFileTree,
} from './useShellFileTree'

/** 只取尾部里那些是命令的部分（目录行还有一段显示用的路径文字）。 */
function actionsOf(tail: OcNode['tail']): string[] {
  return normalizeNodeTail(tail).flatMap(part => (isNodeTailAction(part) ? [part.key] : []))
}

describe('useShellFileTree package navigation', () => {
  it('lists the project packages from the folder and opens each archive by its own path', async () => {
    const projectPath = 'D:/project'
    const openPreviewFile = vi.fn(async () => undefined)
    const activeSession = ref<EditorSession | null>(null)
    const packagesRoot = `${projectPath}/.opencard/packages`
    const archivePath = `${packagesRoot}/alice-icons-1.0.0.ocpack`
    const tree = useShellFileTree({
      projectPath: ref(projectPath),
      indexedEntries: ref([
        { name: '.opencard/packages', isDirectory: true },
        { name: '.opencard/packages/alice-icons-1.0.0.ocpack', isDirectory: false },
        { name: '.opencard/packages/notes.txt', isDirectory: false },
      ]),
      sessions: ref<EditorSession[]>([]),
      formatSessionTitle: session => session.name,
      activeSession,
      isDirectoryExpanded: vi.fn(() => false),
      activateSession: vi.fn(),
      openPreviewFile,
      ensureProjectManagementStructure: vi.fn(async () => undefined),
      translate: key => key,
      packageCoordinates: ref(new Map([[archivePath, 'alice/icons@1.0.0']])),
    })

    // 项目里装了哪些包就是文件夹里有哪几个 `.ocpack`；别的文件不进这棵树。
    expect(tree.projectManagementTreeData.value.children.get(packagesRoot)).toEqual([archivePath])
    // 标题是文件真正的名字，小字是包自述的坐标 —— 文件叫什么名字不算数。
    expect(tree.projectManagementTreeData.value.items.get(archivePath)?.label)
      .toBe('alice-icons-1.0.0.ocpack')
    expect(normalizeNodeTail(tree.projectManagementTreeData.value.items.get(archivePath)?.tail)[0])
      .toBe('alice/icons@1.0.0')
    // 尾部动作和文件树里那一行是同一套（重命名/回收站/显示/复制路径都在那个"更多"里）。
    expect(actionsOf(tree.projectManagementTreeData.value.items.get(archivePath)?.tail))
      .toEqual([PROJECT_ENTRY_MORE_ACTION_KEY])
    // 包目录那一行提供一个"添加包"的入口，点这一行打开包管理器整页。
    expect(actionsOf(tree.projectManagementTreeData.value.items.get(packagesRoot)?.tail))
      .toEqual([PROJECT_PACKAGE_ADD_ACTION_KEY])
    await tree.handleProjectManagementSelect([packagesRoot])
    expect(openPreviewFile).toHaveBeenCalledWith(packagesRoot)

    await tree.handleProjectManagementSelect([archivePath])
    expect(openPreviewFile).toHaveBeenCalledWith(archivePath)

    activeSession.value = {
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
    }
    await nextTick()
    expect(tree.selectedManagementKeys.value).toEqual([archivePath])
    expect(resolveFileType(archivePath, projectPath))
      .toMatchObject({ id: 'opencard-resource-package', editorId: 'package-manifest' })
  })
})
