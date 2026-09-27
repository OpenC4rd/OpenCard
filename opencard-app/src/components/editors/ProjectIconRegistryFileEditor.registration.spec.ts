import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectIconRegistryFileEditor from './ProjectIconRegistryFileEditor.vue'
import ProjectIconRegistryWorkbench from './ProjectIconRegistryWorkbench.vue'
import ProjectIconRegistrationDialog from './ProjectIconRegistrationDialog.vue'
import { useShellProgressTasks } from '../../features/shell/composables/useShellProgressTasks'

const mocks = vi.hoisted(() => ({
  readBinaryFile: vi.fn(),
  writeBinaryFile: vi.fn(),
  fileExists: vi.fn(),
  createDirectory: vi.fn(),
  readDirectory: vi.fn(),
  readProjectIconPack: vi.fn(),
  inspectProjectIconFile: vi.fn(),
  recordContent: vi.fn(),
}))

const notificationMocks = vi.hoisted(() => ({ notifyAppError: vi.fn(), notifySuccess: vi.fn() }))
const TASK_KEY = 'project-icon-pack'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('./MonacoEditor.vue', () => ({ default: { template: '<div class="monaco-stub" />' } }))
vi.mock('../../features/notifications/titlebarNotices', () => notificationMocks)
vi.mock('../../features/editor-runtime/history/editorHistoryManager', () => ({
  editorHistoryManager: { recordContent: mocks.recordContent },
}))
vi.mock('../../features/workspace/services/projectIconCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/workspace/services/projectIconCatalog')>()
  return { ...actual, buildProjectIconCatalog: vi.fn(() => ({ series: [], entries: [] })) }
})
vi.mock('../../features/workspace/services/projectIconFileFacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/workspace/services/projectIconFileFacts')>()
  return { ...actual, inspectProjectIconFile: mocks.inspectProjectIconFile }
})
vi.mock('../../features/workspace/services/projectIconPack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/workspace/services/projectIconPack')>()
  return { ...actual, readProjectIconPack: mocks.readProjectIconPack }
})
vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    readBinaryFile: mocks.readBinaryFile,
    writeBinaryFile: mocks.writeBinaryFile,
    fileExists: mocks.fileExists,
    createDirectory: mocks.createDirectory,
    readDirectory: mocks.readDirectory,
  },
}))
vi.mock('../../features/workspace/store/projectStore', () => ({
  useProjectStore: () => ({
    projectPath: { value: 'D:/Demo' },
    projectIconCatalog: { value: { series: [], entries: [] } },
    resolveResourceAssetSrcFromFile: (_file: string, source: string) => `asset://${source}`,
    resolveResourcePathFromFile: (file: string, source: string) => `${file}/../${source}`,
    resolveProjectInternalPath: (relative: string) => `D:/Demo/.opencard/${relative}`,
  }),
}))

const progress = useShellProgressTasks()

function mountEditor() {
  return mount(ProjectIconRegistryFileEditor, {
    props: { filePath: 'D:/Demo/.opencard/icons/icons.json', modelValue: '{}' },
  })
}

function lastRegistry(wrapper: ReturnType<typeof mountEditor>) {
  const updates = wrapper.emitted('update:modelValue') ?? []
  return JSON.parse(updates[updates.length - 1]?.[0] as string)
}

