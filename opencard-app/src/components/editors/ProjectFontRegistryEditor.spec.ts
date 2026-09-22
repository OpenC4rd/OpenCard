import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { OcNodeCollection } from '../../shared/ui/node/node.types'
import OcTree from '../standard/OcTree.vue'
import ProjectFontRegistryEditor from './ProjectFontRegistryEditor.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const mountWorkbench = () => mount(ProjectFontRegistryEditor, {
  props: {
    families: [],
    compositions: [],
    resolveAssetSrc: (source: string) => source,
    readFontBytes: async () => new Uint8Array(),
  },
  global: { stubs: { OcTree: true } },
})

describe('ProjectFontRegistryEditor', () => {
  it('offers one add action on each tree root and routes it to its own command', () => {
    const wrapper = mountWorkbench()
    const tree = wrapper.getComponent(OcTree)
    const data = tree.props('data') as OcNodeCollection

    expect(data.items.get('families')?.tail).toMatchObject([{ key: 'add-family', icon: 'action.add' }])
    expect(data.items.get('compositions')?.tail).toMatchObject([{ key: 'add-composition', icon: 'action.add' }])

    tree.vm.$emit('action', { key: 'families', actionKey: 'add-family', source: 'inline' })
    tree.vm.$emit('action', { key: 'compositions', actionKey: 'add-composition', source: 'inline' })

    expect(wrapper.emitted('register-family')).toHaveLength(1)
    expect(wrapper.emitted('add-composition')).toHaveLength(1)
  })
})
