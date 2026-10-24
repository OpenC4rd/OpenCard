import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RESOURCE_PACKAGE_TYPE, type ResourcePackageManifest } from '../../features/workspace/model/resourcePackage'
import PackageManifestEditor from './PackageManifestEditor.vue'

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
vi.mock('../../features/workspace/services/resourcePackageArchive', () => ({
  readResourcePackageArchive: archives.readResourcePackageArchive,
  readResourcePackageCover: archives.readResourcePackageCover,
}))

function mountEditor() {
  const wrapper = mount(PackageManifestEditor, { props: { session: createTestSession({ path: ARCHIVE_PATH }) } })
  return flushPromises().then(() => wrapper)
}

beforeEach(() => {
  archives.readResourcePackageArchive.mockReset()
  archives.readResourcePackageCover.mockReset()
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
  it('titles the file with its name and captions it with the coordinate the package declares', async () => {
    const wrapper = await mountEditor()

    expect(wrapper.vm.presentation?.title).toBe('alice@theme@1.2.3.ocpack')
    expect(wrapper.vm.presentation?.description).toBe('alice/theme@1.2.3')
  })

  it('reads the cover from this archive with the type its extension declares', async () => {
    archives.readResourcePackageArchive.mockResolvedValue({
      coordinate: 'alice/theme@1.2.3',
      manifest: { ...manifest, cover: 'assets/cover.png' },
      fingerprint: 'fp-theme',
      rootPath: null,
      unpacked: false,
    })
    archives.readResourcePackageCover.mockResolvedValue('blob:theme-cover')
    await mountEditor()

    expect(archives.readResourcePackageCover).toHaveBeenCalledWith(ARCHIVE_PATH, 'image/png')

    // SVG 不是靠魔数认的：类型必须按封面文件自己的扩展名给。
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

  it('does not read a cover the manifest does not declare', async () => {
    await mountEditor()

    expect(archives.readResourcePackageArchive).toHaveBeenCalledWith(ARCHIVE_PATH)
    expect(archives.readResourcePackageCover).not.toHaveBeenCalled()
  })

  it('reports a file it cannot read', async () => {
    archives.readResourcePackageArchive.mockRejectedValue(new Error('Package archive is corrupt'))

    const wrapper = await mountEditor()

    expect(wrapper.text()).toContain('packageManifest.unavailable')
  })
})
