import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ShellWorkspaceFrame from './ShellWorkspaceFrame.vue'

describe('ShellWorkspaceFrame', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders only the controlled workspace content', () => {
    const wrapper = mount(ShellWorkspaceFrame, {
      props: {
        title: 'Workspace',
        actions: [],
      },
      slots: { default: '<div class="workspace-content">Editor</div>' },
    })

    expect(wrapper.get('.workspace-content').text()).toBe('Editor')
    expect(wrapper.find('.workspace-bottom-panel').exists()).toBe(false)
  })

  it('renders workspace actions and emits their key to the Shell owner', async () => {
    const wrapper = mount(ShellWorkspaceFrame, {
      props: {
        title: 'Card',
        actions: [{
          key: 'card-designer.toggle-mode',
          icon: 'data.table',
          hoverTip: 'Switch to data table view',
        }],
      },
    })

    const action = wrapper.get('button[aria-label="Switch to data table view"]')
    expect(action.classes()).toContain('oc-button')
    expect(action.element.parentElement?.classList).not.toContain('workspace-action')
    expect(action.attributes('data-tooltip')).toBe('Switch to data table view')
    await action.trigger('click')
    expect(wrapper.emitted('action')).toEqual([['card-designer.toggle-mode']])
  })

  it('renders string entries as visible non-interactive workspace text', () => {
    const wrapper = mount(ShellWorkspaceFrame, {
      props: {
        title: 'Diff',
        actions: [
          'abc1234',
          { key: 'diff.before', icon: 'file.git', hoverTip: 'Version A' },
          'def5678',
        ],
      },
    })

    const labels = wrapper.findAll('.workspace-action-text')
    expect(labels.map(label => label.text())).toEqual(['abc1234', 'def5678'])
    expect(labels.every(label => !label.classes().includes('oc-text--mono'))).toBe(true)
    expect(wrapper.find('button[aria-label="abc1234"]').exists()).toBe(false)
  })

  it('does not emit disabled workspace actions', async () => {
    const wrapper = mount(ShellWorkspaceFrame, {
      props: {
        title: 'Dictionary',
        actions: [{
          key: 'dictionary.workbook.export',
          icon: 'action.export',
          hoverTip: 'Export workbook',
          disabled: true,
        }],
      },
    })

    const action = wrapper.get('button[aria-label="Export workbook"]')
    expect(action.attributes('disabled')).toBeDefined()
    await action.trigger('click')
    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('emits the selected child key from a workspace action submenu', async () => {
    const wrapper = mount(ShellWorkspaceFrame, {
      attachTo: document.body,
      props: {
        title: 'Card',
        actions: [{
          key: 'card.export',
          icon: 'action.export',
          hoverTip: 'Export card',
          children: [
            { key: 'card.export.current', title: 'Export current card' },
            { key: 'card.export.all', title: 'Export all cards' },
          ],
        }],
      },
    })

    const action = wrapper.get('button[aria-label="Export card"]')
    expect(action.attributes('aria-haspopup')).toBe('menu')
    await action.trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>(
      '.oc-action-menu__button[aria-label="Export current card"]',
    )?.click()
    await flushPromises()

    expect(wrapper.emitted('action')).toEqual([['card.export.current']])
  })
})
