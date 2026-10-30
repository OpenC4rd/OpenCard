/**
 * 求值卡片长度表达式：纯数字（默认 mm）、`mm`、`cm`、`in`、`pt`、`%`（相对 parentSpan），
 * 以及由它们和 `+ - * / ( )` 组成的四则运算（可包在 `calc(...)` 内）。
 * 任何语法错误、未知单位或除零都返回 fallback。
 */
export function evaluateRenderLength(expr: string, parentSpan: number, fallback = 0): number {
  const parser = new LengthParser(String(expr ?? ''), parentSpan)
  const value = parser.parse()
  return value !== null && Number.isFinite(value) ? value : fallback
}

class LengthParser {
  private pos = 0
  private failed = false

  constructor(
    private readonly src: string,
    private readonly span: number,
  ) {}

  parse(): number | null {
    this.skipSpace()
    if (this.pos >= this.src.length) return null
    const value = this.expression()
    this.skipSpace()
    return this.failed || this.pos < this.src.length ? null : value
  }

  private skipSpace() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos += 1
  }

  private peek(): string {
    this.skipSpace()
    return this.src[this.pos] ?? ''
  }

  private expression(): number {
    let value = this.term()
    for (let op = this.peek(); op === '+' || op === '-'; op = this.peek()) {
      this.pos += 1
      const rhs = this.term()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  private term(): number {
    let value = this.unary()
    for (let op = this.peek(); op === '*' || op === '/'; op = this.peek()) {
      this.pos += 1
      const rhs = this.unary()
      if (op === '/' && rhs === 0) this.failed = true
      value = op === '*' ? value * rhs : value / rhs
    }
    return value
  }

  private unary(): number {
    const ch = this.peek()
    if (ch === '+' || ch === '-') {
      this.pos += 1
      const value = this.unary()
      return ch === '-' ? -value : value
    }
    return this.primary()
  }

  private primary(): number {
    const ch = this.peek()
    if (ch === '(') {
      this.pos += 1
      return this.group()
    }
    if (/^calc\s*\(/i.test(this.src.slice(this.pos))) {
      this.pos = this.src.indexOf('(', this.pos) + 1
      return this.group()
    }
    const match = /^(?:\d+\.?\d*|\.\d+)/.exec(this.src.slice(this.pos))
    if (!match) {
      this.failed = true
      return 0
    }
    this.pos += match[0].length
    const value = Number(match[0])
    const rest = this.src.slice(this.pos)
    if (rest.startsWith('%')) {
      this.pos += 1
      return (value * this.span) / 100
    }
    if (/^mm(?![a-z])/i.test(rest)) {
      this.pos += 2
      return value
    }
    if (/^cm(?![a-z])/i.test(rest)) {
      this.pos += 2
      return value * 10
    }
    if (/^in(?![a-z])/i.test(rest)) {
      this.pos += 2
      return value * 25.4
    }
    if (/^pt(?![a-z])/i.test(rest)) {
      this.pos += 2
      return (value * 25.4) / 72
    }
    if (/^[a-z]/i.test(rest)) this.failed = true
    return value
  }

  private group(): number {
    const value = this.expression()
    if (this.peek() === ')') this.pos += 1
    else this.failed = true
    return value
  }
}
