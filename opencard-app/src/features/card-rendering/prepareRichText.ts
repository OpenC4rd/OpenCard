import type { CardBlock, CardDocument, CardFaceKey, CardInstanceRecord } from '../../entities/card/model'
import { visitCardBlockTree } from '../../entities/card/tree'
import type { RichTextDocument, RichTextNode } from '../../shared/rich-text/richTextHtml'
import { createCardPipelineIssue, type CardPipelineIssue } from './cardPipelineIssue'
import {
  parseCardMarkup,
  type CardMarkupBlockNode,
  type CardMarkupDiagnostic,
  type CardMarkupDocument,
  type CardMarkupInlineNode,
  type CardMarkupParagraphNode,
} from './markup'

export type PreparedRichTextDocument =
  | (CardMarkupDocument & {
      readonly children: readonly RichTextNode[]
    })
  | (RichTextDocument & {
      readonly blocks?: readonly CardMarkupBlockNode[]
    })

export type PreparedRichText = {
  document: PreparedRichTextDocument
  diagnostics: readonly CardPipelineIssue[]
  valid: boolean
}

export type PreparedRichTextCatalog = ReadonlyMap<string, PreparedRichText>

function hostIssue(
  documentId: string,
  block: CardBlock,
  faceKey: CardFaceKey,
  instanceId: string | null,
  diagnostic: CardMarkupDiagnostic,
): CardPipelineIssue {
  return createCardPipelineIssue({
    type: 'card-designer.rich-text.invalid-html',
    location: {
      documentId,
      instanceId,
      faceKey,
      owner: { kind: 'block', id: block.id },
      blockId: block.id,
      fieldKey: 'content',
      characterOffset: diagnostic.offset,
    },
    token: diagnostic.message,
    details: {
      code: diagnostic.code,
      message: diagnostic.message,
      offset: diagnostic.offset,
    },
  })
}

function inlineToRichTextNode(node: CardMarkupInlineNode): RichTextNode {
  switch (node.type) {
    case 'text':
      return { type: 'text', value: node.value }
    case 'binding':
      return {
        type: 'element',
        tag: 'span',
        attributes: { 'data-oc-binding': node.expression },
        children: [{ type: 'text', value: `{{${node.expression}}}` }],
      }
    case 'br':
      return { type: 'element', tag: 'br', attributes: {}, children: [] }
    case 'icon': {
      const sep = node.key.indexOf('/')
      const seriesKey = sep > 0 ? node.key.slice(0, sep) : ''
      const iconKey = sep > 0 ? node.key.slice(sep + 1) : node.key
      return {
        type: 'icon',
        packageKey: node.pkg ?? null,
        seriesKey,
        iconKey,
      }
    }
    case 'img':
      return {
        type: 'element',
        tag: 'img',
        attributes: {
          src: node.src,
          ...(node.width !== undefined ? { width: node.width } : {}),
          ...(node.height !== undefined ? { height: node.height } : {}),
        },
        children: [],
      }
    case 'span': {
      const styleParts: string[] = []
      if (node.style.bold) styleParts.push('font-weight: bold')
      if (node.style.italic) styleParts.push('font-style: italic')
      if (node.style.underline) styleParts.push('text-decoration: underline')
      if (node.style.strikethrough) styleParts.push('text-decoration: line-through')
      if (node.style.color) styleParts.push(`color: ${node.style.color}`)
      const bg = node.style.markColor ?? node.style.backgroundColor
      if (bg) styleParts.push(`background-color: ${bg}`)
      if (node.style.fontSize) styleParts.push(`font-size: ${node.style.fontSize}`)
      if (node.style.fontFamily) styleParts.push(`font-family: ${node.style.fontFamily}`)
      const attributes: Record<string, string> = {}
      if (styleParts.length > 0) attributes.style = styleParts.join('; ')
      return {
        type: 'element',
        tag: 'span',
        attributes,
        children: node.children.map(inlineToRichTextNode),
      }
    }
  }
}

function paragraphToRichTextNode(node: CardMarkupParagraphNode): RichTextNode {
  const attributes: Record<string, string> = {}
  if (node.align) {
    attributes.style = `text-align: ${node.align};`
  }
  return {
    type: 'element',
    tag: 'p',
    attributes,
    children: node.children.map(inlineToRichTextNode),
  }
}

function cardMarkupBlocksToRichTextNodes(
  blocks: readonly CardMarkupBlockNode[],
): readonly RichTextNode[] {
  const nodes: RichTextNode[] = []
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      nodes.push(paragraphToRichTextNode(block))
    } else if (block.type === 'list') {
      nodes.push({
        type: 'element',
        tag: block.ordered ? 'ol' : 'ul',
        attributes: {},
        children: block.items.map((item) => ({
          type: 'element',
          tag: 'li',
          attributes: {},
          children: item.map(paragraphToRichTextNode),
        })),
      })
    }
  }
  return nodes
}

export function prepareRichText(options: {
  document: CardDocument
  currentCard?: CardInstanceRecord | null
}): { catalog: PreparedRichTextCatalog; issues: CardPipelineIssue[] } {
  const catalog = new Map<string, PreparedRichText>()
  const issues: CardPipelineIssue[] = []

  for (const [faceKey, face] of Object.entries(options.document.faces) as [
    CardFaceKey,
    CardDocument['faces'][CardFaceKey],
  ][]) {
    for (const child of face.children) {
      visitCardBlockTree(child.block, (host) => {
        if (host.type !== 'text-block') return
        const parsed = parseCardMarkup(host.content ?? '')
        const diagnostics = parsed.diagnostics.map((diag) =>
          hostIssue(options.document.id, host, faceKey, options.currentCard?.id ?? null, diag),
        )
        issues.push(...diagnostics)
        const children = cardMarkupBlocksToRichTextNodes(parsed.document.blocks)
        const doc: PreparedRichTextDocument = {
          source: parsed.document.source,
          blocks: parsed.document.blocks,
          children,
        }
        catalog.set(host.id, {
          document: doc,
          diagnostics,
          valid: parsed.valid,
        })
      })
    }
  }

  return { catalog, issues }
}
