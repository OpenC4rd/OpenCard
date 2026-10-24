import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import OcTree from '../../../components/standard/OcTree.vue'
import type { OcNodeCollection } from '../../../shared/ui/node/node.types'
import { type AppOutputEntry } from '../../logging/appOutput'
import { COPY_ISSUE_ACTION_KEY } from '../spacePage'
import ShellBottomPanel from './ShellBottomPanel.vue'

const issueTreeData: OcNodeCollection = {
  rootKeys: ['session:a', 'session:b'],
  items: new Map([
    ['session:a', { label: 'Card A (1)', icon: 'mdiCardsOutline' }],
    ['issue:a', { label: 'Invalid binding', icon: 'mdiAlertOutline' }],
    ['session:b', { label: 'Card B', icon: 'mdiCardsOutline' }],
    ['issue:b', { label: 'Missing field', icon: 'mdiAlertOutline' }],
  ]),
  children: new Map([['session:a', ['issue:a']], ['session:b', ['issue:b']]]),
}

const outputEntries: AppOutputEntry[] = [
  { id: 1, severity: 'info', timestamp: 1_000, message: 'info message' },
  { id: 2, severity: 'warning', timestamp: 2_000, message: 'warning message' },
  { id: 3, severity: 'error', timestamp: 3_000, message: 'error details', detail: 'path: missing.ocdocument', code: 'OC-E2003' },
]

function mountPanel(expanded = true, output: readonly AppOutputEntry[] = [], activeTab: 'issues' | 'output' = 'issues') {
  return mount(ShellBottomPanel, {
    props: {
      expanded,
      activeTab,
      issueCount: 1,
      issueSeverity: 'warning',
      issueTreeData,
      expandedIssueKeys: ['session:a'],
      outputEntries: output,
      issuesLabel: 'Problems',
      outputLabel: 'Output',
      issueEmptyLabel: 'No problems',
      issueFilterLabel: 'Filter problems',
      outputEmptyLabel: 'No output',
      outputFilterEmptyLabel: 'No matching output',
      outputClearLabel: 'Clear',
      outputCopyLabel: 'Click to copy',
      outputLocale: 'en-US',
      outputSeverityFilterLabel: 'Severity filters',
      outputSeverityLabels: { info: 'Info', success: 'Success', warning: 'Warning', error: 'Error' },
      expandLabel: 'Expand panel',
      collapseLabel: 'Collapse panel',
      pinLabel: 'Pin panel',
      unpinLabel: 'Unpin panel',
    },
  })
}

function collectExpandEvents(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.emitted('expanded-change')
}

