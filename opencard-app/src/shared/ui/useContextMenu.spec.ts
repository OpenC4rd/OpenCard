import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import OcContextMenu from '../../components/standard/OcContextMenu.vue'
import OverlayGroupRoot from '../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'
import type { OcActionMenuEntry } from './action/action.types'
import { useContextMenu, type ContextMenu } from './useContextMenu'

const ITEMS = [{ key: 'rename', title: 'Rename' }, { key: 'delete', title: 'Delete' }]

describe('useContextMenu', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null
  const hosts: ReturnType<typeof mount>[] = []

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    hosts.splice(0).forEach(host => host.unmount())
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    document.body.innerHTML = ''
  })

  function mountHost(items: readonly OcActionMenuEntry[] = ITEMS, onSelect: (key: string) => void = vi.fn()) {
    let menu!: ContextMenu
    const Host = defineComponent({
      setup() {
        menu = useContextMenu()
        const open = (event: MouseEvent | KeyboardEvent) => menu.trigger(event, () => items, onSelect)
        const button = (id: string) => h('button', { id, onContextmenu: open, onKeydown: open })
        return () => h('div', [button('a'), button('b'), h(OcContextMenu, { menu })])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    hosts.push(wrapper)
    const fire = (id: string, event: Event) => {
      wrapper.get(`#${id}`).element.dispatchEvent(event)
      return event
    }
    return {
      wrapper,
      menu: () => menu,
      element: (id: string) => wrapper.get<HTMLElement>(`#${id}`).element,
      rightClick: (id: string, clientX = 0, clientY = 0) =>
        fire(id, new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY })),
      key: (id: string, key: string, shiftKey = false) =>
        fire(id, new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, shiftKey })),
    }
  }

  const group = () => overlayGroups.get('context-menu')

  it('does not open or claim the event for an empty item list', async () => {
    const { menu, rightClick } = mountHost([])
    const event = rightClick('a')
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    expect(menu().binding.view.open).toBe(false)
    expect(group()?.visible).toBeFalsy()
  })

  it('ignores keys that are not menu keys', async () => {
    const { menu, key } = mountHost()
    expect(key('a', 'Enter').defaultPrevented).toBe(false)
    await flushPromises()
    expect(menu().binding.view.open).toBe(false)
  })

  it('anchors at the pointer for right click and on the element for menu keys', async () => {
    const { element, rightClick, key } = mountHost()
    rightClick('a', 10, 20)
    await flushPromises()
    expect(group()?.anchor).toMatchObject({ x: 10, y: 20 })
    expect(group()?.owner).toBe(element('a'))

    expect(key('b', 'F10', true).defaultPrevented).toBe(true)
    await flushPromises()
    expect(group()?.anchor).toBe(element('b'))
    expect(group()?.owner).toBe(element('b'))
  })

  it('closes the menu before running the selected action', async () => {
    let menu!: ContextMenu
    const openWhenSelected: boolean[] = []
    const host = mountHost(ITEMS, () => openWhenSelected.push(menu.binding.view.open))
    menu = host.menu()
    host.key('a', 'ContextMenu')
    await flushPromises()
    document.querySelector<HTMLElement>('[role="menuitem"]')!.click()
    await flushPromises()
    expect(openWhenSelected).toEqual([false])
  })

  it('drops the action callback on close', async () => {
    const onSelect = vi.fn()
    const { menu, rightClick, key } = mountHost(ITEMS, onSelect)
    rightClick('a')
    await flushPromises()
    key('a', 'Escape')
    menu().binding.select('rename')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('intercepts Escape only while the menu is open', async () => {
    const { menu, rightClick, key } = mountHost()
    expect(key('a', 'Escape').defaultPrevented).toBe(false)

    rightClick('a')
    await flushPromises()
    expect(key('a', 'Escape').defaultPrevented).toBe(true)
    expect(menu().binding.view.open).toBe(false)
  })

  it('closes the menu when the host unmounts', async () => {
    const { wrapper, rightClick } = mountHost()
    rightClick('a')
    await flushPromises()
    expect(group()?.visible).toBe(true)
    hosts.splice(hosts.indexOf(wrapper), 1)
    wrapper.unmount()
    expect(group()?.visible).toBeFalsy()
  })
})
