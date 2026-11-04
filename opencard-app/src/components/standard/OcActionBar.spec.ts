import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OcActionBar from './OcActionBar.vue'
import OverlayGroupRoot from '../ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'
import type { OcActionBarItem } from '../../shared/ui/action/action.types'

const ACTIONS: OcActionBarItem[] = ['a', 'b', 'c', 'd', 'e'].map(key => ({ key, title: key.toUpperCase(), icon: 'mdiPlus' }))

/** jsdom 没有布局：条高 30、宽 barWidth，每一项 itemWidth 宽。 */
function stubLayout(barWidth: number, itemWidth: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 0, this.classList.contains('oc-action-bar') ? barWidth : itemWidth, 30)
  })
}

describe('OcActionBar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('marks every action with its key and toggles with aria-pressed', () => {
    const wrapper = mount(OcActionBar, {
      props: { items: [{ key: 'snap', icon: 'mdiMagnet', active: true }, { key: 'plain', icon: 'mdiPlus' }] },
    })
    expect(wrapper.get('[data-action-key="snap"] button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-action-key="plain"] button').attributes('aria-pressed')).toBeUndefined()
  })

  it('hides itself for an empty item list', () => {
    expect(mount(OcActionBar, { props: { items: [] } }).get('.oc-action-bar').isVisible()).toBe(false)
  })

  it('folds what does not fit into a more button, keeping the leading actions', async () => {
    stubLayout(100, 30)

    const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: ACTIONS.slice(0, 4) } })
    await wrapper.setProps({ items: ACTIONS })
    await flushPromises()

    const shown = wrapper.findAll('[data-action-key]').map(node => node.attributes('data-action-key'))
    expect(shown).toEqual(['a', 'b', '__oc-action-bar-more__'])
  })

  it('folds by a fixed budget without measuring', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    const wrapper = mount(OcActionBar, { props: { items: ACTIONS, overflow: 3 } })
    const shown = wrapper.findAll('[data-action-key]').map(node => node.attributes('data-action-key'))
    expect(shown).toEqual(['a', 'b', '__oc-action-bar-more__'])
    expect(rect).not.toHaveBeenCalled()
  })

  it('does not measure again when a caller passes an equal new array', async () => {
    const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: ACTIONS } })
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    await wrapper.setProps({ items: ACTIONS.map(item => (typeof item === 'object' ? { ...item } : item)) })
    await flushPromises()
    expect(rect).not.toHaveBeenCalled()
  })

  it('keeps everything when the content exactly fills the bar', async () => {
    stubLayout(90.4, 30.2)
    const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: ACTIONS.slice(0, 2) } })
    await wrapper.setProps({ items: ACTIONS.slice(0, 3) })
    await flushPromises()

    expect(wrapper.find('[data-action-key="__oc-action-bar-more__"]').exists()).toBe(false)
  })

  it('moves focus between buttons with the arrow keys', async () => {
    const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: ACTIONS.slice(0, 3) } })
    const buttons = wrapper.findAll('button')
    buttons[0]!.element.focus()
    await buttons[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons[1]!.element)
    await buttons[1]!.trigger('keydown', { key: 'ArrowLeft' })
    await buttons[0]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(buttons[2]!.element)
  })

  describe('menubar', () => {
    const MENUS: OcActionBarItem[] = [
      { key: 'file', title: 'File', children: [{ key: 'open', title: 'Open' }] },
      { key: 'edit', title: 'Edit', children: [{ key: 'undo', title: 'Undo', children: [{ key: 'redo', title: 'Redo' }] }] },
    ]
    let overlayRoot: ReturnType<typeof mount> | null = null

    beforeEach(() => {
      overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
    })

    afterEach(() => {
      overlayRoot?.unmount()
      overlayRoot = null
      for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    })

    function menuItem(label: string): HTMLElement {
      return document.body.querySelector<HTMLElement>(`[role="menuitem"][aria-label="${label}"]`)!
    }

    it('toggles on click and reports the menu the action came from', async () => {
      const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: MENUS, menubar: true } })
      const file = wrapper.get('[data-action-key="file"]')
      await file.trigger('click')
      await flushPromises()
      expect(file.attributes('aria-expanded')).toBe('true')

      menuItem('Open').click()
      await flushPromises()
      expect(wrapper.emitted('select')).toEqual([[{ key: 'open', rootKey: 'file' }]])
      expect(file.attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    it('routes an action picked from the more menu back to its own menu', async () => {
      stubLayout(70, 40)
      const leafMenus: OcActionBarItem[] = [
        { key: 'file', title: 'File', children: [{ key: 'new', title: 'New' }] },
        { key: 'edit', title: 'Edit', children: [{ key: 'open', title: 'Open' }] },
      ]

      const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: [], menubar: true } })
      await wrapper.setProps({ items: leafMenus })
      await flushPromises()
      expect(wrapper.find('[data-action-key="edit"]').exists()).toBe(false)

      await wrapper.get('[data-action-key="__oc-action-bar-more__"]').trigger('click')
      await flushPromises()
      menuItem('Edit').closest('.oc-action-menu__item')?.dispatchEvent(new Event('pointerenter'))
      await flushPromises()
      menuItem('Open').click()
      await flushPromises()

      expect(wrapper.emitted('select')).toEqual([[{ key: 'open', rootKey: 'edit' }]])
      wrapper.unmount()
    })

    it('closes on Escape while focus is outside the menu', async () => {
      const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: MENUS, menubar: true } })
      const file = wrapper.get('[data-action-key="file"]')
      await file.trigger('click')
      await flushPromises()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(file.attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    it('closes when the open menu disappears', async () => {
      const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: MENUS, menubar: true } })
      await wrapper.get('[data-action-key="edit"]').trigger('click')
      await flushPromises()
      await wrapper.setProps({ items: MENUS.slice(0, 1) })
      await flushPromises()
      expect(overlayGroups.get('menu')?.visible).toBeFalsy()
      wrapper.unmount()
    })
  })
})
