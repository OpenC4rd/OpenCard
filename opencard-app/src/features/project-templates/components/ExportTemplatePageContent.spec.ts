import { defineComponent, h, ref } from 'vue'
import { createTemplateExportForm } from '../composables/createTemplateExportForm'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectTemplateStore } from '../store/projectTemplateStore'
import ExportTemplatePageContent from './ExportTemplatePageContent.vue'

let store: ProjectTemplateStore

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }))
vi.mock('../store/projectTemplateStore', () => ({ useProjectTemplateStore: () => store }))

const messages = {
  templateExport: {
    title: 'Export Project Template', projectTitle: 'Current project', formTitle: 'Template information',
    unnamed: 'Untitled', format: 'Format', formatHint: 'Hint', actions: { export: 'Export Template' },
    previewTitle: 'Preview', previewDescription: 'Description', excluded: 'Excluded',
    selectEntry: 'Select entry', selectionHint: 'Use tree',
    dialogs: { chooseOutput: 'Choose output' },
    status: { inspecting: 'Inspecting', exporting: 'Exporting', exported: 'Exported' },
  },
  projectTemplates: {
    fields: { entry: 'Entry', covers: 'Covers', templateName: 'Name', description: 'Description' },
    status: { noCoverCandidates: 'No covers' },
    errors: {
      invalidTemplateName: 'Invalid name', descriptionTooLong: 'Too long', sourceNotProject: 'Not project',
      sourceHasSymlink: 'Symlink', entryNotFound: 'Missing entry', coverNotFound: 'Missing cover',
      archiveFailed: 'Archive failed', unknown: 'Unknown',
    },
  },
}

describe('ExportTemplatePageContent', () => {
  beforeEach(() => {
    store = {
      inspectProjectSource: vi.fn(async () => ({
        sourcePath: '/project', suggestedName: 'Portable', entries: ['main.ocdocument', 'alternate.ocdocument'],
        entryNames: { 'main.ocdocument': 'Main Blueprint', 'alternate.ocdocument': 'Alternate Blueprint' },
        coverCandidates: ['cover.png'],
      })),
      pickTemplateExportPath: vi.fn(async () => '/exports/Portable.octemplate'),
      exportProjectTemplate: vi.fn(async () => '/exports/Portable.octemplate'),
    } as unknown as ProjectTemplateStore
  })

  it('inspects the open project and exports configured metadata', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
    let model!: ReturnType<typeof createTemplateExportForm>
    const onExported = vi.fn()
    const visible = ref(true)
    const wrapper = mount(defineComponent({ setup() {
      model = createTemplateExportForm({ projectPath: ref('/project'), onExported })
      return () => visible.value ? h(ExportTemplatePageContent, { model }) : null
    } }), { global: { plugins: [i18n] } })
    await model.reset()
    model.toggleCover('cover.png')
    model.toggleEntry('alternate.ocdocument')
    model.togglePathIncluded('notes')
    visible.value = false
    await flushPromises()
    visible.value = true
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(store.pickTemplateExportPath).toHaveBeenCalledWith('Portable.octemplate', 'Choose output')
    expect(store.exportProjectTemplate).toHaveBeenCalledWith({
      sourcePath: '/project',
      outputPath: '/exports/Portable.octemplate',
      name: 'Portable',
      description: '',
      entry: 'main.ocdocument',
      entries: ['main.ocdocument', 'alternate.ocdocument'],
      covers: ['cover.png'],
      excludedPaths: ['notes'],
    })
    expect(model.selection.value).toEqual({
      entries: ['main.ocdocument', 'alternate.ocdocument'],
      entryNames: { 'main.ocdocument': 'Main Blueprint', 'alternate.ocdocument': 'Alternate Blueprint' },
      covers: ['cover.png'], excludedPaths: ['notes'],
    })
    expect(onExported).toHaveBeenCalledWith('/exports/Portable.octemplate')
    wrapper.unmount()
  })

  it('ignores an obsolete inspection and stops export when its project changes during the picker', async () => {
    const projectPath = ref('/first')
    let resolveInspection!: (value: Awaited<ReturnType<ProjectTemplateStore['inspectProjectSource']>>) => void
    vi.mocked(store.inspectProjectSource).mockImplementationOnce(() => new Promise(resolve => { resolveInspection = resolve }))
    let model!: ReturnType<typeof createTemplateExportForm>
    const wrapper = mount(defineComponent({ setup() {
      model = createTemplateExportForm({ projectPath, onExported: vi.fn() })
      return () => null
    } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: messages } })] } })
    const obsolete = model.reset()
    projectPath.value = '/second'
    await model.reset()
    resolveInspection({ sourcePath: '/first', suggestedName: 'Obsolete', entries: ['old.ocdocument'], entryNames: {}, coverCandidates: [] })
    await obsolete
    expect(model.name.value).toBe('Portable')
    let finishPicker!: (path: string) => void
    vi.mocked(store.pickTemplateExportPath).mockImplementationOnce(() => new Promise(resolve => { finishPicker = resolve }))
    const exporting = model.exportTemplate()
    expect(model.isBusy.value).toBe(true)
    projectPath.value = '/third'
    await model.reset(false)
    finishPicker('/exports/old.octemplate')
    await exporting
    expect(store.exportProjectTemplate).not.toHaveBeenCalled()
    expect(model.isBusy.value).toBe(false)
    wrapper.unmount()
  })

})