describe('ShellBottomPanel', () => {
  it('filters problems by label while keeping the branch that contains a match', async () => {
    const wrapper = mountPanel()
    const filter = wrapper.get('input[type="search"]')

    await filter.setValue('invalid binding')

    const data = wrapper.findComponent(OcTree).props('data') as OcNodeCollection
    expect(data.rootKeys).toEqual(['session:a'])
    expect(data.children.get('session:a')).toEqual(['issue:a'])
    expect(data.children.get('session:b')).toBeUndefined()
  })

  it('navigates with the activated issue key without interpreting grouping nodes', () => {
    const wrapper = mountPanel()

    wrapper.findComponent(OcTree).vm.$emit('node-activate', { key: 'session:a' })

    expect(wrapper.emitted('issue-navigate')).toEqual([['session:a']])
  })

  it('reports expansion with the node key and the requested state', () => {
    const wrapper = mountPanel()

    wrapper.findComponent(OcTree).vm.$emit('expansion-change', { key: 'session:a', expanded: false })

    expect(wrapper.emitted('issue-expansion-change')).toEqual([['session:a', false]])
  })

  it('forwards only the copy action and ignores other issue actions', () => {
    const wrapper = mountPanel()
    const tree = wrapper.findComponent(OcTree)

    tree.vm.$emit('action', { key: 'issue:a', actionKey: 'some.other-action' })
    tree.vm.$emit('action', { key: 'issue:a', actionKey: COPY_ISSUE_ACTION_KEY })

    expect(wrapper.emitted('issue-copy')).toEqual([['issue:a']])
  })

  it('expands on toggle hover and collapses only after the leave delay', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanel(false)
    try {
      await wrapper.get('.shell-bottom-panel__toggle').trigger('mouseenter')
      await wrapper.setProps({ expanded: true })

      await wrapper.get('.shell-bottom-panel').trigger('mouseleave')
      expect(collectExpandEvents(wrapper)).toEqual([[true]])

      vi.advanceTimersByTime(180)
      expect(collectExpandEvents(wrapper)).toEqual([[true], [false]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not expand when the pointer only crosses the panel edge', async () => {
    const wrapper = mountPanel(false)

    await wrapper.get('.shell-bottom-panel').trigger('mouseenter')

    expect(collectExpandEvents(wrapper)).toBeUndefined()
  })

  it('keeps the panel open while a descendant holds focus and closes it when focus leaves', async () => {
    const wrapper = mountPanel(false)
    document.body.appendChild(wrapper.element)
    try {
      const panel = wrapper.get('.shell-bottom-panel')
      panel.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
      await wrapper.setProps({ expanded: true })

      const issueTab = wrapper.get('#shell-bottom-tab-issues').element as HTMLElement
      issueTab.focus()
      vi.useFakeTimers()
      await wrapper.get('.shell-bottom-panel').trigger('mouseleave')
      vi.advanceTimersByTime(180)
      expect(collectExpandEvents(wrapper)).toEqual([[true]])

      panel.element.dispatchEvent(new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: document.body,
      }))
      expect(collectExpandEvents(wrapper)).toEqual([[true], [false]])
    } finally {
      vi.useRealTimers()
      wrapper.unmount()
    }
  })

  it('stays open while pinned and collapses again once unpinned', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanel(true)
    const toggle = wrapper.get('.shell-bottom-panel__toggle')
    try {
      await toggle.trigger('click')
      await wrapper.get('.shell-bottom-panel').trigger('mouseleave')
      vi.advanceTimersByTime(180)
      expect(collectExpandEvents(wrapper)).toEqual([[true]])

      await toggle.trigger('click')
      await wrapper.get('.shell-bottom-panel').trigger('mouseleave')
      vi.advanceTimersByTime(180)
      expect(collectExpandEvents(wrapper)).toEqual([[true], [false]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves focus to the toggle before the content becomes inert', async () => {
    const wrapper = mountPanel(true)
    document.body.appendChild(wrapper.element)
    try {
      const activeTab = wrapper.get('#shell-bottom-tab-issues')
      const activeTabElement = activeTab.element as HTMLElement
      activeTabElement.focus()

      await wrapper.setProps({ expanded: false })

      expect(document.activeElement).toBe(wrapper.get('.shell-bottom-panel__toggle').element)
      expect(wrapper.find('[inert]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('copies an error entry with its catalog meaning and raw detail', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mountPanel(true, outputEntries, 'output')
    const errorLine = wrapper.findAll('button[data-severity="error"]').find(line => line.find('time').exists())!

    await errorLine.trigger('click')

    expect(writeText).toHaveBeenCalledWith('OC-E2003 Could not open the file\nerror details')
  })

  it('follows new output only while the log is scrolled to the end', async () => {
    const wrapper = mountPanel(true, outputEntries, 'output')
    const scroll = wrapper.get<HTMLElement>('.shell-bottom-panel__output-scroll')
    Object.defineProperties(scroll.element, {
      scrollHeight: { configurable: true, value: 300 },
      clientHeight: { configurable: true, value: 100 },
    })

    await wrapper.setProps({ outputEntries: [...outputEntries, {
      id: 4, severity: 'info', timestamp: 4_000, message: 'new message',
    }] })
    await flushPromises()
    expect(scroll.element.scrollTop).toBe(300)

    scroll.element.scrollTop = 50
    await scroll.trigger('scroll')
    await wrapper.setProps({ outputEntries: [...outputEntries, {
      id: 5, severity: 'info', timestamp: 5_000, message: 'later message',
    }] })
    await flushPromises()
    expect(scroll.element.scrollTop).toBe(50)
  })
})
