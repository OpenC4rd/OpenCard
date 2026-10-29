import { parseResourceReference } from '../../features/workspace/services/resourceReference'
import { parseProjectIconPath } from './projectIconReference'
import { richTextCellAttributes, richTextColumnWidths } from './richTextTable'

const allowedTags = new Set([
  'B', 'BR', 'COL', 'COLGROUP', 'EM', 'I', 'LI', 'MARK', 'OL', 'P', 'S', 'SPAN',
  'STRIKE', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL',
])

const blockedTags = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE', 'TEMPLATE'])
const allowedStyleProperties = [
  'background-color', 'color', 'font-family', 'font-size', 'text-align',
  'text-shadow', '-webkit-text-stroke', '-webkit-text-stroke-color', '-webkit-text-stroke-width',
] as const
const tableStyleProperties = ['min-width', 'width'] as const
const tableParents: Readonly<Record<string, ReadonlySet<string>>> = {
  COL: new Set(['COLGROUP']), COLGROUP: new Set(['TABLE']), THEAD: new Set(['TABLE']),
  TBODY: new Set(['TABLE']), TR: new Set(['THEAD', 'TBODY', 'TABLE']),
  TH: new Set(['TR']), TD: new Set(['TR']),
}

export type RichTextDiagnosticCode =
  | 'unsupported-tag' | 'invalid-structure'

export type RichTextDiagnostic = {
  code: RichTextDiagnosticCode
  path: string
  message: string
}

export type RichTextTextNode = { type: 'text', value: string }
export type RichTextElementNode = {
  type: 'element'
  tag: string
  attributes: Readonly<Record<string, string>>
  children: readonly RichTextNode[]
}
export type RichTextIconNode = {
  type: 'icon'
  /**
   * Reference qualifier: `null` for the current scope, `''` for the host project, otherwise the
   * package's full coordinate（`作者/包名@版本`）.
   */
  packageKey: string | null
  seriesKey: string
  iconKey: string
}
export type RichTextNode = RichTextTextNode | RichTextElementNode | RichTextIconNode
export type RichTextDocument = { html: string, children: readonly RichTextNode[] }
export type RichTextParseResult = {
  document: RichTextDocument
  diagnostics: RichTextDiagnostic[]
  canEnterVisualMode: boolean
}

function elementPath(element: Element): string {
  const parts: string[] = []
  let current: Element | null = element
  while (current?.parentElement) {
    const siblings = Array.from(current.parentElement.children).filter(item => item.tagName === current!.tagName)
    parts.unshift(`${current.tagName.toLowerCase()}[${siblings.indexOf(current) + 1}]`)
    current = current.parentElement === current.ownerDocument.body ? null : current.parentElement
  }
  return parts.join('/')
}

function pushDiagnostic(diagnostics: RichTextDiagnostic[], element: Element, code: RichTextDiagnosticCode, message: string): void {
  diagnostics.push({ code, path: elementPath(element), message })
}

