import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import OverlayGroupRoot from '../../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../../composables/overlayGroups'
import type { PropertyFieldCapabilities } from '../propertyEditor.types'
import FontFamilyPropertyField from './FontFamilyPropertyField.vue'

function createFontCapabilities(): PropertyFieldCapabilities {
  return {
    fonts: [
      {
        key: 'project',
        label: 'Current Project',
        packageKey: null,
        entries: [
          {
            key: 'font:title',
            label: 'Title Serif',
            value: 'font:title',
            cssFamily: '"OCProjectTitle", serif',
          },
        ],
      },
      {
        key: 'pkg:alice/fonts@1.0.0',
        label: 'Alice Fonts',
        packageKey: 'alice/fonts@1.0.0',
        entries: [
          {
            key: 'alice/fonts@1.0.0#font:body',
            label: 'Body Sans',
            value: 'alice/fonts@1.0.0#font:body',
            cssFamily: '"OCPkgBody", sans-serif',
          },
        ],
      },
    ],
  }
}

describe('FontFamilyPropertyField', () => {
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

  it('lists fonts grouped by project and resource package scopes and emits the selected font reference', async () => {
    const wrapper = mount(FontFamilyPropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Font', fieldType: 'fontFamily' },
        value: 'font:title',
        capabilities: createFontCapabilities(),
      },
    })

    try {
      expect(wrapper.get('.font-family-field__value').text()).toBe('Title Serif')

      await wrapper.get('.font-family-field__trigger').trigger('click')
      await flushPromises()

      const pkgFont = document.body.querySelector<HTMLElement>(
        '[data-oc-tree-key="font-entry::alice/fonts@1.0.0#font:body"] [role="treeitem"]',
      )
      expect(pkgFont).not.toBeNull()
      pkgFont!.click()
      await flushPromises()

      expect(wrapper.emitted('update:value')).toEqual([['alice/fonts@1.0.0#font:body']])
    } finally {
      wrapper.unmount()
    }
  })

  it('filters fonts across scopes by search query and clears selection with the clear button', async () => {
    const wrapper = mount(FontFamilyPropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Font', fieldType: 'fontFamily' },
        value: 'font:title',
        capabilities: createFontCapabilities(),
      },
    })

    try {
      await wrapper.get('.font-family-field__trigger').trigger('click')
      await flushPromises()

      const searchInput = document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!
      searchInput.value = 'Body'
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()

      expect(document.body.querySelector('[data-oc-tree-key="font-entry::font:title"]')).toBeNull()
      expect(
        document.body.querySelector('[data-oc-tree-key="font-entry::alice/fonts@1.0.0#font:body"]'),
      ).not.toBeNull()

      await wrapper.get('button[aria-label="清除已选字体"]').trigger('click')
      expect(wrapper.emitted('update:value')).toEqual([['']])
    } finally {
      wrapper.unmount()
    }
  })
})
