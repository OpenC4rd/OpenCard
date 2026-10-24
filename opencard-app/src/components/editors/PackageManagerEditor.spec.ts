import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PackageManagerEditor from './PackageManagerEditor.vue'
import OcActionButton from '../standard/OcActionButton.vue'
import OcAlbum from '../standard/OcAlbum.vue'

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

function mountEditor() {
  return mount(PackageManagerEditor, {
    props: { session: createTestSession({ path: 'D:/project/.opencard/packages' }), languageId: 'plaintext' },
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

  it('asks the shell to trash the archive only after the removal is confirmed', async () => {
    const themePath = 'D:/project/.opencard/packages/theme.ocpack'
    store.packages.set('fp-theme', packageEntry({ author: 'alice', name: 'theme', version: '1.0.0', cover: null }))
    store.files = [{ archivePath: themePath, fingerprint: 'fp-theme' }]

    const wrapper = mountEditor()
    await flushPromises()

    // 删除是不可逆动作：编辑器自己不删文件，只把"删这个"交给壳层。
    const removeButton = wrapper.findAllComponents(OcActionButton)
      .find(button => (button.props('action') as { key: string }).key === 'package-manager.remove')!

    removeButton.vm.$emit('select', { key: 'package-manager.reveal' })
    expect(wrapper.emitted('trash-file')).toBeUndefined()

    removeButton.vm.$emit('select', { key: 'package-manager.confirm-remove' })
    expect(wrapper.emitted('trash-file')).toEqual([[themePath]])
  })

  it('lists one card per archive file and opens that archive when a card is activated', async () => {
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

    const album = wrapper.getComponent(OcAlbum)
    expect(album.props('data').rootKeys).toEqual([copyPath, themePath])

    album.vm.$emit('node-activate', { key: themePath })

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
})
