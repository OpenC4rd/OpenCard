import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OcTree from '../../../components/standard/OcTree.vue'
import type { OcNodeCollection } from '../../../shared/ui/node/node.types'
import { isNodeTailAction, normalizeNodeTail } from '../../../shared/ui/node/node.types'
import type { AppSettings, ProjectWorkspaceState } from '../../settings/model/appSettings'
import type { ProjectCover } from '../model/projectCover'
import { useShellProgressTasks } from '../../shell/composables/useShellProgressTasks'
import ResourcePackageBuilderDialog from './ResourcePackageBuilderDialog.vue'

const buildPackage = vi.hoisted(() => vi.fn(async () => ({ outputPath: '/output/theme.ocpack' })))
const pickSavePath = vi.hoisted(() => vi.fn(async () => '/output/theme.ocpack'))
const readProjectCover = vi.hoisted(() => vi.fn(async (): Promise<ProjectCover | null> => null))
const notifications = vi.hoisted(() => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }))

const projectStore = vi.hoisted(() => ({
  projectFontFamilies: { value: [
    { key: 'latin', name: 'Latin', files: { normal: { upright: 'fonts/latin.ttf' } } },
    { key: 'cjk', name: 'CJK', files: { normal: { upright: 'fonts/cjk.ttf' } } },
  ] },
  projectFontCompositions: { value: [
    { key: 'body', name: 'Body', members: [{ fontKey: 'latin' }, { fontKey: 'cjk' }] },
  ] },
  projectIconSeries: { value: [
    { key: 'status', name: 'Status', source: 'icons/status.png', icons: [] },
  ] },
  projectProfile: { value: { author: 'publisher-test' } },
  // 内化别人的资源时要按坐标找到包解开在哪；这份替身里一个包都没装。
  projectResourceEnvironment: { value: { packages: new Map() } },
}))

