import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { h, type VNode } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcTree from '../../../components/standard/OcTree.vue'
import OcResizeTrack from '../../../components/standard/OcResizeTrack.vue'
import type {
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
} from '../../../shared/ui/node/node.types'
import { APP_OUTPUT_SEVERITIES, type AppOutputEntry } from '../../logging/appOutput'
import ShellBottomPanel from './ShellBottomPanel.vue'

const issueTreeData: OcNodeCollection = {
  rootKeys: ['session:a'],
  items: new Map([
    ['session:a', { label: 'Card A (1)', icon: 'file.opencard' }],
    ['issue:a', { label: 'Invalid binding', icon: 'status.warning' }],
  ]),
  children: new Map([['session:a', ['issue:a']]]),
}

const outputEntries: AppOutputEntry[] = [
  { id: 1, severity: 'info', timestamp: 1_000, message: 'info message' },
  { id: 2, severity: 'warning', timestamp: 2_000, message: 'warning message' },
  { id: 3, severity: 'error', timestamp: 3_000, message: 'error details', detail: 'path: missing.ocdocument', code: 'OC-E2003' },
]

function mountPanel(
  expanded = true,
  output: readonly AppOutputEntry[] = [],
  activeTab: 'issues' | 'output' = 'issues',
  leading?: () => VNode,
) {
  return mount(ShellBottomPanel, {
    slots: leading ? { leading } : {},
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
      outputSeverityLabels: {
        info: 'Info', success: 'Success', warning: 'Warning', error: 'Error',
      },
      expandLabel: 'Expand panel',
      collapseLabel: 'Collapse panel',
      pinLabel: 'Pin panel',
      unpinLabel: 'Unpin panel',
    },
  })
}

