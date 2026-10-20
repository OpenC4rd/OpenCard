import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import OcSlider from './OcSlider.vue'
import { setupGlobalTooltip } from '../../shared/ui/tooltip/globalTooltip'

describe('OcSlider', () => {
  it('supports keyboard preview and commit without a native range input', async () => {
    const wrapper = mount(OcSlider, {
      props: { modelValue: 40, min: 0, max: 100, step: 2 },
    })

    expect(wrapper.find('input[type="range"]').exists()).toBe(false)
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

  it('renders the inner explicit ticks in value order and marks the filled range', () => {
    const wrapper = mount(OcSlider, {
      props: { modelValue: 60, min: 0, max: 100, ticks: [100, 25, 50, 75, 0, 25, -10, Number.NaN] },
    })

    // 两端刻度落在滑轨的圆角端点上，不画刻度。
    const ticks = wrapper.findAll('.oc-slider__tick')
    expect(ticks).toHaveLength(3)
    expect(ticks.map(tick => tick.attributes('style'))).toEqual([
      'left: 25%;', 'left: 50%;', 'left: 75%;',
    ])
    expect(ticks.map(tick => tick.classes().includes('is-filled'))).toEqual([true, true, false])
    expect(wrapper.get('.oc-slider__ticks').attributes('aria-hidden')).toBe('true')
  })

  it('draws no tick when the two ends are the only ticks', () => {
    const wrapper = mount(OcSlider, { props: { modelValue: 50, min: 0, max: 100, ticks: [0, 100] } })

    expect(wrapper.find('.oc-slider__ticks').exists()).toBe(false)
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

  it('puts the thumb and the tick marks on the device pixel grid once the track is measured', async () => {
    let resize: ResizeObserverCallback = () => undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe() {}
      disconnect() {}
    })
    const ratio = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    try {
      const wrapper = mount(OcSlider, {
        props: { modelValue: 50, min: 0, max: 100, ticks: [0, 25, 50, 75, 100], valueText: '50%' },
      })
      resize([{ contentRect: { width: 100 } } as ResizeObserverEntry], {} as ResizeObserver)
      await wrapper.vm.$nextTick()

      // 100px 的一半落在设备像素上；刻度各占一个设备像素（0.5 CSS 像素），并且相位一致。
      expect(wrapper.get('.oc-slider__thumb').attributes('style')).toContain('left: 50px')
      expect(wrapper.findAll('.oc-slider__tick').map(tick => tick.attributes('style'))).toEqual([
        'left: 25.25px; width: 0.5px;',
        'left: 50.25px; width: 0.5px;',
        'left: 75.25px; width: 0.5px;',
      ])
    } finally {
      ratio.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('uses the global tooltip and refreshes its value during keyboard and pointer interaction', async () => {
    vi.useFakeTimers()
    setupGlobalTooltip()
    const wrapper = mount(OcSlider, {
      attachTo: document.body,
      props: { modelValue: 40, valueText: '40%' },
    })
    try {
      const track = wrapper.get('[role="slider"]')
      const layer = document.getElementById('oc-tooltip-layer')!
      await track.trigger('focusin')
      expect(layer.textContent).toBe('40%')
      await track.trigger('keydown', { key: 'ArrowRight' })
      expect(wrapper.emitted('preview')).toEqual([[41]])
      await wrapper.setProps({ modelValue: 41, valueText: '41%' })
      vi.advanceTimersToNextFrame()
      expect(layer.textContent).toBe('41%')

      track.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 70, clientY: 80 }))
      track.element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 90, clientY: 100 }))
      await wrapper.setProps({ valueText: '90%' })
      vi.advanceTimersToNextFrame()
      expect(layer.getAttribute('aria-hidden')).toBe('false')
      expect(layer.textContent).toBe('90%')
      expect(layer.style.left).toBe('100px')
      expect(layer.style.top).toBe('110px')

      await track.trigger('keydown', { key: 'ArrowRight' })
      expect(layer.style.top).toBe('10px')

      await wrapper.setProps({ disabled: true })
      vi.advanceTimersToNextFrame()
      expect(layer.getAttribute('aria-hidden')).toBe('true')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })
})
