import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ProjectFontRegistryFileEditor from './ProjectFontRegistryFileEditor.vue'
import ProjectFontRegistryEditor from './ProjectFontRegistryEditor.vue'
import ProjectFontRegistrationDialog from './ProjectFontRegistrationDialog.vue'
import ProjectFontCompositionDialog from './ProjectFontCompositionDialog.vue'
import OcButton from '../base/OcButton.vue'

const mocks = vi.hoisted(() => ({
  stageProjectAssetFiles: vi.fn(),
  historyResource: { undo: vi.fn(), redo: vi.fn(), release: vi.fn() },
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('./MonacoEditor.vue', () => ({ default: { template: '<div class="monaco-stub" />' } }))
vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    readBinaryFile: vi.fn(),
  },
}))
vi.mock('../../features/workspace/services/projectAssetFileHistory', () => ({
  stageProjectAssetFiles: mocks.stageProjectAssetFiles,
}))

const fontFiles = (source: string) => ({ files: { normal: { upright: source } } })

describe('ProjectFontRegistryFileEditor', () => {
  it('opens family registration and composition creation from the tree entry actions', async () => {
    const wrapper = mount(ProjectFontRegistryFileEditor, {
      props: { filePath: 'D:/Demo/.opencard/fonts/fonts.json', modelValue: '{}' },
      global: { stubs: { ProjectFontRegistryEditor: true } },
    })
    const workbench = wrapper.getComponent(ProjectFontRegistryEditor)

    workbench.vm.$emit('register-family')
    await flushPromises()
    expect(wrapper.getComponent(ProjectFontRegistrationDialog).props('open')).toBe(true)
    expect(wrapper.getComponent(ProjectFontRegistrationDialog).props('originalKey')).toBeUndefined()

    workbench.vm.$emit('add-composition')
    await flushPromises()
    expect(wrapper.getComponent(ProjectFontCompositionDialog).props('open')).toBe(true)
  })

  it('owns independent family and composition edits and targets family configuration', async () => {
    const wrapper = mount(ProjectFontRegistryFileEditor, {
      props: {
        filePath: 'D:/Demo/.opencard/fonts/fonts.json',
        modelValue: JSON.stringify({
          families: [{ key: 'brand-regular', name: 'Regular', ...fontFiles('.opencard/fonts/Brand.woff2') }],
          compositions: [{ key: 'body', name: 'Body', members: [{ fontKey: 'brand-regular' }] }],
        }),
      },
      global: { stubs: { ProjectFontRegistryEditor: true } },
    })
    const workbench = wrapper.getComponent(ProjectFontRegistryEditor)
    workbench.vm.$emit('configure-family', 'brand-regular')
    await flushPromises()
    expect(wrapper.getComponent(ProjectFontRegistrationDialog).props('originalKey')).toBe('brand-regular')
    expect(wrapper.getComponent(ProjectFontRegistrationDialog).props('defaultOpenPath')).toBe('D:/Demo/.opencard/fonts')

    workbench.vm.$emit('update:families', [
      { key: 'display', name: 'Display', ...fontFiles('fonts/Display.woff2') },
    ])
    await wrapper.vm.$nextTick()
    const updates = wrapper.emitted('update:modelValue') ?? []
    expect(JSON.parse(updates[updates.length - 1]?.[0] as string)).toEqual({
      families: [{ key: 'display', name: 'Display', ...fontFiles('fonts/Display.woff2') }],
      compositions: [{ key: 'body', name: 'Body', members: [{ fontKey: 'brand-regular' }] }],
    })

    workbench.vm.$emit('update:compositions', [
      { key: 'heading', name: 'Heading', members: [{ fontKey: 'display' }] },
    ])
    await wrapper.vm.$nextTick()
    const modelUpdates = wrapper.emitted('update:modelValue') ?? []
    expect(JSON.parse(modelUpdates[modelUpdates.length - 1]?.[0] as string)).toEqual({
      families: [{ key: 'display', name: 'Display', ...fontFiles('fonts/Display.woff2') }],
      compositions: [{ key: 'heading', name: 'Heading', members: [{ fontKey: 'display' }] }],
    })
  })

  it('uses raw repair mode for invalid JSON, ignores unknown fields, and saves current content', async () => {
    const invalid = mount(ProjectFontRegistryFileEditor, {
      props: { filePath: 'D:/Demo/.opencard/fonts/fonts.json', modelValue: '{broken' },
    })
    expect(invalid.find('.monaco-stub').exists()).toBe(true)

    const unknownShape = mount(ProjectFontRegistryFileEditor, {
      props: { filePath: 'D:/Demo/.opencard/fonts/fonts.json', modelValue: JSON.stringify({ fonts: [] }) },
      global: { stubs: { ProjectFontRegistryEditor: true } },
    })
    expect(unknownShape.find('.monaco-stub').exists()).toBe(false)

    const empty = mount(ProjectFontRegistryFileEditor, {
      props: { filePath: 'D:/Demo/.opencard/fonts/fonts.json', modelValue: '{}' },
      global: { stubs: { ProjectFontRegistryEditor: true } },
    })
    expect(empty.getComponent(ProjectFontRegistryEditor).props('families')).toEqual([])
    expect(empty.getComponent(ProjectFontRegistryEditor).props('compositions')).toEqual([])
    await empty.get('.project-registry-shell').trigger('keydown', { ctrlKey: true, key: 's' })
    expect(empty.emitted('save')).toHaveLength(1)
  })

  it('reports empty compositions and missing font references without blocking save', async () => {
    const wrapper = mount(ProjectFontRegistryFileEditor, {
      props: {
        filePath: 'D:/Demo/.opencard/fonts/fonts.json',
        modelValue: JSON.stringify({
          compositions: [
            { key: 'unused', name: 'Unused', members: [] },
            { key: 'body', name: 'Body', members: [{ fontKey: 'missing' }] },
          ],
        }),
      },
      global: { stubs: { ProjectFontRegistryEditor: true } },
    })
    const snapshots = wrapper.emitted('issue-snapshot') ?? []
    const snapshot = snapshots[snapshots.length - 1]?.[0] as { issues: { type: string }[] }
    expect(snapshot.issues.map(issue => issue.type)).toEqual(expect.arrayContaining([
      'project-font-registry.empty-composition',
      'project-font-registry.missing-font',
    ]))
    await wrapper.get('.project-registry-shell').trigger('keydown', { ctrlKey: true, key: 's' })
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('updates composition references when a family key changes', async () => {
    const wrapper = mount(ProjectFontRegistryFileEditor, {
      props: {
        filePath: 'D:/Demo/.opencard/fonts/fonts.json',
        modelValue: JSON.stringify({
          families: [{ key: 'latin', name: 'Latin', ...fontFiles('fonts/Latin.woff2') }],
          compositions: [{ key: 'body', name: 'Body', members: [{ fontKey: 'latin' }] }],
        }),
      },
      global: { stubs: { ProjectFontRegistryEditor: true } },
    })
    wrapper.getComponent(ProjectFontRegistrationDialog).vm.$emit('submit', {
      families: [{
        originalKey: 'latin',
        key: 'foundation',
        name: 'Foundation',
        slots: { 'normal.upright': {
          originalSource: 'fonts/Latin.woff2',
          sourcePath: 'fonts/Latin.woff2',
        } },
      }],
    })
    await flushPromises()
    const updates = wrapper.emitted('update:modelValue') ?? []
    expect(JSON.parse(updates[updates.length - 1]?.[0] as string).compositions).toEqual([
      { key: 'body', name: 'Body', members: [{ fontKey: 'foundation' }] },
    ])
  })

  it('confirms family removal and binds orphaned files to the history entry', async () => {
    mocks.stageProjectAssetFiles.mockResolvedValue(mocks.historyResource)
    const wrapper = mount(ProjectFontRegistryFileEditor, {
      props: {
        filePath: 'D:/Demo/.opencard/fonts/fonts.json',
        modelValue: JSON.stringify({
          families: [
            { key: 'a', name: 'A', files: { normal: { upright: '.opencard/fonts/Shared.woff2' }, bold: { upright: '.opencard/fonts/A.woff2' } } },
            { key: 'b', name: 'B', ...fontFiles('.opencard/fonts/Shared.woff2') },
          ],
        }),
      },
      global: { stubs: { ProjectFontRegistryEditor: true, Teleport: true } },
    })
    wrapper.getComponent(ProjectFontRegistryEditor).vm.$emit('remove-family', 'a')
    await wrapper.vm.$nextTick()
    const confirm = wrapper.findAllComponents(OcButton)
      .find(candidate => candidate.text() === 'projectConfig.fonts.remove')
    await confirm!.trigger('click')
    await flushPromises()

    expect(mocks.stageProjectAssetFiles).toHaveBeenCalledWith(
      ['D:/Demo/.opencard/fonts/A.woff2'], undefined, undefined, 'font',
    )
    const updates = wrapper.emitted('update:modelValue') ?? []
    expect(JSON.parse(updates[updates.length - 1]?.[0] as string).families.map((family: { key: string }) => family.key))
      .toEqual(['b'])
    expect(updates[updates.length - 1]?.[1]).toMatchObject({
      mode: 'immediate',
      resource: mocks.historyResource,
    })
  })
})
