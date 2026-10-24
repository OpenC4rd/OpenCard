import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OcNode, OcNodeCollection } from '../../shared/ui/node/node.types'
import OcTree from './OcTree.vue'
import OverlayGroupRoot from '../ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'
import { registerUnhandledExternalDrop } from '../../shared/ui/drop/externalFileDrop'

const platform = vi.hoisted(() => ({
  dragDropHandler: null as ((event: { payload: unknown }) => void) | null,
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: async (handler: (event: { payload: unknown }) => void) => {
      platform.dragDropHandler = handler
      return () => undefined
    },
  }),
}))

function emitPlatformDragDrop(payload: unknown): void {
  platform.dragDropHandler?.({ payload })
}

function menuLabels(): string[] {
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .map(item => item.getAttribute('aria-label') ?? '')
}

function clickMenuItem(label: string): void {
  const item = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find(candidate => candidate.getAttribute('aria-label') === label)
  if (!item) throw new Error(`No menu command for "${label}"`)
  item.click()
}

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

const RENAME_INPUT = 'input'

describe('OcTree commands', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('keeps the rename draft local and commits it on Enter', async () => {
    const data = createData({
      items: [['root', {
        label: 'archive.tar.gz',
        renamable: true,
        renameSelection: { start: 0, end: 11 },
      }]],
    })
    const wrapper = mount(OcTree, { props: { data } })

    await (wrapper.vm as unknown as { beginRename: (key: string) => Promise<void> }).beginRename('root')
    const input = wrapper.get(RENAME_INPUT).element as HTMLInputElement
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 11])

    await wrapper.get(RENAME_INPUT).setValue('Renamed')
    await wrapper.get(RENAME_INPUT).trigger('keydown', { key: 'Enter' })

    expect(data.items.get('root')?.label).toBe('archive.tar.gz')
    expect(wrapper.emitted('rename-commit')).toEqual([[{ key: 'root', name: 'Renamed' }]])
  })

  it('commits a rename on focus loss and cancels it on Escape', async () => {
    const wrapper = mount(OcTree, { attachTo: document.body, props: { data: createData() } })
    const tree = wrapper.vm as unknown as { beginRename: (key: string) => Promise<void> }

    await tree.beginRename('root')
    await wrapper.get(RENAME_INPUT).setValue('Blurred')
    ;(wrapper.get('.oc-tree__row').element as HTMLElement).focus()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('rename-commit')).toEqual([[{ key: 'root', name: 'Blurred' }]])

    await tree.beginRename('root')
    await wrapper.get(RENAME_INPUT).setValue('Cancelled')
    await wrapper.get(RENAME_INPUT).trigger('keydown', { key: 'Escape' })
    expect(wrapper.find(RENAME_INPUT).exists()).toBe(false)
    expect(wrapper.emitted('rename-commit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits the rename action instead of renaming until the parent begins the rename', async () => {
    const wrapper = mount(OcTree, {
      attachTo: document.body,
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            renamable: true,
            tail: [{ key: 'rename', title: 'Rename', icon: 'mdiPencilOutline' }],
          }]],
        }),
      },
    })

    await wrapper.get('button[aria-label="Rename"]').trigger('click')
    expect(wrapper.find(RENAME_INPUT).exists()).toBe(false)
    expect(wrapper.emitted('action')).toEqual([[
      { key: 'root', actionKey: 'rename', source: 'inline' },
    ]])

    await (wrapper.vm as unknown as { beginRename: (key: string) => Promise<void> }).beginRename('root')
    expect(wrapper.get(RENAME_INPUT).element).toBe(document.activeElement)
    wrapper.unmount()
  })

  it('starts renaming on F2 only for a renamable node', async () => {
    const wrapper = mount(OcTree, { attachTo: document.body, props: { data: createData() } })

    await wrapper.get('.oc-tree__row').trigger('keydown', { key: 'F2' })

    expect(wrapper.get(RENAME_INPUT).element).toBe(document.activeElement)
    expect(wrapper.emitted('rename-commit')).toBeUndefined()
    wrapper.unmount()

    const plain = mount(OcTree, {
      props: { data: createData({ items: [['root', { label: 'Root' }]] }) },
    })
    await plain.get('.oc-tree__row').trigger('keydown', { key: 'F2' })
    expect(plain.find(RENAME_INPUT).exists()).toBe(false)
  })

  it('keeps a declared but disabled command visible', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            tail: [
              'Metadata',
              { key: 'duplicate', title: 'Duplicate', icon: 'mdiContentCopy' },
              { key: 'delete', title: 'Delete', icon: 'mdiTrashCanOutline', disabled: true, disabledReason: 'Protected' },
            ],
          }]],
        }),
      },
    })

    await wrapper.get('button[aria-label="More actions"]').trigger('click')
    const deleteButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')
    expect(deleteButton?.disabled).toBe(true)

    const duplicate = document.body.querySelector<HTMLButtonElement>('button[aria-label="Duplicate"]')
    duplicate?.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('action')).toEqual([[
      { key: 'root', actionKey: 'duplicate', source: 'inline' },
    ]])
  })

  it('groups overflowing commands into the row menu and reports the chosen one', async () => {
    const wrapper = mount(OcTree, { props: {
      data: createData({ items: [['root', { label: 'Readable label', tail: [
        { key: 'top', title: 'Move to top', icon: 'mdiFlipToFront' },
        { key: 'up', title: 'Move up', icon: 'mdiArrowUp' },
      ] }]] }),
      actionOverflowTitle: 'Item actions',
    } })

    await wrapper.get('.oc-tree__row').trigger('mouseenter')
    await nextTick()
    await wrapper.get('button[aria-label="Item actions"]').trigger('click')
    expect(menuLabels()).toEqual(['Move to top', 'Move up'])

    clickMenuItem('Move up')
    expect(wrapper.emitted('action')).toContainEqual([{ key: 'root', actionKey: 'up', source: 'inline' }])
    wrapper.unmount()
  })

  it('opens the declared context commands and disposes them with the tree', async () => {
    const wrapper = mount(OcTree, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Root',
            tail: [{
              key: 'more',
              title: 'More',
              children: [
                { key: 'rename', title: 'Rename', icon: 'mdiPencilOutline' },
                { key: 'delete', title: 'Delete', icon: 'mdiTrashCanOutline' },
              ],
            }],
            contextActions: [
              { type: 'divider', key: 'leading' },
              { key: 'rename', title: 'Rename', icon: 'mdiPencilOutline' },
              { type: 'divider', key: 'danger' },
              { type: 'divider', key: 'duplicate-divider' },
              { key: 'delete', title: 'Delete', icon: 'mdiTrashCanOutline' },
              { type: 'divider', key: 'trailing' },
            ],
          }]],
        }),
        selectedKeys: [],
      },
    })

    await wrapper.get('.oc-tree__row').trigger('contextmenu', { clientX: 12, clientY: 18 })
    await flushPromises()
    expect(menuLabels()).toEqual(['Rename', 'Delete'])
    expect(wrapper.emitted('selection-change')?.[0]).toEqual([{
      triggerKey: 'root',
      selectedKeys: ['root'],
    }])

    clickMenuItem('Rename')
    expect(wrapper.emitted('action')?.[0]).toEqual([{
      key: 'root', actionKey: 'rename', source: 'context',
    }])
    await flushPromises()

    await wrapper.get('.oc-tree__row').trigger('contextmenu', { clientX: 12, clientY: 18 })
    await flushPromises()
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
    wrapper.unmount()
    await flushPromises()
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('preserves an existing multi-selection when opening the keyboard context menu', async () => {
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
    await flushPromises()

    expect(wrapper.emitted('selection-change')).toBeUndefined()
    expect(wrapper.emitted('action')).toBeUndefined()
    expect(menuLabels()).toEqual(['Rename'])
  })

  it('starts a drag only after 4px and emits the drop candidate', async () => {
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
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect(wrapper.emitted('move')).toEqual([[
      { key: 'dragged', targetKey: 'target', position: 'before' },
    ]])
    wrapper.unmount()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('reports an external drop on the hovered row', async () => {
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
      x: 0, y: 100, top: 100, bottom: 140, left: 0, right: 200, width: 200, height: 40,
      toJSON: () => ({}),
    })
    await wrapper.vm.$nextTick()

    emitPlatformDragDrop({ type: 'enter', paths: ['D:/textures/tile.png'], position: { x: 10, y: 120 } })
    await wrapper.vm.$nextTick()
    emitPlatformDragDrop({ type: 'drop', paths: ['D:/textures/tile.png'], position: { x: 10, y: 120 } })

    expect(wrapper.emitted('external-drop')).toEqual([[
      { targetKey: 'folder', position: 'inside', payload: ['D:/textures/tile.png'] },
    ]])
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
})
