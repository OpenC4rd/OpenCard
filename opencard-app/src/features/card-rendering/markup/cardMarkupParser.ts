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
import { escapeMarkupText, quoteMarkupArg } from './cardMarkupSerializer'

type Arg = { key: string; value: string }
type TagToken = Extract<CardMarkupToken, { kind: 'tag' }>

const BLOCK_TAGS = new Set(['p', 'paragraph', 'align', 'ul', 'ol', 'li'])
const FLAG_SPANS: Record<string, keyof InlineStyleSpec> = {
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underline',
  s: 'strikethrough',
  strike: 'strikethrough',
  del: 'strikethrough',
}
const ALIGNMENTS: Record<string, AlignmentPosition> = {
  start: 'start', left: 'start', center: 'center', end: 'end', right: 'end', justify: 'justify',
}

export function parseCardMarkup(source: string): CardMarkupParseResult {
  const markup = isLegacyHtml(source) ? htmlToMarkup(source) : source
  const { tokens, diagnostics } = lexCardMarkup(markup)
  const parser = new MarkupParser(tokens, diagnostics)
  const blocks = parser.parseBlocks(0)
  return { document: { source: markup, blocks }, diagnostics, valid: diagnostics.length === 0 }
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

  private expectClose(tag: TagToken) {
    if (this.peek().kind === 'close') this.next()
    else this.report('unclosed-tag', tag.offset, `@${tag.name} 缺少结尾的 }`)
  }

  /** 有正文的标签：吃掉 `{`，由 `parseContent` 解析到配对的 `}`。 */
  private body<T>(tag: TagToken, parseContent: () => T): T | null {
    if (this.peek().kind !== 'open') return null
    this.next()
    const content = parseContent()
    this.expectClose(tag)
    return content
  }

  /**
   * 块级内容：换行分段；`@align`/`@ul`/`@ol` 自成一块。
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
    if (name === 'ul' || name === 'ol') {
      const items = this.body(tag, () => this.parseListItems())
      if (!items) {
        this.report('invalid-structure', tag.offset, `@${name} 缺少正文`)
        return []
      }
      return [{ type: 'list', ordered: name === 'ol', items }]
    }
    if (name === 'p' || name === 'paragraph') {
      const blocks = this.body(tag, () => this.parseBlocks(depth + 1))
      if (blocks === null) {
        this.report('invalid-structure', tag.offset, `@${name} 缺少正文`)
        return []
      }
      const raw = args.find((a) => a.key === 'align')?.value ?? args[0]?.value ?? ''
      const align = raw ? ALIGNMENTS[raw.toLowerCase()] : undefined
      if (raw && !align) this.report('invalid-argument', tag.offset, `@${name} 不支持的对齐方式：${raw}`)
      if (blocks.length === 0) return [{ type: 'paragraph', ...(align ? { align } : {}), children: [] }]
      return align ? blocks.map((block) => (block.type === 'paragraph' && !block.align ? { ...block, align } : block)) : blocks
    }
    const blocks = this.body(tag, () => this.parseBlocks(depth + 1))
    if (blocks === null) {
      this.report('invalid-structure', tag.offset, `@${name} 缺少正文`)
      return []
    }
    if (name === 'li') {
      this.report('invalid-structure', tag.offset, '@li 只能出现在 @ul / @ol 内')
      return blocks
    }
    const raw = args.find((a) => a.key === 'align')?.value ?? args[0]?.value ?? ''
    const align = ALIGNMENTS[raw.toLowerCase()]
    if (!align) this.report('invalid-argument', tag.offset, `@align 不支持的对齐方式：${raw || '(空)'}`)
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
      if (token.kind === 'tag' && token.name.toLowerCase() === 'li') {
        const blocks = this.body(token, () => this.parseBlocks(1))
        if (blocks === null) {
          this.report('invalid-structure', token.offset, '@li 缺少正文')
          continue
        }
        items.push(this.paragraphsOf(blocks, token.offset))
        continue
      }
      this.report('invalid-structure', token.offset, '@ul / @ol 内只能包含 @li')
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
    if (name === 'br') return [{ type: 'br' }]
    if (name === 'icon') return [this.buildIcon(token, args)]
    if (name === 'img') return [this.buildImage(token, args)]

    const isSpanTag = name in FLAG_SPANS || ['mark', 'color', 'size', 'font', 'style'].includes(name)
    const content = this.body(token, () => this.parseInlineNodes())
    if (BLOCK_TAGS.has(name)) {
      this.report('invalid-structure', token.offset, `@${name} 是块级标签，不能嵌在行内标签里`)
      return content ?? []
    }
    if (!isSpanTag) {
      this.report('invalid-structure', token.offset, `未知标签 @${token.name}`)
      const literal: CardMarkupInlineNode = { type: 'text', value: `@${token.name}${token.args === null ? '' : `(${token.args})`}` }
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
    const first = args[0]?.value
    if (name in FLAG_SPANS) style[FLAG_SPANS[name]! as 'bold'] = true
    else if (name === 'mark') style.markColor = this.required(tag, args, 'color', first)
    else if (name === 'color') style.color = this.required(tag, args, 'color', first)
    else if (name === 'size') style.fontSize = this.required(tag, args, 'size', first)
    else if (name === 'font') style.fontFamily = this.required(tag, args, 'family', first)
    else if (name === 'style') for (const arg of args) this.applyStyleArg(tag, style, arg)
    return style
  }

  private required(tag: TagToken, args: Arg[], label: string, positional: string | undefined): string {
    const named = args.find((arg) => {
      if (arg.key === label) return true
      if (label === 'color' && (arg.key === 'color' || arg.key === 'c' || arg.key === 'bg' || arg.key === 'mark')) return true
      if (label === 'family' && (arg.key === 'family' || arg.key === 'name' || arg.key === 'font')) return true
      if (label === 'size' && (arg.key === 'size' || arg.key === 's')) return true
      return false
    })
    const value = named?.value ?? positional
    if (value) return value
    this.report('invalid-argument', tag.offset, `@${tag.name} 缺少 ${label} 参数`)
    return ''
  }

  private applyStyleArg(tag: TagToken, style: InlineStyleSpec, { key, value }: Arg) {
    const number = (text: string | undefined, fallback = 0) => {
      if (text === undefined) return fallback
      const parsed = Number(text)
      if (Number.isFinite(parsed)) return parsed
      this.report('invalid-argument', tag.offset, `@style 的 ${key} 含有无效数字：${text}`)
      return fallback
    }
    switch (key) {
      case 'b': case 'i': case 'u': case 's': {
        const flag = /^(true|1|yes)$/i.test(value) ? true : /^(false|0|no)$/i.test(value) ? false : null
        if (flag === null) this.report('invalid-argument', tag.offset, `@style 的 ${key} 只接受 true / false`)
        else style[FLAG_SPANS[key]! as 'bold'] = flag
        return
      }
      case 'mark': style.markColor = value; return
      case 'color': style.color = value; return
      case 'bg': case 'background': style.backgroundColor = value; return
      case 'size': style.fontSize = value; return
      case 'font': style.fontFamily = value; return
      case 'stroke': {
        const [color, width] = splitTopLevel(value, /\s/)
        style.strokeColor = color
        style.strokeWidth = number(width, 1)
        return
      }
      case 'shadow': {
        const [color, x, y, blur] = splitTopLevel(value, /\s/)
        style.shadowColor = color
        style.shadowOffsetX = number(x)
        style.shadowOffsetY = number(y)
        style.shadowBlur = number(blur)
        return
      }
      case 'fill':
        if (value.startsWith('image:')) {
          style.fillType = 'image'
          style.fillSource = value.slice('image:'.length)
        } else {
          style.fillType = 'color'
          style.fillSource = value
        }
        return
      default:
        this.report('invalid-argument', tag.offset, `@style 不支持的参数：${key || value}`)
    }
  }

  private buildIcon(tag: TagToken, args: Arg[]): CardMarkupIconNode {
    const get = (key: string) => args.find((arg) => arg.key === key)?.value
    const key = get('key') ?? args.find((arg) => arg.key === '')?.value ?? ''
    if (!key) this.report('invalid-argument', tag.offset, '@icon 缺少图标 key')
    const icon: CardMarkupIconNode = { type: 'icon', key }
    const pkg = get('pkg')
    const version = get('version')
    const scope = get('scope')
    const size = get('size')
    if (pkg !== undefined) icon.pkg = pkg
    if (version !== undefined) icon.version = version
    if (scope === 'current' || scope === 'host' || scope === 'package') icon.scope = scope
    else if (scope !== undefined) this.report('invalid-argument', tag.offset, `@icon 不支持的 scope：${scope}`)
    if (size !== undefined) icon.size = size
    return icon
  }

  private buildImage(tag: TagToken, args: Arg[]): CardMarkupImageNode {
    const get = (...keys: string[]) => args.find((arg) => keys.includes(arg.key))?.value
    const src = get('src') ?? args.find((arg) => arg.key === '')?.value ?? ''
    if (!src) this.report('invalid-argument', tag.offset, '@img 缺少 src')
    const image: CardMarkupImageNode = { type: 'img', src }
    const width = get('w', 'width')
    const height = get('h', 'height')
    const fit = get('fit')
    const align = get('align')
    if (width !== undefined) image.width = width
    if (height !== undefined) image.height = height
    if (fit === 'contain' || fit === 'cover' || fit === 'fill') image.fit = fit
    else if (fit !== undefined) this.report('invalid-argument', tag.offset, `@img 不支持的 fit：${fit}`)
    if (align === 'start' || align === 'center' || align === 'end') image.align = align
    else if (align !== undefined) this.report('invalid-argument', tag.offset, `@img 不支持的 align：${align}`)
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
    const key = eq > 0 ? part.slice(0, eq).trim() : ''
    if (eq > 0 && /^[A-Za-z][\w-]*$/.test(key)) return { key, value: unquote(part.slice(eq + 1)) }
    return { key: '', value: unquote(part) }
  })
}

/* ───────────── 旧 HTML 容错：转成 @tag 源码后复用同一条解析路径 ───────────── */

const LEGACY_HTML_START = /^\s*<(?:\!|p|div|span|strong|b|i|em|u|s|del|strike|mark|ul|ol|li|br|h[1-6]|table|tbody|thead|tr|td|th|img)\b/i
const LEGACY_HTML_CLOSE = /<\/(?:p|div|span|strong|b|i|em|u|s|del|strike|mark|ul|ol|li|h[1-6]|table|tbody|thead|tr|td|th)>/i
const LEGACY_HTML_ATTR = /<(?:p|div|span|strong|b|i|em|u|s|del|strike|mark|ul|ol|li|h[1-6]|table|tbody|thead|tr|td|th|img)\s+[^>]+>/i
const LEGACY_HTML_VOID = /<br\s*\/?>/i

export function isLegacyHtml(source: string): boolean {
  return LEGACY_HTML_START.test(source)
    || LEGACY_HTML_CLOSE.test(source)
    || LEGACY_HTML_ATTR.test(source)
    || LEGACY_HTML_VOID.test(source)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec))
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return ENTITIES[String(named).toLowerCase()] ?? whole
  })
}

