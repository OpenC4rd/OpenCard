import type { AlignmentPosition } from '../../../entities/card/model'
import type {
  CardMarkupBlockNode,
  CardMarkupDiagnostic,
  CardMarkupIconNode,
  CardMarkupImageNode,
  CardMarkupInlineNode,
  CardMarkupParagraphNode,
  CardMarkupParseResult,
  InlineStyleSpec,
} from './cardMarkup.types'
import { lexCardMarkup, type CardMarkupToken } from './cardMarkupLexer'

type Arg = { key: string; value: string }
type TagToken = Extract<CardMarkupToken, { kind: 'tag' }>

const BLOCK_TAGS = new Set(['align', 'list'])
const BARE_FLAGS = new Set(['b', 'i', 'u', 's'])
type FlagField = 'bold' | 'italic' | 'underline' | 'strikethrough'
const FLAG_SPANS: Record<string, FlagField> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
  s: 'strikethrough',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strikethrough',
}
const STYLE_KEYS = new Set(['color', 'bg', 'size', 'font', 'fill', 'stroke', 'shadow'])
const ICON_SCOPES = new Set(['current', 'host', 'package'])
const IMAGE_FITS = new Set(['contain', 'cover', 'fill'])
const IMAGE_ALIGNS = new Set(['start', 'center', 'end'])
const ALIGNMENTS: Record<string, AlignmentPosition> = {
  start: 'start', center: 'center', end: 'end', justify: 'justify',
}
const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:mm|cm|in|pt|em|rem|%)$/i
const ABSOLUTE_LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:mm|cm|in|pt)$/i

export function isLength(value: string): boolean {
  return LENGTH.test(value.trim())
}

export function isAbsoluteLength(value: string): boolean {
  return ABSOLUTE_LENGTH.test(value.trim())
}

/**
 * 解析是纯函数，而同一段标记会被诊断、素材预加载和每一帧绘制各问一遍，所以按源文本记住结果。
 * 结果是共享的，只读不改。
 */
const parsedMarkup = new Map<string, CardMarkupParseResult>()
const MAX_PARSED_MARKUP = 1024

export function parseCardMarkup(source: string): CardMarkupParseResult {
  const known = parsedMarkup.get(source)
  if (known) return known
  const { tokens, diagnostics } = lexCardMarkup(source)
  const parser = new MarkupParser(tokens, diagnostics)
  const blocks = parser.parseBlocks(0)
  const result = { document: { source, blocks }, diagnostics, valid: diagnostics.length === 0 }
  if (parsedMarkup.size >= MAX_PARSED_MARKUP) parsedMarkup.clear()
  parsedMarkup.set(source, result)
  return result
}

class MarkupParser {
  private pos = 0

  constructor(
    private readonly tokens: CardMarkupToken[],
    private readonly diagnostics: CardMarkupDiagnostic[],
  ) {}

  private peek(): CardMarkupToken {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!
  }

  private next(): CardMarkupToken {
    const token = this.peek()
    if (token.kind !== 'eof') this.pos += 1
    return token
  }

  private report(code: CardMarkupDiagnostic['code'], offset: number, message: string) {
    this.diagnostics.push({ code, offset, message })
  }

  /** 有正文的标签：吃掉 `{`，由 `parseContent` 解析到配对的 `}`。 */
  private body<T>(tag: TagToken, parseContent: () => T): T | null {
    if (this.peek().kind !== 'open') return null
    this.next()
    const content = parseContent()
    if (this.peek().kind !== 'close') {
      this.report('unclosed-tag', tag.offset, `@${tag.name} 缺少结尾的 }`)
    } else {
      this.next()
    }
    return content
  }

