import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import FeedbackDialog from './FeedbackDialog.vue'
import OverlayGroupRoot from '../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../composables/overlayGroups'
import * as feedbackService from '../services/feedbackService'

// 下拉列表由共享组宿主渲染，挂在离屏挂载点上就不会出现在组件的 DOM 子树里。
let overlayRoot: VueWrapper | null = null

beforeEach(() => {
  overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
})

afterEach(() => {
  overlayRoot?.unmount()
  overlayRoot = null
  for (const group of [...overlayGroups.keys()]) disposeGroup(group)
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mountDialog(props: InstanceType<typeof FeedbackDialog>['$props']) {
  return mount(FeedbackDialog, {
    props,
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { Teleport: true },
    },
  })
}

function buttonByText(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find(button => button.text() === label)!
}

describe('FeedbackDialog', () => {
  it('shows sanitized diagnostics only after explicit opt-in', async () => {
    const wrapper = mountDialog({
      open: true,
      initialKind: 'bug',
      diagnostics: { errorMessage: 'Failed at C:\\Users\\Alice\\secret.ocdocument' },
    })

    expect(wrapper.text()).not.toContain('<local-path>')

    await wrapper.get('input[type="checkbox"]').setValue(true)

    expect(wrapper.text()).toContain('<local-path>')
    expect(wrapper.text()).not.toContain('Alice')
  })

  it('keeps submission disabled while the feedback service is unconfigured', async () => {
    const wrapper = mountDialog({ open: true })

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('keeps the dialog and the draft locked until a pending submission settles', async () => {
    vi.spyOn(feedbackService, 'isFeedbackServiceConfigured').mockReturnValue(true)
    let reject!: (reason: Error) => void
    const pending = new Promise<never>((_, fail) => { reject = fail })
    vi.spyOn(feedbackService, 'submitFeedback').mockReturnValue(pending)
    const wrapper = mountDialog({ open: true })
    try {
      await wrapper.get('textarea').setValue('Keep the draft while sending')
      await wrapper.get('form').trigger('submit')

      await buttonByText(wrapper, 'Cancel').trigger('click')
      expect(wrapper.emitted('close')).toBeUndefined()

      reject(new feedbackService.FeedbackServiceError('network', 'offline'))
      await flushPromises()
      expect(wrapper.get('textarea').element.value).toBe('Keep the draft while sending')
      expect(wrapper.get('[role="alert"]').text()).toContain('connection')

      await buttonByText(wrapper, 'Cancel').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    } finally { wrapper.unmount() }
  })
})
