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

const archives = vi.hoisted(() => ({
  readResourcePackageArchive: vi.fn(),
  readResourcePackageCover: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (
      params?.count === undefined ? key : `${key}:${String(params.count)}`
    ),
  }),
}))
// 预览读的是它拿到的那个文件：清单、指纹、封面都来自这个归档，不查项目的包表。
vi.mock('../../features/workspace/services/resourcePackageArchive', () => ({
  readResourcePackageArchive: archives.readResourcePackageArchive,
  readResourcePackageCover: archives.readResourcePackageCover,
}))

function mountEditor() {
  const wrapper = mount(PackageManifestEditor, { props: { filePath: ARCHIVE_PATH } })
  return flushPromises().then(() => wrapper)
}

beforeEach(() => {
  archives.readResourcePackageArchive.mockReset()
  archives.readResourcePackageCover.mockReset()
  // 默认没有封面：清单不说有，就不去读那一个条目。
  archives.readResourcePackageCover.mockResolvedValue('')
  archives.readResourcePackageArchive.mockResolvedValue({
    coordinate: 'alice/theme@1.2.3',
    manifest,
    fingerprint: 'fp-theme',
    rootPath: '/cache/snapshots/fp-theme',
    unpacked: true,
  })
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

    expect(wrapper.findAll('.package-manifest-editor .oc-bar__title').map(node => node.text())).toEqual([
      'packageManifest.information',
      'packageManifest.fonts',
      'packageManifest.iconSeries',
      'packageManifest.blocks',
    ])
    // 行用仓库统一的行控件：标签在左，值在尾部（字体是 key，图标集是计数 + key）。
    expect(wrapper.findAll('.package-manifest-editor .oc-row').map(node => node.text())).toEqual([
      'packageManifest.coordinatealice/theme@1.2.3',
      'packageManifest.nameTheme Package',
      'packageManifest.fingerprintfp-theme',
      'Bodybody',
      'ActionspackageManifest.iconCount:4actions',
    ])
  })
  it('explains an empty public resource list instead of rendering nothing', async () => {
    archives.readResourcePackageArchive.mockResolvedValue({
      coordinate: 'alice/theme@1.2.3',
      manifest: { ...manifest, public: { fonts: [], iconSeries: [] } },
      fingerprint: 'fp-theme',
      rootPath: '/cache/snapshots/fp-theme',
      unpacked: true,
    })

    const wrapper = await mountEditor()

    expect(wrapper.text()).toContain('packageManifest.noFonts')
    expect(wrapper.text()).toContain('packageManifest.noIconSeries')
    // 空的是资源列表本身：只剩包信息那三行。
    expect(wrapper.findAll('.package-manifest-editor .oc-row')).toHaveLength(3)
  })

  it('asks this file for its cover instead of the project catalog', async () => {
    archives.readResourcePackageArchive.mockResolvedValue({
      coordinate: 'alice/theme@1.2.3',
      manifest: { ...manifest, cover: 'assets/cover.png' },
      fingerprint: 'fp-theme',
      rootPath: null,
      unpacked: false,
    })
    archives.readResourcePackageCover.mockResolvedValue('blob:theme-cover')

    const wrapper = await mountEditor()

    // 连没解开也照读：封面来自这个归档里的那一个条目。
    expect(archives.readResourcePackageCover).toHaveBeenCalledWith(ARCHIVE_PATH, 'image/png')
    expect(wrapper.find('.package-manifest-editor__cover').exists()).toBe(true)

    // SVG 不是靠魔数认的：类型必须按封面文件自己的扩展名给，否则 <img> 不画。
    archives.readResourcePackageArchive.mockResolvedValue({
      coordinate: 'alice/theme@1.2.3',
      manifest: { ...manifest, cover: 'assets/cover.svg' },
      fingerprint: 'fp-theme',
      rootPath: null,
      unpacked: false,
    })
    archives.readResourcePackageCover.mockClear()
    await mountEditor()
    expect(archives.readResourcePackageCover).toHaveBeenCalledWith(ARCHIVE_PATH, 'image/svg+xml')
  })

  it('reports a file it cannot read', async () => {
    archives.readResourcePackageArchive.mockRejectedValue(new Error('Package archive is corrupt'))

    const wrapper = await mountEditor()

    expect(wrapper.text()).toContain('packageManifest.unavailable')
  })

  it('shows a cover only when the manifest declares one and its bytes can be read', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.find('.package-manifest-editor__cover').exists()).toBe(false)

    archives.readResourcePackageArchive.mockResolvedValue({
      coordinate: 'alice/theme@1.2.3',
      manifest: { ...manifest, cover: 'assets/cover.png' },
      fingerprint: 'fp-theme',
      rootPath: '/cache/snapshots/fp-theme',
      unpacked: true,
    })
    archives.readResourcePackageCover.mockResolvedValue('blob:theme-cover')
    const covered = await mountEditor()

    expect(covered.get('.package-manifest-editor__cover .oc-cover__visual').attributes('src'))
      .toBe('blob:theme-cover')
    expect(covered.findAll('.package-manifest-editor .oc-bar__title').map(node => node.text())[0])
      .toBe('packageManifest.cover')

    // 清单说了有封面、字节却读不出来：留空，不当成错误。
    archives.readResourcePackageCover.mockResolvedValue('')
    const broken = await mountEditor()
    expect(broken.find('.package-manifest-editor__cover').exists()).toBe(false)
  })
})
