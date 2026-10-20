import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import FeedbackDialog from './FeedbackDialog.vue'
import * as feedbackService from '../services/feedbackService'

afterEach(() => vi.restoreAllMocks())

function mountDialog(props: InstanceType<typeof FeedbackDialog>['$props']) {
  return mount(FeedbackDialog, {
    props,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { Teleport: true },
    },
  })
}

describe('FeedbackDialog', () => {
  it('switches between the suggestion and problem forms', async () => {
    const wrapper = mountDialog({ open: true, initialKind: 'suggestion' })
    expect(wrapper.text()).toContain('How would you improve OpenCard?')
    expect(wrapper.text()).not.toContain('How can we reproduce it?')

    await wrapper.get('[role="combobox"]').trigger('click')
    await wrapper.findAll('[role="option"]').find(option => option.text() === 'Report a problem')!.trigger('click')
    expect(wrapper.text()).toContain('What happened?')
    expect(wrapper.text()).toContain('How can we reproduce it?')
  })

  it('shows sanitized diagnostics only after explicit opt-in', async () => {
    const wrapper = mountDialog({
      open: true,
      initialKind: 'bug',
      diagnostics: { errorMessage: 'Failed at C:\\Users\\Alice\\secret.ocdocument' },
    })
    expect(wrapper.find('.feedback-dialog__diagnostics').exists()).toBe(false)

    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(wrapper.get('.feedback-dialog__diagnostics').text()).toContain('<local-path>')
    expect(wrapper.get('.feedback-dialog__diagnostics').text()).not.toContain('Alice')
  })

  it('makes an unconfigured service explicit and keeps submission disabled', () => {
    const wrapper = mountDialog({ open: true })
    expect(wrapper.text()).toContain('Feedback service is not configured')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('locks navigation, kind, inputs and closing until a pending submission finishes', async () => {
    vi.spyOn(feedbackService, 'isFeedbackServiceConfigured').mockReturnValue(true)
    let reject!: (reason: Error) => void
    const pending = new Promise<never>((_, fail) => { reject = fail })
    vi.spyOn(feedbackService, 'submitFeedback').mockReturnValue(pending)
    const wrapper = mountDialog({ open: true })
    try {
      await wrapper.get('textarea').setValue('Keep the draft while sending')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.findAll('[role="tab"], [role="radio"]').every(button => button.attributes('disabled') !== undefined)).toBe(true)
      expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[role="combobox"]').attributes('disabled')).toBeDefined()
      await wrapper.get('footer button').trigger('click')
      expect(wrapper.emitted('close')).toBeUndefined()
      expect(wrapper.emitted('pageChange')).toBeUndefined()
      reject(new feedbackService.FeedbackServiceError('network', 'offline'))
      await flushPromises()
      expect(wrapper.get('textarea').element.value).toBe('Keep the draft while sending')
      expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[role="alert"]').text()).toContain('connection')
    } finally { wrapper.unmount() }
  })
})
