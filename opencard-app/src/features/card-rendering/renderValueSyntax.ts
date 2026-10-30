const cssColorFunctions = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\(.+\)$/i
const cssNamedColor = /^[a-z]+$/i
const cssHexColor = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * 卡片渲染只认能被自己算出来的长度：纯数字（默认 mm）、mm、pt、cm、in、%，以及由它们和
 * `+ - * / ( )` 组成的四则运算（可包在 `calc(...)` 里）。
 * `px`、`em`、`vw`、`auto` 之类不具备卡片物理意义或需要浏览器布局上下文，一律拒绝。
 */
const lengthTerm = String.raw`-?(?:\d+\.?\d*|\.\d+)(?:mm|pt|cm|in|%)?`
const singleLength = new RegExp(`^${lengthTerm}$`)
const lengthToken = new RegExp(`${lengthTerm}|[+*/()-]`, 'g')
const bareNumber = /^-?(?:\d+\.?\d*|\.\d+)$/
const calcWrapper = /^calc\((.*)\)$/i

function tokenizeLength(expression: string): string[] | null {
  const compact = expression.replace(/\s+/g, '')
  if (!compact) return null
  const tokens = compact.match(lengthToken)
  if (!tokens || tokens.join('') !== compact) return null
  let depth = 0
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (isLengthTerm(token) && index > 0 && isLengthTerm(tokens[index - 1]!)) return null
    if (token === '(') depth += 1
    if (token === ')' && --depth < 0) return null
  }
  return depth === 0 ? tokens : null
}

function isLengthTerm(token: string): boolean {
  return singleLength.test(token)
}

export function isRenderCssColor(value: string): boolean {
  const candidate = value.trim()
  if (!candidate) return true
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', candidate)
  }
  return cssHexColor.test(candidate)
    || cssColorFunctions.test(candidate)
    || cssNamedColor.test(candidate)
    || candidate === 'transparent'
    || candidate === 'currentColor'
}

export function normalizeRenderCssLength(value: string): string {
  const trimmed = value.trim()
  if (bareNumber.test(trimmed)) return `${trimmed}mm`
  if (!trimmed || singleLength.test(trimmed) || calcWrapper.test(trimmed)) return trimmed
  return `calc(${trimmed})`
}

export function isRenderCssLength(value: string): boolean {
  const candidate = value.trim()
  if (!candidate) return true
  return tokenizeLength(calcWrapper.exec(candidate)?.[1] ?? candidate) !== null
}
