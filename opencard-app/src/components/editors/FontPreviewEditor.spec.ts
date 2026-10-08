import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FontPreviewEditor from './FontPreviewEditor.vue'

const fontSet = {
  add: vi.fn(),
  delete: vi.fn(),
}
const mocks = vi.hoisted(() => ({
  readBinaryFile: vi.fn(),
  pickSavePath: vi.fn(),
  writeBinaryFile: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  repairTrueTypeFont: vi.fn(),
  rejectLoad: false,
}))

class FontFaceMock {
  constructor(
    readonly family: string,
    readonly source: string,
  ) {}

  async load(): Promise<this> {
    if (mocks.rejectLoad) throw new DOMException('A network error occurred.', 'NetworkError')
    return this
  }
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    readBinaryFile: mocks.readBinaryFile,
    pickSavePath: mocks.pickSavePath,
    writeBinaryFile: mocks.writeBinaryFile,
  },
}))
vi.mock('../../features/workspace/services/trueTypeFontRepair', () => ({
  repairTrueTypeFont: mocks.repairTrueTypeFont,
}))

describe('FontPreviewEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('FontFace', FontFaceMock)
    Object.defineProperty(document, 'fonts', { configurable: true, value: fontSet })
    vi.stubGlobal('URL', {
      createObjectURL: mocks.createObjectURL,
      revokeObjectURL: mocks.revokeObjectURL,
    })
    vi.clearAllMocks()
    mocks.rejectLoad = false
    mocks.readBinaryFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
    mocks.repairTrueTypeFont.mockResolvedValue(new Uint8Array([4, 5, 6]))
    mocks.createObjectURL.mockReturnValue('blob:font-preview')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the font for the session and removes it when the preview closes', async () => {
    const wrapper = mount(FontPreviewEditor, {
      props: { session: createTestSession({ path: 'assets/Brand.otf', name: 'Brand.otf' }), resourceRootPath: 'D:/project' },
    })
    await flushPromises()

    expect(mocks.readBinaryFile).toHaveBeenCalledWith('D:/project/assets/Brand.otf')
    expect((mocks.createObjectURL.mock.calls[0]![0] as Blob).type).toBe('font/otf')
    expect(fontSet.add).toHaveBeenCalledWith(expect.objectContaining({
      source: 'url("blob:font-preview")',
    }))
    const input = wrapper.get('textarea')
    expect(input.attributes('style')).toContain('OpenCardFontPreview-')
    expect((input.element as HTMLTextAreaElement).value).toBe('fontPreview.sample')
    expect(wrapper.find('.font-preview-editor__reference').exists()).toBe(false)
    await input.setValue('自定义试字 OpenCard')
    expect((input.element as HTMLTextAreaElement).value).toBe('自定义试字 OpenCard')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.props('session').state.isDirty).toBe(false)

    const loadedFace = fontSet.add.mock.calls[0]![0]
    wrapper.unmount()
    expect(fontSet.delete).toHaveBeenCalledWith(loadedFace)
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:font-preview')
  })

  it('offers repair after loading fails and translates a rejected repaired font', async () => {
    mocks.rejectLoad = true
    const wrapper = mount(FontPreviewEditor, {
      props: { session: createTestSession({ path: 'D:/fonts/Broken.ttf', name: 'Broken.ttf' }),  },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('fontPreview.attemptRepair')
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(mocks.repairTrueTypeFont).toHaveBeenCalled()
    expect(wrapper.text()).toContain('fontPreview.repairFailed')
    expect(mocks.pickSavePath).not.toHaveBeenCalled()
  })
})
