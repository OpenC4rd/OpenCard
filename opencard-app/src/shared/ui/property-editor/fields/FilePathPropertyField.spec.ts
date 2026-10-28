import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayGroupRoot from '../../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../../composables/overlayGroups'
import type { FilePathScope } from '../../../model/filePath'
import FilePathPropertyField from './FilePathPropertyField.vue'

describe('FilePathPropertyField', () => {
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

  it('opens the file picker popover and emits the selected path from project or package scopes', async () => {
    const scopes: readonly FilePathScope[] = [
      {
        key: 'project',
        label: 'Current Project',
        prefix: '',
        readDirectory: vi.fn(async () => [{ name: 'card.ocblock', isDirectory: false }]),
      },
      {
        key: 'pkg:alice/theme@1.0.0',
        label: 'Theme Pack',
        prefix: 'alice/theme@1.0.0#',
        readDirectory: vi.fn(async () => [{ name: 'banner.ocblock', isDirectory: false }]),
      },
    ]

    const wrapper = mount(FilePathPropertyField, {
      attachTo: document.body,
      props: {
        definition: {
          title: 'Source',
          fieldType: 'filePath',
          filter: { target: 'file', pattern: '*.ocblock' },
        },
        value: '',
        capabilities: { files: scopes },
      },
    })

    try {
      await wrapper.get('.file-path-field__trigger').trigger('click')
      await flushPromises()

      const item = document.body.querySelector<HTMLElement>(
        '[data-oc-tree-key="file::pkg:alice/theme@1.0.0::banner.ocblock"] [role="treeitem"]',
      )
      expect(item).not.toBeNull()
      item!.click()
      await flushPromises()

      expect(wrapper.emitted('update:value')).toEqual([['alice/theme@1.0.0#banner.ocblock']])
    } finally {
      wrapper.unmount()
    }
  })

  it('clears the current path when clicking the clear button', async () => {
    const wrapper = mount(FilePathPropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Source', fieldType: 'filePath' },
        value: 'assets/cover.png',
      },
    })

    try {
      await wrapper.get('button[aria-label="清除已选文件"]').trigger('click')
      expect(wrapper.emitted('update:value')).toEqual([['']])
    } finally {
      wrapper.unmount()
    }
  })

  it('refuses opening the popover when readonly', async () => {
    const wrapper = mount(FilePathPropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Source', fieldType: 'filePath', isReadonly: true },
        value: 'assets/cover.png',
      },
    })

    try {
      await wrapper.get('.file-path-field__trigger').trigger('click')
      await flushPromises()
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })
})
