import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OcAutocompletePopover from './OcAutocompletePopover.vue'
import OcOverflowText from './OcOverflowText.vue'

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

  it('opts project-icon thumbnails into the shared project-icon renderer', () => {
    const anchor = document.createElement('input')
    document.body.appendChild(anchor)
    const wrapper = mount(OcAutocompletePopover, {
      attachTo: document.body,
      props: {
        id: 'icon-autocomplete', open: true, anchor, activeKey: 'icon',
        items: [{
          key: 'icon', label: 'Icon',
          thumbnailStyle: { '--oc-project-icon-renderer': 'mask' },
        }],
      },
    })
    expect(document.body.querySelector('.oc-autocomplete-popover__thumbnail')?.classList)
      .toContain('oc-project-icon')
    wrapper.unmount()
  })

  it('renders the detail as the row subtitle and activates both overflow texts', () => {
    const anchor = document.createElement('input')
    document.body.appendChild(anchor)
    const wrapper = mount(OcAutocompletePopover, {
      attachTo: document.body,
      props: {
        id: 'text-autocomplete', open: true, anchor, activeKey: 'long',
        items: [{ key: 'long', label: 'Long title', detail: 'Long subtitle' }],
      },
    })

    const option = document.body.querySelector('.oc-autocomplete-popover__option')!
    expect(option.classList).toContain('oc-row')
    expect(option.querySelector('.oc-row__subtitle')?.textContent).toContain('Long subtitle')
    const textControls = wrapper.findAllComponents(OcOverflowText)
    expect(textControls.map(control => control.props('text'))).toEqual(['Long title', 'Long subtitle'])
    expect(textControls.every(control => control.props('active') === true)).toBe(true)
    const detail = document.body.querySelector<HTMLElement>('.oc-autocomplete-popover__detail')!
    expect(detail.classList).toContain('oc-overflow-text')
    expect(textControls[1]?.props('align')).toBe('right')
    expect(detail.style.textAlign).toBe('right')
    wrapper.unmount()
  })
})
