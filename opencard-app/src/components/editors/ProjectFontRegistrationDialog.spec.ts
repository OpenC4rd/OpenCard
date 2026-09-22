import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ProjectFontRegistrationDialog from './ProjectFontRegistrationDialog.vue'

const mocks = vi.hoisted(() => ({
  pickFile: vi.fn(),
  readBinaryFile: vi.fn(),
  inspectProjectFontSource: vi.fn(),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: { pickFile: mocks.pickFile, readBinaryFile: mocks.readBinaryFile },
}))
vi.mock('../../features/workspace/services/projectFontMetadata', () => ({
  inspectProjectFontSource: mocks.inspectProjectFontSource,
}))
const baseProps = {
  open: true,
  getManagedFontSource: () => 'fonts/Regular.ttf',
  resolveImportConflict: async () => null,
}
const mountDialog = (overrides: Record<string, unknown> = {}) => mount(ProjectFontRegistrationDialog, {
  props: { ...baseProps, ...overrides },
  global: { stubs: { Teleport: true } },
})

describe('ProjectFontRegistrationDialog', () => {
  it('persists only explicitly selected slots and supports the six-slot advanced editor', async () => {
    const wrapper = mountDialog({ originalKey: 'brand-sans', registry: {
      'brand-sans': { kind: 'family', name: 'Brand Sans', family: {
        key: 'brand-sans', name: 'Brand Sans', files: { normal: { upright: 'fonts/Regular.ttf' } },
      } },
    } })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ families: [{ slots: { 'normal.upright': { sourcePath: 'fonts/Regular.ttf' } } }] })
    expect(wrapper.findAll('.project-font-dialog__slot-table thead th')).toHaveLength(3)
    expect(wrapper.findAll('.project-font-dialog__slot-table tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('projectConfig.fonts.weightLight')
  })

  it('surfaces a failed import preflight without permanently disabling confirmation', async () => {
    mocks.pickFile.mockResolvedValueOnce('D:/project/assets/Local.ttf')
    mocks.readBinaryFile.mockResolvedValueOnce(new Uint8Array([1]))
    mocks.inspectProjectFontSource.mockResolvedValueOnce([{
      familyName: 'Local', faceName: 'Regular', weight: { min: 400, max: 400 }, style: { kind: 'normal' },
    }])
    const wrapper = mountDialog({
      originalKey: 'brand-sans',
      getManagedFontSource: () => null,
      resolveImportConflict: async () => { throw new Error('preflight failed') },
      registry: { 'brand-sans': { kind: 'family', name: 'Brand Sans', family: {
        key: 'brand-sans', name: 'Brand Sans', files: { normal: { upright: 'fonts/Regular.ttf' } },
      } } },
    })

    await wrapper.findAll('.project-font-dialog__slot-source')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('projectConfig.fonts.importCheckFailed')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('reenables confirmation after preflighting a project-local unmanaged font', async () => {
    mocks.pickFile.mockResolvedValueOnce('D:/project/assets/Local.ttf')
    mocks.readBinaryFile.mockResolvedValueOnce(new Uint8Array([1]))
    mocks.inspectProjectFontSource.mockResolvedValueOnce([{
      familyName: 'Local', faceName: 'Regular', weight: { min: 400, max: 400 }, style: { kind: 'normal' },
    }])
    const wrapper = mountDialog({
      originalKey: 'brand-sans',
      getManagedFontSource: () => null,
      resolveImportConflict: async () => null,
      registry: { 'brand-sans': { kind: 'family', name: 'Brand Sans', family: {
        key: 'brand-sans', name: 'Brand Sans', files: { normal: { upright: 'fonts/Regular.ttf' } },
      } } },
    })

    await wrapper.findAll('.project-font-dialog__slot-source')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
