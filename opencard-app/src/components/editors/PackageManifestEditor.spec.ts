import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RESOURCE_PACKAGE_TYPE, type ResourcePackageManifest } from '../../features/workspace/model/resourcePackage'
import PackageManifestEditor from './PackageManifestEditor.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'

const manifest: ResourcePackageManifest = {
  type: RESOURCE_PACKAGE_TYPE,
  author: 'alice',
  name: 'theme',
  version: '1.2.3',
  title: 'Theme Package',
  public: {
    fonts: [{ key: 'body', title: 'Body' }],
    iconSeries: [{ key: 'actions', title: 'Actions', count: 4 }],
  },
}

const ARCHIVE_PATH = 'D:/project/.opencard/packages/alice@theme@1.2.3.ocpack'

const packages = vi.hoisted(() => (
  { value: new Map() } as { value: Map<string, unknown> }
))
const archives = vi.hoisted(() => ({ readResourcePackageArchive: vi.fn() }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (
      params?.count === undefined ? key : `${key}:${String(params.count)}`
    ),
  }),
}))
// 预览读的是它拿到的那个文件，不是项目的包表。
vi.mock('../../features/workspace/services/resourcePackageArchive', () => ({
  readResourcePackageArchive: archives.readResourcePackageArchive,
}))
vi.mock('../../features/workspace/store/projectStore', () => ({
  // 包表只用来顺手取一次封面。
  useProjectStore: () => ({ findProjectResourcePackage: (path: string) => packages.value.get(path) ?? null }),
}))

function mountEditor() {
  const wrapper = mount(PackageManifestEditor, { props: { filePath: ARCHIVE_PATH } })
  return flushPromises().then(() => wrapper)
}

beforeEach(() => {
  archives.readResourcePackageArchive.mockReset()
  archives.readResourcePackageArchive.mockResolvedValue({
    coordinate: 'alice/theme@1.2.3',
    manifest,
    fingerprint: 'fp-theme',
    rootPath: '/cache/packages/fp-theme',
    unpacked: true,
  })
  packages.value = new Map([[ARCHIVE_PATH, {
    coordinate: { author: 'alice', name: 'theme', version: '1.2.3' },
    manifest,
    fingerprint: 'fp-theme',
    cover: null,
  }]])
})

describe('PackageManifestEditor', () => {
  it('titles the file and captions it with the coordinate the package declares', async () => {
    const wrapper = await mountEditor()

    expect(wrapper.vm.presentation?.title).toBe('alice@theme@1.2.3.ocpack')
    expect(wrapper.vm.presentation?.description).toBe('alice/theme@1.2.3')
    expect(wrapper.vm.presentation?.icon).toBe('file.package')
    expect(wrapper.findComponent(ProjectRegistryEditorShell).exists()).toBe(true)
    expect(wrapper.text()).toContain('alice/theme@1.2.3')
    expect(wrapper.text()).toContain('Theme Package')
    expect(wrapper.text()).toContain('fp-theme')
  })

  it('lists the public fonts and icon series the package provides', async () => {
    const wrapper = await mountEditor()

    expect(wrapper.findAll('.package-manifest-editor h2').map(node => node.text())).toEqual([
      'packageManifest.information',
      'packageManifest.fonts',
      'packageManifest.iconSeries',
    ])
    expect(wrapper.findAll('.package-manifest-editor__resources > li').map(node => node.text())).toEqual([
      'Bodybody',
      'ActionsactionspackageManifest.iconCount:4',
    ])
  })

  it('explains an empty public resource list instead of rendering nothing', async () => {
    archives.readResourcePackageArchive.mockResolvedValue({
      coordinate: 'alice/theme@1.2.3',
      manifest: { ...manifest, public: { fonts: [], iconSeries: [] } },
      fingerprint: 'fp-theme',
      rootPath: '/cache/packages/fp-theme',
      unpacked: true,
    })

    const wrapper = await mountEditor()

    expect(wrapper.text()).toContain('packageManifest.noFonts')
    expect(wrapper.text()).toContain('packageManifest.noIconSeries')
    expect(wrapper.findAll('.package-manifest-editor__resources')).toHaveLength(0)
  })

  it('previews a file the project catalog does not know', async () => {
    // 同一份内容放了两个文件名、或者手工丢进来的那一份：包表里只留一条，另一条照样要看得见。
    packages.value = new Map()

    const wrapper = await mountEditor()

    expect(wrapper.text()).toContain('alice/theme@1.2.3')
    expect(wrapper.text()).toContain('fp-theme')
    expect(wrapper.find('.package-manifest-editor__cover').exists()).toBe(false)
  })

  it('reports a file it cannot read', async () => {
    archives.readResourcePackageArchive.mockRejectedValue(new Error('Package archive is corrupt'))

    const wrapper = await mountEditor()

    expect(wrapper.text()).toContain('packageManifest.unavailable')
  })

  it('shows a package cover only when the manifest declares a resolvable one', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('.package-manifest-editor__cover').exists()).toBe(false)

    packages.value = new Map([[ARCHIVE_PATH, {
      coordinate: { author: 'alice', name: 'theme', version: '1.2.3' },
      manifest,
      fingerprint: 'fp-theme',
      cover: {
        relativePath: 'assets/cover.png',
        absolutePath: '/project/assets/cover.png',
        src: 'asset:///project/assets/cover.png',
      },
    }]])
    const covered = await mountEditor()

    expect(covered.get('.package-manifest-editor__cover .oc-cover__visual').attributes('src'))
      .toBe('asset:///project/assets/cover.png')
    expect(covered.findAll('.package-manifest-editor h2').map(node => node.text())[0])
      .toBe('packageManifest.cover')
  })
})
