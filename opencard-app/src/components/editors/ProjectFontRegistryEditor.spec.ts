import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectFont } from '../../features/workspace/model/projectFontRegistry'
import OcTree from '../standard/OcTree.vue'
import ProjectFontInspector from './ProjectFontInspector.vue'
import ProjectFontSpecimen from './ProjectFontSpecimen.vue'
import ProjectFontRegistryEditor from './ProjectFontRegistryEditor.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const mountWorkbench = (families: readonly ProjectFont[] = []) => mount(ProjectFontRegistryEditor, {
  props: {
    families,
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

  it('shows only the placeholder until a font exists', () => {
    const wrapper = mountWorkbench()
    expect(wrapper.findComponent(ProjectFontSpecimen).exists()).toBe(false)
    expect(wrapper.findComponent(ProjectFontInspector).exists()).toBe(false)
    expect(wrapper.text()).toContain('projectConfig.fonts.noFontSelected')
  })

  it('opens the configuration of the inspected font from the inspector', () => {
    const wrapper = mountWorkbench([{ key: 'han', name: 'Han', files: { normal: { upright: 'han.ttf' } } }])
    wrapper.getComponent(ProjectFontInspector).vm.$emit('configure')
    expect(wrapper.emitted('configure-family')).toEqual([['han']])
  })
})
