import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcJsonEditor from './OcJsonEditor.vue'

describe('OcJsonEditor', () => {
  it('formats the value and emits parsed JSON on edit', async () => {
    const wrapper = mount(OcJsonEditor, {
      props: {
        modelValue: {
          name: 'OpenCard',
          enabled: true,
        },
      },
    })

    const textarea = wrapper.get('textarea')
    const initialValue = (textarea.element as HTMLTextAreaElement).value
    expect(initialValue).toContain('"name": "OpenCard"')

    await textarea.setValue('{\n  "name": "Sample",\n  "enabled": false\n}')

    const payloads = wrapper.emitted('update:modelValue')
    expect(payloads?.[payloads.length - 1]?.[0]).toEqual({
      name: 'Sample',
      enabled: false,
    })
  })

  it('keeps an invalid draft and reports it instead of emitting', async () => {
    const wrapper = mount(OcJsonEditor, {
      props: {
        modelValue: {
          name: 'OpenCard',
        },
      },
    })

    await wrapper.get('textarea').setValue('{')

    expect(wrapper.text()).toContain('Invalid JSON')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
