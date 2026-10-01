import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ShellSidebar from './ShellSidebar.vue'
import type { ShellButton, ShellList, ShellListGroup } from '../shell.types'

function primaryGroup(lists: ShellList[], headButtons: ShellButton[] = []): ShellListGroup[] {
  return [{ key: 'primary', title: '', headButtons, lists }]
}

describe('ShellSidebar', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('emits the selected child key from a list action submenu', async () => {
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([{
          key: 'project-files',
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

    expect(wrapper.emitted('list-button-clicked')).toEqual([['project-files', 'project.new-file.ocdocument']])
  })

  it('uses one declarative group path and hides the switcher for a single group', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup(
          [{ key: 'recent', title: 'Recent Projects', placeholder: 'Empty', actions: [] }],
          [{ key: 'open', title: 'Open Project', icon: 'status.folder-open' }],
        ),
      },
    })

    expect(wrapper.find('.shell-sidebar-group-switcher').exists()).toBe(false)
    expect(wrapper.get('.shell-sidebar-group-top .shell-sidebar-button').text()).toBe('Open Project')
    expect(wrapper.get('.shell-sidebar-list-title').text()).toBe('Recent Projects')
  })

  it('animates single-group content when its transition identity changes', async () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: [{
          key: 'primary',
          transitionKey: 'space:welcome:none',
          title: '',
          lists: [{ key: 'recent', title: 'Recent Projects', placeholder: 'Empty', actions: [] }],
        }],
      },
    })

    expect(wrapper.get('.shell-sidebar-active-group').attributes('data-transition-key')).toBe('space:welcome:none')
    await wrapper.setProps({
      bodyGroups: [{
        key: 'primary',
        transitionKey: 'space:settings:none',
        title: '',
        lists: [{ key: 'settings', title: 'Settings', placeholder: 'Empty', actions: [] }],
      }],
    })
    await flushPromises()

    expect(wrapper.get('.shell-sidebar-active-group').attributes('data-transition-key')).toBe('space:settings:none')
    expect(wrapper.get('.shell-sidebar-list-title').text()).toBe('Settings')
  })

  it('shares available height across expanded lists and keeps scrolling inside each list', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([
          { key: 'files', title: 'Files', placeholder: 'Empty', actions: [] },
          { key: 'timeline', title: 'Timeline', placeholder: 'Empty', actions: [] },
        ]),
      },
      slots: { 'list-content': '<div class="tree-content">Tree</div>' },
    })

    const sections = wrapper.findAll('.shell-sidebar-list')
    expect(sections).toHaveLength(2)
    expect(sections.every(section => section.attributes('style')?.includes('flex-grow: 1'))).toBe(true)
    expect(wrapper.findAll('.shell-sidebar-list-content')).toHaveLength(2)
    expect(wrapper.find('.shell-sidebar-list-resizer').exists()).toBe(true)
  })

  it('stores resized list proportions and restores them after collapsing', async () => {
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([
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
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 250 }))
    await wrapper.vm.$nextTick()
    const resizedGrow = sections[0]!.attributes('style')
    expect(resizedGrow).not.toContain('flex-grow: 1;')
    window.dispatchEvent(new PointerEvent('pointerup'))
    await wrapper.findAll('.shell-sidebar-list-toggle')[0]!.trigger('click')
    await wrapper.findAll('.shell-sidebar-list-toggle')[0]!.trigger('click')
    expect(sections[0]!.attributes('style')).toBe(resizedGrow)
  })

  it('animates a collapsed list to the shared collapsed height', async () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([
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

  it('switches configured groups, animates the whole active group, and emits the selected key', async () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: [
          {
            key: 'workspace', title: 'Workspace', icon: 'status.folder-open',
            headButtons: [{ key: 'new', title: 'New OpenCard', icon: 'action.file-plus' }],
            lists: [{ key: 'files', title: 'Files', placeholder: 'Empty', actions: [] }],
          },
          {
            key: 'history', title: 'History', icon: 'file.git',
            headButtons: [{ key: 'commit', title: 'Commit', icon: 'action.publish' }],
            lists: [{ key: 'timeline', title: 'Timeline', placeholder: 'No history', actions: [] }],
          },
        ],
      },
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs.map(button => button.attributes('data-tooltip'))).toEqual([undefined, undefined])
    expect(tabs.map(button => button.attributes('aria-selected'))).toEqual(['true', 'false'])
    expect(wrapper.get('.shell-sidebar-group-top .shell-sidebar-button').text()).toBe('New OpenCard')
    await tabs[1]!.trigger('click')
    expect(wrapper.get('.shell-sidebar-group-top .shell-sidebar-button').text()).toBe('Commit')
    expect(wrapper.get('.shell-sidebar-list-title').text()).toBe('Timeline')
    expect(wrapper.emitted('body-group-changed')).toEqual([['history']])
  })

  it('uses tooltips only when compact width hides group titles', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 200,
        compactGroupWidth: 220,
        bodyGroups: [
          { key: 'workspace', title: 'Workspace', icon: 'status.folder-open', lists: [] },
          { key: 'history', title: 'History', icon: 'file.git', lists: [] },
        ],
      },
    })

    const switches = wrapper.findAll('[role="tab"]')
    expect(wrapper.get('.shell-sidebar-group-switcher').classes()).toContain('oc-option-group--icon-only')
    expect(switches.map(button => button.attributes('data-tooltip'))).toEqual(['Workspace', 'History'])
  })

  it('renders declarative tree content and forwards its intent handler', async () => {
    const intents: unknown[] = []
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([{
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
        bodyGroups: primaryGroup([{
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
    expect(wrapper.find('.shell-sidebar-empty').exists()).toBe(false)
  })

  it('renders declarative empty content without mounting a tree', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([{
          key: 'files',
          title: 'Files',
          placeholder: 'No files',
          actions: [],
          content: { type: 'empty' },
        }]),
      },
    })

    expect(wrapper.find('.open-card-shell__sidebar-tree').exists()).toBe(false)
    expect(wrapper.get('.shell-sidebar-empty').text()).toBe('No files')
  })

  it('renders no fallback element for declarative none content', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([{
          key: 'files',
          title: 'Files',
          placeholder: 'No files',
          actions: [],
          content: { type: 'none' },
        }]),
      },
    })

    expect(wrapper.find('.open-card-shell__sidebar-tree').exists()).toBe(false)
    expect(wrapper.find('.shell-sidebar-empty').exists()).toBe(false)
  })

  it('reports the horizontal resize lifecycle', async () => {
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        width: 260,
        maxResizeWidth: 420,
        bodyGroups: primaryGroup([]),
      },
    })
    const sidebar = wrapper.get('.shell-sidebar').element as HTMLElement
    Object.defineProperties(sidebar, {
      setPointerCapture: { value: () => undefined },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: () => undefined },
    })

    wrapper.get('.shell-sidebar-resizer').element.dispatchEvent(new PointerEvent('pointerdown', {
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
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, pointerId: 4 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, pointerId: 4 }))
    expect(wrapper.emitted('resize')).toEqual([[300], [420]])
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4 }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('resize-end')).toHaveLength(1)
    expect(wrapper.get('.shell-sidebar').classes()).not.toContain('is-resizing')
  })

  it('uses medium icons for group actions', () => {
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroups: primaryGroup([], [{ key: 'open', title: 'Open', icon: 'status.folder-open' }]),
      },
    })

    const icons = wrapper.findAll('.shell-sidebar-button .oc-icon')
    expect(icons).toHaveLength(1)
    expect(icons.every(icon => icon.classes().includes('oc-icon--md'))).toBe(true)
  })
})