function parseIconPathToNode(iconPath: string): CardMarkupIconNode {
  const hashIdx = iconPath.indexOf('#')
  if (hashIdx >= 0) {
    const qualifier = iconPath.slice(0, hashIdx).trim()
    const rawKey = iconPath.slice(hashIdx + 1).trim()
    const key = rawKey.startsWith('icon:') ? rawKey.slice('icon:'.length) : rawKey
    if (!qualifier) {
      return { type: 'icon', key, scope: 'host' }
    }
    const atIdx = qualifier.lastIndexOf('@')
    if (atIdx > 0) {
      return {
        type: 'icon',
        key,
        pkg: qualifier.slice(0, atIdx),
        version: qualifier.slice(atIdx + 1),
      }
    }
    return { type: 'icon', key, pkg: qualifier }
  }
  const key = iconPath.startsWith('icon:') ? iconPath.slice('icon:'.length) : iconPath
  return { type: 'icon', key }
}

function serializeIconTag(node: CardMarkupIconNode): string {
  const args: string[] = []
  if (node.key) args.push(`key=${quoteMarkupArg(node.key)}`)
  if (node.pkg) args.push(`pkg=${quoteMarkupArg(node.pkg)}`)
  if (node.version) args.push(`version=${quoteMarkupArg(node.version)}`)
  if (node.scope) args.push(`scope=${quoteMarkupArg(node.scope)}`)
  if (node.size) args.push(`size=${quoteMarkupArg(node.size)}`)
  return `@icon(${args.join(',')})`
}

