import type {
  CardMarkupBlockNode,
  CardMarkupDocument,
  CardMarkupInlineNode,
  CardMarkupParagraphNode,
  InlineStyleSpec,
} from './cardMarkup.types'

/** 文本里会被词法器当作语法的字符一律转义。`\n` 无法转义，交给 `@br()`（带括号，避免后续字母被并进标签名）。 */
export function escapeMarkupText(text: string): string {
  return text.replace(/[\\@{}]/g, '\\$&')
}

/** 参数值含分隔符、括号、引号或首尾空白时加引号；否则原样输出。 */
function quoteMarkupArg(value: string): string {
  if (value !== '' && !/[,"'()\\]|^\s|\s$/.test(value)) return value
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

const FLAG_TAGS: readonly (readonly [keyof InlineStyleSpec, string])[] = [
  ['bold', 'bold'],
  ['italic', 'italic'],
  ['underline', 'underline'],
  ['strikethrough', 'strikethrough'],
]

const FLAG_KEYS: readonly (readonly [keyof InlineStyleSpec, string])[] = [
  ['bold', 'b'],
  ['italic', 'i'],
  ['underline', 'u'],
  ['strikethrough', 's'],
]

function styleArgs(style: InlineStyleSpec): string[] {
  const args: string[] = []
  for (const [field, key] of FLAG_KEYS) if (style[field] === true) args.push(key)
  const text = (key: string, value: string | undefined) => {
    if (value !== undefined) args.push(`${key}=${quoteMarkupArg(value)}`)
  }
  text('color', style.color)
  text('bg', style.backgroundColor)
  text('size', style.fontSize)
  text('font', style.fontFamily)
  text('fill', style.fillSource)
  if (style.stroke) text('stroke', `${style.stroke.color} ${style.stroke.width}`)
  if (style.shadow) {
    const { color, offsetX, offsetY, blur } = style.shadow
    text('shadow', `${color} ${offsetX} ${offsetY} ${blur}`)
  }
  return args
}

/** 只有单个标记时用全称标签（`@bold{…}`），否则落到 `@style(...){…}`。 */
function openSpan(style: InlineStyleSpec): string {
  const defined = (Object.keys(style) as (keyof InlineStyleSpec)[]).filter((key) => style[key] !== undefined && style[key] !== false)
  if (defined.length === 1) {
    const [only] = defined
    const flag = FLAG_TAGS.find(([field]) => field === only)
    if (flag && style[only!] === true) return `@${flag[1]}{`
  }
  return `@style(${styleArgs(style).join(',')}){`
}

function serializeInline(node: CardMarkupInlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value.split('\n').map(escapeMarkupText).join('@br()')
    case 'binding':
      return `{{${node.expression}}}`
    case 'br':
      return '@br()'
    case 'icon': {
      const args: string[] = [`key=${quoteMarkupArg(node.key)}`]
      if (node.pkg != null) args.push(`pkg=${quoteMarkupArg(node.pkg)}`)
      if (node.version != null) args.push(`version=${quoteMarkupArg(node.version)}`)
      if (node.scope !== undefined) args.push(`scope=${node.scope}`)
      if (node.size !== undefined) args.push(`size=${quoteMarkupArg(node.size)}`)
      return `@icon(${args.join(',')})`
    }
    case 'img': {
      const args: string[] = [`src=${quoteMarkupArg(node.src)}`]
      if (node.width !== undefined) args.push(`w=${quoteMarkupArg(node.width)}`)
      if (node.height !== undefined) args.push(`h=${quoteMarkupArg(node.height)}`)
      if (node.fit !== undefined) args.push(`fit=${node.fit}`)
      if (node.align !== undefined) args.push(`align=${node.align}`)
      return `@img(${args.join(',')})`
    }
    case 'span':
      return `${openSpan(node.style)}${node.children.map(serializeInline).join('')}}`
  }
}

function serializeParagraph(paragraph: CardMarkupParagraphNode): string {
  const content = paragraph.children.map(serializeInline).join('')
  return paragraph.align ? `@align(${paragraph.align}){${content}}` : content
}

function serializeBlock(block: CardMarkupBlockNode): string {
  if (block.type === 'paragraph') return serializeParagraph(block)
  const items = block.items.map((item) => `@item{${item.map(serializeParagraph).join('\n')}}`).join('')
  return `${block.ordered ? '@list(ordered)' : '@list'}{${items}}`
}

/** 序列化是解析的逆运算：`parse(serialize(parse(s)))` 与 `parse(s)` 结构相同。 */
export function serializeCardMarkup(document: CardMarkupDocument): string {
  return document.blocks.map(serializeBlock).join('\n')
}
