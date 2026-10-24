import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, h, ref } from 'vue'
import { expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import { requestConfirmation, resolveConfirmation } from '../services/appConfirmation'
import ShellOverlayHost from './ShellOverlayHost.vue'
import type { FeedbackPage } from '../../feedback/model/feedback'

function hostProps() {
  return {
    isExternalFileDragActive: false, isExternalFileDragOverZone: false,
    releaseNotesDialogMode: null, displayedReleaseNotes: null, isDownloadingUpdate: false,
    isInstallingUpdate: false, isUpdateDownloaded: false, feedbackCenterPage: null,
    feedbackDialogKind: 'suggestion' as const, developerMode: false,
  }
}

it.each([false, true])('resolves the confirmation with the decision the user picked (%s)', async accepted => {
  const wrapper = mount(ShellOverlayHost, {
    props: hostProps(),
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { ReleaseNotesDialog: true, FeedbackDialog: true },
    },
  })
  try {
    const decision = requestConfirmation({ title: 'Delete', message: 'Delete this template?', confirmLabel: 'Delete' })
    await flushPromises()
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
    const chosen = buttons.find(button => (button.textContent?.trim() === 'Delete') === accepted)!
    chosen.click()

    expect(await decision).toBe(accepted)
  } finally { resolveConfirmation(false); wrapper.unmount() }
})

it('keeps one feedback draft across page changes and reopening', async () => {
  const page = ref<FeedbackPage | null>('submit')
  const wrapper = mount(defineComponent({ setup: () => () => h(ShellOverlayHost, {
    ...hostProps(),
    feedbackCenterPage: page.value,
    onFeedbackPageChange: (value: FeedbackPage) => { page.value = value },
    onCloseFeedback: () => { page.value = null },
  }) }), {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { ReleaseNotesDialog: true },
    },
  })
  try {
    await flushPromises()
    const input = document.querySelector('textarea')!
    input.value = 'A draft that must survive navigation'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    document.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click()
    await flushPromises()
    expect(page.value).toBe('history')

    document.querySelector<HTMLButtonElement>('[role="tab"]')!.click()
    await flushPromises()
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toBe('A draft that must survive navigation')

    page.value = null
    await flushPromises()
    page.value = 'submit'
    await flushPromises()
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value)
      .toBe('A draft that must survive navigation')
  } finally { wrapper.unmount() }
})
