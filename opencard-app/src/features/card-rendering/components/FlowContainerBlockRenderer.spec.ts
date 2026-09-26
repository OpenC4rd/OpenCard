import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { RenderReadyFlowContainerBlock } from '../render.types'
import FlowContainerBlockRenderer from './FlowContainerBlockRenderer.vue'
import { rendererTestGlobal } from './renderTestUtils'
import NativeBlockRenderer from './NativeBlockRenderer.vue'

describe('FlowContainerBlockRenderer', () => {
  it('does not shrink an explicitly sized child along the flow axis', () => {
    const block = {
      type: 'flow-container-block',
      id: 'flow',
      direction: 'lr',
      gap: '0px',
      clip: true,
      width: '300px',
      height: '200px',
      visible: true,
      name: 'Flow',
      notes: '',
      borderColor: '#000000',
      borderWidth: 0,
      borderStyle: 'solid',
      borderRadius: '',
      background: '',
      translateX: '0px',
      translateY: '0px',
      scaleX: 1,
      scaleY: 1,
      transformAnchor: 'cc',
      zIndex: 0,
      rotation: 0,
      opacity: 1,
      customCss: '',
      children: [{
        block: {
          type: 'text-block',
          id: 'child',
          width: '400px',
          height: '80px',
        },
        location: { type: 'flow-container-location', id: 'location', index: 0, align: 'start' },
      }],
    } as unknown as RenderReadyFlowContainerBlock
    const wrapper = mount(FlowContainerBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: {
        ...rendererTestGlobal,
        stubs: { NativeBlockRenderer: true },
      },
    })

    const child = wrapper.getComponent(NativeBlockRenderer)
    expect(wrapper.get('[data-block-id="flow"]').attributes('style')).toContain('overflow: hidden')
    expect(child.props('block')).toEqual(block.children[0]!.block)
    expect(child.props('placement')).toEqual({ kind: 'flow', location: block.children[0]!.location })
  })
})
