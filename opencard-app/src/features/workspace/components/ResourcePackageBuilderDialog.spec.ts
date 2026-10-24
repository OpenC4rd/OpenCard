import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OcTree from '../../../components/standard/OcTree.vue'
import type { AppSettings } from '../../settings/model/appSettings'
import type { ProjectWorkspaceState } from '../../app-state/model/appState'
import type { ProjectCover } from '../model/projectCover'
import { useShellProgressTasks } from '../../shell/composables/useShellProgressTasks'
import ResourcePackageBuilderDialog from './ResourcePackageBuilderDialog.vue'

const buildPackage = vi.hoisted(() => vi.fn(async () => ({ outputPath: '/output/theme.ocpack' })))
const pickSavePath = vi.hoisted(() => vi.fn(async (): Promise<string | null> => '/output/theme.ocpack'))
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
  projectResourceEnvironment: { value: { packages: new Map() } },
}))

const settings = vi.hoisted(() => ({
  value: {
    identity: { publisherKey: 'publisher-test' },
  } as unknown as AppSettings,
}))
const appState = vi.hoisted(() => ({ value: { projects: { workspaces: {} as Record<string, ProjectWorkspaceState> } } }))
const updateProjects = vi.hoisted(() => vi.fn((patch: { workspaces?: Record<string, ProjectWorkspaceState> }) => {
  if (patch.workspaces) appState.value.projects.workspaces = patch.workspaces
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../store/projectStore', () => ({ useProjectStore: () => projectStore }))
vi.mock('../../settings/store/appSettingsStore', () => ({
  useAppSettingsStore: () => ({ settings }),
}))
vi.mock('../../app-state/store/appStateStore', () => ({ useAppStateStore: () => ({ state: appState, updateProjects }) }))
vi.mock('../services/buildResourcePackage', () => ({ buildResourcePackageFromProject: buildPackage }))
vi.mock('../services/fileSystemService', () => ({ fileSystemService: { pickSavePath } }))
vi.mock('../services/projectCoverService', () => ({ readProjectCover }))
vi.mock('../../notifications/titlebarNotices', () => notifications)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

const entries = [
  'images/card.png', 'images/nested/banner.svg', 'images/notes.txt',
  '.opencard/icons/status.png', '.git/logo.png', '/outside/leak.png',
]

function mountBuilder() {
  return mount(ResourcePackageBuilderDialog, {
    props: { open: true, projectRootPath: '/project', projectName: 'Project', entries },
    global: { stubs: { Teleport: true } },
  })
}

function treeOf(wrapper: ReturnType<typeof mountBuilder>) {
  return wrapper.findComponent(OcTree)
}

async function toggle(wrapper: ReturnType<typeof mountBuilder>, key: string, actionKey: 'select' | 'deselect') {
  treeOf(wrapper).vm.$emit('action', { key, actionKey, source: 'inline' })
  await nextTick()
}

async function submit(wrapper: ReturnType<typeof mountBuilder>) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

function buildTaskKeys(): readonly string[] {
  return useShellProgressTasks().tasks.value.map(task => task.key)
}

beforeEach(() => {
  appState.value.projects.workspaces = {}
  updateProjects.mockClear()
  pickSavePath.mockClear()
  pickSavePath.mockResolvedValue('/output/theme.ocpack')
  buildPackage.mockClear()
  readProjectCover.mockClear()
  notifications.notifySuccess.mockClear()
  notifications.notifyError.mockClear()
})

describe('ResourcePackageBuilderDialog', () => {
  it('builds with every candidate by default and only project-relative files', async () => {
    const wrapper = mountBuilder()
    await flushPromises()

    await submit(wrapper)

    expect(buildPackage).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Project',
      author: 'publisher-test',
      version: '1.0.0',
      title: 'Project',
      outputPath: '/output/theme.ocpack',
      fontSelection: { familyKeys: ['latin', 'cjk'], compositionKeys: ['body'] },
      iconSelection: { seriesKeys: ['status'] },
      // 隐藏目录、托管目录与项目外的路径都不是候选。
      otherSelection: { paths: ['images/card.png', 'images/nested/banner.svg', 'images/notes.txt'] },
    }))
  })

  it('keeps a deselected composition out of the build without touching the fonts', async () => {
    const wrapper = mountBuilder()
    await flushPromises()
    await toggle(wrapper, 'font-composition:body', 'deselect')
    await toggle(wrapper, 'font-family:cjk', 'deselect')
    await toggle(wrapper, 'icon-series:status', 'deselect')
    await toggle(wrapper, 'file:images/notes.txt', 'deselect')

    await submit(wrapper)

    expect(buildPackage).toHaveBeenCalledWith(expect.objectContaining({
      fontSelection: { familyKeys: ['latin'], compositionKeys: [] },
      iconSelection: { seriesKeys: [] },
      otherSelection: { paths: ['images/card.png', 'images/nested/banner.svg'] },
    }))
  })

  it('keeps the selection open when the destination picker is cancelled', async () => {
    pickSavePath.mockResolvedValueOnce(null)
    const wrapper = mountBuilder()
    await flushPromises()

    await submit(wrapper)

    expect(buildPackage).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('closes the dialog and finishes the build on the global progress bar', async () => {
    let finishBuild: (value: { outputPath: string }) => void = () => {}
    buildPackage.mockReturnValueOnce(new Promise(resolve => { finishBuild = resolve }))
    const wrapper = mountBuilder()
    await flushPromises()

    await submit(wrapper)

    // The destination is settled, so the dialog closes and the packing keeps running in the background.
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(buildTaskKeys()).toContain('resource-package-build')

    finishBuild({ outputPath: '/output/theme.ocpack' })
    await flushPromises()

    expect(notifications.notifySuccess).toHaveBeenCalledOnce()
    expect(buildTaskKeys()).not.toContain('resource-package-build')
  })

  it('reports a failed build and clears its progress task', async () => {
    buildPackage.mockRejectedValueOnce(new Error('disk full'))
    const wrapper = mountBuilder()
    await flushPromises()

    await submit(wrapper)

    expect(notifications.notifyError).toHaveBeenCalledWith('disk full')
    expect(buildTaskKeys()).not.toContain('resource-package-build')
  })

  it('refuses to start a second build while one is still running', async () => {
    let finishBuild: (value: { outputPath: string }) => void = () => {}
    buildPackage.mockReturnValueOnce(new Promise(resolve => { finishBuild = resolve }))
    const wrapper = mountBuilder()
    await flushPromises()

    await submit(wrapper)
    buildPackage.mockClear()

    // Submitting again must not reuse the key of the build that is still in flight.
    await submit(wrapper)
    expect(buildPackage).not.toHaveBeenCalled()

    finishBuild({ outputPath: '/output/theme.ocpack' })
    await flushPromises()
    expect(buildTaskKeys()).not.toContain('resource-package-build')
  })

  it('restores a remembered selection instead of selecting everything', async () => {
    appState.value.projects.workspaces = {
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
          otherPaths: ['images/nested/banner.svg'],
          imagePaths: [],
        },
      },
    }
    const wrapper = mountBuilder()
    await flushPromises()

    await submit(wrapper)

    expect(buildPackage).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Theme',
      title: 'Theme Pack',
      version: '2.1.0',
      fontSelection: { familyKeys: ['cjk'], compositionKeys: [] },
      iconSelection: { seriesKeys: [] },
      otherSelection: { paths: ['images/nested/banner.svg'] },
    }))
  })

  it('remembers the build inputs for the project on submit', async () => {
    const wrapper = mountBuilder()
    await flushPromises()
    await toggle(wrapper, 'font-family:latin', 'deselect')
    await toggle(wrapper, 'font-composition:body', 'deselect')
    await toggle(wrapper, 'icon-series:status', 'deselect')

    await submit(wrapper)

    expect(updateProjects).toHaveBeenCalledTimes(1)
    expect(appState.value.projects.workspaces['/project']?.packageBuilder).toEqual({
      name: 'Project',
      author: 'publisher-test',
      version: '1.0.0',
      title: 'Project',
      fontFamilyKeys: ['cjk'],
      fontCompositionKeys: [],
      iconSeriesKeys: [],
      customBlockKeys: [],
      imagePaths: [],
      otherPaths: ['images/card.png', 'images/nested/banner.svg', 'images/notes.txt'],
    })
  })
})
