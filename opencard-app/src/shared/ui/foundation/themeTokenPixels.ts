import { OC_SHARED_THEME_TOKENS } from './themes'

/** 读取共享主题里的像素 token；数值来源仍是 foundation shared tokens。 */
export function readThemePixels(token: keyof typeof OC_SHARED_THEME_TOKENS): number {
  const value = Number.parseFloat(OC_SHARED_THEME_TOKENS[token])
  if (!Number.isFinite(value)) throw new Error(`Invalid foundation pixel token: ${token}`)
  return value
}
