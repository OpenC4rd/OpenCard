import { createTestSession, getTestSession } from '../../features/editor-runtime/editorTestSession'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OcActionButton from '../standard/OcActionButton.vue'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { exportProjectDictionaryWorkbook } from '../../features/workspace/model/projectDictionaryWorkbook'
import DictionaryEditor from './DictionaryEditor.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('./MonacoEditor.vue', () => ({ default: { template: '<div class="monaco-stub" />' } }))

const clipboard = {
  readText: vi.fn<() => Promise<string>>(),
  writeText: vi.fn<(value: string) => Promise<void>>(),
}

function latestDictionary(wrapper: ReturnType<typeof mount>) {
  const updates = getTestSession(wrapper).state.draftContent
  return JSON.parse(updates as string)
}

function actionButton(wrapper: ReturnType<typeof mount>, title: string) {
  return wrapper.findAllComponents(OcActionButton).find(candidate => candidate.props('action').title === title)!
}

describe('DictionaryEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clipboard.readText.mockReset()
    clipboard.writeText.mockReset().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
  })

  it('does not add row, column, or cell selection states', async () => {
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ base: { title: 'Default' }, languages: { en_US: {} } }) }),  },
    })
    await wrapper.get('tbody th[scope="row"]').trigger('click', { ctrlKey: true })
    await wrapper.get('th.dictionary-editor__data-column').trigger('click', { shiftKey: true })
    await wrapper.get('td[data-grid-column="$base"]').trigger('click', { shiftKey: true })

    expect(wrapper.find('[aria-selected]').exists()).toBe(false)
    expect(wrapper.find('.is-selected').exists()).toBe(false)
  })

  it('imports and exports dictionary workbooks through the exposed shell boundary', async () => {
    const bytes = await exportProjectDictionaryWorkbook({
      base: { title: 'Changed' },
      languages: { en_US: { title: 'English' } },
    }, { key: 'Key', base: 'Base' })
    vi.spyOn(fileSystemService, 'pickFile').mockResolvedValue('D:/Demo/dictionary.xlsx')
    vi.spyOn(fileSystemService, 'readBinaryFile').mockResolvedValue(bytes)
    vi.spyOn(fileSystemService, 'pickSavePath').mockResolvedValue('D:/Demo/export.xlsx')
    const writeBinaryFile = vi.spyOn(fileSystemService, 'writeBinaryFile').mockResolvedValue()
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ base: { title: 'Default' } }) }),  },
      global: { stubs: { Teleport: true } },
    })
    const editor = wrapper.vm as unknown as {
      onHeaderAction: (key: string) => Promise<void>
    }

    await editor.onHeaderAction('dictionary.workbook.export')
    expect(writeBinaryFile).toHaveBeenCalledWith('D:/Demo/export.xlsx', expect.any(Uint8Array))
    await editor.onHeaderAction('dictionary.workbook.import')
    await flushPromises()
    expect(wrapper.text()).toContain('dictionaryEditor.workbook.reviewTitle')
    await wrapper.get('button.oc-button--variant-solid').trigger('click')
    expect(latestDictionary(wrapper)).toEqual({
      base: { title: 'Changed' },
      languages: { en_US: { title: 'English' } },
    })
  })

  it('locks workbook operations while the picker is open and releases on cancellation', async () => {
    let finish!: (path: string | null) => void
    const pick = vi.spyOn(fileSystemService, 'pickSavePath').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const write = vi.spyOn(fileSystemService, 'writeBinaryFile').mockResolvedValue()
    const wrapper = mount(DictionaryEditor, { props: { session: createTestSession({ path: 'locale.json', draftContent: '{"base":{"title":"Title"}}' }),  } })
    const editor = wrapper.vm as unknown as { onHeaderAction: (key: string) => Promise<void> }
    const pending = editor.onHeaderAction('dictionary.workbook.export')
    await editor.onHeaderAction('dictionary.workbook.export')
    expect(pick).toHaveBeenCalledTimes(1)
    finish(null)
    await pending
    expect(write).not.toHaveBeenCalled()
    pick.mockResolvedValue(null)
    await editor.onHeaderAction('dictionary.workbook.export')
    expect(pick).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('adds records and language columns in place inside the grid', async () => {
    const wrapper = mount(DictionaryEditor, {
      attachTo: document.body,
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: '{}' }),  },
    })
    await wrapper.get('tbody button').trigger('click')
    const recordForm = wrapper.get('tbody .dictionary-editor__inline-create')
    const recordInput = recordForm.get('input')
    expect(document.activeElement).toBe(recordInput.element)
    await recordInput.setValue('title')
    await recordInput.trigger('blur')
    expect(latestDictionary(wrapper)).toEqual({ base: { title: '' } })

    await wrapper.get('button[data-tooltip="dictionaryEditor.actions.addLanguage"]').trigger('click')
    const languageForm = wrapper.get('thead .dictionary-editor__inline-create')
    const languageInput = languageForm.get('input')
    expect(document.activeElement).toBe(languageInput.element)
    await languageInput.setValue('en_US')
    await languageInput.trigger('blur')
    expect(latestDictionary(wrapper)).toEqual({
      base: { title: '' },
      languages: { en_US: {} },
    })
    wrapper.unmount()
  })

  it('leaves inline editing instead of stranding an invalid blurred draft', async () => {
    const wrapper = mount(DictionaryEditor, {
      attachTo: document.body,
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ base: { title: 'Default', body: 'Body' } }) }),  },
    })

    await wrapper.get('tbody tr:last-child button').trigger('click')
    const createInput = wrapper.get('tbody .dictionary-editor__inline-create input')
    await createInput.trigger('blur')
    expect(wrapper.find('tbody .dictionary-editor__inline-create').exists()).toBe(false)
    expect(getTestSession(wrapper).state.isDirty).toBe(false)

    actionButton(wrapper, 'dictionaryEditor.actions.recordActions').vm.$emit('select', { key: 'rename' })
    await wrapper.vm.$nextTick()
    const renameInput = wrapper.get('tbody .dictionary-editor__rename input')
    await renameInput.setValue('body')
    await renameInput.trigger('blur')
    expect(wrapper.find('tbody .dictionary-editor__rename').exists()).toBe(false)
    expect(wrapper.text()).toContain('title')
    expect(getTestSession(wrapper).state.isDirty).toBe(false)
    wrapper.unmount()
  })

  it('uses embedded fields, shows inheritance, creates overrides, and resets them', async () => {
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ base: { title: '默认' }, languages: { en_US: {} } }) }),  },
    })
    const languageCell = wrapper.get('td[data-grid-column="en_US"]')
    expect(languageCell.classes()).toContain('is-inherited')
    expect(languageCell.find('.property-field-renderer--embedded').exists()).toBe(true)
    expect(languageCell.get('input').attributes('value')).toBe('默认')

    await languageCell.get('input').setValue('English')
    expect(latestDictionary(wrapper).languages.en_US).toEqual({ title: 'English' })
    await wrapper.get('button[data-tooltip="dictionaryEditor.actions.resetOverride"]').trigger('click')
    expect(latestDictionary(wrapper).languages.en_US).toEqual({})
  })

  it('sets and clears the active language in the draft', async () => {
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ languages: { en_US: {} } }) }),  },
    })
    const setActive = wrapper.get('button[data-tooltip="dictionaryEditor.actions.setActive"]')
    await setActive.trigger('click')
    expect(latestDictionary(wrapper).active).toBe('en_US')
    expect(setActive.classes()).toContain('oc-button--active')
    const useBase = wrapper.get('button[data-tooltip="dictionaryEditor.actions.useBase"]')
    await useBase.trigger('click')
    expect(latestDictionary(wrapper)).not.toHaveProperty('active')
    expect(useBase.classes()).toContain('oc-button--active')
  })

  it('keeps language header actions together in one trailing group', () => {
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ languages: { en_US: {} } }) }),  },
    })
    const languageHeader = wrapper.get('th.dictionary-editor__data-column:nth-of-type(3)')
    const actionGroup = languageHeader.get('.dictionary-editor__column-actions')
    expect(actionGroup.findAll('button')).toHaveLength(2)
    expect(languageHeader.get('.dictionary-editor__column-heading').element.children).toHaveLength(2)
  })

  it('routes rename and confirmed deletion through standard action buttons', async () => {
    const wrapper = mount(DictionaryEditor, {
      attachTo: document.body,
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({
          base: { title: '默认', body: '正文' },
          languages: { en_US: { title: 'English' } },
        }) }),  },
    })
    actionButton(wrapper, 'dictionaryEditor.actions.recordActions').vm.$emit('select', { key: 'rename' })
    await wrapper.vm.$nextTick()
    const recordRenameInput = wrapper.get('tbody .dictionary-editor__rename input')
    expect(document.activeElement).toBe(recordRenameInput.element)
    expect((recordRenameInput.element as HTMLInputElement).selectionStart).toBe(0)
    expect((recordRenameInput.element as HTMLInputElement).selectionEnd).toBe('title'.length)
    await recordRenameInput.setValue('heading')
    await recordRenameInput.trigger('blur')
    expect(latestDictionary(wrapper)).toEqual({
      base: { heading: '默认', body: '正文' },
      languages: { en_US: { heading: 'English' } },
    })

    actionButton(wrapper, 'dictionaryEditor.actions.languageActions').vm.$emit('select', { key: 'rename' })
    await wrapper.vm.$nextTick()
    const languageRenameInput = wrapper.get('thead .dictionary-editor__rename input')
    expect(document.activeElement).toBe(languageRenameInput.element)
    expect((languageRenameInput.element as HTMLInputElement).selectionStart).toBe(0)
    expect((languageRenameInput.element as HTMLInputElement).selectionEnd).toBe('en_US'.length)
    await languageRenameInput.setValue('en_GB')
    await languageRenameInput.trigger('blur')
    expect(latestDictionary(wrapper).languages).toEqual({ en_GB: { heading: 'English' } })

    actionButton(wrapper, 'dictionaryEditor.actions.recordActions').vm.$emit('select', { key: 'confirm-delete' })
    await wrapper.vm.$nextTick()
    expect(latestDictionary(wrapper)).toEqual({ base: { body: '正文' }, languages: { en_GB: {} } })
    wrapper.unmount()
  })

  it('copies record keys and language keys from their action menus', async () => {
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ base: { title: 'Default' }, languages: { en_US: {} } }) }),  },
    })
    actionButton(wrapper, 'dictionaryEditor.actions.recordActions').vm.$emit('select', { key: 'copy' })
    await flushPromises()
    expect(clipboard.writeText).toHaveBeenCalledWith('title')

    actionButton(wrapper, 'dictionaryEditor.actions.languageActions').vm.$emit('select', { key: 'copy' })
    await flushPromises()
    expect(clipboard.writeText).toHaveBeenLastCalledWith('en_US')
  })

  it('uses source repair mode for invalid content', () => {
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: '{broken' }),  },
    })
    expect(wrapper.find('.dictionary-editor__repair').exists()).toBe(true)
    expect(wrapper.find('.monaco-stub').exists()).toBe(true)
  })

  it('reports a missing active language without changing the draft', () => {
    const wrapper = mount(DictionaryEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/locale.json', draftContent: JSON.stringify({ active: 'fr_FR', base: { title: 'Default' } }) }),  },
    })
    expect(wrapper.find('.dictionary-editor__notice').exists()).toBe(true)
    expect(getTestSession(wrapper).state.isDirty).toBe(false)
  })
})
