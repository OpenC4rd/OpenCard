import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
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
  it('routes the add command of each tree root to its own event', () => {
    const wrapper = mountWorkbench()
    const tree = wrapper.getComponent(OcTree)

    tree.vm.$emit('action', { key: 'families', actionKey: 'add-family', source: 'inline' })
    tree.vm.$emit('action', { key: 'compositions', actionKey: 'add-composition', source: 'inline' })

    expect(wrapper.emitted('register-family')).toHaveLength(1)
    expect(wrapper.emitted('add-composition')).toHaveLength(1)
  })
})
