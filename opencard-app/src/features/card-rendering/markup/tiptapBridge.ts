import type { AlignmentPosition } from '../../../entities/card/model'
import type {
  CardMarkupBlockNode,
  CardMarkupDocument,
  CardMarkupIconNode,
  CardMarkupImageNode,
  CardMarkupInlineNode,
  CardMarkupParagraphNode,
  CardMarkupSpanNode,
  InlineStyleSpec,
} from './cardMarkup.types'
import { parseCardMarkup } from './cardMarkupParser'
import { serializeCardMarkup } from './cardMarkupSerializer'

export type TiptapBridgeMark = {
  type: string
  attrs?: Record<string, unknown>
}

export type TiptapBridgeNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: readonly TiptapBridgeNode[]
  marks?: readonly TiptapBridgeMark[]
  text?: string
}

type StyledInlineItem = {
  node: CardMarkupInlineNode
  style: InlineStyleSpec
}

const ALIGNMENT_MAP: Record<string, AlignmentPosition> = {
  start: 'start',
  left: 'start',
  center: 'center',
  end: 'end',
  right: 'end',
  justify: 'justify',
}

function parseLength(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined
  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined
  const str = String(val).trim()
  const match = /^(-?(?:\d+\.?\d*|\.\d+))/.exec(str)
  return match ? Number(match[1]) : undefined
}

export function styleToMarks(style: InlineStyleSpec): TiptapBridgeMark[] {
  const marks: TiptapBridgeMark[] = []
  if (style.bold) marks.push({ type: 'bold' })
  if (style.italic) marks.push({ type: 'italic' })
  if (style.underline) marks.push({ type: 'underline' })
  if (style.strikethrough) marks.push({ type: 'strike' })

  const highlightColor = style.markColor ?? style.backgroundColor
  if (highlightColor) {
    marks.push({ type: 'highlight', attrs: { color: highlightColor } })
  }

  const textStyleAttrs: Record<string, unknown> = {}
  if (style.color !== undefined) textStyleAttrs.color = style.color
  if (style.fontSize !== undefined) textStyleAttrs.fontSize = style.fontSize
  if (style.fontFamily !== undefined) textStyleAttrs.fontFamily = style.fontFamily
  if (style.strokeColor !== undefined) textStyleAttrs.textStrokeColor = style.strokeColor
  if (style.strokeWidth !== undefined) textStyleAttrs.textStrokeWidth = `${style.strokeWidth}px`
  if (style.shadowColor !== undefined) textStyleAttrs.textShadowColor = style.shadowColor
  if (style.shadowOffsetX !== undefined) textStyleAttrs.textShadowOffsetX = `${style.shadowOffsetX}px`
  if (style.shadowOffsetY !== undefined) textStyleAttrs.textShadowOffsetY = `${style.shadowOffsetY}px`
  if (style.shadowBlur !== undefined) textStyleAttrs.textShadowBlur = `${style.shadowBlur}px`
  if (style.fillType !== undefined) {
    textStyleAttrs.textFillType = style.fillType
    if (style.fillSource !== undefined) textStyleAttrs.textFillSource = style.fillSource
  }

  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({ type: 'textStyle', attrs: textStyleAttrs })
  }

  return marks
}

