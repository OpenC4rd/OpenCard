import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcSwitch from './OcSwitch.vue'

describe('OcSwitch', () => {
  it('renders a switch and emits the new checked state', async () => {
    const wrapper = mount(OcSwitch, { props: { checked: false } })

    expect(wrapper.get('input').attributes('role')).toBe('switch')

    await wrapper.get('input').setValue(true)

    expect(wrapper.emitted('update:checked')).toEqual([[true]])
    expect(wrapper.emitted('change')?.[0]?.[0]).toBe(true)
  })
})
