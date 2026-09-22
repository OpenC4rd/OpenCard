import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcNodeTail from './OcNodeTail.vue'

describe('OcNodeTail', () => {
  it('renders the trailing text and badges of the node in order', () => {
    const wrapper = mount(OcNodeTail, {
      props: {
        tail: ['Local', { type: 'badge', label: 'Missing', icon: 'status.warning', tone: 'warning' }],
      },
    })

    expect(wrapper.classes()).toContain('oc-node-tail')
    expect(wrapper.attributes('data-tooltip-group')).toBeDefined()
    expect(wrapper.get('.oc-node-tail__text').text()).toBe('Local')
    const badge = wrapper.get('.oc-node-tail__badge')
    expect(badge.attributes('role')).toBe('img')
    expect(badge.attributes('aria-label')).toBe('Missing')
    expect(badge.attributes('data-tooltip')).toBe('Missing')
    expect(wrapper.find('.oc-node-tail__action').exists()).toBe(false)
  })

  it('renders every declared command in order', () => {
    const wrapper = mount(OcNodeTail, {
      props: {
        tail: [
          { key: 'rename', title: 'Rename', icon: 'action.edit' },
          { key: 'delete', title: 'Delete', icon: 'action.delete' },
        ],
      },
    })

    expect(wrapper.findAll('.oc-node-tail__action')).toHaveLength(2)
    expect(wrapper.findAll('.oc-node-tail__action button').map(button => button.attributes('aria-label')))
      .toEqual(['Rename', 'Delete'])
  })

  it('reports the triggered command key and forwards the button tabindex', async () => {
    const wrapper = mount(OcNodeTail, {
      props: {
        tail: [{ key: 'delete', title: 'Delete', icon: 'action.delete' }],
        buttonTabindex: -1,
      },
    })

    const button = wrapper.get('button[aria-label="Delete"]')
    expect(button.attributes('tabindex')).toBe('-1')
    await button.trigger('click')
    expect(wrapper.emitted('action')).toEqual([[{ key: 'delete' }]])
  })

  it('marks the tail as always visible only when the caller asks for it', async () => {
    const wrapper = mount(OcNodeTail, {
      props: {
        tail: [{ key: 'delete', title: 'Delete', icon: 'action.delete' }],
      },
    })

    expect(wrapper.classes()).not.toContain('oc-node-tail--always')
    await wrapper.setProps({ actionVisibility: 'always' })
    expect(wrapper.classes()).toContain('oc-node-tail--always')
  })

  it('hides commands behind an inherited display variable with a none fallback', () => {
    // jsdom does not evaluate the scoped stylesheet, so read the source to pin the invariant.
    const source = readFileSync(join(process.cwd(), 'src/components/standard/OcNodeTail.vue'), 'utf8')
    expect(source).toContain('display: var(--oc-node-tail-action-display, none)')
    expect(source).toContain('.oc-node-tail--always {')
  })
})
