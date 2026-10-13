import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OcAutocompletePopover from './OcAutocompletePopover.vue'

class ResizeObserverStub {
  observe = vi.fn()
  disconnect = vi.fn()
}

describe('OcAutocompletePopover', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', ResizeObserverStub))

  afterEach(() => {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('scrolls the active option into the nearest visible area', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const anchor = document.createElement('input')
    document.body.appendChild(anchor)

    const wrapper = mount(OcAutocompletePopover, {
      attachTo: document.body,
      props: {
        id: 'test-autocomplete',
        open: true,
        anchor,
        activeKey: 'first',
        items: [
          { key: 'first', label: 'First' },
          { key: 'last', label: 'Last' },
        ],
      },
    })

    await wrapper.setProps({ activeKey: 'last' })
    await nextTick()

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    wrapper.unmount()
  })
  it('keeps details selectable when switching between stacked and inline layouts', async () => {
    const anchor = document.createElement('input')
    document.body.appendChild(anchor)
    const wrapper = mount(OcAutocompletePopover, {
      attachTo: document.body,
      props: {
        id: 'details-autocomplete', open: true, anchor, activeKey: 'first',
        items: [{ key: 'first', label: 'Name', detail: 'Path' }],
      },
    })
    const option = () => document.querySelector<HTMLElement>('#details-autocomplete [role="option"]')!
    expect(option().textContent).toContain('Name')
    expect(option().textContent).toContain('Path')
    await wrapper.setProps({ detailLayout: 'inline' })
    expect(option().textContent).toContain('Name')
    expect(option().textContent).toContain('Path')
    option().dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
    expect(wrapper.emitted('select')).toEqual([['first']])
    wrapper.unmount()
  })
})
