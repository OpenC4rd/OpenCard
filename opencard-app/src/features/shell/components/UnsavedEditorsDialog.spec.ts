import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import OcCheckbox from '../../../components/base/OcCheckbox.vue'
import enUS from '../../../locales/en-US'
import type { UnsavedEditorDecision } from '../composables/useUnsavedSessionGuard'
import UnsavedEditorsDialog from './UnsavedEditorsDialog.vue'

const rows: UnsavedEditorDecision[] = [
  {
    sessionId: 'pending',
    name: 'Pending.ocdocument',
    fileTypeId: 'opencard',
    resourceKind: 'draft',
    path: null,
    decision: 'pending',
    savePath: null,
    selected: true,
    error: '',
  },
  {
    sessionId: 'save',
    name: 'Save.ocdocument',
    fileTypeId: 'opencard',
    resourceKind: 'draft',
    path: null,
    decision: 'save',
    savePath: 'D:/cards/Save.ocdocument',
    selected: false,
    error: '',
  },
  {
    sessionId: 'discard',
    name: 'Discard.ocdocument',
    fileTypeId: 'opencard',
    resourceKind: 'draft',
    path: null,
    decision: 'discard',
    savePath: null,
    selected: false,
    error: '',
  },
]

function mountDialog(dialogRows: UnsavedEditorDecision[] = rows) {
  return mount(UnsavedEditorsDialog, {
    props: {
      open: true,
      intentType: 'app',
      rows: dialogRows,
      busy: false,
      globalError: '',
      selectedCount: 1,
      pendingCount: 1,
      saveCount: 1,
      discardCount: 1,
      allPendingSelected: true,
      somePendingSelected: false,
      canConfirm: false,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { Teleport: true },
    },
  })
}

describe('UnsavedEditorsDialog', () => {
  it('shows checkboxes only for undecided rows and keeps decisions reviewable', async () => {
    const wrapper = mountDialog()

    expect(wrapper.findAllComponents(OcCheckbox)).toHaveLength(2)
    expect(wrapper.text()).toContain('Undecided')
    expect(wrapper.text()).toContain('Will save to D:/cards/Save.ocdocument')
    expect(wrapper.text()).toContain('Will discard changes')
    expect(wrapper.get('.unsaved-editors-dialog__footer-actions .oc-button--variant-solid').attributes('disabled'))
      .toBeDefined()

    const changeButtons = wrapper.findAll('button').filter(button => button.text() === 'Change')
    expect(changeButtons).toHaveLength(2)
    await changeButtons[0]!.trigger('click')
    expect(wrapper.emitted('change-decision')).toEqual([['save']])
  })

  it('emits the two batch decisions for the current selection', async () => {
    const wrapper = mountDialog()
    const buttons = wrapper.findAll('button')

    await buttons.find(button => button.text().startsWith('Set to discard'))!.trigger('click')
    await buttons.find(button => button.text().startsWith('Save selected'))!.trigger('click')

    expect(wrapper.emitted('mark-discard')).toHaveLength(1)
    expect(wrapper.emitted('mark-save')).toHaveLength(1)
  })

  it('shows direct cancel, discard, and save actions for one editor', async () => {
    const wrapper = mountDialog([rows[0]!])

    expect(wrapper.findComponent(OcCheckbox).exists()).toBe(false)
    expect(wrapper.find('.unsaved-editors-dialog__list').exists()).toBe(false)
    expect(wrapper.text()).toContain('Save changes to “Pending.ocdocument”?')
    expect(wrapper.text()).toContain('This draft has not been saved to disk.')
    expect(wrapper.get('.oc-dialog__header').text()).not.toContain('This draft has not been saved to disk.')
    expect(wrapper.get('.oc-dialog__body').text()).toContain('This draft has not been saved to disk.')
    expect(wrapper.text()).not.toContain('Save selected')
    expect(wrapper.text()).not.toContain('Confirm decisions')
    expect(wrapper.text()).not.toContain('Not saved to disk')

    const buttons = wrapper.findAll('button')
    await buttons.find(button => button.text() === 'Discard')!.trigger('click')
    await buttons.find(button => button.text() === 'Save')!.trigger('click')

    expect(wrapper.emitted('discard-single')).toHaveLength(1)
    expect(wrapper.emitted('save-single')).toHaveLength(1)
  })
})
