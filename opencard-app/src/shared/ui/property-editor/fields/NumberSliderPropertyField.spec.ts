import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import NumberSliderPropertyField from './NumberSliderPropertyField.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

type SliderFieldDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'number' }>

function mountField(definition: SliderFieldDefinition, value: unknown) {
  return mount(NumberSliderPropertyField, { props: { definition, value } })
}

describe('NumberSliderPropertyField', () => {


  it('keeps the readout in step with the thumb and forwards both events', async () => {
    const wrapper = mountField(
      { title: 'Width', fieldType: 'number', presentation: 'slider', min: 0, max: 100 },
      '12',
    )
    const slider = wrapper.findComponent({ name: 'OcSlider' })

    slider.vm.$emit('preview', 30)
    await nextTick()
    expect(wrapper.get('.oc-slider__readout').text()).toBe('30')
    expect(wrapper.get('.oc-slider__track').attributes('aria-valuenow')).toBe('30')
    expect(wrapper.emitted('preview:value')).toEqual([['30']])

    slider.vm.$emit('commit', 30)
    await nextTick()
    expect(wrapper.emitted('update:value')).toEqual([['30']])
  })


})
