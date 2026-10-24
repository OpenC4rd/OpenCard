import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NumberPropertyField from './NumberPropertyField.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

type NumberFieldDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'number' }>

function mountField(definition: NumberFieldDefinition, value: string) {
  return mount(NumberPropertyField, { props: { definition, value } })
}

describe('NumberPropertyField', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clamps a stepped value to the schema range and stops at its bounds', async () => {
    const wrapper = mountField({ title: 'Number', fieldType: 'number', min: 0, max: 2 }, '1.9')

    await wrapper.get('button[aria-label="Increase"]').trigger('click')
    await wrapper.setProps({ value: '2' })
    await wrapper.get('button[aria-label="Increase"]').trigger('click')
    await wrapper.setProps({ value: '0.1' })
    await wrapper.get('button[aria-label="Decrease"]').trigger('click')
    await wrapper.setProps({ value: '0' })
    await wrapper.get('button[aria-label="Decrease"]').trigger('click')

    expect(wrapper.emitted('update:value')).toEqual([['2'], ['0']])
  })

  it('preserves invalid text for RenderParser diagnostics', async () => {
    const wrapper = mountField({ title: 'Number', fieldType: 'number' }, 'invalid')

    expect(wrapper.get('input').element.value).toBe('invalid')
    await wrapper.get('input').setValue('12oops')
    expect(wrapper.emitted('update:value')).toEqual([['12oops']])
  })

  it('multiplies click and hold steps by five while Shift is pressed', async () => {
    const wrapper = mountField({ title: 'Number', fieldType: 'number' }, '1')

    await wrapper.get('button[aria-label="Increase"]').trigger('click', { shiftKey: true })
    expect(wrapper.emitted('update:value')).toEqual([['6']])
  })

  it('uses the schema decimal step', async () => {
    const wrapper = mountField({ title: 'Scale', fieldType: 'number', min: 0.1, step: 0.1 }, '1')

    await wrapper.get('button[aria-label="Increase"]').trigger('click')
    await wrapper.get('button[aria-label="Decrease"]').trigger('click')
    expect(wrapper.emitted('update:value')).toEqual([['1.1'], ['0.9']])
  })

  it('rounds step writes and valid blurred input to at most three decimal places', async () => {
    const wrapper = mountField({ title: 'Scale', fieldType: 'number', step: 0.1 }, '9.6')

    await wrapper.get('button[aria-label="Increase"]').trigger('click')
    const input = wrapper.get('input')
    await input.setValue('1.2345')
    await input.trigger('blur')
    await input.setValue('-1.2345')
    await input.trigger('blur')

    expect(wrapper.emitted('update:value')).toEqual([
      ['9.7'],
      ['1.2345'],
      ['1.235'],
      ['-1.2345'],
      ['-1.235'],
    ])
  })

  it('keeps empty, incomplete, and diagnostic text unchanged on blur', async () => {
    const wrapper = mountField({ title: 'Number', fieldType: 'number' }, '')
    const input = wrapper.get('input')

    await input.setValue('-')
    await input.trigger('blur')
    await input.setValue('{{self:value}}')
    await input.trigger('blur')

    expect(wrapper.emitted('update:value')).toEqual([['-'], ['{{self:value}}']])
  })

  it('steps between allowed values', async () => {
    const wrapper = mountField(
      { title: 'Factor', fieldType: 'number', min: 1, max: 12, allowedValues: [1, 2, 3, 4, 6, 12] },
      '4',
    )

    await wrapper.get('button[aria-label="Increase"]').trigger('click')
    await wrapper.get('button[aria-label="Decrease"]').trigger('click')
    expect(wrapper.emitted('update:value')).toEqual([['6'], ['3']])
  })

  it('accelerates repeated steps while held and stops on release', async () => {
    vi.useFakeTimers()
    const wrapper = mountField({ title: 'Number', fieldType: 'number' }, '0')
    const increase = wrapper.get('button[aria-label="Increase"]')

    await increase.trigger('pointerdown')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
    await vi.advanceTimersByTimeAsync(420)
    const afterDelay = wrapper.emitted('update:value')?.length ?? 0
    await vi.advanceTimersByTimeAsync(900)
    const afterFirstWindow = wrapper.emitted('update:value')?.length ?? 0
    await vi.advanceTimersByTimeAsync(900)
    const afterSecondWindow = wrapper.emitted('update:value')?.length ?? 0

    expect(afterDelay).toBe(1)
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['5'])
    expect(afterSecondWindow - afterFirstWindow).toBeGreaterThan(afterFirstWindow - afterDelay)

    window.dispatchEvent(new Event('pointerup'))
    const afterRelease = wrapper.emitted('update:value')?.length ?? 0
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.emitted('update:value')).toHaveLength(afterRelease)
  })
})
