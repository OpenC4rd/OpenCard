import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { FilePathDirectoryEntry, FilePathScope } from '../../shared/model/filePath'
import OcDirectorySelector from './OcDirectorySelector.vue'

function createScope(tree: Record<string, readonly FilePathDirectoryEntry[]>): FilePathScope {
  return { key: 'project', label: 'Project', prefix: '', readDirectory: vi.fn(async (dir: string) => tree[dir] ?? []) }
}

const tree = {
  '': [{ name: 'assets', isDirectory: true }, { name: 'cover.png' }, { name: 'notes.txt' }],
  assets: [{ name: 'hero.png' }, { name: 'deep', isDirectory: true }],
  'assets/deep': [{ name: 'x.png' }],
}
const lastEmit = (wrapper: ReturnType<typeof mount>, name: string) => {
  const events = wrapper.emitted(name) ?? []
  return events[events.length - 1]
}
const card = (wrapper: ReturnType<typeof mount>, key: string) => wrapper.get(`[data-oc-album-key="${key}"] [role="option"]`)

async function mountSelector(props: Record<string, unknown> = {}) {
  const scope = createScope(tree)
  const wrapper = mount(OcDirectorySelector, { props: { scope, filter: { target: 'file', pattern: '*.png' }, ...props } })
  await flushPromises()
  return { wrapper, scope }
}

describe('OcDirectorySelector', () => {
  it('lists folders and filtered files of one level only', async () => {
    const { wrapper } = await mountSelector()
    const keys = wrapper.findAll('[data-oc-album-key]').map(node => node.attributes('data-oc-album-key'))
    expect(keys).toEqual(['assets', 'cover.png'])
  })

  it('selects a matching file and refuses a folder when the target is file', async () => {
    const { wrapper } = await mountSelector()
    await card(wrapper, 'cover.png').trigger('click')
    expect(lastEmit(wrapper, 'update:modelValue')).toEqual([['cover.png']])
    await card(wrapper, 'assets').trigger('click')
    expect(lastEmit(wrapper, 'update:modelValue')).toEqual([[]])
  })

  it('opens a folder on double click and navigates back through the breadcrumb, never above root', async () => {
    const { wrapper, scope } = await mountSelector({ root: 'assets' })
    expect(scope.readDirectory).toHaveBeenCalledWith('assets')
    await card(wrapper, 'assets/deep').trigger('dblclick')
    await flushPromises()
    expect(wrapper.emitted('navigate')).toEqual([['assets/deep']])
    expect(wrapper.findAll('[data-oc-album-key]').map(node => node.attributes('data-oc-album-key'))).toEqual(['assets/deep/x.png'])
    const crumbs = wrapper.findAll('nav button')
    expect(crumbs).toHaveLength(2)
    await crumbs[0]!.trigger('click')
    await flushPromises()
    expect(lastEmit(wrapper, 'navigate')).toEqual(['assets'])
  })

  it('activates a file on double click', async () => {
    const { wrapper } = await mountSelector()
    await card(wrapper, 'cover.png').trigger('dblclick')
    expect(wrapper.emitted('activate')).toEqual([['cover.png']])
  })

  it('shows the import button only when importable and reports the current folder', async () => {
    const plain = await mountSelector()
    expect(plain.wrapper.text()).not.toContain('Import')
    const { wrapper } = await mountSelector({ importable: true })
    await wrapper.findAll('button').find(button => button.text() === 'Import')!.trigger('click')
    expect(wrapper.emitted('import-request')).toEqual([['']])
  })

  it('reloads the current folder when refreshKey changes and ignores input while disabled', async () => {
    const { wrapper, scope } = await mountSelector()
    await wrapper.setProps({ refreshKey: 1 })
    await flushPromises()
    expect(scope.readDirectory).toHaveBeenCalledTimes(2)
    await wrapper.setProps({ disabled: true })
    await card(wrapper, 'cover.png').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
