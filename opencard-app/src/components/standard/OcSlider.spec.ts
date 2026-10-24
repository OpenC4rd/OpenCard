import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import OcSlider from './OcSlider.vue'

describe('OcSlider', () => {
  it('supports keyboard preview and commit', async () => {
    const wrapper = mount(OcSlider, {
      props: { modelValue: 40, min: 0, max: 100, step: 2 },
    })

    await wrapper.get('.oc-slider__track').trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.emitted('preview')).toEqual([[42]])
    expect(wrapper.emitted('update:modelValue')).toEqual([[42]])
    expect(wrapper.emitted('commit')).toEqual([[42]])
    expect(wrapper.get('.oc-slider__track').attributes('aria-valuenow')).toBe('42')
  })

  it('keeps its slider semantics and value text on the interactive track', () => {
    const wrapper = mount(OcSlider, {
      props: { modelValue: 40, valueText: '40%', 'aria-label': 'Opacity' },
    })

    const track = wrapper.get('.oc-slider__track')
    expect(track.attributes('role')).toBe('slider')
    expect(track.attributes('aria-label')).toBe('Opacity')
    expect(track.attributes('aria-valuetext')).toBe('40%')
    expect(track.attributes('aria-valuemin')).toBe('0')
    expect(track.attributes('aria-valuemax')).toBe('100')
  })

  it('does not interact while disabled', async () => {
    const wrapper = mount(OcSlider, {
      props: { modelValue: 40, disabled: true },
    })
    await wrapper.get('.oc-slider__track').trigger('keydown', { key: 'End' })

    expect(wrapper.emitted('preview')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('commit')).toBeUndefined()
    expect(wrapper.get('.oc-slider__track').attributes('tabindex')).toBe('-1')
  })

  it('snaps pointer interaction to the nearest explicit tick', async () => {
    const wrapper = mount(OcSlider, {
      props: { modelValue: 40, min: 0, max: 100, ticks: [0, 25, 50, 75, 100] },
    })
    const track = wrapper.get('.oc-slider__track').element as HTMLElement
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 100, width: 100, top: 0, bottom: 4, height: 4,
      x: 0, y: 0, toJSON: () => ({}),
    })

    const event = new Event('pointerdown', { bubbles: true }) as PointerEvent
    Object.defineProperties(event, {
      button: { value: 0 }, pointerId: { value: 1 }, clientX: { value: 47 },
    })
    track.dispatchEvent(event)

    expect(wrapper.emitted('preview')).toEqual([[50]])
  })
})