export function marksToStyle(marks?: readonly TiptapBridgeMark[]): InlineStyleSpec {
  const style: InlineStyleSpec = {}
  if (!marks || marks.length === 0) return style

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        style.bold = true
        break
      case 'italic':
        style.italic = true
        break
      case 'underline':
        style.underline = true
        break
      case 'strike':
      case 'strikethrough':
        style.strikethrough = true
        break
      case 'highlight': {
        const color = mark.attrs?.color
        if (typeof color === 'string' && color) style.markColor = color
        break
      }
      case 'textStyle': {
        const attrs = mark.attrs
        if (!attrs) break
        if (typeof attrs.color === 'string' && attrs.color) style.color = attrs.color
        if (typeof attrs.fontSize === 'string' && attrs.fontSize) style.fontSize = attrs.fontSize
        if (typeof attrs.fontFamily === 'string' && attrs.fontFamily) style.fontFamily = attrs.fontFamily
        if (typeof attrs.textStrokeColor === 'string' && attrs.textStrokeColor) {
          style.strokeColor = attrs.textStrokeColor
        }
        const strokeWidth = parseLength(attrs.textStrokeWidth)
        if (strokeWidth !== undefined) style.strokeWidth = strokeWidth
        if (typeof attrs.textShadowColor === 'string' && attrs.textShadowColor) {
          style.shadowColor = attrs.textShadowColor
        }
        const sx = parseLength(attrs.textShadowOffsetX)
        if (sx !== undefined) style.shadowOffsetX = sx
        const sy = parseLength(attrs.textShadowOffsetY)
        if (sy !== undefined) style.shadowOffsetY = sy
        const sb = parseLength(attrs.textShadowBlur)
        if (sb !== undefined) style.shadowBlur = sb
        if (attrs.textFillType === 'image' || attrs.textFillType === 'color') {
          style.fillType = attrs.textFillType
          if (typeof attrs.textFillSource === 'string') style.fillSource = attrs.textFillSource
        }
        break
      }
    }
  }

  return style
}

function mergeMarks(
  parent: readonly TiptapBridgeMark[],
  child: readonly TiptapBridgeMark[],
): TiptapBridgeMark[] {
  const result: TiptapBridgeMark[] = []
  const childMap = new Map<string, TiptapBridgeMark>()
  for (const m of child) childMap.set(m.type, m)

  for (const p of parent) {
    const c = childMap.get(p.type)
    if (!c) {
      result.push({ ...p, attrs: p.attrs ? { ...p.attrs } : undefined })
    } else {
      result.push({
        type: p.type,
        attrs: p.attrs || c.attrs ? { ...(p.attrs ?? {}), ...(c.attrs ?? {}) } : undefined,
      })
      childMap.delete(p.type)
    }
  }
  for (const c of childMap.values()) {
    result.push({ ...c, attrs: c.attrs ? { ...c.attrs } : undefined })
  }
  return result
}

function formatIconPath(icon: CardMarkupIconNode): string {
  if (icon.scope === 'host') {
    return `#${icon.key.startsWith('icon:') ? icon.key : `icon:${icon.key}`}`
  }
  if (icon.pkg) {
    const qual = icon.version ? `${icon.pkg}@${icon.version}` : icon.pkg
    return `${qual}#${icon.key.startsWith('icon:') ? icon.key : `icon:${icon.key}`}`
  }
  return icon.key
}

function inlineToTiptapNodes(
  node: CardMarkupInlineNode,
  inheritedMarks: readonly TiptapBridgeMark[] = [],
): TiptapBridgeNode[] {
  switch (node.type) {
    case 'text':
      if (!node.value) return []
      return [{
        type: 'text',
        text: node.value,
        ...(inheritedMarks.length > 0 ? { marks: inheritedMarks } : {}),
      }]
    case 'binding':
      return [{
        type: 'binding',
        attrs: { expression: node.expression },
        ...(inheritedMarks.length > 0 ? { marks: inheritedMarks } : {}),
      }]
    case 'br':
      return [{ type: 'hardBreak' }]
    case 'icon':
      return [{
        type: 'projectIcon',
        attrs: {
          iconPath: formatIconPath(node),
          ...(node.size !== undefined ? { size: node.size } : {}),
        },
        ...(inheritedMarks.length > 0 ? { marks: inheritedMarks } : {}),
      }]
    case 'img':
      return [{
        type: 'image',
        attrs: {
          src: node.src,
          ...(node.width !== undefined ? { width: node.width } : {}),
          ...(node.height !== undefined ? { height: node.height } : {}),
          ...(node.fit !== undefined ? { fit: node.fit } : {}),
          ...(node.align !== undefined ? { align: node.align } : {}),
        },
        ...(inheritedMarks.length > 0 ? { marks: inheritedMarks } : {}),
      }]
    case 'span': {
      const spanMarks = styleToMarks(node.style)
      const mergedMarks = mergeMarks(inheritedMarks, spanMarks)
      return node.children.flatMap((child) => inlineToTiptapNodes(child, mergedMarks))
    }
  }
}

