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
export function quoteMarkupArg(value: string): string {
  if (value !== '' && !/[,"'()\\]|^\s|\s$/.test(value)) return value
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

const FLAG_TAGS: readonly (readonly [keyof InlineStyleSpec, string])[] = [
  ['bold', 'b'],
  ['italic', 'i'],
  ['underline', 'u'],
  ['strikethrough', 's'],
]

function styleArgs(style: InlineStyleSpec): string[] {
  const args: string[] = []
  for (const [field, key] of FLAG_TAGS) if (style[field] !== undefined) args.push(`${key}=${style[field]}`)
  const text = (key: string, value: string | undefined) => {
    if (value !== undefined) args.push(`${key}=${quoteMarkupArg(value)}`)
  }
  text('mark', style.markColor)
  text('color', style.color)
  text('bg', style.backgroundColor)
  text('size', style.fontSize)
  text('font', style.fontFamily)
  if (style.strokeColor !== undefined || style.strokeWidth !== undefined) {
    text('stroke', `${style.strokeColor ?? 'currentColor'} ${style.strokeWidth ?? 1}`)
  }
  if (
    style.shadowColor !== undefined || style.shadowOffsetX !== undefined ||
    style.shadowOffsetY !== undefined || style.shadowBlur !== undefined
  ) {
    text('shadow', `${style.shadowColor ?? 'currentColor'} ${style.shadowOffsetX ?? 0} ${style.shadowOffsetY ?? 0} ${style.shadowBlur ?? 0}`)
  }
  if (style.fillType !== undefined || style.fillSource !== undefined) {
    const source = style.fillSource ?? ''
    text('fill', style.fillType === 'image' ? `image:${source}` : source)
  }
  return args
}

/** 只有单个属性时用简写（`@b`、`@color(red)` …），否则落到 `@style(...)`。 */
function openSpan(style: InlineStyleSpec): string {
  const defined = (Object.keys(style) as (keyof InlineStyleSpec)[]).filter((key) => style[key] !== undefined)
  if (defined.length === 1) {
    const [only] = defined
    const flag = FLAG_TAGS.find(([field]) => field === only)
    if (flag && style[only!] === true) return `@${flag[1]}{`
    if (only === 'markColor') return `@mark(color=${quoteMarkupArg(style.markColor!)}){`
    if (only === 'color') return `@color(${quoteMarkupArg(style.color!)}){`
    if (only === 'fontSize') return `@size(${quoteMarkupArg(style.fontSize!)}){`
    if (only === 'fontFamily') return `@font(${quoteMarkupArg(style.fontFamily!)}){`
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
  const items = block.items.map((item) => `@li{${item.map(serializeParagraph).join('\n')}}`).join('')
  return `${block.ordered ? '@ol' : '@ul'}{${items}}`
}

/** 序列化是解析的逆运算：`parse(serialize(parse(s)))` 与 `parse(s)` 结构相同。 */
export function serializeCardMarkup(document: CardMarkupDocument): string {
  return document.blocks.map(serializeBlock).join('\n')
}
