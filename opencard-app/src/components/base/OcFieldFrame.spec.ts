import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcFieldFrame from './OcFieldFrame.vue'

describe('OcFieldFrame', () => {
  it('keeps composition slots and forwards root attributes', () => {
    const wrapper = mount(OcFieldFrame, {
      attrs: { class: 'custom-frame', style: 'width: 123px', 'data-test': 'frame' },
      slots: { prefix: 'P', default: '<input />', suffix: 'S' },
    })

    expect(wrapper.classes()).toContain('custom-frame')
    expect(wrapper.attributes('data-test')).toBe('frame')
    expect(wrapper.attributes('style')).toContain('width: 123px')
    expect(wrapper.get('.oc-field-frame__prefix').text()).toBe('P')
    expect(wrapper.get('.oc-field-frame__suffix').text()).toBe('S')
  })

  it('projects shared field states to classes and aria attributes', () => {
    const wrapper = mount(OcFieldFrame, {
      props: { disabled: true, readonly: true, invalid: true, busy: true },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining([
      'oc-field-frame--disabled',
      'oc-field-frame--readonly',
      'oc-field-frame--invalid',
      'oc-field-frame--busy',
    ]))
    expect(wrapper.attributes()).toMatchObject({
      'aria-disabled': 'true',
      'aria-readonly': 'true',
      'aria-invalid': 'true',
      'aria-busy': 'true',
    })
  })

  it('lets a field own its control layout instead of overriding it from outside', () => {
    const wrapper = mount(OcFieldFrame, {
      props: { wrap: true },
      slots: { default: '<input />' },
    })

    expect(wrapper.classes()).toContain('oc-field-frame--wrap')
    // jsdom does not evaluate the scoped stylesheet, so read the source to pin the invariant.
    const source = readFileSync(
      join(process.cwd(), 'src/components/base/OcFieldFrame.vue'),
      'utf8',
    )
    const start = source.indexOf('\n.oc-field-frame--wrap .oc-field-frame__control {')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(source.slice(start, source.indexOf('}', start))).toContain('flex-wrap: wrap')
  })
})