export function cardMarkupToTiptap(
  documentOrSource: CardMarkupDocument | string,
): TiptapBridgeNode {
  const doc: CardMarkupDocument = typeof documentOrSource === 'string'
    ? parseCardMarkup(documentOrSource).document
    : documentOrSource

  const content: TiptapBridgeNode[] = []
  for (const block of doc.blocks) {
    if (block.type === 'paragraph') {
      const inlines = block.children.flatMap((child) => inlineToTiptapNodes(child))
      const attrs: Record<string, unknown> = {}
      if (block.align && block.align !== 'start') attrs.textAlign = block.align
      content.push({
        type: 'paragraph',
        ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
        ...(inlines.length > 0 ? { content: inlines } : {}),
      })
    } else if (block.type === 'list') {
      const items = block.items.length > 0 ? block.items : [[]]
      content.push({
        type: block.ordered ? 'orderedList' : 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          content: (item.length > 0 ? item : [{ type: 'paragraph' as const, children: [] }]).map((p) => {
            const inlines = p.children.flatMap((child) => inlineToTiptapNodes(child))
            const attrs: Record<string, unknown> = {}
            if (p.align && p.align !== 'start') attrs.textAlign = p.align
            return {
              type: 'paragraph',
              ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
              ...(inlines.length > 0 ? { content: inlines } : {}),
            }
          }),
        })),
      })
    }
  }

  if (content.length === 0) content.push({ type: 'paragraph' })
  return { type: 'doc', content }
}

function parseIconAttrs(attrs?: Record<string, unknown>): CardMarkupIconNode {
  const size = attrs?.size != null && String(attrs.size).trim() ? String(attrs.size).trim() : undefined
  if (attrs?.key) {
    const icon: CardMarkupIconNode = {
      type: 'icon',
      key: String(attrs.key),
    }
    if (attrs.pkg != null) icon.pkg = String(attrs.pkg)
    if (attrs.version != null) icon.version = String(attrs.version)
    if (attrs.scope === 'current' || attrs.scope === 'host' || attrs.scope === 'package') {
      icon.scope = attrs.scope
    }
    if (size !== undefined) icon.size = size
    return icon
  }

  const iconPath = String(attrs?.iconPath ?? attrs?.src ?? '').trim()
  const hashIdx = iconPath.indexOf('#')
  if (hashIdx >= 0) {
    const qualifier = iconPath.slice(0, hashIdx).trim()
    const rawKey = iconPath.slice(hashIdx + 1).trim()
    const key = rawKey.startsWith('icon:') ? rawKey.slice('icon:'.length) : rawKey
    const icon: CardMarkupIconNode = { type: 'icon', key }
    if (size !== undefined) icon.size = size
    if (!qualifier) {
      icon.scope = 'host'
      return icon
    }
    const atIdx = qualifier.lastIndexOf('@')
    if (atIdx > 0) {
      icon.pkg = qualifier.slice(0, atIdx)
      icon.version = qualifier.slice(atIdx + 1)
      return icon
    }
    icon.pkg = qualifier
    return icon
  }

  const key = iconPath.startsWith('icon:') ? iconPath.slice('icon:'.length) : iconPath
  const icon: CardMarkupIconNode = { type: 'icon', key }
  if (size !== undefined) icon.size = size
  return icon
}