const settings = vi.hoisted(() => ({
  value: {
    identity: { publisherKey: 'publisher-test' },
    projectCreation: { workspaceStates: {} as Record<string, ProjectWorkspaceState> },
  } as unknown as AppSettings,
}))
const updateSetting = vi.hoisted(() => vi.fn())
const updateProjectCreation = vi.hoisted(() => vi.fn((patch: { workspaceStates?: Record<string, ProjectWorkspaceState> }) => {
  if (patch.workspaceStates) settings.value.projectCreation.workspaceStates = patch.workspaceStates
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../store/projectStore', () => ({ useProjectStore: () => projectStore }))
vi.mock('../../settings/store/appSettingsStore', () => ({
  useAppSettingsStore: () => ({ settings, updateSetting, updateProjectCreation }),
}))
vi.mock('../services/buildResourcePackage', () => ({ buildResourcePackageFromProject: buildPackage }))
vi.mock('../services/fileSystemService', () => ({ fileSystemService: { pickSavePath } }))
vi.mock('../services/projectCoverService', () => ({ readProjectCover }))
vi.mock('../../notifications/titlebarNotices', () => notifications)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

const imageEntries = [
  'images/card.png', 'images/nested/banner.svg', 'images/notes.txt',
  '.opencard/icons/status.png', '.git/logo.png', '/outside/leak.png',
]

function mountBuilder(entries: readonly string[] = [], projectRootPath = '/project') {
  return mount(ResourcePackageBuilderDialog, {
    props: { open: true, projectRootPath, projectName: 'Project', entries },
    global: { stubs: { Teleport: true } },
  })
}

function actionsOf(data: OcNodeCollection, key: string): readonly string[] | undefined {
  return normalizeNodeTail(data.items.get(key)?.tail).filter(isNodeTailAction).map(action => action.key)
}

function buildTaskKeys(): readonly string[] {
  return useShellProgressTasks().tasks.value.map(task => task.key)
}

beforeEach(() => {
  settings.value.projectCreation.workspaceStates = {}
  updateSetting.mockClear()
  updateProjectCreation.mockClear()
  pickSavePath.mockClear()
  buildPackage.mockClear()
  readProjectCover.mockClear()
  readProjectCover.mockResolvedValue(null)
  notifications.notifySuccess.mockClear()
  notifications.notifyError.mockClear()
})

describe('ResourcePackageBuilderDialog cover summary', () => {
  it('shows the inherited project cover as read-only information', async () => {
    readProjectCover.mockResolvedValue({
      relativePath: 'assets/cover.png',
      absolutePath: '/project/assets/cover.png',
      src: 'asset:///project/assets/cover.png',
    })
    const wrapper = mountBuilder()
    await flushPromises()

    expect(readProjectCover).toHaveBeenCalledWith(expect.objectContaining({ projectRootPath: '/project' }))
    expect((wrapper.get('.resource-package-builder__cover input').element as HTMLInputElement).value)
      .toBe('assets/cover.png')
  })

  it('states that a project without a cover produces a package without one', async () => {
    const wrapper = mountBuilder()
    await flushPromises()

    expect((wrapper.get('.resource-package-builder__cover input').element as HTMLInputElement).value)
      .toBe('resourcePackage.coverNone')
  })
})

describe('ResourcePackageBuilderDialog selection', () => {
  it('keeps public font and composition selections independent and selects everything by default', async () => {
    const wrapper = mountBuilder()
    const tree = wrapper.findComponent(OcTree)
    let data = tree.props('data') as OcNodeCollection
    expect(data.children.get('category:fonts')).toEqual(['font-group:families', 'font-group:compositions'])
    expect(actionsOf(data, 'font-family:latin')).toEqual(['deselect'])
    expect(actionsOf(data, 'font-family:cjk')).toEqual(['deselect'])
    expect(actionsOf(data, 'font-composition:body')).toEqual(['deselect'])
    expect(actionsOf(data, 'icon-series:status')).toEqual(['deselect'])

    tree.vm.$emit('action', { key: 'font-composition:body', actionKey: 'deselect', source: 'inline' })
    tree.vm.$emit('action', { key: 'font-family:cjk', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    data = tree.props('data') as OcNodeCollection
    expect(actionsOf(data, 'font-composition:body')).toEqual(['select'])
    expect(actionsOf(data, 'font-family:cjk')).toEqual(['select'])
    expect(actionsOf(data, 'font-family:latin')).toEqual(['deselect'])

    tree.vm.$emit('action', { key: 'font-family:cjk', actionKey: 'select', source: 'inline' })
    await nextTick()
    data = tree.props('data') as OcNodeCollection
    expect(actionsOf(data, 'font-composition:body')).toEqual(['select'])
    expect(actionsOf(data, 'font-family:cjk')).toEqual(['deselect'])
  })

  it('selects project icon series without exposing their files', async () => {
    const wrapper = mountBuilder()
    const tree = wrapper.findComponent(OcTree)
    let data = tree.props('data') as OcNodeCollection
    expect(data.children.get('category:icons')).toEqual(['icon-series:status'])
    expect(data.items.get('category:icons')?.tail).toBeUndefined()
    expect([...data.items.keys()].some(key => key.includes('status.png'))).toBe(false)

    tree.vm.$emit('action', { key: 'icon-series:status', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    data = tree.props('data') as OcNodeCollection
    expect(actionsOf(data, 'icon-series:status')).toEqual(['select'])

    tree.vm.$emit('action', { key: 'icon-series:status', actionKey: 'select', source: 'inline' })
    await nextTick()
    expect(actionsOf(tree.props('data') as OcNodeCollection, 'icon-series:status')).toEqual(['deselect'])
  })

  it('shows project files by directory and builds from the selection', async () => {
    const wrapper = mountBuilder(imageEntries)
    const tree = wrapper.findComponent(OcTree)
    let data = tree.props('data') as OcNodeCollection

    expect(data.children.get('category:other-files')).toEqual(['folder:other-files:images'])
    expect(data.children.get('folder:other-files:images')).toEqual([
      'file:images/card.png', 'folder:other-files:images/nested', 'file:images/notes.txt',
    ])
    expect(data.items.has('file:images/nested/banner.svg')).toBe(true)
    expect(data.items.has('file:images/notes.txt')).toBe(true)
    expect([...data.items.keys()].some(key => key.includes('.opencard')
      || key.includes('.git') || key.includes('outside'))).toBe(false)
    expect(data.items.get('category:other-files')?.tail).toBeUndefined()
    // An image row carries only its selection command, with no descriptive text part.
    expect(normalizeNodeTail(data.items.get('file:images/card.png')?.tail).filter(part => typeof part === 'string'))
      .toEqual([])
    expect(actionsOf(data, 'file:images/card.png')).toEqual(['deselect'])

    tree.vm.$emit('action', { key: 'file:images/card.png', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    tree.vm.$emit('action', { key: 'file:images/nested/banner.svg', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    data = tree.props('data') as OcNodeCollection
    expect(actionsOf(data, 'file:images/card.png')).toEqual(['select'])

    tree.vm.$emit('action', { key: 'file:images/card.png', actionKey: 'select', source: 'inline' })
    await nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(buildPackage).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Project',
      otherSelection: { paths: ['images/notes.txt', 'images/card.png'] },
    }))
  })

  it('hands the build to the global progress bar instead of freezing the dialog', async () => {
    let finishBuild: (value: { outputPath: string }) => void = () => {}
    buildPackage.mockReturnValueOnce(new Promise(resolve => { finishBuild = resolve }))
    const wrapper = mountBuilder(imageEntries)
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    // The destination is settled, so the dialog closes and the packing keeps running in the background.
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(buildTaskKeys()).toContain('resource-package-build')

    finishBuild({ outputPath: '/output/theme.ocpack' })
    await flushPromises()

    expect(notifications.notifySuccess).toHaveBeenCalledWith('resourcePackage.built')
    expect(buildTaskKeys()).not.toContain('resource-package-build')
  })

  it('reports a failed build as an instant message and clears its progress task', async () => {
    buildPackage.mockRejectedValueOnce(new Error('disk full'))
    const wrapper = mountBuilder(imageEntries)
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(notifications.notifyError).toHaveBeenCalledWith('disk full')
    expect(notifications.notifySuccess).not.toHaveBeenCalled()
    expect(buildTaskKeys()).not.toContain('resource-package-build')
  })

  it('refuses to start a second build while one is still running', async () => {
    let finishBuild: (value: { outputPath: string }) => void = () => {}
    buildPackage.mockReturnValueOnce(new Promise(resolve => { finishBuild = resolve }))
    const wrapper = mountBuilder(imageEntries)
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    buildPackage.mockClear()

    // Submitting again must not reuse the key of the build that is still in flight.
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(buildPackage).not.toHaveBeenCalled()

    finishBuild({ outputPath: '/output/theme.ocpack' })
    await flushPromises()
    expect(buildTaskKeys()).not.toContain('resource-package-build')
  })

  it('restores the previous build and falls back to every candidate when nothing was remembered', async () => {
    settings.value.projectCreation.workspaceStates = {
      '/other': { expandedDirectories: [] },
      '/project': {
        expandedDirectories: [],
        packageBuilder: {
          name: 'Theme',
          title: 'Theme Pack',
          author: 'publisher-test',
          version: '2.1.0',
          fontFamilyKeys: ['cjk'],
          fontCompositionKeys: [],
          iconSeriesKeys: [],
          imagePaths: ['images/nested/banner.svg'],
        },
      },
    }
    const wrapper = mountBuilder(imageEntries)
    const tree = wrapper.findComponent(OcTree)
    const data = tree.props('data') as OcNodeCollection

    expect(actionsOf(data, 'font-family:latin')).toEqual(['select'])
    expect(actionsOf(data, 'font-family:cjk')).toEqual(['deselect'])
    expect(actionsOf(data, 'font-composition:body')).toEqual(['select'])
    expect(actionsOf(data, 'icon-series:status')).toEqual(['select'])
    expect(actionsOf(data, 'file:images/nested/banner.svg')).toEqual(['deselect'])
    expect(actionsOf(data, 'file:images/card.png')).toEqual(['select'])
    // The remembered package name and version come back; the version would otherwise default to 1.0.0.
    const fields = wrapper.findAll('.resource-package-builder__fields input')
    expect((fields[0]!.element as HTMLInputElement).value).toBe('Theme')
    expect((fields[1]!.element as HTMLInputElement).value).toBe('Theme Pack')
    expect((fields[3]!.element as HTMLInputElement).value).toBe('2.1.0')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(buildPackage).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Theme',
      otherSelection: { paths: ['images/nested/banner.svg'] },
      fontSelection: { familyKeys: ['cjk'], compositionKeys: [] },
      iconSelection: { seriesKeys: [] },
    }))
  })

  it('remembers the build inputs for the project and restores them on reopen', async () => {
    const wrapper = mountBuilder(imageEntries)
    const tree = wrapper.findComponent(OcTree)
    tree.vm.$emit('action', { key: 'file:images/card.png', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    tree.vm.$emit('action', { key: 'font-family:latin', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    tree.vm.$emit('action', { key: 'font-composition:body', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    tree.vm.$emit('action', { key: 'icon-series:status', actionKey: 'deselect', source: 'inline' })
    await nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const currentStates = settings.value.projectCreation.workspaceStates
    expect(updateProjectCreation).toHaveBeenCalledTimes(1)
    expect(currentStates['/project']?.packageBuilder).toEqual({
      name: 'Project',
      author: 'publisher-test',
      version: '1.0.0',
      title: 'Project',
      fontFamilyKeys: ['cjk'],
      fontCompositionKeys: [],
      iconSeriesKeys: [],
      customBlockKeys: [],
      imagePaths: [],
      otherPaths: ['images/nested/banner.svg', 'images/notes.txt'],
    })

    const reopened = mountBuilder(imageEntries)
    const reopenedTree = reopened.findComponent(OcTree)
    const data = reopenedTree.props('data') as OcNodeCollection
    expect(actionsOf(data, 'font-family:latin')).toEqual(['select'])
    expect(actionsOf(data, 'font-family:cjk')).toEqual(['deselect'])
    expect(actionsOf(data, 'file:images/card.png')).toEqual(['select'])
    expect(actionsOf(data, 'file:images/nested/banner.svg')).toEqual(['deselect'])
  })
})
