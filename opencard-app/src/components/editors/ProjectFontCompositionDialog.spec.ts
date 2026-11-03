import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ProjectFontCompositionDialog from './ProjectFontCompositionDialog.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const fonts = [
  { key: 'latin', name: 'Latin', files: { normal: { upright: 'fonts/Latin.woff2' } } },
  { key: 'cjk', name: 'CJK', files: { normal: { upright: 'fonts/CJK.woff2' } } },
]

describe('ProjectFontCompositionDialog', () => {
  it('submits the ordered fontKey members', async () => {
    const wrapper = mount(ProjectFontCompositionDialog, {
      props: { open: true, families: fonts, compositions: [] },
      global: { stubs: { Teleport: true, OcAutocompleteList: true } },
    })

    await wrapper.findAll('input')[0]!.setValue('Body')
    const input = wrapper.get('[role="combobox"]')
    await input.setValue('CJK')
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ members: [{ fontKey: 'cjk' }] })
  })

  it('closes only the member suggestions on Escape, not the dialog', async () => {
    const wrapper = mount(ProjectFontCompositionDialog, {
      attachTo: document.body,
      props: { open: true, families: fonts, compositions: [] },
    })
    await nextTick()
    const input = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!
    input.dispatchEvent(new FocusEvent('focus'))
    await nextTick()
    expect(input.getAttribute('aria-expanded')).toBe('true')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()

    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