function tiptapInlineToItems(node: TiptapBridgeNode): StyledInlineItem[] {
  const style = marksToStyle(node.marks)

  switch (node.type) {
    case 'text': {
      const text = node.text ?? ''
      if (!text) return []
      const parts = text.split('\n')
      const items: StyledInlineItem[] = []
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) items.push({ node: { type: 'br' }, style })
        if (parts[i]) items.push({ node: { type: 'text', value: parts[i]! }, style })
      }
      return items
    }
    case 'binding': {
      const expression = String(node.attrs?.expression ?? '').trim()
      return [{ node: { type: 'binding', expression }, style }]
    }
    case 'projectIcon':
    case 'inlineIcon': {
      return [{ node: parseIconAttrs(node.attrs), style }]
    }
    case 'hardBreak': {
      return [{ node: { type: 'br' }, style }]
    }
    case 'image': {
      const src = String(node.attrs?.src ?? '')
      const imageNode: CardMarkupImageNode = { type: 'img', src }
      if (node.attrs?.width) imageNode.width = String(node.attrs.width)
      if (node.attrs?.height) imageNode.height = String(node.attrs.height)
      if (node.attrs?.fit) imageNode.fit = node.attrs.fit as 'contain' | 'cover' | 'fill'
      if (node.attrs?.align) imageNode.align = node.attrs.align as 'start' | 'center' | 'end'
      return [{ node: imageNode, style }]
    }
    default:
      return []
  }
}

function isEquivalentStyle(a: InlineStyleSpec, b: InlineStyleSpec): boolean {
  const definedA = (Object.keys(a) as (keyof InlineStyleSpec)[]).filter((k) => a[k] !== undefined)
  const definedB = (Object.keys(b) as (keyof InlineStyleSpec)[]).filter((k) => b[k] !== undefined)
  if (definedA.length !== definedB.length) return false
  return definedA.every((k) => a[k] === b[k])
}

function intersectStyles(a: InlineStyleSpec, b: InlineStyleSpec): InlineStyleSpec {
  const result: InlineStyleSpec = {}
  for (const key of Object.keys(a) as (keyof InlineStyleSpec)[]) {
    if (a[key] !== undefined && a[key] === b[key]) {
      ;(result as Record<string, unknown>)[key] = a[key]
    }
  }
  return result
}

function subtractStyle(source: InlineStyleSpec, toRemove: InlineStyleSpec): InlineStyleSpec {
  const result: InlineStyleSpec = { ...source }
  for (const key of Object.keys(toRemove) as (keyof InlineStyleSpec)[]) {
    if (toRemove[key] !== undefined && result[key] === toRemove[key]) {
      delete result[key]
    }
  }
  return result
}

function isStyleEmpty(style: InlineStyleSpec): boolean {
  return Object.values(style).every((v) => v === undefined)
}

function mergeInlines(nodes: readonly CardMarkupInlineNode[]): CardMarkupInlineNode[] {
  const result: CardMarkupInlineNode[] = []
  for (const node of nodes) {
    const prev = result[result.length - 1]
    if (prev?.type === 'text' && node.type === 'text') {
      result[result.length - 1] = { type: 'text', value: prev.value + node.value }
    } else if (
      prev?.type === 'span' &&
      node.type === 'span' &&
      isEquivalentStyle(prev.style, node.style)
    ) {
      result[result.length - 1] = {
        type: 'span',
        style: prev.style,
        children: mergeInlines([...prev.children, ...node.children]),
      }
    } else {
      result.push(node)
    }
  }
  return result
}

function reconstructInlines(items: readonly StyledInlineItem[]): CardMarkupInlineNode[] {
  if (items.length === 0) return []

  if (isStyleEmpty(items[0]!.style)) {
    let k = 0
    while (k < items.length && isStyleEmpty(items[k]!.style)) {
      k++
    }
    const leading = mergeInlines(items.slice(0, k).map((x) => x.node))
    return mergeInlines([...leading, ...reconstructInlines(items.slice(k))])
  }

  let common = { ...items[0]!.style }
  let end = 1
  while (end < items.length) {
    const nextCommon = intersectStyles(common, items[end]!.style)
    if (isStyleEmpty(nextCommon)) {
      break
    }
    common = nextCommon
    end++
  }

  const innerItems: StyledInlineItem[] = items.slice(0, end).map((item) => ({
    node: item.node,
    style: subtractStyle(item.style, common),
  }))

  const innerNodes = reconstructInlines(innerItems)
  const spanNode: CardMarkupSpanNode = {
    type: 'span',
    style: common,
    children: innerNodes,
  }

  return mergeInlines([spanNode, ...reconstructInlines(items.slice(end))])
}

