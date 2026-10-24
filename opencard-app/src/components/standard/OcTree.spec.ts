import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OcNode, OcNodeCollection } from '../../shared/ui/node/node.types'
import OcTree from './OcTree.vue'
import { taskScheduler } from '../../utils/taskScheduler'

function createData(options: {
  roots?: string[]
  items?: Array<[string, OcNode]>
  children?: Array<[string, string[]]>
} = {}): OcNodeCollection {
  return {
    rootKeys: options.roots ?? ['root'],
    items: new Map(options.items ?? [
      ['root', { label: 'Root', visual: { type: 'icon', icon: 'mdiDatabaseOutline' }, renamable: true }],
    ]),
    children: new Map(options.children ?? []),
  }
}

describe('OcTree', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('reports the clicked row as the new selection', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['first', 'second'],
          items: [
            ['first', { label: 'First' }],
            ['second', { label: 'Second' }],
          ],
        }),
      },
    })

    await wrapper.get('[data-oc-tree-key="first"] .oc-tree__row').trigger('click')
    expect(wrapper.emitted('selection-change')).toEqual([[
      { triggerKey: 'first', selectedKeys: ['first'] },
    ]])
  })

  it.each([
    ['expand', ['open', 'parent', 'root']],
    ['expand-exclusive', ['parent', 'root']],
  ] as const)('requests the ancestors a selection needs in %s mode', async (mode, expectedKeys) => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [
            ['root', { label: 'Root' }],
            ['parent', { label: 'Parent' }],
            ['child', { label: 'Child' }],
          ],
          children: [
            ['root', ['parent']],
            ['parent', ['child']],
          ],
        }),
        selectedKeys: ['child'],
        expandedKeys: ['open'],
        selectionExpansionMode: mode,
      },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('expansion-sync')).toContainEqual([{
      expandedKeys: expectedKeys,
    }])
  })

  it('keeps expanded descendants of a selected branch in expand-exclusive mode', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['root', 'other'],
          items: [
            ['root', { label: 'Root' }],
            ['parent', { label: 'Parent' }],
            ['selected', { label: 'Selected' }],
            ['child', { label: 'Child' }],
            ['other', { label: 'Other' }],
          ],
          children: [
            ['root', ['parent']],
            ['parent', ['selected']],
            ['selected', ['child']],
          ],
        }),
        selectedKeys: ['selected'],
        expandedKeys: ['other', 'selected', 'child'],
        selectionExpansionMode: 'expand-exclusive',
      },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('expansion-sync')).toContainEqual([{
      expandedKeys: ['parent', 'root', 'selected', 'child'],
    }])
  })

  it('keeps every selected branch visible in expand-exclusive mode', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['left-root', 'right-root'],
          items: [
            ['left-root', { label: 'Left root' }],
            ['left-child', { label: 'Left child' }],
            ['right-root', { label: 'Right root' }],
            ['right-child', { label: 'Right child' }],
          ],
          children: [
            ['left-root', ['left-child']],
            ['right-root', ['right-child']],
          ],
        }),
        selectedKeys: ['left-child', 'right-child'],
        expandedKeys: ['left-child'],
        selectionMode: 'multiple',
        selectionExpansionMode: 'expand-exclusive',
      },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('expansion-sync')).toContainEqual([{
      expandedKeys: ['left-root', 'right-root', 'left-child'],
    }])
  })

  it('windows a thousand rows and reveals an offscreen selection', async () => {
    const keys = Array.from({ length: 1000 }, (_, index) => `item-${index}`)
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: keys,
          items: keys.map(key => [key, { label: key }]),
        }),
        fill: true,
        virtualized: true,
        scrollToSelection: true,
      },
    })

    expect(wrapper.findAll('[data-oc-tree-key]').length).toBeLessThanOrEqual(12)
    await wrapper.setProps({ selectedKeys: ['item-999'] })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    await vi.waitFor(() => expect(wrapper.find('[data-oc-tree-key="item-999"]').exists()).toBe(true))
    const selectedRow = wrapper.get('[data-oc-tree-key="item-999"] .oc-tree__row')
    expect(selectedRow.attributes()).toMatchObject({
      'aria-posinset': '1000',
      'aria-setsize': '1000',
      tabindex: '0',
    })
    expect(wrapper.findAll('[data-oc-tree-key]').length).toBeLessThanOrEqual(12)
  })

  it('stops building a large structure after its view is destroyed', async () => {
    let reads = 0
    const keys = Array.from({ length: 10000 }, (_, index) => `item-${index}`)
    const wrapper = mount(OcTree, { props: {
      data: createData({ roots: keys, items: keys.map(key => [key, {
        label: key, get disabled() { reads++; return false },
      }]) }), virtualized: true,
    } })
    wrapper.unmount()
    const before = reads
    await taskScheduler.yieldToUi()
    expect(reads).toBe(before)
    expect(reads).toBeLessThanOrEqual(256)
  })

  it('leaves the tree out of Tab order on request while a click still focuses the row', async () => {
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: {
        data: createData({
          roots: ['root', 'child'],
          items: [
            ['root', { label: 'Root', tail: [{ key: 'move', title: 'Move', icon: 'mdiDragVariant' }] }],
            ['child', { label: 'Child', tail: [{ key: 'move', title: 'Move', icon: 'mdiDragVariant' }] }],
          ],
        }),
        tabNavigation: 'none',
      },
    })

    expect(wrapper.findAll('[role="treeitem"]').map(row => row.attributes('tabindex'))).toEqual(['-1', '-1'])
    expect(wrapper.findAll('[role="treeitem"] button').map(button => button.attributes('tabindex'))).toEqual(['-1', '-1'])
    await wrapper.get('[data-oc-tree-key="child"] [role="treeitem"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('[data-oc-tree-key="child"] [role="treeitem"]').element)
    wrapper.unmount()
  })

  it('clamps the direct-child badge at 99', () => {
    const childKeys = Array.from({ length: 100 }, (_, index) => `child-${index}`)
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [
            ['root', { label: 'Root', visual: { type: 'icon', icon: 'mdiDatabaseOutline' } }],
            ...childKeys.map((key): [string, OcNode] => [key, { label: key }]),
          ],
          children: [['root', childKeys]],
        }),
      },
    })

    expect(wrapper.get('.oc-tree__child-count').text()).toBe('99+')
  })

  it('emits expansion changes without mutating controlled state', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [
            ['root', { label: 'Root' }],
            ['child', { label: 'Child' }],
          ],
          children: [['root', ['child']]],
        }),
      },
    })

    await wrapper.get('.oc-tree__icon-slot').trigger('click')
    expect(wrapper.emitted('expansion-change')?.[0]).toEqual([{
      key: 'root',
      expanded: true,
    }])
    expect(wrapper.find('[data-oc-tree-key="child"]').exists()).toBe(false)
  })

  it('separates click selection from double-click activation', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['first', 'second'],
          items: [
            ['first', { label: 'First' }],
            ['second', { label: 'Second' }],
          ],
        }),
        activationMode: 'double-click',
      },
    })
    const row = wrapper.get('[data-oc-tree-key="second"] .oc-tree__row')

    await row.trigger('click')
    expect(wrapper.emitted('selection-change')).toEqual([[{
      triggerKey: 'second',
      selectedKeys: ['second'],
    }]])
    expect(wrapper.emitted('node-activate')).toBeUndefined()

    const doubleClick = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    row.element.dispatchEvent(doubleClick)
    await wrapper.vm.$nextTick()

    expect(doubleClick.defaultPrevented).toBe(true)
    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'second' }]])
  })

  it('activates on a single click and ignores a double click in single-click mode', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['first', 'second'],
          items: [
            ['first', { label: 'First' }],
            ['second', { label: 'Second' }],
          ],
        }),
        activationMode: 'single-click',
      },
    })
    const row = wrapper.get('[data-oc-tree-key="second"] .oc-tree__row')

    await row.trigger('click')
    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'second' }]])

    row.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'second' }]])
  })

  it('never activates a row while no activation mode is given', async () => {
    const wrapper = mount(OcTree, { props: { data: createData() } })
    const row = wrapper.get('.oc-tree__row')

    await row.trigger('click')
    row.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('node-activate')).toBeUndefined()
    expect(wrapper.emitted('selection-change')).toEqual([[{
      triggerKey: 'root',
      selectedKeys: ['root'],
    }]])
  })

  it('keeps activation working on rows revealed by expanding a parent', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [
            ['root', { label: 'Root' }],
            ['child', { label: 'Child' }],
          ],
          children: [['root', ['child']]],
        }),
        activationMode: 'double-click',
      },
    })

    await wrapper.get('[data-oc-tree-key="root"] .oc-tree__icon-slot').trigger('click')
    expect(wrapper.emitted('expansion-change')?.[0]).toEqual([{ key: 'root', expanded: true }])
    expect(wrapper.emitted('node-activate')).toBeUndefined()

    await wrapper.setProps({ expandedKeys: ['root'] })
    expect(wrapper.find('[data-oc-tree-key="child"]').exists()).toBe(true)
    const childRow = wrapper.get('[data-oc-tree-key="child"] .oc-tree__row')
    childRow.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'child' }]])
  })

  it.each([
    ['tree', 'treeitem'],
    ['listbox', 'option'],
    ['menu', 'menuitem'],
  ] as const)('exposes the %s role on its rows', (role, rowRole) => {
    const wrapper = mount(OcTree, {
      props: { data: createData(), role, selectionMode: role === 'menu' ? 'none' : 'single' },
    })

    expect(wrapper.get('.oc-tree').attributes('role')).toBe(role)
    expect(wrapper.get('.oc-tree__row').attributes('role')).toBe(rowRole)
  })

  it('reports ctrl-click multi-selection and keyboard expansion', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['root', 'second'],
          items: [
            ['root', { label: 'Root' }],
            ['child', { label: 'Child' }],
            ['second', { label: 'Second' }],
          ],
          children: [['root', ['child']]],
        }),
        selectedKeys: ['root'],
        selectionMode: 'multiple',
      },
    })

    await wrapper.get('[data-oc-tree-key="second"] .oc-tree__row').trigger('click', { ctrlKey: true })
    await wrapper.get('[data-oc-tree-key="root"] .oc-tree__row').trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.emitted('selection-change')).toEqual([
      [{
        triggerKey: 'second',
        selectedKeys: ['root', 'second'],
      }],
    ])
    expect(wrapper.emitted('expansion-change')).toEqual([
      [{ key: 'root', expanded: true }],
    ])
  })

  it('selects the range from the selection anchor with Shift', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['first', 'second', 'third'],
          items: [
            ['first', { label: 'First' }],
            ['second', { label: 'Second' }],
            ['third', { label: 'Third' }],
          ],
        }),
        selectedKeys: ['first'],
        selectionMode: 'multiple',
      },
    })

    await wrapper.get('[data-oc-tree-key="third"] .oc-tree__row').trigger('click', { shiftKey: true })

    expect(wrapper.emitted('selection-change')?.[0]).toEqual([{
      triggerKey: 'third',
      selectedKeys: ['first', 'second', 'third'],
    }])
  })

  it('selects on middle click without treating it as a primary selection', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['root', 'second'],
          items: [
            ['root', { label: 'Root' }],
            ['second', { label: 'Second' }],
          ],
        }),
        selectedKeys: ['root'],
        selectionMode: 'multiple',
      },
    })

    await wrapper.get('[data-oc-tree-key="second"] .oc-tree__row').trigger('auxclick', { button: 1, ctrlKey: true })

    expect(wrapper.emitted('selection-change')?.[0]).toEqual([{
      triggerKey: 'second',
      selectedKeys: ['root', 'second'],
    }])
  })

  it('stops malformed visible topology without following cycles', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mount(OcTree, {
      props: {
        expandedKeys: ['root', 'child'],
        data: createData({
          roots: ['root'],
          items: [
            ['root', { label: 'Root' }],
            ['child', { label: 'Child' }],
          ],
          children: [
            ['root', ['child', 'missing']],
            ['child', ['root']],
          ],
        }),
      },
    })

    const messages = warn.mock.calls.map(([message]) => String(message)).join('\n')
    expect(messages).toContain('Missing item for key "missing"')
    expect(messages).toContain('Children cycle detected')
  })
})
