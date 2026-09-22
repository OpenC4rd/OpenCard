import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { normalizeNodeTail } from '../../../shared/ui/node/node.types'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { resolveFileType } from '../../workspace/model/fileTypes'
import { RESOURCE_PACKAGE_TYPE, type ResourcePackageManifest } from '../../workspace/model/resourcePackage'
import {
  PROJECT_PACKAGE_DELETE_ACTION_KEY,
  PROJECT_PACKAGE_VERIFY_ACTION_KEY,
  useShellFileTree,
} from './useShellFileTree'

describe('useShellFileTree package navigation', () => {
  it('previews the package manager and child manifests through their semantic targets', async () => {
    const projectPath = 'D:/project'
    const openPreviewFile = vi.fn(async () => undefined)
    const activeSession = ref<EditorSession | null>(null)
    const manifest: ResourcePackageManifest = {
      type: RESOURCE_PACKAGE_TYPE,
      key: 'theme',
      name: 'Theme',
      version: '1.0.0',
      contentHash: '0'.repeat(64),
      public: { fonts: [], iconSeries: [] },
    }
    const packageManifests = ref<ReadonlyMap<string, ResourcePackageManifest>>(new Map([['theme', manifest]]))
    const tree = useShellFileTree({
      projectPath: ref(projectPath),
      indexedEntries: ref([
        { name: '.opencard/packages/theme', isDirectory: true },
        { name: '.opencard/packages/theme/.opencard', isDirectory: true },
        { name: '.opencard/packages/theme/.opencard/manifest.json', isDirectory: false },
      ]),
      packageManifests,
      sessions: ref<EditorSession[]>([]),
      formatSessionTitle: session => session.name,
      activeSession,
      isDirectoryExpanded: vi.fn(() => false),
      activateSession: vi.fn(),
      openPreviewFile,
      ensureProjectManagementStructure: vi.fn(async () => undefined),
      translate: key => key,
    })

    await tree.handleProjectManagementSelect([`${projectPath}/.opencard/packages/packages.json`])
    expect(openPreviewFile).toHaveBeenCalledWith(`${projectPath}/.opencard/packages/packages.json`)

    await tree.handleProjectManagementSelect([`${projectPath}/.opencard/packages/theme`])
    expect(openPreviewFile).toHaveBeenCalledWith(`${projectPath}/.opencard/packages/theme/.opencard/manifest.json`)
    expect(tree.projectManagementTreeData.value.children.get(`${projectPath}/.opencard/packages/packages.json`))
      .toEqual([`${projectPath}/.opencard/packages/theme`])
    expect(normalizeNodeTail(tree.projectManagementTreeData.value.items.get(`${projectPath}/.opencard/packages/theme`)?.tail))
      .toEqual([
        { key: PROJECT_PACKAGE_VERIFY_ACTION_KEY, title: 'packageManager.verify', icon: 'action.check' },
        {
          key: PROJECT_PACKAGE_DELETE_ACTION_KEY,
          title: 'resourcePackage.delete',
          icon: 'action.delete',
          iconTone: 'danger',
        },
      ])
    expect(tree.findProjectPackageKeyByNodeKey(`${projectPath}/.opencard/packages/theme`)).toBe('theme')

    packageManifests.value = new Map()
    activeSession.value = {
      id: 'package-manifest',
      resourceKind: 'workspace',
      path: `${projectPath}/.opencard/packages/theme/.opencard/manifest.json`,
      fileTypeId: 'json',
      name: 'manifest.json',
      editorId: 'monaco',
      savedContent: '',
      draftContent: '',
      isDirty: false,
      isPreview: true,
    }
    await nextTick()
    expect(tree.selectedManagementKeys.value).toEqual([])

    packageManifests.value = new Map([['theme', manifest]])
    await nextTick()
    expect(tree.selectedManagementKeys.value).toEqual([`${projectPath}/.opencard/packages/theme`])
    expect(resolveFileType(`${projectPath}/.opencard/packages/theme/.opencard/manifest.json`, projectPath))
      .toMatchObject({ id: 'opencard-installed-package-manifest', editorId: 'package-manifest' })
  })
})
