import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PackageManagerEditor from './PackageManagerEditor.vue'

const store = vi.hoisted(() => ({
  packages: new Map<string, unknown>(),
  unreadable: [] as unknown[],
  revealEntryInFileManager: vi.fn(async () => undefined),
}))

vi.mock('../../features/workspace/store/projectStore', () => ({
  useProjectStore: () => ({
    projectResourcePackages: { value: store.packages },
    unreadableProjectResourcePackages: { value: store.unreadable },
    revealEntryInFileManager: store.revealEntryInFileManager,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function packageEntry(options: {
  archivePath: string
  title: string
  author: string
  name: string
  version: string
  cover: { src: string } | null
  unpacked: boolean
}) {
  return {
    coordinate: { author: options.author, name: options.name, version: options.version },
    manifest: { title: options.title },
    archivePath: options.archivePath,
    rootPath: options.unpacked ? `/cache/${options.name}` : null,
    cover: options.cover,
  }
}

/** 不桩掉 OcAlbum：这一页要的正是它在卡片里画出来的那点东西。 */
function mountEditor() {
  return mount(PackageManagerEditor, {
    props: { filePath: 'D:/project/.opencard/packages', languageId: 'plaintext' },
    global: { stubs: { ProjectRegistryEditorShell: { template: '<div><slot /></div>' } } },
  })
}

describe('PackageManagerEditor', () => {
  beforeEach(() => {
    store.packages = new Map()
    store.unreadable = []
    store.revealEntryInFileManager.mockClear()
  })

  it('gives every installed package a card with its cover and its unpack state', async () => {
    store.packages.set('alice/theme@1.0.0', packageEntry({
      archivePath: 'D:/project/.opencard/packages/theme.ocpack',
      title: 'Theme Pack',
      author: 'alice',
      name: 'theme',
      version: '1.0.0',
      cover: { src: 'asset://cover.png' },
      unpacked: true,
    }))
    store.packages.set('bob/tools@2.0.0', packageEntry({
      archivePath: 'D:/project/.opencard/packages/tools.ocpack',
      title: 'Tools',
      author: 'bob',
      name: 'tools',
      version: '2.0.0',
      cover: null,
      unpacked: false,
    }))

    const wrapper = mountEditor()
    await flushPromises()

    // 卡片按显示名排序，标题是显示名，小字是坐标，状态是一条看得见的标记。
    expect(wrapper.findAll('.oc-album__title').map(node => node.text())).toEqual(['Theme Pack', 'Tools'])
    const cards = wrapper.findAll('.oc-album__node')
    expect(cards[0]?.attributes('data-oc-album-key')).toBe('D:/project/.opencard/packages/theme.ocpack')
    expect(cards[0]?.text()).toContain('alice/theme@1.0.0')
    expect(cards[0]?.text()).toContain('packageManager.unpacked')
    expect(cards[1]?.text()).toContain('packageManager.unpacking')
    // 封面是解开之后的资源：解开的画出来，没解开的那张卡片媒体区是空的。
    expect(cards[0]?.find('img').attributes('src')).toBe('asset://cover.png')
    expect(cards[1]?.find('img').exists()).toBe(false)
    // 每张卡片都有"在文件管理器显示"和"复制坐标"（图标按钮，标题在属性上）。
    expect(wrapper.html()).toContain('packageManager.reveal')
    expect(wrapper.html()).toContain('packageManager.copyCoordinate')
  })

  it('lists the archives it cannot read instead of hiding them', async () => {
    store.unreadable = [{ archivePath: 'D:/project/.opencard/packages/broken.ocpack', reason: 'Package fingerprint is missing' }]

    const wrapper = mountEditor()
    await flushPromises()

    expect(wrapper.text()).toContain('broken.ocpack')
    expect(wrapper.text()).toContain('Package fingerprint is missing')
    expect(wrapper.text()).toContain('packageManager.unreadable')
  })

  it('says so when the project has no packages at all', async () => {
    const wrapper = mountEditor()
    await flushPromises()

    expect(wrapper.text()).toContain('packageManager.empty')
    expect(wrapper.findAll('.oc-album__node')).toHaveLength(0)
  })
})
