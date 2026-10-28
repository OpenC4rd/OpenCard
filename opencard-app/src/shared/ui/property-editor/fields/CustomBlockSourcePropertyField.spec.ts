import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayGroupRoot from '../../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../../composables/overlayGroups'
import type { PropertyFieldCapabilities } from '../propertyEditor.types'
import CustomBlockSourcePropertyField from './CustomBlockSourcePropertyField.vue'

function createCapabilities(): PropertyFieldCapabilities {
  return {
    files: [
      {
        key: 'project',
        label: 'Current Project',
        prefix: '',
        readDirectory: vi.fn(async () => [
          { name: 'banner.ocblock', isDirectory: false },
          { name: 'ignore.png', isDirectory: false },
        ]),
      },
    ],
    customBlocks: [
      {
        key: 'project',
        label: 'Current Project',
        packageKey: null,
        collections: [
          {
            key: 'headers',
            name: 'Headers',
            entries: [
              {
                key: 'headers/hero',
                name: 'Hero Header',
                collectionKey: 'headers',
                blockKey: 'hero',
                value: 'block:headers/hero',
              },
            ],
          },
        ],
      },
      {
        key: 'pkg:alice/ui@1.0.0',
        label: 'Alice UI',
        packageKey: 'alice/ui@1.0.0',
        collections: [
          {
            key: 'frames',
            name: 'Frames',
            entries: [
              {
                key: 'frames/gold',
                name: 'Gold Frame',
                collectionKey: 'frames',
                blockKey: 'gold',
                value: 'alice/ui@1.0.0#block:frames/gold',
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('CustomBlockSourcePropertyField', () => {
  let overlayRoot: VueWrapper | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    document.body.innerHTML = ''
  })

  it('selects a registered custom block from project or package scopes', async () => {
    const wrapper = mount(CustomBlockSourcePropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Source', fieldType: 'customBlockSource' },
        value: '',
        capabilities: createCapabilities(),
      },
    })

    try {
      await wrapper.get('.custom-block-source-field__trigger').trigger('click')
      await flushPromises()

      const pkgBlock = document.body.querySelector<HTMLElement>(
        '[data-oc-tree-key="block-entry::alice/ui@1.0.0#block:frames/gold"] [role="treeitem"]',
      )
      expect(pkgBlock).not.toBeNull()
      pkgBlock!.click()
      await flushPromises()

      expect(wrapper.emitted('update:value')).toEqual([['alice/ui@1.0.0#block:frames/gold']])
    } finally {
      wrapper.unmount()
    }
  })

  it('opens on the file tab when the current value is a .ocblock file path and filters out non-.ocblock files', async () => {
    const wrapper = mount(CustomBlockSourcePropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Source', fieldType: 'customBlockSource' },
        value: 'banner.ocblock',
        capabilities: createCapabilities(),
      },
    })

    try {
      await wrapper.get('.custom-block-source-field__trigger').trigger('click')
      await flushPromises()

      expect(document.body.querySelector('[data-oc-tree-key="file::project::ignore.png"]')).toBeNull()
      const fileItem = document.body.querySelector<HTMLElement>(
        '[data-oc-tree-key="file::project::banner.ocblock"] [role="treeitem"]',
      )
      expect(fileItem).not.toBeNull()
      fileItem!.click()
      await flushPromises()

      expect(wrapper.emitted('update:value')).toEqual([['banner.ocblock']])
    } finally {
      wrapper.unmount()
    }
  })
})