  /**
   * 块级内容：换行分段；`@align` / `@list` 自成一块。
   * 紧跟块级标签后的换行只是分隔符，不产生空段落。
   */
  parseBlocks(depth: number): CardMarkupBlockNode[] {
    const blocks: CardMarkupBlockNode[] = []
    let current: CardMarkupInlineNode[] = []
    let inParagraph = true
    let emptyTailAllowed = false

    for (;;) {
      const token = this.peek()
      if (token.kind === 'eof' || (token.kind === 'close' && depth > 0)) break
      if (token.kind === 'newline') {
        this.next()
        if (inParagraph) {
          blocks.push({ type: 'paragraph', children: current })
          current = []
          emptyTailAllowed = true
        } else {
          inParagraph = true
          emptyTailAllowed = false
        }
        continue
      }
      if (token.kind === 'tag' && BLOCK_TAGS.has(token.name.toLowerCase())) {
        this.next()
        if (current.length > 0) blocks.push({ type: 'paragraph', children: current })
        current = []
        blocks.push(...this.parseBlockTag(token, depth))
        inParagraph = false
        continue
      }
      if (!inParagraph) {
        inParagraph = true
        emptyTailAllowed = false
      }
      current.push(...this.parseInlineItem())
    }
    if (inParagraph && (current.length > 0 || emptyTailAllowed)) blocks.push({ type: 'paragraph', children: current })
    return blocks
  }

  private parseBlockTag(tag: TagToken, depth: number): CardMarkupBlockNode[] {
    const name = tag.name.toLowerCase()
    const args = parseArgs(tag.args)
    if (name === 'list') {
      let ordered = false
      if (args.length > 0) {
        if (args.length === 1 && args[0]!.key === '' && args[0]!.value.toLowerCase() === 'ordered') ordered = true
        else this.report('invalid-argument', tag.offset, '@list 只接受一个 ordered 标记')
      }
      const items = this.body(tag, () => this.parseListItems())
      if (!items) {
        this.report('invalid-structure', tag.offset, '@list 缺少正文')
        return []
      }
      return [{ type: 'list', ordered, items }]
    }
    let align: AlignmentPosition | undefined
    if (args.length !== 1 || args[0]!.key !== '') {
      this.report('invalid-argument', tag.offset, '@align 需要且只需要一个方向参数')
    } else {
      align = ALIGNMENTS[args[0]!.value.toLowerCase()]
      if (!align) this.report('invalid-argument', tag.offset, `@align 不支持的方向：${args[0]!.value || '(空)'}`)
    }
    const blocks = this.body(tag, () => this.parseBlocks(depth + 1))
    if (blocks === null) {
      this.report('invalid-structure', tag.offset, '@align 缺少正文')
      return []
    }
    if (blocks.length === 0) return [{ type: 'paragraph', ...(align ? { align } : {}), children: [] }]
    return align ? blocks.map((block) => (block.type === 'paragraph' && !block.align ? { ...block, align } : block)) : blocks
  }

  private parseListItems(): CardMarkupParagraphNode[][] {
    const items: CardMarkupParagraphNode[][] = []
    for (;;) {
      const token = this.peek()
      if (token.kind === 'eof' || token.kind === 'close') break
      this.next()
      if (token.kind === 'newline' || (token.kind === 'text' && !token.value.trim())) continue
      if (token.kind === 'tag' && token.name.toLowerCase() === 'item') {
        const blocks = this.body(token, () => this.parseBlocks(1))
        if (blocks === null) {
          this.report('invalid-structure', token.offset, '@item 缺少正文')
          continue
        }
        items.push(this.paragraphsOf(blocks, token.offset))
        continue
      }
      this.report('invalid-structure', token.offset, '@list 内只能包含 @item')
      if (token.kind === 'tag') this.body(token, () => this.parseBlocks(1))
    }
    return items
  }

  private paragraphsOf(blocks: CardMarkupBlockNode[], offset: number): CardMarkupParagraphNode[] {
    const paragraphs: CardMarkupParagraphNode[] = []
    for (const block of blocks) {
      if (block.type === 'paragraph') paragraphs.push(block)
      else {
        this.report('invalid-structure', offset, '列表项内不支持嵌套列表，已展平为段落')
        for (const item of block.items) paragraphs.push(...item)
      }
    }
    return paragraphs
  }

  private parseInlineNodes(): CardMarkupInlineNode[] {
    const nodes: CardMarkupInlineNode[] = []
    for (;;) {
      const token = this.peek()
      if (token.kind === 'eof' || token.kind === 'close') break
      if (token.kind === 'newline') {
        this.next()
        nodes.push({ type: 'br' })
        continue
      }
      nodes.push(...this.parseInlineItem())
    }
    return nodes
  }

