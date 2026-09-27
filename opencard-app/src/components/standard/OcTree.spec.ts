import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  OcNode,
  OcNodeActivateEvent,
  OcNodeCollection,
} from '../../shared/ui/node/node.types'
import OcTree from './OcTree.vue'
import OcActionButton from './OcActionButton.vue'
import { useFloatingMenu } from '../../composables/useFloatingMenu'
import { registerUnhandledExternalDrop } from '../../shared/ui/drop/externalFileDrop'

const platform = vi.hoisted(() => ({
  dragDropHandler: null as ((event: { payload: unknown }) => void) | null,
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: async (handler: (event: { payload: unknown }) => void) => {
      platform.dragDropHandler = handler
      return platform.unlisten
    },
  }),
}))

function emitPlatformDragDrop(payload: unknown): void {
  platform.dragDropHandler?.({ payload })
}

function createData(options: {
  roots?: string[]
  items?: Array<[string, OcNode]>
  children?: Array<[string, string[]]>
} = {}): OcNodeCollection {
  return {
    rootKeys: options.roots ?? ['root'],
    items: new Map(options.items ?? [
      ['root', { label: 'Root', visual: { type: 'icon', icon: 'data.collection' }, renamable: true }],
    ]),
    children: new Map(options.children ?? []),
  }
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0, y: 0, top: 0, right: width, bottom: height, left: 0, width, height,
    toJSON: () => ({}),
  }
}

