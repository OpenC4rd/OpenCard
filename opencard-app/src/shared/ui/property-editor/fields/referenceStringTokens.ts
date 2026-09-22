/**
 * 模块说明：
 * - 多项字符串与"已提交项 + 正在输入的尾巴"之间的纯转换（拆分、拼接、光标换算、粘贴拆分）
 * 职责边界：
 * - 只做纯函数转换 不持有状态、不碰 DOM、不决定交互
 */

export type ReferenceStringListSeparator = 'semicolon' | 'comma' | 'newline'

const SEPARATOR_CHARS: Record<ReferenceStringListSeparator, string> = {
  semicolon: ';',
  comma: ',',
  newline: '\n',
}

/** 分隔符字符；同时是"输入时按哪个键成项"的判据。 */
export function referenceStringSeparatorChar(separator: ReferenceStringListSeparator): string {
  return SEPARATOR_CHARS[separator]
}

/** 拆一整串：分隔符之间的项是已提交项（去空白、丢空项），最后一段是正在输入的尾巴（可以留空、不做修剪）。 */
export function splitReferenceStringTokens(
  value: string,
  separator: ReferenceStringListSeparator,
): { tokens: string[]; draft: string } {
  const parts = value.split(SEPARATOR_CHARS[separator])
  const draft = parts.pop() ?? ''
  return { tokens: parts.map(part => part.trim()).filter(Boolean), draft }
}

/** 拼回规范形态：丢掉空白项，不留尾部分隔符。 */
export function joinReferenceStringTokens(
  tokens: readonly string[],
  draft: string,
  separator: ReferenceStringListSeparator,
): string {
  return [...tokens, draft].map(token => token.trim()).filter(Boolean).join(SEPARATOR_CHARS[separator])
}

/** 已提交项在整串里占的前缀（含尾分隔符）：把尾巴里的光标换算回整串坐标要用它。 */
export function referenceStringTokenPrefix(
  tokens: readonly string[],
  separator: ReferenceStringListSeparator,
): string {
  if (tokens.length === 0) return ''
  const char = SEPARATOR_CHARS[separator]
  return `${tokens.join(char)}${char}`
}

/** 粘贴时的拆分：按配置的分隔符与换行一起拆，和输入框里的"一次一项"保持一致。 */
export function splitPastedReferenceStringTokens(
  text: string,
  separator: ReferenceStringListSeparator,
): string[] {
  const parts = separator === 'newline'
    ? text.split('\n')
    : text.split(new RegExp(`[${SEPARATOR_CHARS[separator]}\\n]`))
  return parts.map(part => part.trim()).filter(Boolean)
}
