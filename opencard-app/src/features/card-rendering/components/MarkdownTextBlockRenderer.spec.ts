import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MarkdownTextBlockRenderer from './MarkdownTextBlockRenderer.vue'
import { parseRenderReadyBlockForTest, rendererTestGlobal } from './renderTestUtils'

describe('MarkdownTextBlockRenderer', () => {
  it('rejects raw HTML and resolves Markdown images through the project asset protocol', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'safe-markdown-text-block',
      type: 'markdown-text-block',
      content: '<script>alert(1)</script>\n\n![Portrait](assets/portrait.png){width=40% height=160px fit=cover align=center onclick=alert(1)}',
    })

    const wrapper = mount(MarkdownTextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })
    const content = wrapper.get('.markdown-text-block-content')

    expect(content.find('script').exists()).toBe(false)
    // Raw HTML is escaped into text, so the literal markup survives as characters only.
    expect(content.text()).toContain('<script>alert(1)</script>')
    const image = content.get('img')
    expect(image.attributes('src')).toBe('asset://assets/portrait.png')
    expect(image.attributes('alt')).toBe('Portrait')
    expect(image.attributes('onclick')).toBeUndefined()
  })

  it('drops attributes from non-image Markdown elements and rejects unsafe image values', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'restricted-markdown-attributes',
      type: 'markdown-text-block',
      content: '# Heading {width=20px}\n\n![Portrait](assets/portrait.png){width="100%;color:red" fit=unknown align=outside}',
    })

    const wrapper = mount(MarkdownTextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })
    const content = wrapper.get('.markdown-text-block-content')

    expect(content.get('h1').attributes('width')).toBeUndefined()
    // An invalid width/fit/align triplet must not leak a half-applied inline style.
    expect(content.get('img').attributes('style')).toBeUndefined()
  })
})
