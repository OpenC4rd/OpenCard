import type { AlignmentPosition } from '../../../entities/card/model'

/** 描边与阴影在标记里是不可分割的元组：要么完整存在，要么不存在。 */
export type TextStroke = { color: string; width: string }
export type TextShadow = { color: string; offsetX: string; offsetY: string; blur: string }

/** 长度保留作者写下的原文（含单位），只在排版时求值，源码与编辑器之间才能无损往返。 */
export type InlineStyleSpec = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  color?: string
  backgroundColor?: string
  fontSize?: string
  fontFamily?: string
  stroke?: TextStroke
  shadow?: TextShadow
  fillSource?: string
}

export type CardMarkupTextNode = { type: 'text'; value: string }
export type CardMarkupBindingNode = { type: 'binding'; expression: string }
export type CardMarkupBreakNode = { type: 'br' }
export type CardMarkupIconNode = {
  type: 'icon'
  key: string
  pkg?: string | null
  version?: string | null
  scope?: 'current' | 'host' | 'package'
  size?: string
}
export type CardMarkupImageNode = {
  type: 'img'
  src: string
  width?: string
  height?: string
  fit?: 'contain' | 'cover' | 'fill'
  align?: 'start' | 'center' | 'end'
}
export type CardMarkupSpanNode = {
  type: 'span'
  style: InlineStyleSpec
  children: readonly CardMarkupInlineNode[]
}
export type CardMarkupInlineNode =
  | CardMarkupTextNode
  | CardMarkupBindingNode
  | CardMarkupBreakNode
  | CardMarkupIconNode
  | CardMarkupImageNode
  | CardMarkupSpanNode

export type CardMarkupParagraphNode = {
  type: 'paragraph'
  align?: AlignmentPosition
  children: readonly CardMarkupInlineNode[]
}
export type CardMarkupListNode = {
  type: 'list'
  ordered: boolean
  items: readonly (readonly CardMarkupParagraphNode[])[]
}
export type CardMarkupBlockNode = CardMarkupParagraphNode | CardMarkupListNode

export type CardMarkupDiagnostic = {
  code: 'unclosed-tag' | 'invalid-argument' | 'invalid-structure'
  offset: number
  message: string
}
export type CardMarkupDocument = {
  source: string
  blocks: readonly CardMarkupBlockNode[]
}
export type CardMarkupParseResult = {
  document: CardMarkupDocument
  diagnostics: readonly CardMarkupDiagnostic[]
  valid: boolean
}
