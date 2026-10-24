import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import type { UnsavedEditorDecision } from '../composables/useUnsavedSessionGuard'
import UnsavedEditorsDialog from './UnsavedEditorsDialog.vue'

function row(sessionId: string, decision: UnsavedEditorDecision['decision']): UnsavedEditorDecision {
  return {
    sessionId,
    name: `${sessionId}.ocdocument`,
    fileTypeId: 'opencard',
    resourceKind: 'draft',
    path: null,
    decision,
    savePath: null,
    selected: decision === 'pending',
    error: '',
  }
}

function mountDialog(rows: UnsavedEditorDecision[], busy = false) {
  return mount(UnsavedEditorsDialog, {
    props: {
      open: true,
      intentType: 'app',
      rows,
      busy,
      globalError: '',
      selectedCount: 1,
      pendingCount: rows.filter(item => item.decision === 'pending').length,
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

function buttonByText(wrapper: ReturnType<typeof mountDialog>, label: string) {
  return wrapper.findAll('button').find(button => button.text() === label)!
}

describe('UnsavedEditorsDialog', () => {
  it('asks the owning guard to reopen a decided row by its session id', async () => {
    const wrapper = mountDialog([row('pending', 'pending'), row('save', 'save')])

    await buttonByText(wrapper, 'Change').trigger('click')

    expect(wrapper.emitted('change-decision')).toEqual([['save']])
  })

  it('closes a single editor with a direct save or discard decision', async () => {
    const wrapper = mountDialog([row('pending', 'pending')])

    await buttonByText(wrapper, 'Discard').trigger('click')
    await buttonByText(wrapper, 'Save').trigger('click')

    expect(wrapper.emitted('discard-single')).toHaveLength(1)
    expect(wrapper.emitted('save-single')).toHaveLength(1)
  })

  it('ignores cancel while the close is in progress', async () => {
    const busy = mountDialog([row('pending', 'pending')], true)
    await buttonByText(busy, 'Cancel').trigger('click')
    expect(busy.emitted('cancel')).toBeUndefined()

    const idle = mountDialog([row('pending', 'pending')])
    await buttonByText(idle, 'Cancel').trigger('click')
    expect(idle.emitted('cancel')).toHaveLength(1)
  })
})