describe('OcTree', () => {
  afterEach(() => {
    useFloatingMenu().closeMenu()
    vi.restoreAllMocks()
  })

  it('centers a placeholder while the tree has no visible entries', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({ roots: [], items: [] }),
        placeholder: 'Opened files appear here',
      },
    })

    expect(wrapper.classes()).toContain('is-empty')
    expect(wrapper.get('.oc-tree__placeholder').text()).toBe('Opened files appear here')
    await wrapper.setProps({ data: createData() })
    expect(wrapper.classes()).not.toContain('is-empty')
    expect(wrapper.find('.oc-tree__placeholder').exists()).toBe(false)
  })

  it('renders roots as list rows and reports the triggered selection', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          roots: ['first', 'second'],
          items: [
            ['first', { label: 'First' }],
            ['second', { label: 'Second' }],
          ],
        }),
        selectedKeys: ['second'],
      },
    })

    expect(wrapper.findAll('[data-oc-tree-key]')).toHaveLength(2)
    expect(wrapper.get('[data-oc-tree-key="second"] .oc-tree__row').classes()).toContain('is-selected')

    await wrapper.get('[data-oc-tree-key="first"] .oc-tree__row').trigger('click')
    expect(wrapper.emitted('selection-change')?.[0]).toEqual([{
      triggerKey: 'first',
      selectedKeys: ['first'],
    }])
  })

  it('keeps a badge-only tail as a standalone part of the row', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'A long changed file name',
            tail: { type: 'badge', label: 'Added', icon: 'action.add', tone: 'success' },
          }]],
        }),
      },
    })
    // OcText 的提示全文取自它自己渲染出来的字，所以挂载后一拍才挂上属性。
    await nextTick()

    // The trailing line lives in the row's append container, so the chip carries its own width next
    // to the title instead of being squeezed inside a box of its own. The tree's tail line is
    // layout-transparent (`display: contents`), so the chip stays a direct flex item of the append.
    const append = wrapper.get('.oc-tree__row .oc-row__append')
    const tail = wrapper.get('.oc-tree__tail')
    expect(append.element.children).toHaveLength(1)
    expect(tail.element.className).toContain('oc-tree__tail')
    expect(Array.from(tail.element.children).map(child => child.className)).toEqual(['oc-node-tail__badge'])
    expect(wrapper.get('.oc-node-tail__badge').attributes('aria-label')).toBe('Added')
    expect(wrapper.get('.oc-node-tail__badge').attributes('data-tooltip')).toBe('Added')
    expect(wrapper.get('.oc-tree__label').attributes('data-tooltip')).toBe('A long changed file name')
    expect(wrapper.get('.oc-tree__label').attributes()).toHaveProperty('data-tooltip-overflow')
  })

  it('opts project-icon visuals into the shared project-icon renderer', () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Icon',
            visual: { type: 'style', style: { '--oc-project-icon-renderer': 'mask' } },
          }]],
        }),
      },
    })
    expect(wrapper.get('.oc-tree__node-visual').classes()).toContain('oc-project-icon')
  })

  it.each([
    ['expand', ['open', 'parent', 'root']],
    ['expand-exclusive', ['parent', 'root']],
  ] as const)('requests %s selection ancestor expansion from tree topology', async (mode, expectedKeys) => {
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

  it('keeps expanded descendants of the selected branch in expand-exclusive mode', async () => {
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

  it('scrolls the tree viewport to a selected row only when enabled', async () => {
    const data = createData({
      roots: ['first', 'second'],
      items: [
        ['first', { label: 'First' }],
        ['second', { label: 'Second' }],
      ],
    })
    const wrapper = mount(OcTree, {
      props: {
        data,
        selectedKeys: ['first'],
        scrollToSelection: false,
        fill: true,
      },
    })
    const root = wrapper.get('.oc-tree').element as HTMLElement
    const secondRow = wrapper.get('[data-oc-tree-key="second"] .oc-tree__row').element as HTMLElement
    root.scrollTop = 0
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      top: 0, bottom: 100, left: 0, right: 200, width: 200, height: 100, x: 0, y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(secondRow, 'getBoundingClientRect').mockReturnValue({
      top: 120, bottom: 150, left: 0, right: 200, width: 200, height: 30, x: 0, y: 120,
      toJSON: () => ({}),
    })

    await wrapper.setProps({ selectedKeys: ['second'] })
    expect(root.scrollTop).toBe(0)

    await wrapper.setProps({ scrollToSelection: true })
    await wrapper.vm.$nextTick()
    expect(root.scrollTop).toBe(50)
  })

  it('windows a thousand fixed-height rows and reveals an offscreen selection', async () => {
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

    const selectedRow = wrapper.get('[data-oc-tree-key="item-999"] .oc-tree__row')
    expect(selectedRow.attributes()).toMatchObject({
      'aria-posinset': '1000',
      'aria-setsize': '1000',
      tabindex: '0',
    })
    expect(wrapper.findAll('[data-oc-tree-key]').length).toBeLessThanOrEqual(12)
  })
  it('renders expanded children and rotates the node type icon', () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [
            ['root', { label: 'Root', visual: { type: 'icon', icon: 'data.collection' } }],
            ['child', { label: 'Child' }],
          ],
          children: [['root', ['child']]],
        }),
        expandedKeys: ['root'],
      },
    })

    expect(wrapper.findAll('[data-oc-tree-key]')).toHaveLength(2)
    expect(wrapper.get('[data-oc-tree-key="child"]').attributes('style')).toContain('12px')
    expect(wrapper.get('[data-oc-tree-key="root"] .oc-tree__node-visual').classes()).toContain('is-expanded')
    expect(wrapper.get('[data-oc-tree-key="root"] .oc-tree__child-count').classes()).toContain('is-expanded')
    expect(wrapper.get('[data-oc-tree-key="root"] .oc-tree__branch-guide').attributes('data-guide-rows')).toBe('1')
    expect(wrapper.find('[data-oc-tree-key="root"] .oc-tree__branch-connector').exists()).toBe(false)
    expect(wrapper.find('[data-oc-tree-key="child"] .oc-tree__branch-connector').exists()).toBe(true)
    expect(wrapper.find('[data-oc-tree-key="child"] .oc-tree__branch-guide').exists()).toBe(false)
  })

  it('can leave the tree out of Tab order while pointer focus keeps keyboard interaction active', async () => {
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: {
        data: createData({
          roots: ['root', 'child'],
          items: [
            ['root', { label: 'Root', tail: [{ key: 'move', title: 'Move', icon: 'action.drag' }] }],
            ['child', { label: 'Child', tail: [{ key: 'move', title: 'Move', icon: 'action.drag' }] }],
          ],
        }),
        tabNavigation: 'none',
      },
    })

    expect(wrapper.findAll('.oc-tree__row').map(row => row.attributes('tabindex'))).toEqual(['-1', '-1'])
    expect(wrapper.findAll('.oc-node-tail__action button').map(button => button.attributes('tabindex'))).toEqual(['-1', '-1'])
    await wrapper.get('[data-oc-tree-key="child"] .oc-tree__row').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('[data-oc-tree-key="child"] .oc-tree__row').element)
    wrapper.unmount()
  })

  it.each([
    [3, '3'],
    [100, '99+'],
  ])('shows %i direct children as the %s icon badge', (childCount, expectedBadge) => {
    const childKeys = Array.from({ length: childCount }, (_, index) => `child-${index}`)
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [
            ['root', { label: 'Root', visual: { type: 'icon', icon: 'data.collection' } }],
            ...childKeys.map((key): [string, OcNode] => [key, { label: key }]),
          ],
          children: [['root', childKeys]],
        }),
      },
    })

    expect(wrapper.get('.oc-tree__child-count').text()).toBe(expectedBadge)
    expect(wrapper.get('.oc-tree__child-count').classes()).toContain('oc-number-badge')
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

  it('activates the double-clicked row and prevents that event default', async () => {
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
    const doubleClick = new MouseEvent('dblclick', { bubbles: true, cancelable: true })

    row.element.dispatchEvent(doubleClick)
    await wrapper.vm.$nextTick()

    // The pair is swallowed by the row, and the event carries the row's own key and nothing else.
    expect(doubleClick.defaultPrevented).toBe(true)
    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'second' }]])
    const payload = wrapper.emitted('node-activate')?.[0]?.[0] as OcNodeActivateEvent
    expect(Object.keys(payload)).toEqual(['key'])
  })

  it('keeps a single click selecting without activating in double-click mode', async () => {
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

    await wrapper.get('[data-oc-tree-key="second"] .oc-tree__row').trigger('click')

    // The click still reaches the row, but its selection intent stays separate from activation.
    expect(wrapper.emitted('selection-change')).toEqual([[{
      triggerKey: 'second',
      selectedKeys: ['second'],
    }]])
    expect(wrapper.emitted('node-activate')).toBeUndefined()
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
    // The same activation still stands alone: the double click adds no second report.
    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'second' }]])
  })

  it('never activates a row while the activation mode is none', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData(),
        activationMode: 'none',
      },
    })
    const row = wrapper.get('.oc-tree__row')

    await row.trigger('click')
    row.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('node-activate')).toBeUndefined()
    // The click is a real row click: it selects, so the silence above is the disabled activation.
    expect(wrapper.emitted('selection-change')).toEqual([[{
      triggerKey: 'root',
      selectedKeys: ['root'],
    }]])
  })

  it('never activates a row while no activation mode is given', async () => {
    const wrapper = mount(OcTree, { props: { data: createData() } })
    const row = wrapper.get('.oc-tree__row')

    await row.trigger('click')
    row.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('node-activate')).toBeUndefined()
  })

  it('keeps activation consistent on rows revealed by expanding a parent', async () => {
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

    // Expansion is controlled, so it is driven the way a parent does it: a real icon click, then
    // the new expanded state fed back into the tree.
    await wrapper.get('[data-oc-tree-key="root"] .oc-tree__icon-slot').trigger('click')
    expect(wrapper.emitted('expansion-change')?.[0]).toEqual([{ key: 'root', expanded: true }])
    expect(wrapper.emitted('node-activate')).toBeUndefined()

    await wrapper.setProps({ expandedKeys: ['root'] })
    expect(wrapper.find('[data-oc-tree-key="child"]').exists()).toBe(true)
    const childRow = wrapper.get('[data-oc-tree-key="child"] .oc-tree__row')
    childRow.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'child' }]])

    await wrapper.get('[data-oc-tree-key="root"] .oc-tree__icon-slot').trigger('click')
    expect(wrapper.emitted('expansion-change')?.[1]).toEqual([{ key: 'root', expanded: false }])
    await wrapper.setProps({ expandedKeys: [] })
    expect(wrapper.find('[data-oc-tree-key="child"]').exists()).toBe(false)
  })

  it('keeps rename draft local and emits a rename commit on Enter', async () => {
    const data = createData()
    const wrapper = mount(OcTree, { props: { data } })

    await (wrapper.vm as unknown as { beginRename: (key: string) => Promise<void> })
      .beginRename('root')
    const input = wrapper.get('input')
    await input.setValue('Renamed')
    await input.trigger('keydown', { key: 'Enter' })

    expect(data.items.get('root')?.label).toBe('Root')
    expect(wrapper.emitted('rename-commit')).toEqual([[
      { key: 'root', name: 'Renamed' },
    ]])
  })

  it('applies the consumer-provided rename selection range', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'archive.tar.gz',
            renamable: true,
            renameSelection: { start: 0, end: 11 },
          }]],
        }),
      },
    })

    await (wrapper.vm as unknown as { beginRename: (key: string) => Promise<void> })
      .beginRename('root')

    const input = wrapper.get('input').element as HTMLInputElement
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 11])
  })

  it('commits rename on a real focus change and cancels it on Escape', async () => {
    const wrapper = mount(OcTree, { attachTo: document.body, props: { data: createData() } })
    const tree = wrapper.vm as unknown as { beginRename: (key: string) => Promise<void> }

    await tree.beginRename('root')
    await wrapper.get('input').setValue('Blurred')
    ;(wrapper.get('.oc-tree__row').element as HTMLElement).focus()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('rename-commit')).toEqual([[
      { key: 'root', name: 'Blurred' },
    ]])

    await tree.beginRename('root')
    await wrapper.get('input').setValue('Cancelled')
    await wrapper.get('input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.emitted('rename-commit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps rename actions generic until the parent calls beginRename', async () => {
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            renamable: true,
            tail: [{ key: 'rename', title: 'Rename', icon: 'action.edit' }],
          }]],
        }),
      },
    })

    expect(wrapper.find('button[aria-label="Rename"]').exists()).toBe(true)
    await wrapper.get('button[aria-label="Rename"]').trigger('click')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.emitted('action')).toEqual([[
      { key: 'root', actionKey: 'rename', source: 'inline' },
    ]])

    await (wrapper.vm as unknown as { beginRename: (key: string) => Promise<void> })
      .beginRename('root')
    expect(wrapper.get('input').element).toBe(document.activeElement)
    wrapper.unmount()
  })

  it('starts renaming in place on F2 for a renamable node', async () => {
    const wrapper = mount(OcTree, { attachTo: document.body, props: { data: createData() } })

    await wrapper.get('.oc-tree__row').trigger('keydown', { key: 'F2' })

    expect(wrapper.get('input').element).toBe(document.activeElement)
    expect(wrapper.emitted('rename-commit')).toBeUndefined()
    wrapper.unmount()
  })

  it('ignores F2 on a node that is not renamable', async () => {
    const wrapper = mount(OcTree, {
      props: { data: createData({ items: [['root', { label: 'Root' }]] }) },
    })

    await wrapper.get('.oc-tree__row').trigger('keydown', { key: 'F2' })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.emitted('rename-commit')).toBeUndefined()
  })

  it.each([
    ['tree', 'treeitem'],
    ['listbox', 'option'],
    ['menu', 'menuitem'],
  ] as const)('maps the %s role onto its rows', (role, rowRole) => {
    const wrapper = mount(OcTree, {
      props: { data: createData(), role, selectionMode: role === 'menu' ? 'none' : 'single' },
    })

    expect(wrapper.get('.oc-tree').attributes('role')).toBe(role)
    expect(wrapper.get('.oc-tree__row').attributes('role')).toBe(rowRole)
  })

  it('emits controlled multiple selection and keyboard expansion intents', async () => {
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

  it('keeps middle-button selection distinct from primary selection', async () => {
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

  it('selects the visible range from the selection anchor with Shift', async () => {
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

  it('shows only declared actions and keeps disabled actions visible with their reason', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            tail: [
              'Metadata',
              { key: 'duplicate', title: 'Duplicate', icon: 'action.copy' },
              { key: 'delete', title: 'Delete', icon: 'action.delete', disabled: true, disabledReason: 'Protected' },
            ],
          }]],
        }),
      },
    })

    await wrapper.get('button[aria-label="Duplicate"]').trigger('click')
    expect(wrapper.get('.oc-tree__row .oc-row__append').text()).toBe('Metadata')
    expect(wrapper.get('button[aria-label="Delete: Protected"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('action')).toEqual([[
      { key: 'root', actionKey: 'duplicate', source: 'inline' },
    ]])
  })

  it('packs all root actions into one more menu when the title cannot fit without the trade', async () => {
    let resize: ResizeObserverCallback = () => undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe(): void {}
      disconnect(): void {}
    })
    const actions = [
      { key: 'top', title: 'Move to top', icon: 'tool.flip-to-front' },
      { key: 'up', title: 'Move up', icon: 'nav.arrow-up' },
      { key: 'delete', title: 'Delete', icon: 'action.delete' },
    ] as const
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', { label: 'A readable label', tail: [...actions] }]],
        }),
        actionOverflowTitle: 'Item actions',
      },
    })
    const row = wrapper.get('.oc-tree__row').element as HTMLElement
    const label = wrapper.get('.oc-tree__label').element as HTMLElement
    const revealClass = vi.spyOn(wrapper.get('.oc-tree').element.classList, 'add')
    let actionParts = [...wrapper.findAll('.oc-node-tail__action')]
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 160 })
    // The row leaves the title 40px while the title needs 100px, so its commands go into one menu.
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 100 })
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(rect(40, 28))
    for (const part of actionParts) {
      vi.spyOn(part.element as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(40, 22))
    }

    resize([], {} as ResizeObserver)
    await wrapper.vm.$nextTick()
    const overflow = wrapper.getComponent(OcActionButton)
    expect(overflow.props('action')).toMatchObject({
      title: 'Item actions',
      icon: 'nav.more',
      children: [{ key: 'top' }, { key: 'up' }, { key: 'delete' }],
    })
    overflow.vm.$emit('select', { key: 'up' })
    expect(wrapper.emitted('action')).toContainEqual([{
      key: 'root', actionKey: 'up', source: 'inline',
    }])
    // Hidden commands are revealed for the measurement pass, and that state never survives it.
    expect(revealClass).toHaveBeenCalledWith('are-commands-revealed')
    expect(wrapper.classes()).not.toContain('are-commands-revealed')

    actionParts = [...wrapper.findAll('.oc-node-tail__action')]
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(rect(220, 28))
    for (const part of actionParts) {
      vi.spyOn(part.element as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(10, 22))
    }
    resize([], {} as ResizeObserver)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAllComponents(OcActionButton).map(button => button.props('action').key))
      .toEqual(['top', 'up', 'delete'])
  })

  it('trades the trailing text before trading the commands', async () => {
    let resize: ResizeObserverCallback = () => undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe(): void {}
      disconnect(): void {}
    })
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            tail: [
              '2 weeks',
              { key: 'top', title: 'Move to top', icon: 'tool.flip-to-front' },
              { key: 'up', title: 'Move up', icon: 'nav.arrow-up' },
            ],
          }]],
        }),
      },
    })
    const row = wrapper.get('.oc-tree__row').element as HTMLElement
    const label = wrapper.get('.oc-tree__label').element as HTMLElement
    const tailText = wrapper.get('.oc-node-tail__text').element as HTMLElement
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 120 })
    // The title needs 60px and holds 50px, but the 30px its trailing text still occupies already
    // counts towards the room the title can get back, so no command has to be given up.
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 60 })
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(rect(50, 28))
    vi.spyOn(tailText, 'getBoundingClientRect').mockReturnValue(rect(30, 20))
    for (const part of wrapper.findAll('.oc-node-tail__action')) {
      vi.spyOn(part.element as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(20, 22))
    }

    resize([], {} as ResizeObserver)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAllComponents(OcActionButton).map(button => button.props('action').key))
      .toEqual(['top', 'up'])
  })

  it('renders no action container when a node declares no commands', () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', { label: 'Root', tail: ['2 weeks'] }]],
        }),
      },
    })

    expect(wrapper.get('.oc-tree__row .oc-row__append').text()).toContain('2 weeks')
    expect(wrapper.find('.oc-node-tail__action').exists()).toBe(false)
  })

  it('can keep inline actions visible without row interaction', () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            tail: ['2 weeks', { key: 'move', title: 'Move up', icon: 'nav.arrow-up' }],
          }]],
        }),
        actionVisibility: 'always',
      },
    })

    // The always-visible state now lives on the shared tail line, which reveals its commands itself.
    expect(wrapper.get('.oc-node-tail').classes()).toContain('oc-node-tail--always')
    // jsdom does not evaluate the scoped stylesheet, so assert the structure the rule targets:
    // the command is the trailing part of the node's own line.
    const tail = wrapper.get('.oc-tree__tail')
    const actionPart = wrapper.get('.oc-node-tail__action')
    expect(tail.element.contains(actionPart.element)).toBe(true)
    const tailChildren = Array.from(tail.element.children)
    expect(tailChildren[tailChildren.length - 1]?.classList.contains('oc-node-tail__action')).toBe(true)
  })

  it('keeps revealed commands mounted while their floating menu is open', async () => {
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            tail: [{ key: 'more', title: 'More', children: [{ key: 'rename', title: 'Rename' }] }],
          }]],
        }),
      },
    })
    const actionPart = wrapper.get('.oc-node-tail__action')
    const actionButton = wrapper.getComponent(OcActionButton)

    await actionButton.trigger('pointerenter')

    expect(actionButton.classes()).toContain('is-menu-open')
    expect(actionPart.element.matches(':has(.oc-action-button.is-menu-open)')).toBe(true)
    wrapper.unmount()
  })

  it('opens direct context actions without exposing the inline more wrapper', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            tail: [{
              key: 'more',
              title: 'More',
              children: [
                { key: 'rename', title: 'Rename', icon: 'action.edit' },
                { key: 'delete', title: 'Delete', icon: 'action.delete' },
              ],
            }],
            contextActions: [
              { type: 'divider', key: 'leading' },
              { key: 'rename', title: 'Rename', icon: 'action.edit' },
              { type: 'divider', key: 'danger' },
              { type: 'divider', key: 'duplicate-divider' },
              { key: 'delete', title: 'Delete', icon: 'action.delete' },
              { type: 'divider', key: 'trailing' },
            ],
          }]],
        }),
        selectedKeys: [],
      },
    })

    await wrapper.get('.oc-tree__row').trigger('contextmenu', { clientX: 12, clientY: 18 })
    const menu = useFloatingMenu()
    expect(menu.state.value.items.map(item => item.key)).toEqual(['rename', 'danger', 'delete'])
    expect(menu.state.value.items[1]).toEqual({ type: 'divider', key: 'danger' })
    expect(wrapper.emitted('selection-change')?.[0]).toEqual([{
      triggerKey: 'root',
      selectedKeys: ['root'],
    }])

    menu.selectMenuItem('rename')
    expect(wrapper.emitted('action')?.[0]).toEqual([{
      key: 'root', actionKey: 'rename', source: 'context',
    }])
  })

  it('preserves an existing multi-selection and supports the keyboard menu key', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            contextActions: [{ key: 'rename', title: 'Rename' }],
          }]],
        }),
        selectedKeys: ['root', 'other'],
        selectionMode: 'multiple',
      },
    })

    await wrapper.get('.oc-tree__row').trigger('keydown', { key: 'ContextMenu' })
    expect(wrapper.emitted('selection-change')).toBeUndefined()
    expect(wrapper.emitted('action')).toBeUndefined()
    expect(useFloatingMenu().state.value.items.map(item => item.key)).toEqual(['rename'])
  })

  it('starts drag only after 4px and emits the visual drop candidate', async () => {
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: {
        data: createData({
          roots: ['dragged', 'other', 'target'],
          items: [
            ['dragged', { label: 'Dragged', draggable: true }],
            ['other', { label: 'Other', draggable: true }],
            ['target', { label: 'Target' }],
          ],
        }),
        selectedKeys: ['dragged', 'other'],
        selectionMode: 'multiple',
      },
    })
    const draggedRow = wrapper.get('[data-oc-tree-key="dragged"] .oc-tree__row')
    const targetNode = wrapper.get('[data-oc-tree-key="target"]').element as HTMLElement
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => targetNode),
    })
    vi.spyOn(targetNode, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 200,
      width: 200,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })

    await draggedRow.trigger('mousedown', { button: 0, clientX: 10, clientY: 110 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 12, clientY: 111 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(wrapper.emitted('move')).toBeUndefined()

    await draggedRow.trigger('mousedown', { button: 0, clientX: 10, clientY: 110 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 105 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-oc-tree-key="dragged"]').classes()).toContain('is-drag-source')
    expect(wrapper.get('[data-oc-tree-key="other"]').classes()).toContain('is-drag-source')
    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(wrapper.emitted('move')).toEqual([[
      { key: 'dragged', targetKey: 'target', position: 'before' },
    ]])
    wrapper.unmount()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('reports an external drop on the hovered row and clears the highlight after it', async () => {
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: {
        data: createData({
          roots: ['folder', 'file'],
          items: [
            ['folder', { label: 'Folder' }],
            ['file', { label: 'File' }],
          ],
        }),
        externalDrop: true,
      },
    })
    const folderNode = wrapper.get('[data-oc-tree-key="folder"]').element as HTMLElement
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => folderNode) })
    vi.spyOn(folderNode, 'getBoundingClientRect').mockReturnValue({
      ...rect(200, 40), top: 100, bottom: 140, y: 100,
    })
    await wrapper.vm.$nextTick()

    emitPlatformDragDrop({ type: 'enter', paths: ['D:/textures/tile.png'], position: { x: 10, y: 120 } })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-oc-tree-key="folder"]').classes()).toContain('is-drop-inside')

    emitPlatformDragDrop({ type: 'drop', paths: ['D:/textures/tile.png'], position: { x: 10, y: 120 } })
    expect(wrapper.emitted('external-drop')).toEqual([[
      { targetKey: 'folder', position: 'inside', payload: ['D:/textures/tile.png'] },
    ]])

    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-oc-tree-key="folder"]').classes()).not.toContain('is-drop-inside')
    wrapper.unmount()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('leaves external drops to the window when it has not opted in', async () => {
    const unhandled = vi.fn()
    const disposeUnhandled = registerUnhandledExternalDrop(unhandled)
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: { data: createData({ roots: ['folder'], items: [['folder', { label: 'Folder' }]] }) },
    })
    const folderNode = wrapper.get('[data-oc-tree-key="folder"]').element as HTMLElement
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => folderNode) })
    await wrapper.vm.$nextTick()

    emitPlatformDragDrop({ type: 'enter', paths: ['D:/textures/tile.png'], position: { x: 10, y: 10 } })
    emitPlatformDragDrop({ type: 'drop', paths: ['D:/textures/tile.png'], position: { x: 10, y: 10 } })

    expect(wrapper.emitted('external-drop')).toBeUndefined()
    expect(unhandled).toHaveBeenCalledWith(['D:/textures/tile.png'])
    wrapper.unmount()
    disposeUnhandled()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('warns about malformed collapsed topology in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mount(OcTree, {
      props: {
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
