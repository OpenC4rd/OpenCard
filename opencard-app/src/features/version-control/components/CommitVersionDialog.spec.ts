import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import CommitVersionDialog from './CommitVersionDialog.vue'

function mountDialog(props: { busy?: boolean } = {}) {
  return mount(CommitVersionDialog, {
    props: { open: true, ...props },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { Teleport: true },
    },
  })
}

describe('CommitVersionDialog', () => {
  it('submits a trimmed summary with an optional description', async () => {
    const wrapper = mountDialog()
    await wrapper.get('input').setValue('  Update card layout  ')
    await wrapper.get('textarea').setValue('  Align the back face with the front.  ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[{
      summary: 'Update card layout',
      description: 'Align the back face with the front.',
    }]])
  })

  it('refuses to submit without a summary', async () => {
    const wrapper = mountDialog()
    await wrapper.get('textarea').setValue('Description only')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('refuses submit and dismissal while committing', async () => {
    const wrapper = mountDialog({ busy: true })
    await wrapper.get('input').setValue('Update card layout')
    await wrapper.get('form').trigger('submit')
    wrapper.getComponent({ name: 'OcDialog' }).vm.$emit('request-close')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
