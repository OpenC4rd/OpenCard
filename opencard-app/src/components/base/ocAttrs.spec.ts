import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcCheckbox from './OcCheckbox.vue'
import OcSwitch from './OcSwitch.vue'

describe('OC attribute forwarding', () => {
  it('keeps checkbox layout attrs on the label and form attrs on the input', () => {
    const wrapper = mount(OcCheckbox, {
      attrs: { class: 'consumer-class', style: 'width: 20px', name: 'enabled', 'aria-label': 'Enabled' },
    })

    expect(wrapper.classes()).toContain('consumer-class')
    expect(wrapper.attributes('style')).toContain('width: 20px')
    expect(wrapper.get('input').attributes('name')).toBe('enabled')
    expect(wrapper.get('input').attributes('aria-label')).toBe('Enabled')
  })

  it('projects the checkbox mixed state over a checked value', () => {
    const wrapper = mount(OcCheckbox, { props: { checked: true, indeterminate: true } })
    const input = wrapper.get('input')

    expect((input.element as HTMLInputElement).indeterminate).toBe(true)
    expect(input.attributes('aria-checked')).toBe('mixed')
  })

  it('forwards Switch layout attrs and emits its checked state', async () => {
    const wrapper = mount(OcSwitch, {
      attrs: { class: 'consumer-class', style: 'width: 40px', name: 'enabled', 'aria-label': 'Enabled' },
    })

    expect(wrapper.classes()).toContain('consumer-class')
    expect(wrapper.attributes('style')).toContain('width: 40px')
    expect(wrapper.get('input').attributes()).toMatchObject({
      name: 'enabled',
      'aria-label': 'Enabled',
      role: 'switch',
    })

    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:checked')).toEqual([[true]])
    expect(wrapper.emitted('change')?.[0]?.[0]).toBe(true)
  })

})