  /** 解析一个行内单元（文本 / 绑定 / 行内标签）；调用方保证当前不是 eof / 换行 / 块级标签。 */
  private parseInlineItem(): CardMarkupInlineNode[] {
    const token = this.next()
    if (token.kind === 'text') return [{ type: 'text', value: token.value }]
    if (token.kind === 'binding') return [{ type: 'binding', expression: token.expression }]
    if (token.kind === 'close') return [{ type: 'text', value: '}' }]
    if (token.kind === 'open') return [{ type: 'text', value: '{' }]
    if (token.kind !== 'tag') return []

    const name = token.name.toLowerCase()
    const args = parseArgs(token.args)
    if (name === 'br') {
      if (args.length > 0) this.report('invalid-argument', token.offset, '@br 不接受参数')
      return [{ type: 'br' }]
    }
    if (name === 'icon') return [this.buildIcon(token, args)]
    if (name === 'img') return [this.buildImage(token, args)]

    const content = this.body(token, () => this.parseInlineNodes())
    if (BLOCK_TAGS.has(name)) {
      this.report('invalid-structure', token.offset, `@${name} 是块级标签，不能嵌在行内标签里`)
      return content ?? []
    }
    if (name === 'item') {
      this.report('invalid-structure', token.offset, '@item 只能出现在 @list 内')
      return content ?? []
    }
    if (!(name in FLAG_SPANS) && name !== 'style') {
      this.report('invalid-structure', token.offset, `未知标签 @${token.name}`)
      const literal: CardMarkupInlineNode = {
        type: 'text',
        value: `@${token.name}${token.args === null ? '' : `(${token.args})`}`,
      }
      return content ? [literal, ...content] : [literal]
    }
    if (content === null) {
      this.report('invalid-structure', token.offset, `@${name} 缺少正文`)
      return [{ type: 'text', value: `@${token.name}` }]
    }
    return [{ type: 'span', style: this.buildStyle(token, name, args), children: content }]
  }

  private buildStyle(tag: TagToken, name: string, args: Arg[]): InlineStyleSpec {
    const style: InlineStyleSpec = {}
    if (name in FLAG_SPANS) {
      if (args.length > 0) this.report('invalid-argument', tag.offset, `@${name} 不接受参数`)
      style[FLAG_SPANS[name]!] = true
      return style
    }
    if (args.length === 0) this.report('invalid-argument', tag.offset, '@style 缺少参数')
    for (const arg of args) this.applyStyleArg(tag, style, arg)
    return style
  }

  private applyStyleArg(tag: TagToken, style: InlineStyleSpec, { key, value }: Arg) {
    if (key === '') {
      const flag = value.toLowerCase()
      if (!BARE_FLAGS.has(flag)) {
        this.report('invalid-argument', tag.offset, `未知样式标记：${value || '(空)'}`)
        return
      }
      style[FLAG_SPANS[flag]!] = true
      return
    }
    if (BARE_FLAGS.has(key)) {
      this.report('invalid-argument', tag.offset, `标记 ${key} 不带值`)
      return
    }
    switch (key) {
      case 'color':
        if (!value) this.report('invalid-argument', tag.offset, 'color 为空')
        else style.color = value
        return
      case 'bg':
        if (!value) this.report('invalid-argument', tag.offset, 'bg 为空')
        else style.backgroundColor = value
        return
      case 'size':
        if (!isLength(value)) this.report('invalid-argument', tag.offset, `size 需要带单位的长度：${value || '(空)'}`)
        else style.fontSize = value
        return
      case 'font':
        if (!value) this.report('invalid-argument', tag.offset, 'font 为空')
        else style.fontFamily = value
        return
      case 'fill':
        if (!value) this.report('invalid-argument', tag.offset, 'fill 为空')
        else style.fillSource = value
        return
      case 'stroke': {
        const [color, width] = splitTopLevel(value, /\s/)
        if (color === undefined || width === undefined) {
          this.report('invalid-argument', tag.offset, 'stroke 需要 颜色 + 长度')
          return
        }
        if (!isAbsoluteLength(width)) {
          this.report('invalid-argument', tag.offset, `stroke 长度需要绝对单位（mm/cm/in/pt）：${width}`)
          return
        }
        style.stroke = { color, width }
        return
      }
      case 'shadow': {
        const [color, x, y, blur] = splitTopLevel(value, /\s/)
        if (color === undefined || x === undefined || y === undefined || blur === undefined) {
          this.report('invalid-argument', tag.offset, 'shadow 需要 颜色 + x + y + 模糊')
          return
        }
        if (![x, y, blur].every(isAbsoluteLength)) {
          this.report('invalid-argument', tag.offset, 'shadow 偏移与模糊需要绝对单位（mm/cm/in/pt）')
          return
        }
        style.shadow = { color, offsetX: x, offsetY: y, blur }
        return
      }
      default:
        this.report('invalid-argument', tag.offset, STYLE_KEYS.has(key) ? `@style 参数无效：${key}` : `未知样式键：${key}`)
    }
  }

