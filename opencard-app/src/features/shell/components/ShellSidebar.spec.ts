import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShellSidebar from './ShellSidebar.vue'
import type { ShellButton, ShellList, ShellListGroup } from '../shell.types'

function primaryGroup(lists: ShellList[], headButtons: ShellButton[] = []): ShellListGroup {
  return { key: 'primary', title: '', headButtons, lists }
}

describe('ShellSidebar', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns a list submenu token to its owning VM', async () => {
    const onAction = vi.fn()
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([{
          onAction, key: 'project-files',
          title: 'Files',
          placeholder: 'Empty',
          actions: [{
            key: 'project.new-file',
            icon: 'action.file-plus',
            hoverTip: 'New File',
            children: [
              { key: 'project.new-file.ocdocument', title: 'OpenCard (.ocdocument)' },
              { key: 'project.new-file.project-configuration', title: 'Project Configuration' },
            ],
          }],
        }]),
      },
    })

    const action = wrapper.get('button[aria-label="New File"]')
    expect(action.classes()).toContain('oc-button')
    await action.trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.oc-action-menu__button[aria-label="OpenCard (.ocdocument)"]')?.click()
    await flushPromises()

    expect(onAction).toHaveBeenCalledWith('project.new-file.ocdocument')
  })




  it('stores resized list proportions and restores them after collapsing', async () => {
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([
          { key: 'files', title: 'Files', placeholder: 'Empty', actions: [] },
          { key: 'timeline', title: 'Timeline', placeholder: 'Empty', actions: [] },
        ]),
      },
    })
    const sections = wrapper.findAll('.shell-sidebar-list')
    sections[0]!.element.getBoundingClientRect = () => ({ height: 200 } as DOMRect)
    sections[1]!.element.getBoundingClientRect = () => ({ height: 200 } as DOMRect)

    wrapper.find('.shell-sidebar-list-resizer').element.dispatchEvent(new PointerEvent('pointerdown', { clientY: 200, bubbles: true }))
    await wrapper.vm.$nextTick()
    wrapper.get('.shell-sidebar-list-resizer').element.dispatchEvent(new PointerEvent('pointermove', { clientY: 250 }))
    await wrapper.vm.$nextTick()
    const resizedGrow = sections[0]!.attributes('style')
    expect(resizedGrow).not.toContain('flex-grow: 1;')
    wrapper.get('.shell-sidebar-list-resizer').element.dispatchEvent(new PointerEvent('pointerup', { clientY: 250 }))
    await wrapper.findAll('.shell-sidebar-list-toggle')[0]!.trigger('click')
    await wrapper.findAll('.shell-sidebar-list-toggle')[0]!.trigger('click')
    expect(sections[0]!.attributes('style')).toBe(resizedGrow)
  })

  it('animates a collapsed list to the shared collapsed height', async () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([
          { key: 'files', title: 'Files', placeholder: 'Empty', actions: [] },
          { key: 'timeline', title: 'Timeline', placeholder: 'Empty', actions: [] },
        ]),
      },
    })

    await wrapper.find('.shell-sidebar-list-toggle').trigger('click')
    const firstSection = wrapper.find('.shell-sidebar-list')
    expect(firstSection.classes()).toContain('collapsed')
    expect(firstSection.attributes('style')).toContain('flex-basis: var(--oc-size-md)')
    expect(firstSection.find('.shell-sidebar-list-content-wrap').classes()).toContain('collapsed')
  })

  it('renders declarative tree content and forwards its intent handler', async () => {
    const intents: unknown[] = []
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([{
          key: 'files',
          title: 'Files',
          placeholder: 'Empty',
          actions: [],
          content: {
            type: 'tree',
            data: {
              rootKeys: ['file'],
              items: new Map([['file', { label: 'Card', icon: 'file.opencard' }]]),
              children: new Map(),
            },
            role: 'tree',
            selectionMode: 'single',
            activationMode: 'none',
            onSelectionChange: event => intents.push(event),
          },
        }]),
      },
    })

    expect(wrapper.find('.open-card-shell__sidebar-tree').exists()).toBe(true)
    await wrapper.get('.oc-tree__row').trigger('click')
    expect(intents).toEqual([{
      triggerKey: 'file',
      selectedKeys: ['file'],
    }])
  })

  it('keeps an empty declarative tree mounted and shows its placeholder', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([{
          key: 'editors',
          title: 'Open Editors',
          placeholder: 'Opened files appear here',
          actions: [],
          content: {
            type: 'tree',
            data: { rootKeys: [], items: new Map(), children: new Map() },
            role: 'listbox',
            selectionMode: 'single',
            activationMode: 'none',
          },
        }]),
      },
    })

    expect(wrapper.find('.open-card-shell__sidebar-tree').exists()).toBe(true)
    expect(wrapper.get('.oc-tree__placeholder').text()).toBe('Opened files appear here')
  })

  it('reports the horizontal resize lifecycle', async () => {
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        width: 260,
        maxResizeWidth: 420,
        bodyGroup: primaryGroup([]),
      },
    })
    const sidebar = wrapper.get('.shell-sidebar').element as HTMLElement
    Object.defineProperties(sidebar, {
      setPointerCapture: { value: () => undefined },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: () => undefined },
    })

    const handle = wrapper.get('.shell-sidebar-resizer [role=separator]')
    handle.element.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: 260,
      pointerId: 4,
    }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('resize-start')).toHaveLength(1)
    expect(wrapper.get('.shell-sidebar').classes()).toContain('is-resizing')
    await wrapper.setProps({ resizeToggleAnimating: true })
    expect(wrapper.get('.shell-sidebar').classes()).not.toContain('is-resizing')
    await wrapper.setProps({ resizeToggleAnimating: false })
    expect(wrapper.get('.shell-sidebar').classes()).toContain('is-resizing')
    handle.element.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, pointerId: 4 }))
    await wrapper.setProps({ collapsed: true })
    expect(wrapper.find('.shell-sidebar-resizer [role=separator]').exists()).toBe(true)
    handle.element.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, pointerId: 4 }))
    expect(wrapper.emitted('resize')).toEqual([[300], [420]])
    handle.element.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4, clientX: 900 }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('resize-end')).toHaveLength(1)
    expect(wrapper.get('.shell-sidebar').classes()).not.toContain('is-resizing')
  })

  it('uses medium icons for group actions', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([], [{ key: 'open', title: 'Open', icon: 'status.folder-open' }]),
      },
    })

    const icons = wrapper.findAll('.shell-sidebar-button .oc-icon')
    expect(icons).toHaveLength(1)
    expect(icons.every(icon => icon.classes().includes('oc-icon--md'))).toBe(true)
  })
})
