/**
 * 安全内联标记协议：只解析应用文案允许的扁平标记，其他输入保持原文。
 */
import { iconGlyphs, type IconToken } from '../icon/iconRegistry'

export type InlineMarkupNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'emphasis'; value: string }
  | { type: 'code'; value: string }
  | { type: 'key'; value: string }
  | { type: 'break' }
  | { type: 'icon'; reference: IconToken }

const INLINE_MARKUP_PATTERN = /\[icon:([^\]\r\n]+)\]|\[(b|i|code|key)\]([^\[\]\r\n]+)\[\/\2\]|\[br\]/gi

function isIconToken(value: string): value is IconToken {
  return Object.prototype.hasOwnProperty.call(iconGlyphs, value)
}

export function parseInlineMarkup(source: string): readonly InlineMarkupNode[] {
  const nodes: InlineMarkupNode[] = []
  let cursor = 0

  for (const match of source.matchAll(INLINE_MARKUP_PATTERN)) {
    const index = match.index ?? 0
    const value = match[1]?.trim() ?? ''
    const tag = match[2]?.toLocaleLowerCase()
    const taggedValue = match[3] ?? ''
    const iconReference = match[1] !== undefined && isIconToken(value) ? value : null
    const isLegacyDoubleBracketIcon = match[1] !== undefined
      && (source[index - 1] === '[' || source[index + match[0].length] === ']')

    if (isLegacyDoubleBracketIcon || (match[1] !== undefined && iconReference === null)) continue
    if (index > cursor) nodes.push({ type: 'text', value: source.slice(cursor, index) })

    if (match[0].toLocaleLowerCase() === '[br]') nodes.push({ type: 'break' })
    else if (iconReference !== null) nodes.push({ type: 'icon', reference: iconReference })
    else if (tag === 'b') nodes.push({ type: 'strong', value: taggedValue })
    else if (tag === 'i') nodes.push({ type: 'emphasis', value: taggedValue })
    else if (tag === 'code') nodes.push({ type: 'code', value: taggedValue })
    else if (tag === 'key') nodes.push({ type: 'key', value: taggedValue })

    cursor = index + match[0].length
  }

  if (cursor < source.length) nodes.push({ type: 'text', value: source.slice(cursor) })
  return nodes
}

export function inlineMarkupToText(source: string): string {
  return parseInlineMarkup(source)
    .map(node => {
      if (node.type === 'break') return ' '
      if (node.type === 'icon') return ''
      return node.value
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
