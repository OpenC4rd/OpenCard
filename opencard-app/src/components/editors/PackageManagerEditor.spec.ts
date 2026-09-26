import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PackageManagerEditor from './PackageManagerEditor.vue'
import OcActionButton from '../standard/OcActionButton.vue'

const store = vi.hoisted(() => ({
  packages: new Map<string, unknown>(),
  files: [] as Array<{ archivePath: string; fingerprint: string }>,
  unreadable: [] as unknown[],
  revealEntryInFileManager: vi.fn(async () => undefined),
}))

vi.mock('../../features/workspace/store/projectStore', () => ({
  useProjectStore: () => ({
    projectResourcePackages: { value: store.packages },
    projectResourcePackageFiles: { value: store.files },
    unreadableProjectResourcePackages: { value: store.unreadable },
    revealEntryInFileManager: store.revealEntryInFileManager,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function packageEntry(options: {
  author: string
  name: string
  version: string
  cover: { src: string } | null
}) {
  return {
    coordinate: { author: options.author, name: options.name, version: options.version },
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
    store.files = []
    store.unreadable = []
    store.revealEntryInFileManager.mockClear()
  })

  it('gives every installed package a card titled with its file name and the coordinate it claims', async () => {
    const themePath = 'D:/project/.opencard/packages/theme.ocpack'
    const toolsPath = 'D:/project/.opencard/packages/tools.ocpack'
    store.packages.set('fp-theme', packageEntry({
      author: 'alice',
      name: 'theme',
      version: '1.0.0',
      cover: { src: 'asset://cover.png' },
    }))
    store.packages.set('fp-tools', packageEntry({
      author: 'bob',
      name: 'tools',
      version: '2.0.0',
      cover: null,
    }))
    store.files = [
      { archivePath: themePath, fingerprint: 'fp-theme' },
      { archivePath: toolsPath, fingerprint: 'fp-tools' },
    ]

    const wrapper = mountEditor()
    await flushPromises()

    // 卡片就是侧栏那一行：标题是文件真正的名字，小字是包自述的坐标。
    expect(wrapper.findAll('.oc-album__label').map(node => node.text()))
      .toEqual(['theme.ocpack', 'tools.ocpack'])
    const cards = wrapper.findAll('.oc-album__node')
    expect(cards[0]?.attributes('data-oc-album-key')).toBe('D:/project/.opencard/packages/theme.ocpack')
    expect(cards[0]?.text()).toContain('alice/theme@1.0.0')
    expect(cards[1]?.text()).toContain('bob/tools@2.0.0')
    // 封面是解开之后的资源：解开的画出来，没解开的那张卡片媒体区是空的。
    expect(cards[0]?.find('img').attributes('src')).toBe('asset://cover.png')
    expect(cards[1]?.find('img').exists()).toBe(false)
    // 每张卡片都有"在文件管理器显示"和"移除包"（图标按钮，标题在属性上）。
    expect(wrapper.html()).toContain('packageManager.reveal')
    expect(wrapper.html()).toContain('packageManager.remove')
  })

  it('asks the shell to trash the archive only after the removal is confirmed', async () => {
    const themePath = 'D:/project/.opencard/packages/theme.ocpack'
    store.packages.set('fp-theme', packageEntry({ author: 'alice', name: 'theme', version: '1.0.0', cover: null }))
    store.files = [{ archivePath: themePath, fingerprint: 'fp-theme' }]

    const wrapper = mountEditor()
    await flushPromises()

    // 删除是不逆的动作，编辑器自己不删文件，只把"删这个"交给壳层。
    const removeButton = wrapper.findAllComponents(OcActionButton)
      .find(button => (button.props('action') as { key: string }).key === 'package-manager.remove')
    expect(removeButton?.props('action')).toMatchObject({ children: [{ key: 'package-manager.confirm-remove' }] })

    removeButton!.vm.$emit('select', { key: 'package-manager.reveal' })
    expect(wrapper.emitted('trash-file')).toBeUndefined()

    removeButton!.vm.$emit('select', { key: 'package-manager.confirm-remove' })
    expect(wrapper.emitted('trash-file')).toEqual([[themePath]])
  })

  it('lists one card per archive file and opens that archive when a card is clicked', async () => {
    const themePath = 'D:/project/.opencard/packages/theme.ocpack'
    const copyPath = 'D:/project/.opencard/packages/theme-copy.ocpack'
    store.packages.set('fp-theme', packageEntry({
      author: 'alice',
      name: 'theme',
      version: '1.0.0',
      cover: null,
    }))
    // 同一份内容又放了一个文件名：文件夹里有它，相册里就有它。
    store.files = [
      { archivePath: themePath, fingerprint: 'fp-theme' },
      { archivePath: copyPath, fingerprint: 'fp-theme' },
    ]

    const wrapper = mountEditor()
    await flushPromises()

    const cards = wrapper.findAll('.oc-album__node')
    // 按文件名排序，两张卡各自带着自己那个文件名。
    expect(cards.map(card => card.attributes('data-oc-album-key'))).toEqual([copyPath, themePath])
    expect(wrapper.findAll('.oc-album__label').map(node => node.text()))
      .toEqual(['theme-copy.ocpack', 'theme.ocpack'])
    // 名字不同、内容相同：坐标是一样的。
    expect(cards[0]?.text()).toContain('alice/theme@1.0.0')
    expect(cards[1]?.text()).toContain('alice/theme@1.0.0')

    await cards[1]!.get('.oc-album__card').trigger('click')
    expect(wrapper.emitted('open-file')).toEqual([[themePath]])
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
