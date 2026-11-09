import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import ProjectCoverField from './ProjectCoverField.vue'

const mocks = vi.hoisted(() => ({
  openDirectorySelector: vi.fn(),
  pickFiles: vi.fn(),
  fileExists: vi.fn(),
  getFileInfo: vi.fn(),
  copyFile: vi.fn(),
  writeFile: vi.fn(),
  notifyError: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }),
}))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }))
vi.mock('../../shared/ui/directorySelectorService', () => ({ openDirectorySelector: mocks.openDirectorySelector }))
vi.mock('../../features/notifications/titlebarNotices', () => ({ notifyError: mocks.notifyError }))
vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    pickFiles: mocks.pickFiles,
    fileExists: mocks.fileExists,
    getFileInfo: mocks.getFileInfo,
    toAssetSrc: (path: string) => `asset://${path}`,
    copyFile: mocks.copyFile,
    writeFile: mocks.writeFile,
  },
}))
vi.mock('../../features/workspace/store/projectStore', () => ({
  useProjectStore: () => ({ fileChangeRevision: ref(0) }),
}))

function mountField(modelValue = '') {
  return mount(ProjectCoverField, {
    props: { modelValue, projectRootPath: 'D:/Project' },
  })
}

describe('ProjectCoverField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fileExists.mockResolvedValue(false)
  })

  it('previews an existing cover through the project asset URL', async () => {
    mocks.fileExists.mockResolvedValue(true)
    const wrapper = mountField('assets/cover.png')
    await flushPromises()

    expect(wrapper.get('img').attributes('src')).toBe('asset://D:/Project/assets/cover.png')
    expect(wrapper.text()).not.toContain('projectConfig.cover.missing')
  })

  it('explains an unusable cover as state instead of failing the field', async () => {
    const missing = mountField('assets/cover.png')
    await flushPromises()
    expect(missing.text()).toContain('projectConfig.cover.missing')
    expect(mocks.notifyError).not.toHaveBeenCalled()

    const unsupported = mountField('assets/cover.txt')
    await flushPromises()
    expect(unsupported.text()).toContain('projectConfig.cover.unsupported')
    expect(unsupported.find('img').exists()).toBe(false)
    expect(mocks.notifyError).not.toHaveBeenCalled()
  })

  it('picks an image through the directory selector scoped to the project', async () => {
    const wrapper = mountField('')
    mocks.openDirectorySelector.mockResolvedValue(['assets/cover.png'])

    await wrapper.get('.project-cover-field__banner').trigger('click')
    await flushPromises()

    const options = mocks.openDirectorySelector.mock.calls[0]![0]
    expect(options.filter).toEqual({ target: 'file', pattern: '*.{png,jpg,jpeg,webp,avif,gif,svg}' })
    expect(options.resolveThumbnailSrc('assets/cover.png')).toBe('asset://D:/Project/assets/cover.png')
    expect(wrapper.emitted('update:modelValue')).toEqual([['assets/cover.png']])
    expect(mocks.notifyError).not.toHaveBeenCalled()
  })

  it('keeps the cover when the selector is cancelled', async () => {
    const wrapper = mountField('assets/cover.png')
    mocks.openDirectorySelector.mockResolvedValue(null)

    await wrapper.get('.project-cover-field__banner').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('copies images from the computer into the browsed folder instead of refusing them', async () => {
    const wrapper = mountField('')
    mocks.openDirectorySelector.mockResolvedValue(null)
    mocks.pickFiles.mockResolvedValue(['D:/Downloads/cover.png'])
    mocks.getFileInfo.mockResolvedValue({ isDirectory: false })

    await wrapper.get('.project-cover-field__banner').trigger('click')
    await flushPromises()
    const added = await mocks.openDirectorySelector.mock.calls[0]![0].importInto('assets')

    expect(added).toBe(true)
    expect(mocks.copyFile).toHaveBeenCalledWith('D:/Downloads/cover.png', 'D:/Project/assets/cover.png')
  })

  it('clears the reference on remove without deleting any file', async () => {
    const wrapper = mountField('assets/cover.png')

    const remove = wrapper.findAll('button').find(button => button.attributes('aria-label') === 'projectConfig.cover.remove')
    await remove!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(mocks.copyFile).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
})
