import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayGroupRoot from '../../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../../composables/overlayGroups'
import type { PropertyFieldCapabilities } from '../propertyEditor.types'
import ImageSourcePropertyField from './ImageSourcePropertyField.vue'

function createCapabilities(): PropertyFieldCapabilities {
  return {
    files: [
      {
        key: 'project',
        label: 'Current Project',
        prefix: '',
        readDirectory: vi.fn(async () => [
          { name: 'hero.png', isDirectory: false },
          { name: 'notes.txt', isDirectory: false },
        ]),
      },
    ],
    icons: [
      {
        key: 'project',
        label: 'Current Project',
        packageKey: null,
        series: [
          {
            key: 'mana',
            name: 'Mana Symbols',
            entries: [
              {
                key: 'mana/fire',
                name: 'Fire',
                seriesKey: 'mana',
                iconKey: 'fire',
                value: 'icon:mana/fire',
                iconPath: 'mana/fire',
                inlineStyle: { backgroundImage: 'url(blob:mana)' },
                previewStyle: { backgroundImage: 'url(blob:mana)' },
              },
            ],
          },
        ],
      },
      {
        key: 'pkg:alice/pack@1.0.0',
        label: 'Alice Pack',
        packageKey: 'alice/pack@1.0.0',
        series: [
          {
            key: 'badges',
            name: 'Badges',
            entries: [
              {
                key: 'badges/rare',
                name: 'Rare',
                seriesKey: 'badges',
                iconKey: 'rare',
                value: 'alice/pack@1.0.0#icon:badges/rare',
                iconPath: 'alice/pack@1.0.0#badges/rare',
                inlineStyle: { backgroundImage: 'url(blob:rare)' },
                previewStyle: { backgroundImage: 'url(blob:rare)' },
              },
            ],
          },
        ],
      },
    ],
    resolveImagePreview: ref => (ref === 'hero.png' ? 'blob:hero' : null),
  }
}

describe('ImageSourcePropertyField', () => {
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

  it('filters to image files in the file tab and emits the chosen image path', async () => {
    const wrapper = mount(ImageSourcePropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Source', fieldType: 'imageSource' },
        value: '',
        capabilities: createCapabilities(),
      },
    })

    try {
      await wrapper.get('.image-source-field__trigger').trigger('click')
      await flushPromises()

      expect(document.body.querySelector('[data-oc-tree-key="file::project::notes.txt"]')).toBeNull()
      const item = document.body.querySelector<HTMLElement>(
        '[data-oc-tree-key="file::project::hero.png"] [role="treeitem"]',
      )
      expect(item).not.toBeNull()
      item!.click()
      await flushPromises()

      expect(wrapper.emitted('update:value')).toEqual([['hero.png']])
    } finally {
      wrapper.unmount()
    }
  })

  it('opens on the icon tab when the current value is an icon reference and emits a package icon reference', async () => {
    const wrapper = mount(ImageSourcePropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Source', fieldType: 'imageSource' },
        value: 'icon:mana/fire',
        capabilities: createCapabilities(),
      },
    })

    try {
      await wrapper.get('.image-source-field__trigger').trigger('click')
      await flushPromises()

      const pkgIcon = document.body.querySelector<HTMLElement>(
        '[data-oc-tree-key="icon-entry::alice/pack@1.0.0#icon:badges/rare"] [role="treeitem"]',
      )
      expect(pkgIcon).not.toBeNull()
      pkgIcon!.click()
      await flushPromises()

      expect(wrapper.emitted('update:value')).toEqual([['alice/pack@1.0.0#icon:badges/rare']])
    } finally {
      wrapper.unmount()
    }
  })

  it('clears the current source when clicking the clear button', async () => {
    const wrapper = mount(ImageSourcePropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Source', fieldType: 'imageSource' },
        value: 'hero.png',
        capabilities: createCapabilities(),
      },
    })

    try {
      await wrapper.get('button[aria-label="清除已选图片"]').trigger('click')
      expect(wrapper.emitted('update:value')).toEqual([['']])
    } finally {
      wrapper.unmount()
    }
  })
})
