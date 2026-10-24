import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TextBlockRenderer from './TextBlockRenderer.vue'
import { parseRenderReadyBlockForTest, rendererTestGlobal, richTextRendererTestGlobal } from './renderTestUtils'

describe('TextBlockRenderer', () => {
  it('renders no HTML that has no prepared safe document', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'safe-rich-text-block',
      type: 'text-block',
      content: '<script>alert(1)</script><p onclick="alert(1)" style="color: red; position: fixed">Safe <span style="font-family: Impact; background-image: url(x)">text</span></p>',
    })

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })
    const content = wrapper.get('.text-block-content--richtext')

    expect(content.find('script').exists()).toBe(false)
    expect(content.find('p').exists()).toBe(false)
  })

  it('preserves only the controlled binding attribute on rich-text spans', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'binding-rich-text-block',
      type: 'text-block',
      content: '<p><span data-oc-binding="self:name" onclick="alert(1)" class="x">OpenCard</span></p>',
    })

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: richTextRendererTestGlobal(block),
    })
    const binding = wrapper.get('[data-oc-binding]')

    expect(binding.attributes('data-oc-binding')).toBe('self:name')
    expect(binding.attributes('onclick')).toBeUndefined()
  })
})
