/**
 * 模块说明：
 * - 解析图标语义 token 到 MDI SVG path
 * 职责边界：
 * - 负责 token 回退与缺失告警，不承载颜色/尺寸策略
 */
import { iconGlyphs, type IconToken } from './iconPacks'
import type { IconGlyph } from './icon.types'

export type IconResolvable = IconToken | IconGlyph

export const UNKNOWN_ICON_TOKEN: IconToken = 'status.unknown'
export const DEFAULT_ICON_TOKEN: IconToken = 'file.generic'

const warnedMissingTokens = new Set<string>()

function isIconGlyph(value: unknown): value is IconGlyph {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<IconGlyph>
  return typeof candidate.path === 'string'
}

function warnMissingToken(token: string, source: string): void {
  if (!import.meta.env.DEV) {
    return
  }

  if (warnedMissingTokens.has(token)) {
    return
  }

  warnedMissingTokens.add(token)
  console.warn(`[icon] unresolved token: "${token}" at ${source}, fallback to "${UNKNOWN_ICON_TOKEN}"`)
}

function resolveToken(token: IconToken): IconGlyph | null {
  return iconGlyphs[token] ?? null
}

export function resolveIcon(input?: IconResolvable, source = 'unknown'): IconGlyph {
  if (isIconGlyph(input)) {
    return input
  }

  const token = input ?? DEFAULT_ICON_TOKEN
  const resolved = resolveToken(token)
  if (resolved) {
    return resolved
  }

  warnMissingToken(token, source)

  return resolveToken(UNKNOWN_ICON_TOKEN) ?? iconGlyphs[DEFAULT_ICON_TOKEN]
}
