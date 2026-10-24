import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StringPropertyField from './StringPropertyField.vue'

describe('StringPropertyField', () => {
  it('steps through every string enum option in schema order', async () => {
    const wrapper = mount(StringPropertyField, {
      props: {
        value: 'standard',
        definition: {
          title: 'Quality',
          fieldType: 'string',
          options: ['preview', 'standard', 'high', 'ultra', 'custom'],
          presentation: 'stepper',
        },
      },
    })

    await wrapper.get('button[aria-label="Previous option"]').trigger('click')
    await wrapper.get('button[aria-label="Next option"]').trigger('click')
    expect(wrapper.emitted('update:value')).toEqual([['preview'], ['high']])
  })

  it('accepts the prepared completion with Tab', async () => {
    const wrapper = mount(StringPropertyField, {
      props: {
        value: '12p',
        definition: {
          title: 'Width',
          fieldType: 'string',
          completion: {
            static: { values: ['px', '%'], presentation: 'ghost' },
          },
        },
      },
    })

    await wrapper.get('input').trigger('keydown', { key: 'Tab' })
    expect(wrapper.emitted('update:value')).toEqual([['12px']])
  })

  it('commits deferred text on blur and cancels it with Escape', async () => {
    const wrapper = mount(StringPropertyField, {
      props: {
        value: 'before',
        definition: { title: 'Name', fieldType: 'string', commitMode: 'blur' },
      },
    })
    const input = wrapper.get('input')
    await input.setValue('after')
    expect(wrapper.emitted('update:value')).toBeUndefined()
    await input.trigger('blur')
    expect(wrapper.emitted('update:value')).toEqual([['after']])

    await wrapper.setProps({ value: 'after' })
    await input.setValue('cancelled')
    await input.trigger('keydown', { key: 'Escape' })
    expect((input.element as HTMLInputElement).value).toBe('after')
    expect(wrapper.emitted('update:value')).toEqual([['after']])
  })
})
