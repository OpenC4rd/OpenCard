import { normalizeRichTextHtml, parseRichTextHtml, type RichTextNode } from '../../rich-text/richTextHtml'
import { fromCssFontFamily, toCssFontFamily } from '../../../features/workspace/model/projectFonts'
export const richTextParseOptions = { preserveWhitespace: 'full' as const }
export function canonicalEditorHtml(value: string): string {
  const dom = new DOMParser().parseFromString(value, 'text/html')
  for (const element of dom.body.querySelectorAll<HTMLElement>('[data-oc-font]')) { element.style.fontFamily = toCssFontFamily(element.getAttribute('data-oc-font') ?? ''); element.removeAttribute('data-oc-font') }
  for (const element of dom.body.querySelectorAll('[data-oc-dynamic-style]')) {
    element.setAttribute('style', element.getAttribute('data-oc-dynamic-style') ?? '')
    element.removeAttribute('data-oc-dynamic-style')
  }
  return dom.body.innerHTML
}

/** Compare supported rendering semantics, allowing equivalent HTML spellings. */
export function equivalentRichTextHtml(left: string, right: string): boolean {
  type Content = { type: string; value: string; format: string; children?: Content[] }
  const ordered = (attributes: Readonly<Record<string, string>>) => JSON.stringify(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)))
  const normalize = (nodes: readonly RichTextNode[], inherited: Record<string, string> = {}): Content[] => {
    const result: Content[] = []
    for (const node of nodes) {
      if (node.type !== 'element') {
        const format = ordered(inherited)
        const previous = result[result.length - 1]
        if (node.type === 'text' && previous?.type === 'text' && previous.format === format) previous.value += node.value
        else result.push({ type: node.type, value: node.type === 'text' ? node.value : JSON.stringify(node), format })
        continue
      }
      const attributes = { ...node.attributes }
      const style = document.createElement('span').style
      style.cssText = attributes.style ?? ''
      delete attributes.style
      for (const property of Array.from(style)) {
        const value = style.getPropertyValue(property)
        if (value !== 'inherit') attributes[`style:${property}`] = property === 'font-family' ? fromCssFontFamily(value) : value
      }
      const marks: Record<string, string> = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', u: 'underline', s: 'strike', strike: 'strike', mark: 'highlight' }
      if (node.tag === 'span' || marks[node.tag]) {
        const format = { ...inherited, ...attributes, ...(marks[node.tag] ? { [`mark:${marks[node.tag]}`]: 'true' } : {}) }
        for (const child of normalize(node.children, format)) {
          const previous = result[result.length - 1]
          if (child.type === 'text' && previous?.type === 'text' && previous.format === child.format) previous.value += child.value
          else result.push(child)
        }
      } else result.push({ type: node.tag, value: ordered(attributes), format: ordered(inherited), children: normalize(node.children, inherited) })
    }
    return result
  }
  const tree = (html: string) => normalize(parseRichTextHtml(html).document.children)
  return JSON.stringify(tree(left)) === JSON.stringify(tree(right))
}
export function visualEditorHtml(value: string): string {
  const parsed = parseRichTextHtml(value)
  if (!parsed.canEnterVisualMode || !/<[^>]+>/.test(value)) return normalizeRichTextHtml(value)
  const documentNode = new DOMParser().parseFromString(value, 'text/html')
  for (const element of Array.from(documentNode.body.querySelectorAll<HTMLElement>('[style]'))) {
    const rawStyle = element.getAttribute('style') ?? ''
    if (!rawStyle.includes('{{') && !rawStyle.includes('}}')) continue
    element.setAttribute('data-oc-dynamic-style', rawStyle)
    element.removeAttribute('style')
  }
  return documentNode.body.innerHTML
}

