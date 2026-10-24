import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import OcSelect from './OcSelect.vue'
import OcDialog from './OcDialog.vue'
import OverlayGroupRoot from '../ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'
import { h } from 'vue'

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two', disabled: true },
  { value: 'three', label: 'Three' },
]

describe('OcSelect', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    document.body.innerHTML = ''
  })

  it('dismisses for outside activation and keyboard focus without committing a choice', async () => {
    const wrapper = mount(OcSelect, { attachTo: document.body, props: { modelValue: 'one', options } })
    const outside = document.createElement('button')
    document.body.append(outside)
    try {
      const trigger = wrapper.get('.oc-select__trigger')
      await trigger.trigger('click')
      await flushPromises()
      expect(document.querySelector('.oc-select__listbox')).not.toBeNull()

      outside.click()
      await flushPromises()
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.querySelector('.oc-select__listbox')).toBeNull()

      await trigger.trigger('click')
      await flushPromises()
      outside.focus()
      await flushPromises()
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(wrapper.emitted('commit')).toBeUndefined()
    } finally { wrapper.unmount(); outside.remove() }
  })

  it('commits a real option inside a modal dialog', async () => {
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
      document.body.querySelector<HTMLButtonElement>('.oc-select__trigger')!.click()
      await flushPromises()
      document.body.querySelectorAll<HTMLButtonElement>('.oc-select__option')[2]!.click()
      await flushPromises()

      expect(selected).toEqual(['three'])
    } finally {
      wrapper.unmount()
    }
  })

  it('opens a listbox and commits the selected option', async () => {
    const wrapper = mount(OcSelect, {
      props: { modelValue: 'one', options },
      attachTo: document.body,
    })

    await wrapper.get('.oc-select__trigger').trigger('click')
    await flushPromises()
    document.body.querySelectorAll<HTMLButtonElement>('.oc-select__option')[2]!.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([['three']])
    expect(wrapper.emitted('commit')).toEqual([['three']])
    expect(wrapper.get('.oc-select__trigger').attributes('aria-expanded')).toBe('false')
    expect(document.querySelector('.oc-select__listbox')).toBeNull()
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
    expect(document.querySelector('.oc-select__listbox')).toBeNull()
  })
})