describe('ProjectIconRegistryFileEditor icon registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    progress.removeTask(TASK_KEY)
    mocks.fileExists.mockResolvedValue(false)
    mocks.readDirectory.mockResolvedValue([])
    mocks.readBinaryFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    mocks.inspectProjectIconFile.mockImplementation(async (source: string) => (
      /\.png$/i.test(source) ? { tint: 'original', pixelated: true } : { tint: 'theme' }
    ))
  })

  it('avoids a leftover folder instead of mixing two sets in one directory', async () => {
    // A folder from an earlier set that was removed without cleanup: the Key is free in the registry,
    // but `icons/outline` still holds files, so the new set must not be written in among them.
    const existing = new Set(['D:/Demo/.opencard/icons/outline'])
    mocks.fileExists.mockImplementation(async (path: string) => existing.has(path))
    mocks.readDirectory.mockResolvedValue([{ name: 'old.svg', isFile: true, isDirectory: false }])
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons', key: 'outline',
      icons: [{ sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' }],
    })
    await flushPromises()

    // The folder name moves aside, and the file keeps its exact Key-derived name.
    expect(mocks.writeBinaryFile.mock.calls.map(call => call[0]))
      .toEqual(['D:/Demo/.opencard/icons/outline-2/warn.svg'])
    expect(lastRegistry(wrapper).iconSeries[0].icons[0].source)
      .toBe('.opencard/icons/outline-2/warn.svg')
  })

  it('reuses an empty leftover folder so removing and re-creating a set keeps its folder', async () => {
    // Removing a set moves its files out but leaves the folder. Re-creating it must land in the same
    // folder, or the name would drift to `outline-2`, then `outline-3`, on every removal.
    const existing = new Set(['D:/Demo/.opencard/icons/outline'])
    mocks.fileExists.mockImplementation(async (path: string) => existing.has(path))
    mocks.readDirectory.mockResolvedValue([])
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons', key: 'outline',
      icons: [{ sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' }],
    })
    await flushPromises()

    expect(mocks.writeBinaryFile.mock.calls.map(call => call[0]))
      .toEqual(['D:/Demo/.opencard/icons/outline/warn.svg'])
  })

  it('stores every imported icon under its Key and derives each file its own tint', async () => {
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons',
      key: 'outline',
      icons: [
        { sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' },
        { sourcePath: 'D:/Icons/Coin.PNG', iconKey: 'coin', name: 'Coin' },
      ],
    })
    await flushPromises()

    expect(mocks.readBinaryFile.mock.calls.map(call => call[0]))
      .toEqual(['D:/Icons/Warn.svg', 'D:/Icons/Coin.PNG'])
    // The Key names the file, and the original extension is preserved.
    expect(mocks.writeBinaryFile.mock.calls.map(call => call[0])).toEqual([
      'D:/Demo/.opencard/icons/outline/warn.svg',
      'D:/Demo/.opencard/icons/outline/coin.png',
    ])
    expect(lastRegistry(wrapper)).toEqual({
      iconSeries: [{
        name: 'Outline icons',
        key: 'outline',
        icons: [
          { iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'theme' },
          { iconKey: 'coin', name: 'Coin', source: '.opencard/icons/outline/coin.png', tint: 'original', pixelated: true },
        ],
      }],
    })
  })

  it('prepares every icon before copying any of them', async () => {
    // Reading and probing is the slow half of an import, so it runs ahead of the copy instead of
    // being interleaved with it one file at a time. Observable order: all reads, then all writes.
    const order: string[] = []
    mocks.readBinaryFile.mockImplementation(async (path: string) => {
      order.push(`read:${path}`)
      return new Uint8Array([1, 2, 3])
    })
    mocks.inspectProjectIconFile.mockImplementation(async (source: string) => {
      order.push(`probe:${source}`)
      return { tint: 'theme' }
    })
    mocks.writeBinaryFile.mockImplementation(async (path: string) => {
      order.push(`write:${path}`)
    })
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons',
      key: 'outline',
      icons: [
        { sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' },
        { sourcePath: 'D:/Icons/Coin.svg', iconKey: 'coin', name: 'Coin' },
        { sourcePath: 'D:/Icons/Gem.svg', iconKey: 'gem', name: 'Gem' },
      ],
    })
    await flushPromises()

    const firstWrite = order.findIndex(step => step.startsWith('write:'))
    expect(firstWrite).toBeGreaterThan(-1)
    expect(order.slice(0, firstWrite).every(step => !step.startsWith('write:'))).toBe(true)
    expect(order.filter(step => step.startsWith('read:'))).toHaveLength(3)
    // The copy still happens in the order the icons were picked.
    expect(order.slice(firstWrite)).toEqual([
      'write:D:/Demo/.opencard/icons/outline/warn.svg',
      'write:D:/Demo/.opencard/icons/outline/coin.svg',
      'write:D:/Demo/.opencard/icons/outline/gem.svg',
    ])
  })

  it('writes nothing at all when one icon cannot be prepared', async () => {
    // Preparing first is what keeps a failed import from leaving copied files behind with no
    // registry entry to reach them.
    mocks.readBinaryFile.mockImplementation(async (path: string) => {
      if (path === 'D:/Icons/Coin.svg') throw new Error('read failed')
      return new Uint8Array([1])
    })
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons',
      key: 'outline',
      icons: [
        { sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' },
        { sourcePath: 'D:/Icons/Coin.svg', iconKey: 'coin', name: 'Coin' },
      ],
    })
    await flushPromises()

    expect(mocks.writeBinaryFile).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(notificationMocks.notifyAppError).toHaveBeenCalledWith('OC-E3011', expect.any(Error))
  })

  it('runs the copy on the global progress bar and notifies when it finishes', async () => {
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons', key: 'outline',
      icons: [{ sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' }],
    })
    // The dialog closes immediately so the popup never blocks on the copy.
    expect(wrapper.getComponent(ProjectIconRegistrationDialog).props('open')).toBe(false)
    await flushPromises()

    expect(notificationMocks.notifySuccess).toHaveBeenCalledWith('projectConfig.icons.setCreated')
    expect(notificationMocks.notifyAppError).not.toHaveBeenCalled()
    // The task is released once it settles.
    expect(progress.tasks.value.some(task => task.key === TASK_KEY)).toBe(false)
  })

  it('reports a failed copy as an instant message and leaves the registry unchanged', async () => {
    mocks.readBinaryFile.mockRejectedValue(new Error('read failed'))
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons', key: 'outline',
      icons: [{ sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' }],
    })
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(notificationMocks.notifyAppError).toHaveBeenCalledWith('OC-E3011', expect.any(Error))
    expect(notificationMocks.notifySuccess).not.toHaveBeenCalled()
    expect(progress.tasks.value.some(task => task.key === TASK_KEY)).toBe(false)
  })

  it('refuses a second pack command while one is running', async () => {
    let release: () => void = () => undefined
    mocks.readBinaryFile.mockImplementation(() => new Promise(resolve => {
      release = () => resolve(new Uint8Array([1]))
    }))
    const wrapper = mountEditor()

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'First', key: 'first',
      icons: [{ sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' }],
    })
    await flushPromises()

    // Related commands are disabled for the duration of the task.
    const actions = wrapper.vm.workspaceActions as { disabled?: boolean }[]
    expect(actions.every(action => action.disabled)).toBe(true)
    expect(progress.tasks.value.some(task => task.key === TASK_KEY)).toBe(true)

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Second', key: 'second',
      icons: [{ sourcePath: 'D:/Icons/Logo.svg', iconKey: 'logo', name: 'Logo' }],
    })
    await flushPromises()
    expect(mocks.readBinaryFile).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
    expect(progress.tasks.value.some(task => task.key === TASK_KEY)).toBe(false)
  })

  it('adds new icons to the folder the set already owns instead of opening a second one', async () => {
    // The set's Key and its folder name need not agree: it may have been renamed, or its folder may
    // carry a suffix from an earlier set. Adding must follow the files, not rebuild the folder name.
    const wrapper = mount(ProjectIconRegistryFileEditor, {
      props: {
        filePath: 'D:/Demo/.opencard/icons/icons.json',
        modelValue: JSON.stringify({
          iconSeries: [{
            name: 'Outline', key: 'outline',
            icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline-2/warn.svg', tint: 'theme' }],
          }],
        }),
      },
    })

    wrapper.getComponent(ProjectIconRegistryWorkbench).vm.$emit('add-icons', 'outline')
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent(ProjectIconRegistrationDialog).props('targetSeries'))
      .toMatchObject({ key: 'outline' })

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline', key: 'outline',
      icons: [{ sourcePath: 'D:/Icons/Gem.svg', iconKey: 'gem', name: 'Gem' }],
    })
    await flushPromises()

    expect(mocks.writeBinaryFile.mock.calls.map(call => call[0]))
      .toEqual(['D:/Demo/.opencard/icons/outline-2/gem.svg'])
    expect(lastRegistry(wrapper).iconSeries[0].icons.map((icon: { iconKey: string }) => icon.iconKey))
      .toEqual(['warn', 'gem'])
    expect(notificationMocks.notifySuccess).toHaveBeenCalledWith('projectConfig.icons.iconsAdded')
  })

  it('unpacks an imported icon pack into a folder named after the set', async () => {
    mocks.readProjectIconPack.mockResolvedValue({
      manifest: {
        name: 'Outline', key: 'outline',
        icons: [
          { iconKey: 'warn', name: 'Warn', source: 'icons/warn.svg', tint: 'theme' },
          { iconKey: 'coin', name: 'Coin', source: 'icons/coin.png', tint: 'original' },
        ],
      },
      iconSources: new Map([
        ['icons/warn.svg', new Uint8Array([1])],
        ['icons/coin.png', new Uint8Array([2])],
      ]),
    })
    const wrapper = mountEditor()

    await (wrapper.vm as unknown as {
      importIconPack(request: { packPath: string; name: string; key: string }): Promise<void>
    }).importIconPack({ packPath: 'D:/Packs/outline.ociconpack', name: 'Outline', key: 'outline' })
    await flushPromises()

    expect(mocks.writeBinaryFile.mock.calls.map(call => call[0])).toEqual([
      'D:/Demo/.opencard/icons/outline/warn.svg',
      'D:/Demo/.opencard/icons/outline/coin.png',
    ])
    // A pack already declares each icon's tint, so no file inspection is needed.
    expect(mocks.inspectProjectIconFile).not.toHaveBeenCalled()
    expect(lastRegistry(wrapper)).toEqual({
      iconSeries: [{
        name: 'Outline',
        key: 'outline',
        icons: [
          { iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'theme' },
          { iconKey: 'coin', name: 'Coin', source: '.opencard/icons/outline/coin.png', tint: 'original' },
        ],
      }],
    })
    expect(notificationMocks.notifySuccess).toHaveBeenCalledWith('projectConfig.icons.packImported')
  })

  it('reports an unreadable pack as an instant message', async () => {
    mocks.readProjectIconPack.mockRejectedValue(new Error('bad archive'))
    const wrapper = mountEditor()

    await (wrapper.vm as unknown as {
      importIconPack(request: { packPath: string; name: string; key: string }): Promise<void>
    }).importIconPack({ packPath: 'D:/Packs/broken.ociconpack', name: 'Broken', key: 'broken' })
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(notificationMocks.notifyAppError).toHaveBeenCalledWith('OC-E3013', expect.any(Error))
  })

  it('still delivers the new set when the editor is rebuilt mid-copy', async () => {
    // The shell rebuilds this editor whenever the active file changes, and a vnode listener is not
    // invoked once the emitting component unmounts. The result must therefore reach the session by id,
    // or the files would land on disk with no registry entry and the set would vanish.
    let release: () => void = () => undefined
    mocks.readBinaryFile.mockImplementation(() => new Promise(resolve => {
      release = () => resolve(new Uint8Array([1]))
    }))
    const wrapper = mount(ProjectIconRegistryFileEditor, {
      props: {
        filePath: 'D:/Demo/.opencard/icons/icons.json', modelValue: '{}', sessionId: 'session-1',
      },
    })

    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons', key: 'outline',
      icons: [{ sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' }],
    })
    await flushPromises()
    // Simulate the user switching to another file while the copy runs.
    wrapper.unmount()
    release()
    await flushPromises()

    expect(mocks.recordContent).toHaveBeenCalledWith(
      'session-1',
      expect.any(String),
      undefined,
    )
    const [sessionId, content] = mocks.recordContent.mock.calls[0]!
    expect(sessionId).toBe('session-1')
    expect(JSON.parse(content as string).iconSeries).toEqual([{
      name: 'Outline icons', key: 'outline',
      icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'theme' }],
    }])
  })

  it('delivers through the owning editor while it is still mounted', async () => {
    const wrapper = mountEditor()
    wrapper.getComponent(ProjectIconRegistrationDialog).vm.$emit('submit', {
      name: 'Outline icons', key: 'outline',
      icons: [{ sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' }],
    })
    await flushPromises()

    // A live editor goes through the host, which also drives auto-save for registry files.
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(mocks.recordContent).not.toHaveBeenCalled()
  })
})
