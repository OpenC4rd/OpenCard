import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, h, ref } from 'vue'
import { expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import { requestConfirmation, resolveConfirmation } from '../services/appConfirmation'
import ShellOverlayHost from './ShellOverlayHost.vue'
import type { FeedbackPage } from '../../feedback/model/feedback'

it.each([false, true])('keeps confirmation text in the body and resolves the selected decision (%s)', async accepted => {
  const wrapper = mount(ShellOverlayHost, {
    props: {
      isExternalFileDragActive: false, isExternalFileDragOverZone: false,
      releaseNotesDialogMode: null, displayedReleaseNotes: null, isDownloadingUpdate: false,
      isInstallingUpdate: false, isUpdateDownloaded: false, feedbackCenterPage: null,
      feedbackDialogKind: 'suggestion', developerMode: false,
    },
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { ReleaseNotesDialog: true, FeedbackDialog: true, FloatingMenuHost: true },
    },
  })
  try {
    const decision = requestConfirmation({ title: 'Delete', message: 'Delete this template?', confirmLabel: 'Delete' })
    await flushPromises()
    const dialog = document.querySelector('.oc-dialog')!
    expect(dialog.querySelector('.oc-dialog__header')?.textContent).toBe('Delete')
    expect(dialog.querySelector('.oc-dialog__body')?.textContent).toBe('Delete this template?')
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('footer button')
    buttons[accepted ? 1 : 0]!.click()
    expect(await decision).toBe(accepted)
  } finally { resolveConfirmation(false); wrapper.unmount() }
})

it('keeps one feedback dialog and its unfinished draft across page changes and reopening', async () => {
  const page = ref<FeedbackPage | null>('submit')
  const wrapper = mount(defineComponent({ setup: () => () => h(ShellOverlayHost, {
    isExternalFileDragActive: false, isExternalFileDragOverZone: false,
    releaseNotesDialogMode: null, displayedReleaseNotes: null, isDownloadingUpdate: false,
    isInstallingUpdate: false, isUpdateDownloaded: false, feedbackCenterPage: page.value,
    feedbackDialogKind: 'suggestion', developerMode: false,
    onFeedbackPageChange: (value: FeedbackPage) => { page.value = value },
    onCloseFeedback: () => { page.value = null },
  }) }), {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { ReleaseNotesDialog: true, FloatingMenuHost: true },
    },
  })
  try {
    await flushPromises()
    const dialog = document.querySelector('.feedback-dialog')!
    const input = dialog.querySelector('textarea')!
    input.value = 'A draft that must survive navigation'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const history = dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!
    history.click()
    await flushPromises()
    expect(page.value).toBe('history')
    expect(document.querySelectorAll('.oc-dialog')).toHaveLength(1)
    expect(document.querySelector('.feedback-dialog')).toBe(dialog)
    dialog.querySelector<HTMLButtonElement>('[role="tab"]')!.click()
    await flushPromises()
    expect(dialog.querySelector('textarea')?.value).toBe('A draft that must survive navigation')
    page.value = null
    await flushPromises()
    page.value = 'submit'
    await flushPromises()
    expect(document.querySelector<HTMLTextAreaElement>('.feedback-dialog textarea')?.value).toBe('A draft that must survive navigation')
  } finally { wrapper.unmount() }
})
