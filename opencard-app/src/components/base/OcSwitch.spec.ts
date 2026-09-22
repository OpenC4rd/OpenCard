import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcSwitch from './OcSwitch.vue'

describe('OcSwitch', () => {
  it('marks the knob for the stretch animation when the state changes', async () => {
    const wrapper = mount(OcSwitch, { props: { checked: false } })
    const knob = wrapper.get('.oc-switch__thumb')
    expect(knob.classes()).not.toContain('is-toggling')

    await wrapper.setProps({ checked: true })
    await new Promise(resolve => requestAnimationFrame(resolve))
    await wrapper.vm.$nextTick()

    expect(knob.classes()).toContain('is-toggling')

    // 动画播完就摘掉，下一次切换才会重新播。
    await knob.trigger('animationend')
    expect(knob.classes()).not.toContain('is-toggling')
  })

  it('forwards the input state and emits the new value', async () => {
    const wrapper = mount(OcSwitch, { props: { checked: false } })

    await wrapper.get('input').setValue(true)

    expect(wrapper.emitted('update:checked')).toEqual([[true]])
    expect(wrapper.emitted('change')?.[0]?.[0]).toBe(true)
  })
})
