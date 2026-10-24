import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcCheckbox from './OcCheckbox.vue'

describe('OcCheckbox', () => {
  it('reports the mixed state over a checked value', () => {
    const wrapper = mount(OcCheckbox, { props: { checked: true, indeterminate: true } })
    const input = wrapper.get('input')

    expect((input.element as HTMLInputElement).indeterminate).toBe(true)
    expect(input.attributes('aria-checked')).toBe('mixed')
  })
})
