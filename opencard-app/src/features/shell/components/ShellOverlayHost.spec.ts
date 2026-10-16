import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import { requestConfirmation, resolveConfirmation } from '../services/appConfirmation'
import ShellOverlayHost from './ShellOverlayHost.vue'

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
      stubs: { ReleaseNotesDialog: true, FeedbackDialog: true, FeedbackHistoryDialog: true, FloatingMenuHost: true },
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
