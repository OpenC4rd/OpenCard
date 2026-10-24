import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OcResizeHandle from './OcResizeHandle.vue'

function mountHandle(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(OcResizeHandle, {
    props: {
      minimum: 120,
      maximum: 480,
      value: 240,
      label: 'Resize panel',
      ...overrides,
    },
  })
  const element = wrapper.element as HTMLElement
  Object.defineProperties(element, {
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: vi.fn(() => true) },
    releasePointerCapture: { value: vi.fn() },
  })
  return { element, wrapper }
}

function dispatchPointer(element: HTMLElement, type: string, init: PointerEventInit): void {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }))
}

afterEach(() => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})

describe('OcResizeHandle', () => {
  it('converts pixel movement to layout weights and restores them on cancel', () => {
    const { element, wrapper } = mountHandle({ minimum: 0, maximum: 2, value: 1, unitsPerPixel: 0.005 })
    dispatchPointer(element, 'pointerdown', { button: 0, pointerId: 2, clientY: 200 })
    dispatchPointer(element, 'pointermove', { pointerId: 2, clientY: 250 })
    dispatchPointer(element, 'pointercancel', { pointerId: 2, clientY: 250 })
    expect(wrapper.emitted('update:value')).toEqual([[1.25], [1]])
    wrapper.unmount()
  })

  it('exposes separator orientation and value boundaries', () => {
    const { element } = mountHandle({ orientation: 'vertical' })

    expect(element.getAttribute('role')).toBe('separator')
    expect(element.getAttribute('aria-orientation')).toBe('vertical')
    expect(element.getAttribute('aria-valuemin')).toBe('120')
    expect(element.getAttribute('aria-valuemax')).toBe('480')
    expect(element.getAttribute('aria-valuenow')).toBe('240')
    expect(element.getAttribute('aria-label')).toBe('Resize panel')
  })

  it('uses pointer capture and restores body state after a horizontal separator drag', async () => {
    const { element, wrapper } = mountHandle()
    const setPointerCapture = element.setPointerCapture as ReturnType<typeof vi.fn>

    dispatchPointer(element, 'pointerdown', { button: 0, pointerId: 3, clientY: 100 })
    dispatchPointer(element, 'pointermove', { pointerId: 3, clientY: 180 })

    expect(setPointerCapture).toHaveBeenCalledWith(3)
    expect(document.body.style.cursor).toBe('row-resize')
    expect(wrapper.emitted('update:value')).toEqual([[320]])

    dispatchPointer(element, 'pointerup', { pointerId: 3, clientY: 180 })

    expect(wrapper.emitted('resize-end')).toHaveLength(1)
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  it('mirrors pointer and keyboard direction when requested', async () => {
    const { element, wrapper } = mountHandle({ orientation: 'vertical', direction: 'reverse', step: 20 })

    dispatchPointer(element, 'pointerdown', { button: 0, pointerId: 4, clientX: 200 })
    dispatchPointer(element, 'pointermove', { pointerId: 4, clientX: 240 })
    expect(wrapper.emitted('update:value')).toEqual([[200]])
    dispatchPointer(element, 'pointercancel', { pointerId: 4, clientX: 240 })

    await wrapper.trigger('keydown', { key: 'ArrowLeft' })
    const afterArrow = wrapper.emitted('update:value') ?? []
    expect(afterArrow[afterArrow.length - 1]).toEqual([260])
    await wrapper.trigger('keydown', { key: 'End' })
    const afterEnd = wrapper.emitted('update:value') ?? []
    expect(afterEnd[afterEnd.length - 1]).toEqual([480])
  })

  it('cancels an active drag with Escape and restores its start value', async () => {
    const { element, wrapper } = mountHandle()

    dispatchPointer(element, 'pointerdown', { button: 0, pointerId: 8, clientY: 100 })
    dispatchPointer(element, 'pointermove', { pointerId: 8, clientY: 220 })
    await wrapper.trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('update:value')).toEqual([[360], [240]])
    expect(wrapper.emitted('resize-cancel')).toHaveLength(1)
    expect(document.body.style.cursor).toBe('')
  })

  it('cleans pointer state when unmounted during a drag', async () => {
    const { element, wrapper } = mountHandle()

    dispatchPointer(element, 'pointerdown', { button: 0, pointerId: 9, clientY: 100 })
    expect(document.body.style.userSelect).toBe('none')

    wrapper.unmount()

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })
})