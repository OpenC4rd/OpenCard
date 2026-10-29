import type { AlignmentPosition } from '../../../entities/card/model'

export type InlineStyleSpec = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  markColor?: string
  color?: string
  backgroundColor?: string
  fontSize?: string
  fontFamily?: string
  strokeColor?: string
  strokeWidth?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowBlur?: number
  fillType?: 'color' | 'image'
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