describe('ShellBottomPanel', () => {
  it('projects controlled tree data and sends the selected key to its page', () => {
    const wrapper = mountPanel()
    const tree = wrapper.getComponent(OcTree)
    const event: OcNodeActivateEvent = { key: 'issue:a' }

    expect(tree.props('data')).toEqual(issueTreeData)
    expect(tree.props('expandedKeys')).toEqual(['session:a'])
    tree.vm.$emit('node-activate', event)

    expect(wrapper.emitted('issue-navigate')).toEqual([['issue:a']])
  })

  it('filters diagnostics by their instance, Block, or field label text', async () => {
    const wrapper = mountPanel()
    const filter = wrapper.get('input[type="search"]')
    await filter.setValue('invalid binding')
    expect(wrapper.findComponent(OcTree).props('data').rootKeys).toEqual(['session:a'])
    await filter.setValue('missing field')
    await flushPromises()
    expect(wrapper.findComponent(OcTree).exists()).toBe(false)
    expect(wrapper.text()).toContain('No problems')
  })

  it('emits controlled expansion changes without interpreting the node key', () => {
    const wrapper = mountPanel()
    const tree = wrapper.getComponent(OcTree)

    tree.vm.$emit('expansion-change', {
      key: 'session:a',
      expanded: false,
    } satisfies OcNodeExpansionEvent)

    expect(wrapper.emitted('issue-expansion-change')).toEqual([['session:a', false]])
  })

  it('leaves grouping-node interpretation to the supplying page', () => {
    const wrapper = mountPanel()
    const tree = wrapper.getComponent(OcTree)

    tree.vm.$emit('node-activate', {
      key: 'session:a',
    } satisfies OcNodeActivateEvent)

    expect(wrapper.emitted('issue-navigate')).toEqual([['session:a']])
  })

  it('requests expansion on hover and collapse after leaving the whole panel', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanel(false)

    try {
      await wrapper.get('.shell-bottom-panel__toggle').trigger('mouseenter')
      await wrapper.setProps({ expanded: true })
      await wrapper.get('#shell-bottom-tab-output').trigger('click')
      await wrapper.get('.shell-bottom-panel').trigger('mouseleave')
      expect(wrapper.emitted('expanded-change')).toEqual([[true]])
      vi.advanceTimersByTime(180)

      expect(wrapper.emitted('expanded-change')).toEqual([[true], [false]])
      expect(wrapper.emitted('tab-change')).toEqual([['output']])
      expect(wrapper.get('.shell-bottom-panel').classes()).toContain('is-expanded')
      expect(wrapper.get('#shell-bottom-tab-issues').attributes('aria-selected')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the panel open while its resize handle has keyboard focus', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanel(true, [], 'issues', () => h(OcResizeTrack, {
      label: 'Resize panel', minimum: 120, maximum: 300, value: 180,
    }))
    document.body.appendChild(wrapper.element)
    try {
      ;(wrapper.get('[role=separator]').element as HTMLElement).focus()
      await wrapper.get('.shell-bottom-panel').trigger('mouseleave')
      vi.advanceTimersByTime(180)
      expect(wrapper.emitted('expanded-change')).toBeUndefined()
      await wrapper.get('[role=separator]').trigger('keydown', { key: 'ArrowUp' })
      expect(wrapper.getComponent(OcResizeTrack).emitted('update:value')).toEqual([[164]])
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('locks and unlocks from the floating control', async () => {
    const wrapper = mountPanel(true)
    const toggle = wrapper.get('.shell-bottom-panel__toggle')
 
    await toggle.trigger('click')
    await toggle.trigger('click')
 
    expect(wrapper.emitted('expanded-change')).toEqual([[true]])
    expect(toggle.attributes('aria-pressed')).toBe('false')
  })

  it('moves focus to the toggle before making the panel content inert', async () => {
    const wrapper = mountPanel(true)
    document.body.appendChild(wrapper.element)

    try {
      const activeTab = wrapper.get('#shell-bottom-tab-issues')
      const toggle = wrapper.get('.shell-bottom-panel__toggle')

      ;(activeTab.element as HTMLButtonElement).focus()
      expect(document.activeElement).toBe(activeTab.element)

      await wrapper.setProps({ expanded: false })

      expect(document.activeElement).toBe(toggle.element)
      expect(wrapper.get('.shell-bottom-panel__content').attributes()).not.toHaveProperty('aria-hidden')
      expect(wrapper.get('.shell-bottom-panel__content').attributes()).toHaveProperty('inert')
    } finally {
      wrapper.unmount()
    }
  })

  it('exposes the highest issue severity on the center control only when issues exist', async () => {
    const wrapper = mountPanel(false)
    const toggle = wrapper.get('.shell-bottom-panel__toggle')

    expect(toggle.attributes('data-issue-severity')).toBe('warning')

    await wrapper.setProps({ issueSeverity: 'error' })
    expect(toggle.attributes('data-issue-severity')).toBe('error')

    await wrapper.setProps({ issueCount: 0 })
    expect(toggle.attributes()).not.toHaveProperty('data-issue-severity')
  })

  it('locks and unlocks automatic expansion from the floating toggle', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanel(true)
    const toggle = wrapper.get('.shell-bottom-panel__toggle')
 
    try {
      expect(toggle.getComponent(OcIcon).props('name')).toBe('nav.chevron-down')
      await toggle.trigger('mouseenter')
      expect(toggle.getComponent(OcIcon).props('name')).toBe('tool.pin')
      expect(toggle.attributes('aria-pressed')).toBe('false')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-pressed')).toBe('true')
      expect(toggle.getComponent(OcIcon).props('name')).toBe('tool.pin-off')
      expect(toggle.attributes('aria-label')).toBe('Unpin panel')
      await wrapper.get('.shell-bottom-panel').trigger('mouseleave')
      vi.advanceTimersByTime(180)
      expect(wrapper.emitted('expanded-change')).toEqual([[true]])
 
      await toggle.trigger('mouseleave')
      expect(toggle.getComponent(OcIcon).props('name')).toBe('nav.chevron-down')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-pressed')).toBe('false')
      await toggle.trigger('mouseenter')
      expect(toggle.getComponent(OcIcon).props('name')).toBe('tool.pin')
      expect(toggle.attributes('aria-label')).toBe('Pin panel')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not expand when the pointer only crosses the panel edge', async () => {
    const wrapper = mountPanel(false)

    await wrapper.get('.shell-bottom-panel').trigger('mouseenter')

    expect(wrapper.emitted('expanded-change')).toBeUndefined()
  })

  it('opens on keyboard focus and closes when focus leaves the panel', async () => {
    const wrapper = mountPanel(false)
    const panel = wrapper.get('.shell-bottom-panel')
    panel.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.setProps({ expanded: true })
    panel.element.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: document.body,
    }))
 
    expect(wrapper.emitted('expanded-change')).toEqual([[true], [false]])
  })

  it('renders timestamped output, filters by severity, and emits clear', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const wrapper = mountPanel(true, outputEntries, 'output')

    expect(wrapper.findAll('.shell-bottom-panel__output-line')).toHaveLength(3)
    expect(wrapper.get('.shell-bottom-panel__output').element.lastElementChild)
      .toBe(wrapper.get('.shell-bottom-panel__output-toolbar').element)
    expect(wrapper.get('.shell-bottom-panel__severity-dock')
      .find('.shell-bottom-panel__severity-filters').exists()).toBe(true)
    expect(wrapper.get('[data-severity="warning"] .shell-bottom-panel__output-message').text())
      .toBe('warning message')
    const errorEntry = wrapper.get('.shell-bottom-panel__output-line[data-severity="error"]')
    expect(errorEntry.find('time').exists()).toBe(true)
    expect(errorEntry.get('.shell-bottom-panel__output-severity').text()).toBe('Error')
    expect(errorEntry.text()).toContain('OC-E2003')
    expect(errorEntry.text()).toContain('Could not open the file')
    expect(errorEntry.get('.shell-bottom-panel__output-detail').text()).toBe('path: missing.ocdocument')
    expect(errorEntry.text()).not.toContain('error details')
    await errorEntry.trigger('click')
    expect(writeText).toHaveBeenCalledWith(
      'OC-E2003 Could not open the file\nerror details',
    )
    expect(wrapper.get('.shell-bottom-panel__severity-filter[data-severity="warning"]')
      .text()).toContain('1')

    await wrapper.get('.shell-bottom-panel__severity-filter[data-severity="warning"]').trigger('click')
    expect(wrapper.findAll('.shell-bottom-panel__output-line')).toHaveLength(2)
    expect(wrapper.find('.shell-bottom-panel__output-line[data-severity="warning"]').exists()).toBe(false)

    const clear = wrapper.findAll('button').find(button => button.text() === 'Clear')!
    expect(clear.classes()).toContain('shell-bottom-panel__output-clear')
    expect(clear.classes()).toContain('shell-bottom-panel__toolbar-button')
    for (const filter of wrapper.findAll('.shell-bottom-panel__severity-filter')) {
      expect(filter.classes()).toContain('shell-bottom-panel__toolbar-button')
    }
    await clear.trigger('click')
    expect(wrapper.emitted('output-clear')).toEqual([[]])
  })

  it('styles every output severity declared by the output channel', () => {
    const source = readFileSync(join(process.cwd(), 'src/features/shell/components/ShellBottomPanel.vue'), 'utf8')

    for (const severity of APP_OUTPUT_SEVERITIES) {
      expect(source).toContain(`[data-severity='${severity}']`)
    }
    for (const stale of ['debug', 'log', 'warn']) {
      expect(source).not.toContain(`[data-severity='${stale}']`)
    }
  })

  it('follows new output only while the log view is at the end', async () => {
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
