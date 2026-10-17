import { h, type VNodeChild } from 'vue'
import type { RichTextIconNode, RichTextNode } from '../../rich-text/richTextHtml'
import { resolveRichTextStyle } from '../../rich-text/richTextResourceStyle'

/** Compose inline paint at the leaf, where the effective font size is known. */
export function renderRichTextDocument(nodes: readonly RichTextNode[], options: {
  resolveFont: (reference: string) => string | null
  resolveImage: (reference: string) => string | null
  renderIcon: (node: RichTextIconNode) => VNodeChild
}): VNodeChild[] {
  const resolve = (attributes: Readonly<Record<string, string>>) => resolveRichTextStyle(attributes, options.resolveFont, options.resolveImage)
  function render(node: RichTextNode, paint: Record<string, string>): VNodeChild {
    if (node.type !== 'element') {
      const content = node.type === 'icon' ? options.renderIcon(node) : node.value
      const style = resolve(node.type === 'icon' ? { style: paint.style ?? '' } : paint)
      return style ? h('span', { style }, [content]) : content
    }
    const attributes = { ...node.attributes }
    const style = document.createElement('span').style
    style.cssText = attributes.style ?? ''
    const inline = ['span', 'mark', 'b', 'strong', 'i', 'em', 'u', 's', 'strike'].includes(node.tag)
    const next = { ...paint }
    for (const key of ['data-oc-fill-type', 'data-oc-fill-source']) {
      if (attributes[key] !== undefined) next[key] = attributes[key]!
    }
    if (inline && (style.backgroundColor || node.tag === 'mark')) {
      next.style = `background-color: ${style.backgroundColor || '#ffff00'};`
      style.backgroundColor = node.tag === 'mark' ? 'transparent' : ''
    }
    attributes.style = resolve({ ...attributes, style: style.cssText, 'data-oc-fill-type': '' })
    return h(node.tag, attributes, node.children.map(child => render(child, next)))
  }
  return nodes.map(node => render(node, {}))
}
