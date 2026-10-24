import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CdeOverlayDock from './CdeOverlayDock.vue'

const props = {
  side: 'left' as const,
  extent: 280,
  collapsedExtent: 0,
  minExtent: 280,
  maxExtent: 420,
  expandDragThreshold: 28,
  collapseDragThreshold: 70,
  floatingGap: 6,
  topSize: 240,
  topMinHeight: 160,
  bottomMinHeight: 220,
  splitGap: 8,
  responsiveMinStageWidth: 720,
  widthLabel: 'Resize sidebar',
  widthTooltip: 'Resize sidebar[br]Double-click to toggle',
  splitLabel: 'Resize panels',
}

let resizeCallback: ResizeObserverCallback | null = null

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  resizeCallback = null
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function pointer(element: HTMLElement, type: string, init: PointerEventInit): void {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }))
}

describe('CdeOverlayDock', () => {
  it('settles width drag through the shared extent contract', async () => {
    const wrapper = mount(CdeOverlayDock, {
      props,
      slots: { top: '<section>top</section>', bottom: '<section>bottom</section>' },
    })
    const handle = wrapper.get('[aria-label="Resize sidebar"]').element as HTMLElement
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    })

    pointer(handle, 'pointerdown', { button: 0, pointerId: 1, clientX: 280 })
    await nextTick()
    pointer(handle, 'pointermove', { pointerId: 1, clientX: 200 })
    pointer(handle, 'pointerup', { pointerId: 1, clientX: 200 })
    await nextTick()

    const updates = wrapper.emitted('update:extent') ?? []
    expect(updates[updates.length - 1]).toEqual([0])
    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })

  it('emits a collapse toggle intent on width handle double click', () => {
    const wrapper = mount(CdeOverlayDock, {
      props: { ...props, extent: props.minExtent },
      slots: { top: '<section>top</section>', bottom: '<section>bottom</section>' },
    })
    const handle = wrapper.get('[aria-label="Resize sidebar"]').element as HTMLElement

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1)
  })

  it('uses vertical split semantics and emits an absolute top size', () => {
    const wrapper = mount(CdeOverlayDock, {
      props,
      slots: { top: '<section>top</section>', bottom: '<section>bottom</section>' },
    })
    const splitComponent = wrapper.findAllComponents({ name: 'OcResizeHandle' })[0]
    const handle = wrapper.get('[aria-label="Resize panels"]').element as HTMLElement
    splitComponent?.vm.$emit('resize', { value: 280, delta: 40, event: new KeyboardEvent('keydown') })

    expect(wrapper.emitted('update:top-size')).toContainEqual([280])
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('keeps the measured split origin when the first pointer move arrives', async () => {
    const wrapper = mount(CdeOverlayDock, {
      props,
      slots: { top: '<section>top</section>', bottom: '<section>bottom</section>' },
    })
    const stack = wrapper.get('.cde-overlay-dock__stack').element as HTMLElement
    const topPanel = wrapper.get('.cde-overlay-dock__panel--top').element as HTMLElement
    stack.getBoundingClientRect = () => ({ height: 700 } as DOMRect)
    topPanel.getBoundingClientRect = () => ({ height: 240 } as DOMRect)
    await nextTick()
    await nextTick()

    const handle = wrapper.get('[aria-label="Resize panels"]').element as HTMLElement
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    })
    pointer(handle, 'pointerdown', { button: 0, pointerId: 2, clientY: 240 })
    pointer(handle, 'pointermove', { pointerId: 2, clientY: 250 })

    expect(wrapper.emitted('update:top-size')).toContainEqual([250])
  })

  it('uses the measured split origin when no persisted top size exists', async () => {
    const wrapper = mount(CdeOverlayDock, {
      props: { ...props, topSize: null },
      slots: { top: '<section>top</section>', bottom: '<section>bottom</section>' },
    })
    const stack = wrapper.get('.cde-overlay-dock__stack').element as HTMLElement
    const topPanel = wrapper.get('.cde-overlay-dock__panel--top').element as HTMLElement
    stack.getBoundingClientRect = () => ({ height: 700 } as DOMRect)
    topPanel.getBoundingClientRect = () => ({ height: 240 } as DOMRect)
    await nextTick()
    await nextTick()

    const handle = wrapper.get('[aria-label="Resize panels"]').element as HTMLElement
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    })
    pointer(handle, 'pointerdown', { button: 0, pointerId: 3, clientY: 240 })
    pointer(handle, 'pointermove', { pointerId: 3, clientY: 250 })

    expect(wrapper.emitted('update:top-size')).toContainEqual([250])
  })


  it('auto-collapses in a narrow stage without hiding the resize entry point', () => {
    const wrapper = mount(CdeOverlayDock, {
      props,
      slots: { top: '<section>top</section>', bottom: '<section>bottom</section>' },
    })
    const stage = wrapper.element.parentElement as HTMLElement
    resizeCallback?.([{
      target: stage,
      contentRect: { width: 600 } as DOMRectReadOnly,
    } as unknown as ResizeObserverEntry], {} as ResizeObserver)

    expect(wrapper.emitted('update:extent')).toContainEqual([0])
    expect(wrapper.find('[aria-label="Resize sidebar"]').exists()).toBe(true)
  })

  it('does not echo an unchanged persisted top size from resize observation', () => {
    const wrapper = mount(CdeOverlayDock, {
      props,
      slots: { top: '<section>top</section>', bottom: '<section>bottom</section>' },
    })

    const stack = wrapper.get('.cde-overlay-dock__stack').element as HTMLElement
    const topPanel = wrapper.get('.cde-overlay-dock__panel--top').element as HTMLElement
    stack.getBoundingClientRect = () => ({ height: 700 } as DOMRect)
    topPanel.getBoundingClientRect = () => ({ height: 240 } as DOMRect)
    resizeCallback?.([{ target: stack, contentRect: { height: 700 } as DOMRectReadOnly } as unknown as ResizeObserverEntry], {} as ResizeObserver)

    expect(wrapper.emitted('update:top-size') ?? []).toHaveLength(0)
  })
})
