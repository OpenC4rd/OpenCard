import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import ProjectCoverField from './ProjectCoverField.vue'

const mocks = vi.hoisted(() => ({
  pickFile: vi.fn(),
  fileExists: vi.fn(),
  copyFile: vi.fn(),
  writeFile: vi.fn(),
  notifyError: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }),
}))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }))
vi.mock('../../features/notifications/titlebarNotices', () => ({ notifyError: mocks.notifyError }))
vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    pickFile: mocks.pickFile,
    fileExists: mocks.fileExists,
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

  it('picks an image inside the project through the banner', async () => {
    const wrapper = mountField('')
    mocks.pickFile.mockResolvedValue('D:/Project/assets/cover.png')

    await wrapper.get('.project-cover-field__banner').trigger('click')
    await flushPromises()

    expect(mocks.pickFile).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'D:/Project',
      extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg'],
    }))
    expect(wrapper.emitted('update:modelValue')).toEqual([['assets/cover.png']])
    expect(mocks.notifyError).not.toHaveBeenCalled()
  })

  it('refuses a pick outside the project without copying files', async () => {
    const wrapper = mountField('assets/cover.png')
    mocks.pickFile.mockResolvedValue('D:/Downloads/cover.png')

    await wrapper.get('.project-cover-field__banner').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(mocks.notifyError).toHaveBeenCalledWith('projectConfig.cover.outsideProject')
    expect(mocks.copyFile).not.toHaveBeenCalled()
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
