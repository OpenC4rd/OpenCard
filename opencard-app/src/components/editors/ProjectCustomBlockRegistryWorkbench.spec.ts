import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import OcTree from '../standard/OcTree.vue'
import ProjectCustomBlockRegistryWorkbench from './ProjectCustomBlockRegistryWorkbench.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const collections = [
  { key: 'layout', name: 'Layout', blocks: [{ key: 'panel', source: 'panel.ocblock' }, { key: 'button', source: 'button.ocblock' }] },
  { key: 'fx', name: 'Effects', blocks: [] },
  { key: 'badges', name: 'Badges', blocks: [{ key: 'gold', source: 'gold.ocblock' }] },
]
const mountWorkbench = () => {
  const wrapper = mount(ProjectCustomBlockRegistryWorkbench, {
    props: { collections },
    global: { stubs: { OcTree: true, PropertyEditor: true } },
  })
  const tree = wrapper.getComponent(OcTree)
  const select = async (key: string) => {
    tree.vm.$emit('selection-change', { triggerKey: key, selectedKeys: [key] })
    await wrapper.vm.$nextTick()
  }
  return { wrapper, tree, select }
}

describe('ProjectCustomBlockRegistryWorkbench', () => {
  it('nests each collection\'s blocks and keeps a placeholder under an empty one', () => {
    const data = mountWorkbench().tree.props('data')
    expect(data.children.get('collection:layout')).toEqual(['block:layout/panel', 'block:layout/button'])
    expect(data.items.get(data.children.get('collection:fx')![0]!)?.disabled).toBe(true)
  })

  it('lands on the first block when switching collections, and keeps the block otherwise', async () => {
    const { tree, select } = mountWorkbench()
    expect(tree.props('selectedKeys')).toEqual(['block:layout/panel'])
    await select('block:layout/button')
    expect(tree.props('selectedKeys')).toEqual(['block:layout/button'])
    await select('collection:layout')
    expect(tree.props('selectedKeys')).toEqual(['block:layout/button'])
    await select('collection:badges')
    expect(tree.props('selectedKeys')).toEqual(['block:badges/gold'])
    await select('collection:fx')
    expect(tree.props('selectedKeys')).toEqual(['collection:fx'])
  })

  it('ignores the placeholder row', async () => {
    const { tree, select } = mountWorkbench()
    await select('empty:fx')
    expect(tree.props('selectedKeys')).toEqual(['block:layout/panel'])
  })

  it('routes tree actions to the collection and block they belong to', () => {
    const { wrapper, tree } = mountWorkbench()
    tree.vm.$emit('action', { key: 'collection:layout', actionKey: 'add-block', source: 'inline' })
    tree.vm.$emit('action', { key: 'collection:fx', actionKey: 'configure', source: 'inline' })
    tree.vm.$emit('action', { key: 'collection:fx', actionKey: 'remove', source: 'inline' })
    tree.vm.$emit('action', { key: 'block:layout/button', actionKey: 'remove-block', source: 'inline' })
    expect(wrapper.emitted('add-block')).toEqual([['layout']])
    expect(wrapper.emitted('configure-collection')).toEqual([['fx']])
    expect(wrapper.emitted('remove-collection')).toEqual([['fx']])
    expect(wrapper.emitted('remove-block')).toEqual([['layout', 'button']])
  })

  it('tracks collapsed collections', async () => {
    const { wrapper, tree } = mountWorkbench()
    tree.vm.$emit('expansion-change', { key: 'collection:layout', expanded: false })
    await wrapper.vm.$nextTick()
    expect(tree.props('expandedKeys')).toEqual(['collection:fx', 'collection:badges'])
  })
})