function readCss(attrs: string): Record<string, string> {
  const style = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs)
  const css: Record<string, string> = {}
  const rawStyle = decodeEntities(style?.[1] ?? style?.[2] ?? '')
  for (const declaration of rawStyle.split(';')) {
    const colon = declaration.indexOf(':')
    if (colon > 0) {
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      const val = declaration.slice(colon + 1).trim().replace(/^["']|["']$/g, '').trim()
      css[prop] = val
    }
  }
  const align = /\salign\s*=\s*"([^"]*)"/i.exec(attrs)
  if (align && !css['text-align']) css['text-align'] = align[1]!

  const font = /data-oc-font="([^"]*)"/i.exec(attrs)?.[1]
  if (font && !css['font-family']) css['font-family'] = font

  const fillType = /data-oc-fill-type="([^"]*)"/i.exec(attrs)?.[1]
  const fillSource = /data-oc-fill-source="([^"]*)"/i.exec(attrs)?.[1]
  if (fillType === 'image' && fillSource) {
    css['fill'] = `image:${fillSource}`
  } else if (fillType && fillSource) {
    css['fill'] = fillSource
  }

  const strokeColor = css['-webkit-text-stroke-color'] ?? css['text-stroke-color']
  const strokeWidth = css['-webkit-text-stroke-width'] ?? css['text-stroke-width']
  if (strokeColor || strokeWidth) {
    const w = strokeWidth ? String(parseFloat(strokeWidth) || 1) : '1'
    css['stroke'] = `${strokeColor ?? 'currentColor'} ${w}`
  }

  const shadowColor = /data-oc-shadow-color="([^"]*)"/i.exec(attrs)?.[1]
  const shadowX = /data-oc-shadow-offset-x="([^"]*)"/i.exec(attrs)?.[1]
  const shadowY = /data-oc-shadow-offset-y="([^"]*)"/i.exec(attrs)?.[1]
  const shadowBlur = /data-oc-shadow-blur="([^"]*)"/i.exec(attrs)?.[1]
  if (shadowColor || shadowX || shadowY || shadowBlur) {
    const x = shadowX ? String(parseFloat(shadowX) || 0) : '0'
    const y = shadowY ? String(parseFloat(shadowY) || 0) : '0'
    const b = shadowBlur ? String(parseFloat(shadowBlur) || 0) : '0'
    css['shadow'] = `${shadowColor ?? 'currentColor'} ${x} ${y} ${b}`
  }

  return css
}

