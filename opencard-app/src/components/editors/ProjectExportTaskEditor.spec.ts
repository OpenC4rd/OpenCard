import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import enUS from '../../locales/en-US'
import { createDefaultProjectExportTask } from '../../features/exporting/exportTask'
import ProjectExportTaskEditor from './ProjectExportTaskEditor.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(async () => 'C:/exports') }))

function mountEditor() {
  return mount(ProjectExportTaskEditor, {
    props: {
      modelValue: createDefaultProjectExportTask(),
      documents: [{ path: 'cards/main.ocdocument', width: 540, height: 850 }],
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { Teleport: true, OcAutocompleteList: true },
    },
  })
}

describe('projectExportTaskEditor', () => {
  it('emits a controlled update after choosing an output folder', async () => {
    const wrapper = mountEditor()
    await wrapper.get('[role="combobox"]').trigger('focus')
    await wrapper.get('button[aria-label="Add card document"]').trigger('click')
    await wrapper.get('button[aria-label="Choose output folder"]').trigger('click')
    await flushPromises()

    const updates = wrapper.emitted('update:modelValue') ?? []
    expect(updates[updates.length - 1]?.[0]).toMatchObject({
      documentPaths: ['cards/main.ocdocument'],
      outputDirectory: 'C:/exports',
    })
  })

  it('locks editing and withholds confirmation while busy', () => {
    const wrapper = mount(ProjectExportTaskEditor, {
      props: {
        modelValue: createDefaultProjectExportTask(),
        documents: [],
        busy: true,
        showValidation: true,
        preparationIssues: [{ code: 'output-unavailable' }],
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
        stubs: { Teleport: true, OcAutocompleteList: true },
      },
    })

    expect(wrapper.get('[role="combobox"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
  })
})