function parseAlignAttr(attrs?: Record<string, unknown>): AlignmentPosition | undefined {
  const raw = attrs?.textAlign
  if (typeof raw !== 'string') return undefined
  const mapped = ALIGNMENT_MAP[raw.toLowerCase()]
  if (mapped === 'start') return undefined
  return mapped
}

function tiptapToParagraph(node: TiptapBridgeNode): CardMarkupParagraphNode {
  const items: StyledInlineItem[] = []
  for (const child of node.content ?? []) {
    items.push(...tiptapInlineToItems(child))
  }

  const children = reconstructInlines(items)
  const align = parseAlignAttr(node.attrs)

  return {
    type: 'paragraph',
    align: align ?? undefined,
    children,
  }
}

function tiptapBlockToCardMarkup(node: TiptapBridgeNode): CardMarkupBlockNode[] {
  switch (node.type) {
    case 'paragraph':
      return [tiptapToParagraph(node)]

    case 'bulletList':
    case 'orderedList': {
      const items: CardMarkupParagraphNode[][] = []
      for (const item of node.content ?? []) {
        if (item.type === 'listItem') {
          const paragraphs: CardMarkupParagraphNode[] = []
          for (const child of item.content ?? []) {
            if (child.type === 'paragraph') {
              paragraphs.push(tiptapToParagraph(child))
            } else if (child.type === 'bulletList' || child.type === 'orderedList') {
              const nested = tiptapBlockToCardMarkup(child)
              for (const b of nested) {
                if (b.type === 'paragraph') paragraphs.push(b)
                else for (const pList of b.items) paragraphs.push(...pList)
              }
            } else {
              paragraphs.push(tiptapToParagraph({ type: 'paragraph', content: [child] }))
            }
          }
          items.push(paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph', children: [] }])
        }
      }
      return [{
        type: 'list',
        ordered: node.type === 'orderedList',
        items,
      }]
    }

    case 'table': {
      const paragraphs: CardMarkupParagraphNode[] = []
      const extractParas = (n: TiptapBridgeNode) => {
        if (n.type === 'paragraph') {
          paragraphs.push(tiptapToParagraph(n))
        } else {
          for (const c of n.content ?? []) extractParas(c)
        }
      }
      extractParas(node)
      return paragraphs
    }

    default:
      if (node.content && node.content.length > 0) {
        return [tiptapToParagraph({ type: 'paragraph', content: node.content })]
      }
      return [{ type: 'paragraph', children: [] }]
  }
}

export function tiptapToCardMarkup(
  source: TiptapBridgeNode | string,
): CardMarkupDocument {
  if (typeof source === 'string') {
    return parseCardMarkup(source).document
  }

  const blocks: CardMarkupBlockNode[] = []
  if (source.type === 'doc') {
    for (const child of source.content ?? []) {
      blocks.push(...tiptapBlockToCardMarkup(child))
    }
  } else {
    blocks.push(...tiptapBlockToCardMarkup(source))
  }

  const docBlocks: readonly CardMarkupBlockNode[] =
    blocks.length > 0 ? blocks : [{ type: 'paragraph' as const, children: [] }]
  const doc: CardMarkupDocument = { source: '', blocks: docBlocks }
  doc.source = serializeCardMarkup(doc)
  return doc
}

export function serializeTiptapMarkup(source: TiptapBridgeNode | string): string {
  return serializeCardMarkup(tiptapToCardMarkup(source))
}

export function cardMarkupToHtml(source: string | CardMarkupDocument): string {
  const doc: CardMarkupDocument = typeof source === 'string'
    ? parseCardMarkup(source).document
    : source
  const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  function inlineToHtml(node: CardMarkupInlineNode): string {
    switch (node.type) {
      case 'text':
        return escapeHtml(node.value)
      case 'binding':
        return `<span class="binding-node" data-type="binding" data-expression="${escapeHtml(node.expression)}">{{${escapeHtml(node.expression)}}}</span>`
      case 'br':
        return '<br>'
      case 'icon': {
        const path = formatIconPath(node)
        const sizeAttr = node.size ? ` data-oc-size="${escapeHtml(node.size)}"` : ''
        return `<span class="project-icon-node" data-type="projectIcon" data-icon-path="${escapeHtml(path)}"${sizeAttr}></span>`
      }
      case 'img': {
        const attrs = [`src="${escapeHtml(node.src)}"`]
        if (node.width) attrs.push(`width="${escapeHtml(node.width)}"`)
        if (node.height) attrs.push(`height="${escapeHtml(node.height)}"`)
        return `<img ${attrs.join(' ')} />`
      }
      case 'span': {
        let content = node.children.map(inlineToHtml).join('')
        const style = node.style
        if (style.bold) content = `<strong>${content}</strong>`
        if (style.italic) content = `<em>${content}</em>`
        if (style.underline) content = `<u>${content}</u>`
        if (style.strikethrough) content = `<s>${content}</s>`
        if (style.markColor || style.backgroundColor) {
          const color = style.markColor ?? style.backgroundColor!
          content = `<mark data-color="${color}" style="background-color: ${color}">${content}</mark>`
        }
        const styleAttrs: string[] = []
        if (style.color) styleAttrs.push(`color: ${style.color}`)
        if (style.fontSize) styleAttrs.push(`font-size: ${style.fontSize}`)
        if (style.fontFamily) styleAttrs.push(`font-family: ${style.fontFamily}`)
        if (style.strokeColor) styleAttrs.push(`-webkit-text-stroke-color: ${style.strokeColor}`)
        if (style.strokeWidth !== undefined) styleAttrs.push(`-webkit-text-stroke-width: ${style.strokeWidth}px`)
        if (style.shadowColor) styleAttrs.push(`text-shadow: ${style.shadowColor} ${style.shadowOffsetX ?? 0}px ${style.shadowOffsetY ?? 0}px ${style.shadowBlur ?? 0}px`)
        const dataAttrs: string[] = []
        if (style.fillType) dataAttrs.push(`data-oc-fill-type="${style.fillType}"`)
        if (style.fillSource) dataAttrs.push(`data-oc-fill-source="${escapeHtml(style.fillSource)}"`)
        if (styleAttrs.length > 0 || dataAttrs.length > 0) {
          const styleStr = styleAttrs.length > 0 ? ` style="${styleAttrs.join('; ')}"` : ''
          const dataStr = dataAttrs.length > 0 ? ` ${dataAttrs.join(' ')}` : ''
          content = `<span${dataStr}${styleStr}>${content}</span>`
        }
        return content
      }
    }
  }

  function blockToHtml(block: CardMarkupBlockNode): string {
    if (block.type === 'paragraph') {
      const align = block.align ? ` style="text-align: ${block.align}"` : ''
      return `<p${align}>${block.children.map(inlineToHtml).join('')}</p>`
    }
    if (block.type === 'list') {
      const tag = block.ordered ? 'ol' : 'ul'
      const items = block.items.map(item => `<li>${item.map(p => blockToHtml(p)).join('')}</li>`).join('')
      return `<${tag}>${items}</${tag}>`
    }
    return ''
  }

  const html = doc.blocks.map(blockToHtml).join('')
  return html || '<p></p>'
}

export function htmlToCardMarkup(html: string): string {
  const result = parseCardMarkup(html)
  return serializeCardMarkup(result.document)
}
