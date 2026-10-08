import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcSelect from './OcSelect.vue'
import OcDialog from './OcDialog.vue'
import { h } from 'vue'

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two', disabled: true },
  { value: 'three', label: 'Three' },
]

describe('OcSelect', () => {
  it('keeps a modal dropdown inside its owner and commits its real option', async () => {
    const selected = [] as string[]
    const wrapper = mount(OcDialog, {
      attachTo: document.body,
      props: { open: true, title: 'Choose' },
      slots: { default: () => h(OcSelect, {
        modelValue: 'one', options,
        'onUpdate:modelValue': value => selected.push(String(value)),
      }) },
      global: { stubs: { transition: false } },
    })
    try {
      await wrapper.vm.$nextTick()
      const backdrop = document.body.querySelector('.oc-dialog__backdrop')!
      backdrop.querySelector<HTMLButtonElement>('.oc-select__trigger')!.click()
      await wrapper.vm.$nextTick()
      const layer = backdrop.querySelector('.oc-floating-layer')!
      expect(layer.parentElement).toBe(backdrop)
      layer.querySelectorAll<HTMLButtonElement>('.oc-select__option')[2]!.click()
      await wrapper.vm.$nextTick()
      expect(selected).toEqual(['three'])
    } finally {
      wrapper.unmount()
    }
  })
  it('opens a themed listbox and commits a selected option', async () => {
    const wrapper = mount(OcSelect, {
      props: { modelValue: 'one', options },
      attachTo: document.body,
    })

    await wrapper.get('.oc-select__trigger').trigger('click')
    const option = document.body.querySelectorAll<HTMLButtonElement>('.oc-select__option')[2]!
    option.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([['three']])
    expect(wrapper.emitted('commit')).toEqual([['three']])
    expect(wrapper.get('.oc-select__trigger').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('skips disabled options during keyboard navigation', async () => {
    const wrapper = mount(OcSelect, {
      props: { modelValue: 'one', options },
      attachTo: document.body,
    })
    const trigger = wrapper.get('.oc-select__trigger')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')).toEqual([['three']])
    wrapper.unmount()
  })

  it('keeps readonly controls focusable without opening them', async () => {
    const wrapper = mount(OcSelect, {
      props: { modelValue: 'one', options, readonly: true },
    })

    await wrapper.get('.oc-select__trigger').trigger('click')
    expect(wrapper.get('.oc-select__trigger').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.oc-select__trigger').attributes('aria-expanded')).toBe('false')
  })

  it('renders selected and menu labels with the option presentation style', async () => {
    const wrapper = mount(OcSelect, {
      props: {
        modelValue: 'brand',
        options: [{
          value: 'brand',
          label: 'Brand',
          labelStyle: { fontFamily: 'Brand Preview' },
        }],
      },
      attachTo: document.body,
    })

    expect((wrapper.get('.oc-select__value').element as HTMLElement).style.fontFamily).toBe('"Brand Preview"')
    await wrapper.get('.oc-select__trigger').trigger('click')
    expect((document.body.querySelector('.oc-select__option-label') as HTMLElement).style.fontFamily)
      .toBe('"Brand Preview"')
    wrapper.unmount()
  })
})