export function parseRichTextHtml(source: string): RichTextParseResult {
  const documentNode = new DOMParser().parseFromString(source, 'text/html')
  const diagnostics: RichTextDiagnostic[] = []

  for (const element of Array.from(documentNode.body.querySelectorAll('*'))) {
    if (element.tagName === 'SCRIPT') {
      pushDiagnostic(diagnostics, element, 'unsupported-tag', `Unsupported <${element.tagName.toLowerCase()}> element`)
      continue
    }
    if (!allowedTags.has(element.tagName)) continue
    const expectedParents = tableParents[element.tagName]
    if (expectedParents && !expectedParents.has(element.parentElement?.tagName ?? '')) {
      pushDiagnostic(diagnostics, element, 'invalid-structure', `Invalid <${element.tagName.toLowerCase()}> parent`)
    }

  }

  function toNode(node: Node): RichTextNode | null {
    if (node instanceof Text) return { type: 'text', value: node.data }
    if (!(node instanceof Element) || !allowedTags.has(node.tagName)) return null
    if (node.tagName === 'SPAN' && node.hasAttribute('data-oc-icon-path')) {
      const reference = parseProjectIconPath(node.getAttribute('data-oc-icon-path') ?? '')
      return {
        type: 'icon',
        packageKey: reference?.packageKey ?? null,
        seriesKey: reference?.seriesKey ?? '',
        iconKey: reference?.iconKey ?? '',
      }
    }
    const attributes: Record<string, string> = {}
    const styleProperties = node.tagName === 'TABLE' || node.tagName === 'COL'
      ? tableStyleProperties : allowedStyleProperties
    const safeStyle = styleProperties.flatMap(property => {
      const value = (node as HTMLElement).style.getPropertyValue(property)
      return value ? [`${property}: ${value};`] : []
    }).join(' ')
    if (safeStyle) attributes.style = safeStyle
    if (node.tagName === 'SPAN' && node.hasAttribute('data-oc-binding')) {
      attributes['data-oc-binding'] = node.getAttribute('data-oc-binding') ?? ''
    }
    for (const name of [
      'data-oc-fill-type', 'data-oc-fill-source', 'data-oc-shadow-color',
      'data-oc-shadow-offset-x', 'data-oc-shadow-offset-y', 'data-oc-shadow-blur',
    ]) {
      if (name.startsWith('data-oc-fill-') && node.getAttribute('data-oc-fill-type') !== 'image') continue
      const value = node.getAttribute(name)
      if (value !== null) attributes[name] = value
    }
    if (node.tagName === 'TD' || node.tagName === 'TH') {
      Object.assign(attributes, richTextCellAttributes(node))
    }
    if (node instanceof HTMLTableElement && !node.querySelector(':scope > colgroup')) {
      const widths = richTextColumnWidths(node)
      if (widths.some(Boolean)) {
        const group = node.ownerDocument.createElement('colgroup')
        for (const width of widths) {
          const column = node.ownerDocument.createElement('col')
          if (width) column.style.width = `${width}px`
          group.append(column)
        }
        node.prepend(group)
      }
    }
    return {
      type: 'element',
      tag: node.tagName.toLowerCase(),
      attributes,
      children: Array.from(node.childNodes).flatMap(child => {
        const parsed = toNode(child)
        return parsed ? [parsed] : []
      }),
    }
  }

  const parsedChildren = documentNode.body.children.length === 0
    ? (documentNode.body.textContent ?? '').replace(/\r\n?/g, '\n').split('\n').map(line => ({
        type: 'element' as const,
        tag: 'p',
        attributes: {},
        children: line ? [{ type: 'text' as const, value: line }] : [{
          type: 'element' as const, tag: 'br', attributes: {}, children: [],
        }],
      }))
    : Array.from(documentNode.body.childNodes).flatMap(node => {
        const parsed = toNode(node)
        return parsed ? [parsed] : []
      })

  return {
    document: {
      html: source,
      children: parsedChildren,
    },
    diagnostics,
    canEnterVisualMode: diagnostics.length === 0,
  }
}



