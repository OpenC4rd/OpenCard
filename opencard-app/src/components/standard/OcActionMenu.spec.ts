import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcActionMenu from './OcActionMenu.vue'

describe('OcActionMenu', () => {
  it('renders dividers without turning them into commands', async () => {
    const wrapper = mount(OcActionMenu, {
      props: {
        actions: [
          { key: 'save', title: 'Save', icon: 'action.save', shortcut: ['Ctrl', 'S'] },
          { type: 'divider', key: 'file-export-divider' },
          { key: 'export', title: 'Export', icon: 'action.export' },
        ],
      },
    })

    expect(wrapper.findAll('[role="separator"]')).toHaveLength(1)
    expect(wrapper.findAll('[role="menuitem"]')).toHaveLength(2)
    expect(wrapper.findAll('[role="menuitem"]')[0]!.attributes('data-tooltip')).toBeUndefined()
    expect(wrapper.findAll('[role="menuitem"]')[0]!.attributes('title')).toBeUndefined()
    expect(wrapper.findAll('.oc-key').map(key => key.text()))
      .toEqual(['Ctrl', 'S'])

    await wrapper.findAll('[role="menuitem"]')[1]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[{ key: 'export' }]])
  })

  it('renders generic action thumbnails in the dense menu row', () => {
    const wrapper = mount(OcActionMenu, {
      props: {
        actions: [{
          key: 'status/wide',
          title: 'Wide',
          thumbnailStyle: { width: '2em', height: '1em', backgroundImage: 'url("status.png")' },
          thumbnailLabel: 'Wide icon',
        }],
      },
    })
    const thumbnail = wrapper.get('.oc-action-menu__thumbnail')
    expect(thumbnail.attributes('aria-label')).toBe('Wide icon')
    expect(thumbnail.attributes('style')).toContain('background-image')
    expect(wrapper.find('.oc-action-menu__icon-spacer').exists()).toBe(false)
  })

  it('renders a capped numeric badge with an accessible action label', () => {
    const wrapper = mount(OcActionMenu, {
      props: { actions: [{ key: 'feedback', title: 'Feedback', badge: 120, badgeLabel: '120 unread replies' }] },
    })

    expect(wrapper.get('.oc-number-badge').text()).toBe('99+')
    expect(wrapper.get('[role="menuitem"]').attributes('aria-label')).toBe('Feedback, 120 unread replies')
  })

  it('renders marked-up titles while deriving a plain accessible label', () => {
    const wrapper = mount(OcActionMenu, {
      props: { actions: [{ key: 'fill', title: '[b]Fill[/b] [key]F[/key] [icon:layout.fill]' }] },
    })

    expect(wrapper.get('.oc-action-menu__label strong').text()).toBe('Fill')
    expect(wrapper.get('.oc-action-menu__label kbd').text()).toBe('F')
    expect(wrapper.find('.oc-action-menu__label .oc-icon').exists()).toBe(true)
    expect(wrapper.get('[role="menuitem"]').attributes('aria-label')).toBe('Fill F')
  })

  it('opts project-icon thumbnails into the shared project-icon renderer', () => {
    const wrapper = mount(OcActionMenu, {
      props: {
        actions: [{
          key: 'status/wide',
          thumbnailStyle: { '--oc-project-icon-renderer': 'mask' },
        }],
      },
    })
    expect(wrapper.get('.oc-action-menu__thumbnail').classes()).toContain('oc-project-icon')
  })

  it('moves keyboard focus across enabled commands', async () => {
    const wrapper = mount(OcActionMenu, {
      attachTo: document.body,
      props: {
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

  it('opens nested commands with ArrowRight and requests close with ArrowLeft', async () => {
    const wrapper = mount(OcActionMenu, {
      attachTo: document.body,
      props: {
        actions: [{
          key: 'more',
          title: 'More',
          children: [{ key: 'rename', title: 'Rename' }],
        }],
      },
    })

    await wrapper.get('[role="menuitem"]').trigger('keydown', { key: 'ArrowRight' })
    await wrapper.vm.$nextTick()
    expect(document.activeElement?.textContent).toContain('Rename')
    const childMenu = wrapper.findAllComponents(OcActionMenu)[0]
    await childMenu!.get('[role="menuitem"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(childMenu!.emitted('close-submenu')).toHaveLength(1)
    wrapper.unmount()
  })

  it('requests dismissal on Escape', async () => {
    const wrapper = mount(OcActionMenu, {
      props: { actions: [{ key: 'rename', title: 'Rename' }] },
    })
    await wrapper.get('[role="menuitem"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
