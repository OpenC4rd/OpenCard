import type { CardMarkupDiagnostic } from './cardMarkup.types'

/**
 * 词法单元。LL(2)：`TAG` 之后只需再看一个字符就能决定是否紧跟 `OPEN`。
 * - `{{expr}}` 拥有最高优先级，永远整体成为 `BINDING`；
 * - `{` 只有紧跟在带正文的 `@tag` / `@tag(args)` 之后才是 `OPEN`，其余情形是普通文本；
 * - `}` 总是 `CLOSE`，由语法分析器决定它是结束正文还是字面量。
 */
export type CardMarkupToken =
  | { kind: 'text'; value: string; offset: number }
  | { kind: 'binding'; expression: string; offset: number }
  | { kind: 'tag'; name: string; args: string | null; offset: number }
  | { kind: 'open'; offset: number }
  | { kind: 'close'; offset: number }
  | { kind: 'newline'; offset: number }
  | { kind: 'eof'; offset: number }

/** 没有正文的标签：其后的 `{` 不是正文起点。 */
const BODYLESS_TAGS = new Set(['br', 'icon', 'img'])
const ESCAPABLE = new Set(['@', '{', '}', '\\'])
const TAG_NAME = /[A-Za-z][A-Za-z0-9]*/y

export function lexCardMarkup(source: string): { tokens: CardMarkupToken[]; diagnostics: CardMarkupDiagnostic[] } {
  const tokens: CardMarkupToken[] = []
  const diagnostics: CardMarkupDiagnostic[] = []
  let text = ''
  let textOffset = 0
  let i = 0

  const pushText = (value: string, at: number) => {
    if (!text) textOffset = at
    text += value
  }
  const flush = () => {
    if (text) tokens.push({ kind: 'text', value: text, offset: textOffset })
    text = ''
  }
  const emit = (token: CardMarkupToken) => {
    flush()
    tokens.push(token)
  }

  while (i < source.length) {
    const ch = source[i]!
    if (ch === '\\' && ESCAPABLE.has(source[i + 1] ?? '')) {
      pushText(source[i + 1]!, i)
      i += 2
    } else if (ch === '\n') {
      emit({ kind: 'newline', offset: i })
      i += 1
    } else if (ch === '\r') {
      i += 1
    } else if (ch === '}') {
      emit({ kind: 'close', offset: i })
      i += 1
    } else if (ch === '{' && source[i + 1] === '{') {
      const end = source.indexOf('}}', i + 2)
      if (end < 0) {
        diagnostics.push({ code: 'unclosed-tag', offset: i, message: '绑定表达式缺少结尾的 }}' })
        pushText('{', i)
        i += 1
      } else {
        emit({ kind: 'binding', expression: source.slice(i + 2, end).trim(), offset: i })
        i = end + 2
      }
    } else if (ch === '@') {
      TAG_NAME.lastIndex = i + 1
      const match = TAG_NAME.exec(source)
      if (!match) {
        pushText('@', i)
        i += 1
        continue
      }
      const name = match[0]
      const start = i
      const nextChar = source[TAG_NAME.lastIndex]
      const isBrTag = name.toLowerCase() === 'br' && (nextChar === '(' || !nextChar || /\s/.test(nextChar))
      if (!isBrTag && nextChar !== '(' && nextChar !== '{') {
        pushText(source.slice(start, TAG_NAME.lastIndex), start)
        i = TAG_NAME.lastIndex
        continue
      }
      i = TAG_NAME.lastIndex
      let args: string | null = null
      if (source[i] === '(') {
        const close = findArgsEnd(source, i)
        if (close < 0) {
          diagnostics.push({ code: 'unclosed-tag', offset: start, message: `@${name} 的参数缺少 )` })
          pushText(source.slice(start, i + 1), start)
          i += 1
          continue
        }
        args = source.slice(i + 1, close)
        i = close + 1
      }
      emit({ kind: 'tag', name, args, offset: start })
      if (!BODYLESS_TAGS.has(name.toLowerCase()) && source[i] === '{') {
        tokens.push({ kind: 'open', offset: i })
        i += 1
      }
    } else {
      pushText(ch, i)
      i += 1
    }
  }
  emit({ kind: 'eof', offset: source.length })
  return { tokens, diagnostics }
}

/** 找到与 `source[open]` 的 `(` 配对的 `)`，括号嵌套与引号内的括号不计。 */
function findArgsEnd(source: string, open: number): number {
  let depth = 0
  let quote = ''
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]!
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth += 1
    else if (ch === ')' && --depth === 0) return i
  }
  return -1
}
