import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UnsupportedFileEditor from './UnsupportedFileEditor.vue'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  openWithDefaultApp: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: mocks,
}))

vi.mock('./MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: {
      modelValue: String,
      language: String,
      readOnly: Boolean,
    },
    template: '<div class="monaco-stub" />',
  },
}))

describe('UnsupportedFileEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readFile.mockResolvedValue('readonly content')
    mocks.openWithDefaultApp.mockResolvedValue(undefined)
  })

  it('reads workspace content only after the user chooses readonly text', async () => {
    const wrapper = mount(UnsupportedFileEditor, {
      props: { session: createTestSession({ path: 'assets/reference.bin', name: 'reference.bin' }), resourceRootPath: 'D:/project' },
    })

    expect(mocks.readFile).not.toHaveBeenCalled()

    await wrapper.findAll('button')[0]!.trigger('click')

    expect(mocks.readFile).toHaveBeenCalledWith('D:/project/assets/reference.bin')
    expect(wrapper.getComponent({ name: 'MonacoEditor' }).props()).toMatchObject({
      modelValue: 'readonly content',
      language: 'plaintext',
      readOnly: true,
    })
  })

  it('hands a system open to the OS without reading the file', async () => {
    const wrapper = mount(UnsupportedFileEditor, {
      props: { session: createTestSession({ path: 'D:/outside/reference.bin', name: 'reference.bin' }) },
    })

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(mocks.openWithDefaultApp).toHaveBeenCalledWith('D:/outside/reference.bin')
    expect(mocks.readFile).not.toHaveBeenCalled()
  })
})
