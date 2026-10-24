import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OcNode, OcNodeCollection } from '../../shared/ui/node/node.types'
import OcAlbum from './OcAlbum.vue'

function createData(options: {
  roots?: string[]
  items?: Array<[string, OcNode]>
} = {}): OcNodeCollection {
  const items = options.items ?? [['root', { label: 'Root', visual: { type: 'icon', icon: 'mdiPackageVariantClosed' } }]]
  return {
    rootKeys: options.roots ?? items.map(([key]) => key),
    items: new Map(items),
    children: new Map(),
  }
}

describe('OcAlbum', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders exactly the root level and no nested children', () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: {
          rootKeys: ['root', 'second'],
          items: new Map<string, OcNode>([
            ['root', { label: 'Root', visual: { type: 'icon', icon: 'mdiPackageVariantClosed' } }],
            ['second', { label: 'Second', visual: { type: 'icon', icon: 'mdiPackageVariantClosed' } }],
            ['nested', { label: 'Nested', visual: { type: 'icon', icon: 'mdiPackageVariantClosed' } }],
          ]),
          children: new Map([['root', ['nested']]]),
        },
      },
    })

    expect(wrapper.findAll('[data-oc-album-key]')).toHaveLength(2)
    expect(wrapper.find('[data-oc-album-key="nested"]').exists()).toBe(false)
  })

  it('reports the card key and action key when a card action is invoked', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['theme', {
            label: 'Theme',
            visual: { type: 'icon', icon: 'mdiPackageVariantClosed' },
            tail: [{
              key: 'remove',
              title: 'No longer needed',
              icon: 'mdiTrashCanOutline',
              iconTone: 'danger',
            }],
          }]],
        }),
      },
    })

    await wrapper.get('button[aria-label="No longer needed"]').trigger('click')

    expect(wrapper.emitted('action')).toEqual([[
      { key: 'theme', actionKey: 'remove', source: 'inline' },
    ]])
  })

  it('keeps a disabled action visible with its reason and does not invoke it', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['theme', {
            label: 'Theme',
            visual: { type: 'icon', icon: 'mdiPackageVariantClosed' },
            tail: [{
              key: 'remove',
              title: 'Remove',
              icon: 'mdiTrashCanOutline',
              disabled: true,
              disabledReason: 'Required',
            }],
          }]],
        }),
      },
    })

    const button = wrapper.get('button[aria-label="Remove: Required"]')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')

    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('emits a selection change for the clicked card', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [
            ['first', { label: 'First', visual: { type: 'icon', icon: 'mdiPackageVariantClosed' } }],
            ['second', { label: 'Second', visual: { type: 'icon', icon: 'mdiPackageVariantClosed' } }],
          ],
        }),
        selectedKeys: ['first'],
      },
    })

    await wrapper.get('[data-oc-album-key="second"] .oc-album__card').trigger('click')

    expect(wrapper.emitted('selection-change')).toEqual([[
      { triggerKey: 'second', selectedKeys: ['second'] },
    ]])
  })

  it('stays inert when selection is disabled', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData(),
        selectionMode: 'none',
        activationMode: 'none',
      },
    })

    const card = wrapper.get('.oc-album__card')
    expect(card.attributes('role')).toBe('listitem')
    await card.trigger('click')

    expect(wrapper.emitted('selection-change')).toBeUndefined()
    expect(wrapper.emitted('node-activate')).toBeUndefined()
  })

  it('activates a card on double click when the consumer asks for it', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData(),
        activationMode: 'double-click',
      },
    })

    await wrapper.get('.oc-album__card').trigger('dblclick')

    expect(wrapper.emitted('node-activate')).toEqual([[{ key: 'root' }]])
  })
})