function styleArgs(css: Record<string, string>): string[] {
  const args: string[] = []
  const add = (key: string, value: string | undefined) => value && args.push(`${key}=${quoteMarkupArg(value)}`)
  if (/^(bold|[6-9]00)$/.test(css['font-weight'] ?? '')) args.push('b=true')
  if (css['font-style'] === 'italic') args.push('i=true')
  const decoration = css['text-decoration'] ?? css['text-decoration-line'] ?? ''
  if (decoration.includes('underline')) args.push('u=true')
  if (decoration.includes('line-through')) args.push('s=true')
  add('color', css['color'])
  add('bg', css['background-color'])
  add('size', css['font-size'])
  add('font', css['font-family'])
  if (css['stroke']) add('stroke', css['stroke'])
  if (css['shadow']) add('shadow', css['shadow'])
  if (css['fill']) add('fill', css['fill'])
  return args
}

function escapeMarkupTextPreservingBindings(text: string): string {
  const parts = text.split(/(\{\{[^}]+\}\})/g)
  return parts.map((part, index) => {
    if (index % 2 === 1) return part
    return escapeMarkupText(part)
  }).join('')
}

const HTML_TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)|</g

function htmlToMarkup(html: string): string {
  const out: string[] = []
  const stack: { name: string; close: string }[] = []
  const trimNewline = () => {
    const last = out[out.length - 1]
    if (last?.endsWith('\n')) out[out.length - 1] = last.slice(0, -1)
  }
  const popTo = (index: number) => {
    while (stack.length > index) {
      const { name, close } = stack.pop()!
      if (name === 'li') trimNewline()
      out.push(close)
    }
  }
  const atBoundary = () => out.length === 0 || out[out.length - 1]!.endsWith('\n')

  let skipDepth = 0

  for (const match of html.matchAll(HTML_TOKEN)) {
    const [, slash, rawName, attrs = '', , text] = match
    if (text !== undefined) {
      if (skipDepth > 0) continue
      const decoded = decodeEntities(text).replace(/\s+/g, ' ')
      const top = stack[stack.length - 1]?.name
      if (!decoded.trim() && (top === 'ul' || top === 'ol' || top === 'table' || top === 'tbody' || top === 'thead' || top === 'tr' || atBoundary())) continue
      out.push(escapeMarkupTextPreservingBindings(decoded))
      continue
    }
    if (!rawName) continue
    const name = rawName.toLowerCase()
    if (slash) {
      if (skipDepth > 0) {
        skipDepth -= 1
        continue
      }
      const index = stack.map((entry) => entry.name).lastIndexOf(name)
      if (index >= 0) popTo(index)
      continue
    }
    if (skipDepth > 0) {
      skipDepth += 1
      continue
    }
    if (name === 'script' || name === 'style') {
      skipDepth = 1
      continue
    }
    if (name === 'br') {
      out.push('@br()')
      continue
    }
    if (name === 'img') {
      const src = /src="([^"]*)"/i.exec(attrs)?.[1] ?? ''
      const w = /width="([^"]*)"/i.exec(attrs)?.[1]
      const h = /height="([^"]*)"/i.exec(attrs)?.[1]
      const imgArgs: string[] = [`src=${quoteMarkupArg(src)}`]
      if (w) imgArgs.push(`w=${quoteMarkupArg(w)}`)
      if (h) imgArgs.push(`h=${quoteMarkupArg(h)}`)
      out.push(`@img(${imgArgs.join(',')})`)
      continue
    }
    if (name === 'span') {
      const bindingMatch = /data-oc-binding="([^"]*)"|data-expression="([^"]*)"/i.exec(attrs)
      if (bindingMatch || /data-type="binding"/i.test(attrs)) {
        const expr = bindingMatch?.[1] ?? bindingMatch?.[2] ?? ''
        if (expr) {
          out.push(`{{${expr}}}`)
          skipDepth = 1
          continue
        }
      }
      const iconMatch = /data-oc-icon-path="([^"]*)"|data-icon-path="([^"]*)"/i.exec(attrs)
      if (iconMatch || /data-type="projectIcon"/i.test(attrs)) {
        const iconPath = iconMatch?.[1] ?? iconMatch?.[2] ?? ''
        const sizeMatch = /data-oc-size="([^"]*)"|data-size="([^"]*)"/i.exec(attrs)
        const size = sizeMatch?.[1] ?? sizeMatch?.[2]
        const keyMatch = /data-key="([^"]*)"/i.exec(attrs)?.[1]
        const pkgMatch = /data-pkg="([^"]*)"/i.exec(attrs)?.[1]
        const versionMatch = /data-version="([^"]*)"/i.exec(attrs)?.[1]
        const scopeMatch = /data-scope="([^"]*)"/i.exec(attrs)?.[1]
        const iconNode: CardMarkupIconNode = iconPath
          ? parseIconPathToNode(iconPath)
          : { type: 'icon', key: keyMatch ?? '' }
        if (keyMatch && !iconNode.key) iconNode.key = keyMatch
        if (pkgMatch && !iconNode.pkg) iconNode.pkg = pkgMatch
        if (versionMatch && !iconNode.version) iconNode.version = versionMatch
        if (scopeMatch === 'current' || scopeMatch === 'host' || scopeMatch === 'package') iconNode.scope = scopeMatch
        if (size) iconNode.size = size
        out.push(serializeIconTag(iconNode))
        skipDepth = 1
        continue
      }
    }
    const css = readCss(attrs)
    let open = ''
    let close = '}'
    if (name === 'p' || name === 'div' || /^h[1-6]$/.test(name)) {
      const align = css['text-align']
      open = align && ALIGNMENTS[align.toLowerCase()] ? `@align(${ALIGNMENTS[align.toLowerCase()]}){` : ''
      close = open ? '}\n' : '\n'
      if (name.startsWith('h')) {
        open += '@b{'
        close = `}${close}`
      }
      const sArgs = styleArgs(css)
      if (sArgs.length > 0) {
        open += `@style(${sArgs.join(',')}){`
        close = `}${close}`
      }
    } else if (name === 'strong' || name === 'b') open = '@b{'
    else if (name === 'em' || name === 'i') open = '@i{'
    else if (name === 'u') open = '@u{'
    else if (name === 's' || name === 'del' || name === 'strike') open = '@s{'
    else if (name === 'mark') open = `@mark(color=${quoteMarkupArg(css['background-color'] ?? '#FFFF00')}){`
    else if (name === 'ul' || name === 'ol' || name === 'li') open = `@${name}{`
    else if (name === 'table' || name === 'tbody' || name === 'thead') {
      open = ''
      close = ''
    } else if (name === 'tr') {
      open = ''
      close = '\n'
    } else if (name === 'td' || name === 'th') {
      open = ''
      close = ' '
    } else if (name === 'span') {
      const args = styleArgs(css)
      open = args.length ? `@style(${args.join(',')}){` : ''
      if (!open) close = ''
    } else continue
    out.push(open)
    stack.push({ name, close: open || close === '\n' || close === ' ' ? close : '' })
  }
  popTo(0)
  trimNewline()
  return out.join('')
}
