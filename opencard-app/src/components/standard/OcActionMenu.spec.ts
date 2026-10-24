import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OcActionMenu from './OcActionMenu.vue'
import OcActionButton from './OcActionButton.vue'
import OverlayGroupRoot from '../ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'

describe('OcActionMenu', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    document.body.innerHTML = ''
  })

  function menus(): HTMLElement[] {
    return [...document.body.querySelectorAll<HTMLElement>('[role="menu"]')]
  }

  function menuAt(index: number): HTMLElement {
    const menu = menus()[index]
    if (!menu) throw new Error(`No menu at layer ${index}`)
    return menu
  }

  async function openMenu(action: OcActionDefinition) {
    const wrapper = mount(OcActionButton, { attachTo: document.body, props: { action } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('renders dividers without turning them into commands', async () => {
    const onSelect = vi.fn()
    const wrapper = mount(OcActionMenu, {
      props: {
        overlayKey: 'spec-menu',
        onSelect,
        actions: [
          { key: 'save', title: 'Save', icon: 'mdiContentSaveOutline', shortcut: ['Ctrl', 'S'] },
          { type: 'divider', key: 'file-export-divider' },
          { key: 'export', title: 'Export', icon: 'mdiExport' },
        ],
      },
    })

    expect(wrapper.findAll('[role="separator"]')).toHaveLength(1)
    expect(wrapper.findAll('[role="menuitem"]')).toHaveLength(2)

    await wrapper.findAll('[role="menuitem"]')[1]!.trigger('click')

    expect(onSelect).toHaveBeenCalledWith('export')
  })

  it('caps a numeric badge and keeps it out of the accessible name', () => {
    const wrapper = mount(OcActionMenu, {
      props: { overlayKey: 'spec-menu', actions: [{ key: 'feedback', title: 'Feedback', badge: 120, badgeLabel: '120 unread replies' }] },
    })

    expect(wrapper.get('.oc-number-badge').text()).toBe('99+')
    expect(wrapper.get('[role="menuitem"]').attributes('aria-label')).toBe('Feedback, 120 unread replies')
  })

  it('moves keyboard focus across enabled commands', async () => {
    const wrapper = mount(OcActionMenu, {
      attachTo: document.body,
      props: {
        overlayKey: 'spec-menu',
        actions: [
          { key: 'first', title: 'First' },
          { key: 'disabled', title: 'Disabled', disabled: true },
          { key: 'last', title: 'Last' },
        ],
      },
    })
    const buttons = wrapper.findAll<HTMLButtonElement>('[role="menuitem"]')

    wrapper.vm.focusFirst()
    expect(document.activeElement).toBe(buttons[0]!.element)
    await buttons[0]!.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[2]!.element)
    await buttons[2]!.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(buttons[0]!.element)
    await buttons[0]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(buttons[2]!.element)
    wrapper.unmount()
  })

  it('opens the nested layer with ArrowRight and focuses its first command', async () => {
    const wrapper = await openMenu({
      key: 'more',
      title: 'More',
      children: [{ key: 'edit', title: 'Edit', children: [{ key: 'rename', title: 'Rename' }] }],
    })

    const branch = menuAt(0).querySelector<HTMLButtonElement>('[role="menuitem"]')!
    branch.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()

    const childItem = menuAt(1).querySelector<HTMLButtonElement>('[role="menuitem"]')!
    expect(childItem.getAttribute('aria-label')).toBe('Rename')
    expect(document.activeElement).toBe(childItem)
    wrapper.unmount()
  })

  it('collapses the nested layer with ArrowLeft and returns focus to the branch', async () => {
    const wrapper = await openMenu({
      key: 'more',
      title: 'More',
      children: [{ key: 'edit', title: 'Edit', children: [{ key: 'rename', title: 'Rename' }] }],
    })

    const branch = menuAt(0).querySelector<HTMLButtonElement>('[role="menuitem"]')!
    branch.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    const childItem = menuAt(1).querySelector<HTMLButtonElement>('[role="menuitem"]')!

    childItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await flushPromises()

    // 只收起自己打开的那一层：根层由调用方决定何时关闭。
    expect(menus()).toHaveLength(1)
    expect(branch.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(branch)
    wrapper.unmount()
  })

  it('keeps the child menu alive while a command inside it is being pressed', async () => {
    const wrapper = await openMenu({
      key: 'trash',
      title: 'Trash',
      children: [{ key: 'danger', title: 'Danger', children: [{ key: 'confirm', title: 'Confirm' }] }],
    })

    const branch = menuAt(0).querySelector<HTMLButtonElement>('[role="menuitem"]')!
    branch.closest('.oc-action-menu__item')!.dispatchEvent(new Event('pointerenter'))
    await flushPromises()
    const confirm = document.body.querySelector<HTMLButtonElement>('[data-oc-action-key="confirm"]')!
    expect(confirm).not.toBeNull()

    branch.focus()
    await flushPromises()

    // 按子菜单命令时焦点离开分支项会排一个延迟关闭，命令必须在那个延迟之后依然接得住。
    confirm.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
    confirm.focus()
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    expect(confirm.isConnected).toBe(true)

    confirm.click()
    expect(wrapper.emitted('select')).toEqual([[{ key: 'confirm' }]])
    wrapper.unmount()
  })

  it('closes its own layer on Escape', async () => {
    const wrapper = await openMenu({
      key: 'more',
      title: 'More',
      children: [{ key: 'rename', title: 'Rename' }],
    })

    const item = menuAt(0).querySelector<HTMLButtonElement>('[role="menuitem"]')!
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(menus()).toHaveLength(0)
    wrapper.unmount()
  })
})