export function sanitizeRichTextHtml(source: string): string {
  const documentNode = new DOMParser().parseFromString(source, 'text/html')
  for (const element of Array.from(documentNode.body.querySelectorAll('*'))) {
    if (blockedTags.has(element.tagName)) { element.remove(); continue }
    if (!allowedTags.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); continue }
    const styleValues = Object.fromEntries(allowedStyleProperties.map(property => [property, (element as HTMLElement).style.getPropertyValue(property)]))
    styleValues['font-family'] = normalizeProjectFontFamilyStyle(styleValues['font-family'])
    const bindingExpression = element.tagName === 'SPAN' ? sanitizeBindingExpression(element.getAttribute('data-oc-binding')) : null
    const iconPath = element.tagName === 'SPAN' ? sanitizeIconPath(element.getAttribute('data-oc-icon-path')) : null
    const fillType = element.tagName === 'SPAN' ? sanitizeFillType(element.getAttribute('data-oc-fill-type')) : null
    const fillSource = fillType === 'image' ? sanitizeFillSource(element.getAttribute('data-oc-fill-source')) : null
    const shadowColor = element.tagName === 'SPAN' ? sanitizeCssColor(element.getAttribute('data-oc-shadow-color')) : null
    const shadowOffsetX = element.hasAttribute('data-oc-shadow-offset-x') ? sanitizeCssLength(element.getAttribute('data-oc-shadow-offset-x')) : null
    const shadowOffsetY = element.hasAttribute('data-oc-shadow-offset-y') ? sanitizeCssLength(element.getAttribute('data-oc-shadow-offset-y')) : null
    const shadowBlur = element.hasAttribute('data-oc-shadow-blur') ? sanitizeCssLength(element.getAttribute('data-oc-shadow-blur')) : null
    const tableCell = element.tagName === 'TD' || element.tagName === 'TH' ? richTextCellAttributes(element) : {}
    const layout = element.tagName === 'TABLE' || element.tagName === 'COL'
      ? Object.fromEntries(tableStyleProperties.map(property => [property, (element as HTMLElement).style.getPropertyValue(property)])) : {}
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name)
    for (const property of allowedStyleProperties) {
      const value = styleValues[property]
      if (value && !iconPath) (element as HTMLElement).style.setProperty(property, value)
    }
    for (const [property, value] of Object.entries(layout)) if (value) (element as HTMLElement).style.setProperty(property, value)
    for (const [name, value] of Object.entries(tableCell)) element.setAttribute(name, value)
    if (bindingExpression !== null) element.setAttribute('data-oc-binding', bindingExpression)
    if (fillType) element.setAttribute('data-oc-fill-type', fillType)
    if (fillType === 'image' && fillSource) element.setAttribute('data-oc-fill-source', fillSource)
    if (shadowColor) {
      element.setAttribute('data-oc-shadow-color', shadowColor)
    }
    if (shadowOffsetX) element.setAttribute('data-oc-shadow-offset-x', shadowOffsetX)
    if (shadowOffsetY) element.setAttribute('data-oc-shadow-offset-y', shadowOffsetY)
    if (shadowBlur) element.setAttribute('data-oc-shadow-blur', shadowBlur)
    if (iconPath) {
      element.setAttribute('data-oc-icon-path', iconPath)
      element.replaceChildren()
    }
  }
  return documentNode.body.innerHTML
}

function normalizeProjectFontFamilyStyle(value: string): string {
  const trimmed = value.trim()
  const unquoted = trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1) : trimmed
  const parsed = parseResourceReference(unquoted)
  if (parsed.diagnostics.length > 0) return value
  if (!parsed.reference || parsed.reference.kind !== 'font' || parsed.reference.scope !== 'current') return value
  return JSON.stringify(`OpenCardProjectFont-${parsed.reference.key}`)
}
function sanitizeBindingExpression(value: string | null): string | null {
  if (value === null) return null
  const expression = value.trim()
  return /[{}<>\u0000-\u001f\u007f]/.test(expression) ? null : expression
}
function sanitizeIconPath(value: string | null): string | null {
  const path = value?.trim() ?? ''
  return path && (parseProjectIconPath(path) || /^\{\{\s*[^{}]+?\s*\}\}$/.test(path)) ? path : null
}
function sanitizeFillType(value: string | null): 'image' | null {
  return value === 'image' ? value : null
}
function sanitizeFillSource(value: string | null): string | null {
  const source = value?.trim() ?? ''
  return source && !/["'<>\u0000-\u001f\u007f]/.test(source)
    && !/^(?:javascript|vbscript|data):/i.test(source) ? source : null
}
function sanitizeCssColor(value: string | null): string | null {
  const color = value?.trim() ?? ''
  return color && /^[#a-z0-9(),.%\s+-]+$/i.test(color) ? color : null
}
function sanitizeCssLength(value: string | null): string {
  const length = value?.trim() ?? ''
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|pt|mm|cm|in|%)$/.test(length) ? length : '0mm'
}
export function normalizeRichTextHtml(source: string): string {
  if (source === '') return '<p></p>'
  const sourceDocument = new DOMParser().parseFromString(source, 'text/html')
  if (sourceDocument.body.children.length > 0) {
    const sanitizedDocument = new DOMParser().parseFromString(sanitizeRichTextHtml(source), 'text/html')
    for (const node of Array.from(sanitizedDocument.body.childNodes)) if (node instanceof Text && !node.data.trim()) node.remove()
    return sanitizedDocument.body.innerHTML
  }
  const documentNode = document.implementation.createHTMLDocument('')
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const paragraph = documentNode.createElement('p')
    if (line) paragraph.textContent = line; else paragraph.append(documentNode.createElement('br'))
    documentNode.body.append(paragraph)
  }
  return documentNode.body.innerHTML
}
