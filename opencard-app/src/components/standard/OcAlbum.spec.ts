import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OcNode, OcNodeCollection } from '../../shared/ui/node/node.types'
import OcAlbum from './OcAlbum.vue'

function createData(options: {
  roots?: string[]
  items?: Array<[string, OcNode]>
} = {}): OcNodeCollection {
  const items = options.items ?? [['root', { label: 'Root', visual: { type: 'icon', icon: 'file.package' } }]]
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

  it('renders one card per root key and ignores nested children', () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: {
          rootKeys: ['root', 'second'],
          items: new Map<string, OcNode>([
            ['root', { label: 'Root', visual: { type: 'icon', icon: 'file.package' } }],
            ['second', { label: 'Second', visual: { type: 'icon', icon: 'file.package' } }],
            ['nested', { label: 'Nested', visual: { type: 'icon', icon: 'file.package' } }],
          ]),
          children: new Map([['root', ['nested']]]),
        },
      },
    })

    expect(wrapper.findAll('[data-oc-album-key]')).toHaveLength(2)
    expect(wrapper.find('[data-oc-album-key="nested"]').exists()).toBe(false)
  })

  it('keeps the cover image and the node icon in separate card slots', () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Theme',
            visual: { type: 'icon', icon: 'file.package' },
            cover: { type: 'image', src: 'asset://cover.png', label: 'Theme cover' },
          }]],
        }),
      },
    })

    const image = wrapper.get('.oc-cover__visual')
    expect(image.attributes('src')).toBe('asset://cover.png')
    expect(image.attributes('alt')).toBe('Theme cover')
    // The album-unique cover owns the media slot; the node icon never stands in for it.
    expect(wrapper.find('.oc-album__media .oc-icon').exists()).toBe(false)
    const title = wrapper.get('.oc-album__title')
    expect(Array.from(title.element.children).map(child => child.tagName.toLowerCase()))
      .toEqual(['svg', 'span'])
    expect(title.get('.oc-album__label').text()).toBe('Theme')
  })

  it('drops a cover image that fails to load and keeps the node icon in the title', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Theme',
            visual: { type: 'icon', icon: 'file.package' },
            cover: { type: 'image', src: 'asset://missing.png' },
          }]],
        }),
      },
    })

    expect(wrapper.find('.oc-cover__visual').exists()).toBe(true)
    await wrapper.get('.oc-cover__visual').trigger('error')

    expect(wrapper.find('.oc-cover__visual').exists()).toBe(false)
    expect(wrapper.find('.oc-album__media .oc-icon').exists()).toBe(false)
    expect(wrapper.find('.oc-album__title .oc-icon').exists()).toBe(true)
  })

  it('retries the cover when the node points at a different image', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Theme',
            visual: { type: 'icon', icon: 'file.package' },
            cover: { type: 'image', src: 'asset://broken.png' },
          }]],
        }),
      },
    })

    await wrapper.get('.oc-cover__visual').trigger('error')
    expect(wrapper.find('.oc-cover__visual').exists()).toBe(false)

    await wrapper.setProps({
      data: createData({
        items: [['root', {
          label: 'Theme',
          visual: { type: 'icon', icon: 'file.package' },
          cover: { type: 'image', src: 'asset://replaced.png' },
        }]],
      }),
    })

    expect(wrapper.get('.oc-cover__visual').attributes('src')).toBe('asset://replaced.png')
  })

  it('renders text and status-badge tail parts without turning them into actions', () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Theme',
            visual: { type: 'icon', icon: 'file.package' },
            tail: ['Local', { type: 'badge', label: 'Missing', icon: 'status.warning', tone: 'warning' }],
          }]],
        }),
      },
    })

    expect(wrapper.get('.oc-album__tail').text()).toContain('Local')
    const badge = wrapper.get('.oc-node-tail__badge')
    expect(badge.attributes('aria-label')).toBe('Missing')
    expect(badge.attributes('data-tooltip')).toBe('Missing')
    expect(wrapper.find('.oc-album__tail button').exists()).toBe(false)
  })

  it('stacks the title row above the tail in the card overlay', () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['root', {
            label: 'Theme@1.0.0',
            visual: { type: 'icon', icon: 'file.package' },
            tail: ['Local', { key: 'remove', title: 'Remove', icon: 'action.delete' }],
          }]],
        }),
      },
    })

    const infoChildren = Array.from(wrapper.get('.oc-album__info').element.children)
    expect(infoChildren[0]?.classList.contains('oc-album__title')).toBe(true)
    expect(infoChildren[1]?.classList.contains('oc-album__meta')).toBe(true)
    const titleChildren = Array.from(wrapper.get('.oc-album__title').element.children)
    expect(titleChildren[0]?.classList.contains('oc-icon')).toBe(true)
    expect(titleChildren[1]?.classList.contains('oc-album__label')).toBe(true)
    expect(wrapper.get('.oc-album__meta').element.children[0]?.classList.contains('oc-album__tail')).toBe(true)
  })

  it('renders card commands as the trailing parts of the tail line', () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['theme', {
            label: 'Theme@1.0.0',
            visual: { type: 'icon', icon: 'file.package' },
            tail: ['Local', { key: 'remove', title: 'No longer needed', icon: 'action.delete' }],
          }]],
        }),
      },
    })

    const tail = wrapper.get('.oc-album__tail')
    expect(tail.text()).toContain('Local')
    const children = Array.from(tail.element.children)
    expect(children[children.length - 1]?.classList.contains('oc-node-tail__action')).toBe(true)
    expect(wrapper.find('button[aria-label="No longer needed"]').exists()).toBe(true)
    // Commands stay in the card's own info row; the node has no separate overlay layer.
    expect(tail.element.closest('.oc-album__info')).not.toBeNull()
    expect(Array.from(wrapper.get('.oc-album__node').element.children)).toHaveLength(1)
  })

  it('reports the card key and action key when a card action is invoked', async () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({
          items: [['theme', {
            label: 'Theme',
            visual: { type: 'icon', icon: 'file.package' },
            tail: [{
              key: 'remove',
              title: 'No longer needed',
              icon: 'action.delete',
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
            visual: { type: 'icon', icon: 'file.package' },
            tail: [{
              key: 'remove',
              title: 'Remove',
              icon: 'action.delete',
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
            ['first', { label: 'First', visual: { type: 'icon', icon: 'file.package' } }],
            ['second', { label: 'Second', visual: { type: 'icon', icon: 'file.package' } }],
          ],
        }),
        selectedKeys: ['first'],
      },
    })

    expect(wrapper.get('[data-oc-album-key="first"] .oc-album__card').classes()).toContain('is-selected')
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

  it('shows the placeholder while there is nothing to render', () => {
    const wrapper = mount(OcAlbum, {
      props: {
        data: createData({ roots: [], items: [] }),
        placeholder: 'No packages',
      },
    })

    expect(wrapper.classes()).toContain('is-empty')
    expect(wrapper.get('.oc-album__placeholder').text()).toBe('No packages')
  })

  it('reserves the command height so revealing a command cannot reflow the card', () => {
    // jsdom does not evaluate the scoped stylesheet, so read the source to pin the invariant.
    const source = readFileSync(
      join(process.cwd(), 'src/components/standard/OcAlbum.vue'),
      'utf8',
    )
    const cssRule = (selector: string): string => {
      // Anchor to a line start so compound selectors ending in the same name do not match.
      const start = source.indexOf(`\n${selector} {`)
      expect(start).toBeGreaterThanOrEqual(0)
      return source.slice(start, source.indexOf('}', start))
    }

    // The strip overlays the cover, so a strip that grew on hover would hide part of the cover.
    expect(cssRule('.oc-album__info')).toContain('position: absolute')
    // The meta row always reserves a small action button's height.
    expect(cssRule('.oc-album__meta')).toContain('min-height: var(--oc-size-sm)')
  })
})
