import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import enUS from '../../locales/en-US'
import FontDiffView from './FontDiffView.vue'

const { readBinaryFile } = vi.hoisted(() => ({
  readBinaryFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: { readBinaryFile },
}))

class FontFaceMock {
  constructor(
    readonly family: string,
    readonly source: string,
  ) {}

  async load(): Promise<this> {
    return this
  }
}

describe('FontDiffView', () => {
  beforeEach(() => {
    readBinaryFile.mockClear()
    vi.stubGlobal('FontFace', FontFaceMock)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:font'),
      revokeObjectURL: vi.fn(),
    })
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: vi.fn(), delete: vi.fn() },
    })
  })

  it('reads each revision from its own snapshot root at the project-relative path', async () => {
    const wrapper = mount(FontDiffView, {
      props: {
        filePath: 'D:/project/.opencard/fonts/Brand.woff2',
        projectRootPath: 'D:/project',
        comparison: {
          before: {
            revisionId: 'abc',
            label: 'Previous version',
            content: '',
            resourceRootPath: 'D:/snapshot-abc',
          },
          after: {
            revisionId: null,
            label: 'Disk version',
            content: '',
            resourceRootPath: 'D:/project',
          },
        },
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      },
    })
    await flushPromises()

    expect(readBinaryFile).toHaveBeenCalledWith('D:/snapshot-abc/.opencard/fonts/Brand.woff2')
    expect(readBinaryFile).toHaveBeenCalledWith('D:/project/.opencard/fonts/Brand.woff2')
    expect(readBinaryFile).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
