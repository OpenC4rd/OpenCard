import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ShellTitleBar from './ShellTitleBar.vue'

describe('ShellTitleBar', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders weighted task progress and exposes active tasks on the title', async () => {
    const wrapper = mount(ShellTitleBar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [],
      },
    })

    expect(wrapper.find('.titlebar-shader').exists()).toBe(false)

    await wrapper.setProps({
      tasks: [
        { key: 'export', title: 'Exporting cards', progress: 0.25, weight: 3 },
        { key: 'index', title: 'Indexing files', progress: 0.75, weight: 1 },
        { key: 'update', title: 'Waiting to install update', progress: 0, active: false },
      ],
    })

    expect(wrapper.get('transition-stub').attributes('name')).toBe('titlebar-progress-fade')
    expect(wrapper.get('.titlebar-shader .appearance-shader').attributes('style')).toContain('--appearance-progress: 37.5%')
    expect(wrapper.get('.titlebar-brand-lockup').attributes('data-tooltip')).toBeUndefined()

    await wrapper.get('.titlebar-brand-lockup').trigger('pointerenter')
    const rows = document.body.querySelectorAll('.titlebar-task-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain('Exporting cards')
    expect(rows[0]?.textContent).toContain('25%')
    expect(rows[0]?.querySelector<HTMLElement>('.titlebar-task-row__fill')?.style.width).toBe('25%')
    expect(rows[2]?.textContent).toContain('Waiting to install update')

    await wrapper.setProps({
      tasks: [{ key: 'export', title: 'Exporting cards', progress: 0.6, weight: 1 }],
    })
    expect(document.body.querySelector('.titlebar-task-row')?.textContent).toContain('60%')
    wrapper.unmount()
  })

  it('shows task detail and emits cancellation by stable task key', async () => {
    const wrapper = mount(ShellTitleBar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [],
        cancelTaskLabel: 'Cancel task',
        tasks: [{
          key: 'export', title: 'Exporting cards', progress: 0.25,
          detail: 'Rendering cards/main.ocdocument', cancellable: true,
        }],
      },
    })
    await wrapper.get('.titlebar-brand-lockup').trigger('pointerenter')
    expect(document.body.querySelector('.titlebar-task-row__detail')?.textContent)
      .toBe('Rendering cards/main.ocdocument')
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Cancel task"]')?.click()
    expect(wrapper.emitted('cancel-task')).toEqual([['export']])
    wrapper.unmount()
  })

  it('does not emit disabled menu actions', async () => {
    const wrapper = mount(ShellTitleBar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [{
          key: 'file',
          label: 'File',
          actions: [
            { key: 'open-project', title: 'Open Project' },
            { key: 'close-project-folder', title: 'Close Project Folder', disabled: true },
          ],
        }],
      },
    })

    await wrapper.get('.titlebar-menu-button').trigger('click')
    const items = document.body.querySelectorAll<HTMLButtonElement>('.oc-action-menu__button')
    expect(items[1]?.disabled).toBe(true)

    items[1]!.click()
    expect(wrapper.emitted('menu-action')).toBeUndefined()

    items[0]!.click()
    expect(wrapper.emitted('menu-action')).toEqual([['file', 'open-project']])
    wrapper.unmount()
  })

  it('keeps an arbitrarily deep title menu branch mounted through pointerdown', async () => {
    const wrapper = mount(ShellTitleBar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [{
          key: 'file',
          label: 'File',
          actions: [{
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
        }],
      },
    })

    await wrapper.get('.titlebar-menu-button').trigger('click')
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
    leafButton?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
    await flushPromises()
    expect(leafButton?.isConnected).toBe(true)

    leafButton?.click()
    expect(wrapper.emitted('menu-action')).toEqual([['file', 'leaf']])
    wrapper.unmount()
  })

  it('switches menus on hover after a menu has been activated', async () => {
    const wrapper = mount(ShellTitleBar, {
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [
          { key: 'file', label: 'File', actions: [] },
          { key: 'edit', label: 'Edit', actions: [] },
        ],
      },
    })
    const menus = wrapper.findAll('.titlebar-menu')
    const buttons = wrapper.findAll('.titlebar-menu-button')

    await menus[1]!.trigger('pointerenter')
    expect(buttons[1]!.attributes('aria-expanded')).toBe('false')

    await buttons[0]!.trigger('click')
    await menus[1]!.trigger('pointerenter')

    expect(buttons[0]!.attributes('aria-expanded')).toBe('false')
    expect(buttons[1]!.attributes('aria-expanded')).toBe('true')
  })

  it('reserves native macOS chrome and separates application actions from window controls', () => {
    const wrapper = mount(ShellTitleBar, {
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [],
        nativeMacosControls: true,
        windowControls: [
          { key: 'fullscreen', icon: 'window.fullscreen', group: 'app' },
          { key: 'minimize', icon: 'window.minimize', group: 'window' },
          { key: 'restore', icon: 'window.restore', group: 'window' },
        ],
      },
    })

    expect(wrapper.get('.titlebar').classes()).toContain('titlebar-native-macos')
    const controls = wrapper.findAll('.titlebar-right .titlebar-icon')
    expect(controls[1]!.classes()).toContain('titlebar-icon-window-start')
    expect(controls[2]!.classes()).not.toContain('titlebar-icon-window-start')
  })

  it('keeps menu-adjacent app actions independent from task progress', async () => {
    const wrapper = mount(ShellTitleBar, {
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [{ key: 'help', label: 'Help', actions: [] }],
        appActions: [{
          key: 'install-update',
          icon: 'action.download',
          hoverTip: 'Downloading 42%',
        }],
      },
    })

    const action = wrapper.get('.titlebar-app-action')
    expect(action.element.previousElementSibling?.classList).toContain('titlebar-menu')
    expect(wrapper.find('.titlebar-shader').exists()).toBe(false)
    await action.trigger('click')
    expect(wrapper.emitted('app-action')).toEqual([['install-update']])
  })

  it('shows a numeric badge on a titlebar menu group', () => {
    const wrapper = mount(ShellTitleBar, {
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [{ key: 'help', label: 'Help', badge: 4, badgeLabel: '4 unread replies', actions: [] }],
      },
    })

    expect(wrapper.get('.titlebar-menu-button .oc-number-badge').text()).toBe('4')
    expect(wrapper.get('.titlebar-menu-button').attributes('aria-label')).toBe('Help, 4 unread replies')
  })

  it('keeps the sidebar toggle as the only navigation control before menus', async () => {
    const wrapper = mount(ShellTitleBar, {
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [{ key: 'file', label: 'File', actions: [] }],
      },
    })

    const leftIcons = wrapper.findAll('.titlebar-left > .titlebar-icon')
    expect(leftIcons).toHaveLength(1)
    expect(leftIcons[0]!.element.nextElementSibling?.classList).toContain('titlebar-menu')

    await leftIcons[0]!.trigger('click')
    expect(wrapper.emitted('toggle-sidebar')).toEqual([[]])
  })

  it('only exposes the native drag region when dragging is enabled', async () => {
    const wrapper = mount(ShellTitleBar, {
      props: {
        collapsed: false,
        brandLabel: 'OpenCard',
        menuGroups: [],
        dragRegion: true,
      },
    })

    expect(wrapper.get('.titlebar-drag').attributes()).toHaveProperty('data-tauri-drag-region')
    expect(wrapper.get('.titlebar-drag').classes()).toContain('titlebar-drag-enabled')
    expect(wrapper.get('.titlebar-brand-lockup').attributes()).toHaveProperty('data-tauri-drag-region')

    await wrapper.setProps({ tasks: [{ key: 'export', title: 'Exporting', progress: 0.5 }] })

    expect(wrapper.get('.titlebar-brand-lockup').attributes()).not.toHaveProperty('data-tauri-drag-region')
    expect(wrapper.get('.titlebar-brand-lockup').classes()).toContain('titlebar-brand-lockup-interactive')

    await wrapper.setProps({ dragRegion: false })

    expect(wrapper.get('.titlebar-drag').attributes()).not.toHaveProperty('data-tauri-drag-region')
    expect(wrapper.get('.titlebar-drag').classes()).not.toContain('titlebar-drag-enabled')
  })
})
