import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { FilePathDirectoryEntry, FilePathScope } from '../../shared/model/filePath'
import OcFilePicker from './OcFilePicker.vue'

function createScope(
  key: string,
  label: string,
  prefix: string,
  tree: Record<string, readonly FilePathDirectoryEntry[]>,
): FilePathScope {
  return {
    key,
    label,
    prefix,
    readDirectory: vi.fn(async (directory: string) => tree[directory] ?? []),
  }
}

describe('OcFilePicker', () => {
  it('emits the full reference with package prefix when selecting a file from a scope', async () => {
    const projectScope = createScope('project', '当前项目', '', {
      '': [
        { name: 'assets', isDirectory: true },
        { name: 'cover.png', isDirectory: false },
      ],
      assets: [{ name: 'hero.png', isDirectory: false }],
    })
    const packageScope = createScope('pkg:author/core@1.0.0', 'Core Pack', 'author/core@1.0.0#', {
      '': [{ name: 'badge.svg', isDirectory: false }],
    })

    const wrapper = mount(OcFilePicker, {
      props: {
        scopes: [projectScope, packageScope],
        filter: { target: 'file', pattern: '*.{png,svg}' },
      },
    })
    await flushPromises()

    await wrapper.get('[data-oc-tree-key="file::pkg:author/core@1.0.0::badge.svg"] [role="treeitem"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['author/core@1.0.0#badge.svg']])
  })

  it('expands a directory instead of emitting a selection when filter target is file', async () => {
    const projectScope = createScope('project', '当前项目', '', {
      '': [
        { name: 'assets', isDirectory: true },
        { name: 'notes.txt', isDirectory: false },
      ],
      assets: [
        { name: 'hero.png', isDirectory: false },
        { name: 'readme.md', isDirectory: false },
      ],
    })

    const wrapper = mount(OcFilePicker, {
      props: {
        scopes: [projectScope],
        filter: { target: 'file', pattern: '*.png' },
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-oc-tree-key="file::project::notes.txt"]').exists()).toBe(false)

    await wrapper.get('[data-oc-tree-key="dir::project::assets"] [role="treeitem"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('[data-oc-tree-key="file::project::assets/readme.md"]').exists()).toBe(false)

    await wrapper.get('[data-oc-tree-key="file::project::assets/hero.png"] [role="treeitem"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['assets/hero.png']])
  })

  it('emits directory path when filter target is directory', async () => {
    const projectScope = createScope('project', '当前项目', '', {
      '': [{ name: 'icons', isDirectory: true }],
    })

    const wrapper = mount(OcFilePicker, {
      props: {
        scopes: [projectScope],
        filter: { target: 'directory' },
      },
    })
    await flushPromises()

    await wrapper.get('[data-oc-tree-key="dir::project::icons"] [role="treeitem"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['icons']])
  })

  it('crawls nested directories and filters across scopes when a search query is entered', async () => {
    const projectScope = createScope('project', '当前项目', '', {
      '': [{ name: 'blocks', isDirectory: true }],
      blocks: [
        { name: 'header.ocblock', isDirectory: false },
        { name: 'ignore.png', isDirectory: false },
      ],
    })

    const wrapper = mount(OcFilePicker, {
      props: {
        scopes: [projectScope],
        filter: { target: 'file', pattern: '*.ocblock' },
      },
    })
    await flushPromises()

    await wrapper.get('input').setValue('header')
    await flushPromises()

    await wrapper.get('[data-oc-tree-key="file::project::blocks/header.ocblock"] [role="treeitem"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['blocks/header.ocblock']])
  })

  it('refuses selection and directory expansion while disabled', async () => {
    const projectScope = createScope('project', '当前项目', '', {
      '': [{ name: 'cover.png', isDirectory: false }],
    })

    const wrapper = mount(OcFilePicker, {
      props: {
        scopes: [projectScope],
        disabled: true,
      },
    })
    await flushPromises()

    await wrapper.get('[data-oc-tree-key="file::project::cover.png"] [role="treeitem"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
