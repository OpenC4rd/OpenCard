import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFloatingMenu } from '../../composables/useFloatingMenu'
import FloatingMenuHost from './FloatingMenuHost.vue'
import OcDialog from '../standard/OcDialog.vue'

describe('FloatingMenuHost pointer dismissal', () => {
  afterEach(() => {
    useFloatingMenu().closeMenu()
    vi.useRealTimers()
  })

  it('closes after the pointer moves beyond the menu safety distance', async () => {
    vi.useFakeTimers()
    const wrapper = mount(FloatingMenuHost, { attachTo: document.body })
    const menu = useFloatingMenu()
    menu.openMenu({
      anchor: new DOMRect(10, 10, 0, 0),
      items: [{ key: 'rename', title: 'Rename' }],
    })
    await nextTick()

    const surface = document.querySelector<HTMLElement>('.floating-menu-surface')!
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(10, 10, 120, 80),
    )
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300 }))
    vi.advanceTimersByTime(181)

    expect(menu.state.value.isOpen).toBe(false)
    wrapper.unmount()
  })

  it('cancels pending dismissal when the pointer returns near the menu', async () => {
    vi.useFakeTimers()
    const wrapper = mount(FloatingMenuHost, { attachTo: document.body })
    const menu = useFloatingMenu()
    menu.openMenu({
      anchor: new DOMRect(10, 10, 0, 0),
      items: [{ key: 'rename', title: 'Rename' }],
    })
    await nextTick()

    const surface = document.querySelector<HTMLElement>('.floating-menu-surface')!
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(10, 10, 120, 80),
    )
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300 }))
    vi.advanceTimersByTime(100)
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 132, clientY: 50 }))
    vi.advanceTimersByTime(100)

    expect(menu.state.value.isOpen).toBe(true)
    wrapper.unmount()
  })

  it('selects a leaf through arbitrarily nested teleported context menus', async () => {
    const onSelect = vi.fn()
    const wrapper = mount(FloatingMenuHost, { attachTo: document.body })
    const dialog = mount(OcDialog, {
      attachTo: document.body,
      props: { open: true, title: 'Context menu owner' },
      slots: { default: '<button class="context-target">Open menu</button>' },
      global: { stubs: { transition: false } },
    })
    await nextTick()
    const backdrop = document.body.querySelector<HTMLElement>('.oc-dialog__backdrop')!
    const target = backdrop.querySelector<HTMLElement>('.context-target')!
    const menu = useFloatingMenu()
    target.addEventListener('contextmenu', event => menu.openContextMenu({
      event,
      items: [{
        key: 'level-1',
        title: 'Level 1',
        children: [{
          key: 'level-2',
          title: 'Level 2',
          children: [{
            key: 'level-3',
            title: 'Level 3',
            children: [{ key: 'leaf', title: 'Leaf' }],
          }],
        }],
      }],
      onSelect,
    }))
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    await nextTick()

    for (let depth = 1; depth < 4; depth += 1) {
      const layers = document.body.querySelectorAll<HTMLElement>('.oc-floating-layer')
      layers[layers.length - 1]?.querySelector<HTMLElement>('.oc-action-menu__item')
        ?.dispatchEvent(new Event('pointerenter'))
      await flushPromises()
    }

    const leafButton = document.body.querySelector<HTMLButtonElement>(
      '.oc-action-menu__button[aria-label="Leaf"]',
    )
    expect(leafButton).not.toBeNull()
    expect(Array.from(document.body.querySelectorAll('.oc-floating-layer'))
      .every(layer => layer.parentElement === backdrop)).toBe(true)
    leafButton?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
    await flushPromises()
    expect(leafButton?.isConnected).toBe(true)

    leafButton?.click()
    await flushPromises()
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('leaf')
    expect(menu.state.value.isOpen).toBe(false)
    wrapper.unmount()
    dialog.unmount()
  })
})