  private buildIcon(tag: TagToken, args: Arg[]): CardMarkupIconNode {
    const icon: CardMarkupIconNode = { type: 'icon', key: '' }
    for (const arg of args) {
      if (arg.key === '') {
        this.report('invalid-argument', tag.offset, `@icon 参数必须具名：${arg.value}`)
        continue
      }
      switch (arg.key) {
        case 'key': icon.key = arg.value; break
        case 'pkg': icon.pkg = arg.value; break
        case 'version': icon.version = arg.value; break
        case 'scope':
          if (ICON_SCOPES.has(arg.value)) icon.scope = arg.value as CardMarkupIconNode['scope']
          else this.report('invalid-argument', tag.offset, `@icon 不支持的 scope：${arg.value}`)
          break
        case 'size':
          if (!isLength(arg.value)) this.report('invalid-argument', tag.offset, `@icon size 需要带单位的长度：${arg.value}`)
          else icon.size = arg.value
          break
        default:
          this.report('invalid-argument', tag.offset, `@icon 未知参数：${arg.key}`)
      }
    }
    if (!icon.key) this.report('invalid-argument', tag.offset, '@icon 缺少 key')
    return icon
  }

  private buildImage(tag: TagToken, args: Arg[]): CardMarkupImageNode {
    const image: CardMarkupImageNode = { type: 'img', src: '' }
    for (const arg of args) {
      if (arg.key === '') {
        this.report('invalid-argument', tag.offset, `@img 参数必须具名：${arg.value}`)
        continue
      }
      switch (arg.key) {
        case 'src': image.src = arg.value; break
        case 'w':
        case 'h':
          if (!isLength(arg.value)) this.report('invalid-argument', tag.offset, `@img ${arg.key} 需要带单位的长度：${arg.value}`)
          else if (arg.key === 'w') image.width = arg.value
          else image.height = arg.value
          break
        case 'fit':
          if (IMAGE_FITS.has(arg.value)) image.fit = arg.value as CardMarkupImageNode['fit']
          else this.report('invalid-argument', tag.offset, `@img 不支持的 fit：${arg.value}`)
          break
        case 'align':
          if (IMAGE_ALIGNS.has(arg.value)) image.align = arg.value as CardMarkupImageNode['align']
          else this.report('invalid-argument', tag.offset, `@img 不支持的 align：${arg.value}`)
          break
        default:
          this.report('invalid-argument', tag.offset, `@img 未知参数：${arg.key}`)
      }
    }
    if (!image.src) this.report('invalid-argument', tag.offset, '@img 缺少 src')
    return image
  }
}

/** 按顶层分隔符切分：括号嵌套与引号内的分隔符不算。 */
function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  const push = (end: number) => {
    const part = text.slice(start, end).trim()
    if (part || separator.source !== String.raw`\s`) parts.push(part)
  }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (depth === 0 && separator.test(ch)) {
      push(i)
      start = i + 1
    }
  }
  push(text.length)
  return parts
}

function unquote(raw: string): string {
  const value = raw.trim()
  const quote = value[0]
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).replace(/\\(["'\\])/g, '$1')
  }
  return value
}

function parseArgs(raw: string | null): Arg[] {
  if (raw === null || !raw.trim()) return []
  return splitTopLevel(raw, /,/).map((part) => {
    const eq = part.indexOf('=')
    const key = eq > 0 ? part.slice(0, eq).trim().toLowerCase() : ''
    if (eq > 0 && /^[a-z][\w-]*$/i.test(key)) return { key, value: unquote(part.slice(eq + 1)) }
    return { key: '', value: unquote(part) }
  })
}
