import { DEFAULT_OC_THEME, OC_THEME_REGISTRY } from './themes'
import { prefersReducedMotion } from './prefersReducedMotion'
import {
  OC_EDITABLE_THEME_COLOR_KEYS,
  OC_THEME_TOKEN_KEYS,
  type OcThemeColorOverrides,
  type OcThemeId,
  type OcThemeTokenKey,
  type OcThemeTokens,
} from './themeTokens'

export type OcThemeTypography = {
  fontFamily?: string
  baseFontSize?: number
}

function resolveFontStack(fontFamily: string | undefined, fallback: string): string {
  if (!fontFamily || fontFamily === 'system') return fallback
  const families = fontFamily.split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"'))
    .filter(Boolean)
    .map(item => `"${item}"`)
  return families.length ? `${families.join(', ')}, ${fallback}` : fallback
}

let currentTheme: OcThemeId = DEFAULT_OC_THEME
let currentThemeColorSignature: string | null = null
let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null

function createThemeColorSignature(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides,
  accentNeighborAngle: number,
): string {
  return JSON.stringify([
    themeId,
    accentNeighborAngle,
    ...OC_EDITABLE_THEME_COLOR_KEYS.map(token => overrides[token] ?? null),
  ])
}

export function resolveOcPixelToken(
  token: OcThemeTokenKey,
  element?: Element | null,
): number {
  const computedValue = element && typeof getComputedStyle !== 'undefined'
    ? getComputedStyle(element).getPropertyValue(token).trim()
    : ''
  const value = computedValue || OC_THEME_REGISTRY[currentTheme][token]
  const pixels = Number.parseFloat(value)
  if (!Number.isFinite(pixels)) throw new Error(`Theme token ${token} must resolve to pixels`)
  return pixels
}

function normalizeThemeId(themeId: string): OcThemeId {
  if (themeId === 'dark' || themeId === 'light') {
    return themeId
  }
  console.warn(`[OpenCard/UI] Unknown theme "${themeId}", fallback to "${DEFAULT_OC_THEME}".`)
  return DEFAULT_OC_THEME
}

type Rgb = readonly [number, number, number]

const DARK_READABLE_FOREGROUND: Rgb = [31, 36, 48]
const LIGHT_READABLE_FOREGROUND: Rgb = [245, 242, 255]
const RGB_BLACK: Rgb = [0, 0, 0]
const RGB_WHITE: Rgb = [255, 255, 255]
const FOREGROUND_THEME_BIAS = 1.2

function parseHex(value: string): Rgb | null {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null
  return [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16)) as unknown as Rgb
}

function toHex(channels: Rgb): string {
  return `#${channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function withAlpha(color: string, alpha: number): string {
  return `${color.toUpperCase()}${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}`
}

function luminance(channels: Rgb): number {
  const [red, green, blue] = channels.map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722
}

export function getReadableForegroundTone(
  value: string,
  themeId: OcThemeId = currentTheme,
): 'dark' | 'light' {
  const color = parseHex(value) ?? RGB_BLACK
  const darkContrast = contrast(DARK_READABLE_FOREGROUND, color)
  const lightContrast = contrast(LIGHT_READABLE_FOREGROUND, color)
  if (themeId === 'light') {
    return lightContrast * FOREGROUND_THEME_BIAS >= darkContrast ? 'light' : 'dark'
  }
  return darkContrast * FOREGROUND_THEME_BIAS >= lightContrast ? 'dark' : 'light'
}

export function getReadableForegroundColor(
  value: string,
  themeId: OcThemeId = currentTheme,
): string {
  return toHex(getReadableForegroundTone(value, themeId) === 'dark'
    ? DARK_READABLE_FOREGROUND
    : LIGHT_READABLE_FOREGROUND)
}

function contrast(left: Rgb, right: Rgb): number {
  const brighter = Math.max(luminance(left), luminance(right))
  const darker = Math.min(luminance(left), luminance(right))
  return (brighter + 0.05) / (darker + 0.05)
}

function mix(left: Rgb, right: Rgb, amount: number): Rgb {
  return left.map((channel, index) => channel + (right[index]! - channel) * amount) as unknown as Rgb
}

export function deriveAccentNeighborColor(value: string, angleDegrees = -50): string {
  const rgb = parseHex(value)
  if (!rgb) return value
  const [red, green, blue] = rgb.map(channel => channel / 255)
  const maximum = Math.max(red!, green!, blue!)
  const minimum = Math.min(red!, green!, blue!)
  const delta = maximum - minimum
  const lightness = (maximum + minimum) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0
  if (delta > 0) {
    if (maximum === red) hue = ((green! - blue!) / delta) % 6
    else if (maximum === green) hue = (blue! - red!) / delta + 2
    else hue = (red! - green!) / delta + 4
    hue *= 60
  }
  hue = (hue + 360 + angleDegrees % 360) % 360
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = hue / 60
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = lightness - chroma / 2
  let channels: Rgb
  if (sector < 1) channels = [chroma, secondary, 0]
  else if (sector < 2) channels = [secondary, chroma, 0]
  else if (sector < 3) channels = [0, chroma, secondary]
  else if (sector < 4) channels = [0, secondary, chroma]
  else if (sector < 5) channels = [secondary, 0, chroma]
  else channels = [chroma, 0, secondary]
  return toHex(channels.map(channel => (channel + offset) * 255) as unknown as Rgb)
}

function readableAccent(accent: Rgb, background: Rgb): string {
  if (contrast(accent, background) >= 4.5) return toHex(accent)
  const target = contrast(DARK_READABLE_FOREGROUND, background) >= contrast(LIGHT_READABLE_FOREGROUND, background)
    ? DARK_READABLE_FOREGROUND
    : LIGHT_READABLE_FOREGROUND
  for (let amount = 0.1; amount <= 1; amount += 0.1) {
    const candidate = mix(accent, target, amount)
    if (contrast(candidate, background) >= 4.5) return toHex(candidate)
  }
  return toHex(target)
}

export function resolveOcThemeTokens(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides = {},
  accentNeighborAngle = -50,
  typography: OcThemeTypography = {},
): OcThemeTokens {
  const tokens: OcThemeTokens = { ...OC_THEME_REGISTRY[themeId] }
  for (const token of OC_EDITABLE_THEME_COLOR_KEYS) {
    const value = overrides[token]
    if (value && parseHex(value)) tokens[token] = value
  }

  const baseFontSize = Math.min(16, Math.max(10, Math.round(typography.baseFontSize ?? 12)))
  tokens['--oc-font-sans'] = resolveFontStack(typography.fontFamily, tokens['--oc-font-sans'])
  tokens['--oc-text-xs'] = `${baseFontSize - 2}px`
  tokens['--oc-text-sm'] = `${baseFontSize - 1}px`
  tokens['--oc-text-base'] = `${baseFontSize}px`
  tokens['--oc-text-lg'] = `${baseFontSize + 1}px`
  tokens['--oc-text-xl'] = `${Math.round(baseFontSize * 4 / 3)}px`
  tokens['--oc-font-preview-size'] = `${baseFontSize * 4}px`

  const baseValue = tokens['--oc-bg-base']
  const foregroundValue = tokens['--oc-fg-default']
  const base = parseHex(baseValue)
  const foreground = parseHex(foregroundValue)
  const usesLightForeground = getReadableForegroundTone(baseValue, themeId) === 'light'

  if (base && overrides['--oc-bg-base']) {
    tokens['--oc-bg-surface'] = toHex(mix(base, RGB_WHITE, usesLightForeground ? 0.045 : 0.7))
    const surface = parseHex(tokens['--oc-bg-surface'])!
    tokens['--oc-bg-block'] = toHex(mix(base, surface, 0.5))
    tokens['--oc-bg-raised'] = toHex(mix(base, RGB_WHITE, usesLightForeground ? 0.09 : 0.35))
    tokens['--oc-bg-input'] = toHex(mix(base, RGB_WHITE, usesLightForeground ? 0.14 : 0.72))
  }

  if (base && foreground && (overrides['--oc-bg-base'] || overrides['--oc-fg-default'])) {
    tokens['--oc-bg-hover'] = withAlpha(foregroundValue, usesLightForeground ? 0.06 : 0.05)
    tokens['--oc-border-muted'] = toHex(mix(base, foreground, 0.1))
    tokens['--oc-border-default'] = toHex(mix(base, foreground, 0.16))
    tokens['--oc-border-strong'] = toHex(mix(base, foreground, 0.28))
    tokens['--oc-fg-muted'] = toHex(mix(foreground, base, 0.4))
    tokens['--oc-fg-subtle'] = toHex(mix(foreground, base, 0.62))
    tokens['--oc-fg-disabled'] = toHex(mix(foreground, base, 0.7))
    tokens['--oc-icon-muted'] = tokens['--oc-fg-muted']
    tokens['--oc-scrollbar-thumb'] = withAlpha(foregroundValue, 0.3)
    tokens['--oc-scrollbar-thumb-hover'] = withAlpha(foregroundValue, 0.46)
  }

  const accentValue = tokens['--oc-accent']
  const accent = parseHex(accentValue)
  tokens['--oc-accent-neighbor'] = deriveAccentNeighborColor(accentValue, accentNeighborAngle)
  if (accent) {
    const accentSurface = parseHex(tokens['--oc-bg-surface']) ?? base!
    const accentForegroundTone = getReadableForegroundTone(accentValue, themeId)
    tokens['--oc-bg-active'] = withAlpha(accentValue, usesLightForeground ? 0.22 : 0.18)
    tokens['--oc-bg-selected'] = withAlpha(accentValue, usesLightForeground ? 0.16 : 0.12)
    tokens['--oc-bg-accent'] = accentValue
    tokens['--oc-bg-accent-hover'] = toHex(mix(
      accent,
      accentForegroundTone === 'light' ? RGB_BLACK : RGB_WHITE,
      0.08,
    ))
    tokens['--oc-bg-accent-subtle'] = withAlpha(accentValue, usesLightForeground ? 0.12 : 0.1)
    tokens['--oc-border-accent'] = accentValue
    tokens['--oc-accent-fg'] = getReadableForegroundColor(accentValue, themeId)
    tokens['--oc-accent-glow'] = withAlpha(accentValue, usesLightForeground ? 0.28 : 0.35)
    tokens['--oc-fg-accent'] = readableAccent(accent, accentSurface)
    tokens['--oc-icon-accent'] = tokens['--oc-fg-accent']
    tokens['--oc-focus-ring'] = `0 0 0 2px ${withAlpha(accentValue, usesLightForeground ? 0.4 : 0.5)}`
  }
  return tokens
}

function applyTheme(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides,
  accentNeighborAngle: number,
  typography: OcThemeTypography,
) {
  const colorSignature = createThemeColorSignature(themeId, overrides, accentNeighborAngle)
  if (typeof document === 'undefined') {
    currentTheme = themeId
    currentThemeColorSignature = colorSignature
    return
  }

  const root = document.documentElement
  const shouldTransitionColors = currentThemeColorSignature !== null
    && currentThemeColorSignature !== colorSignature
  const prefersReduced = prefersReducedMotion()
  if (shouldTransitionColors && !prefersReduced) {
    if (themeTransitionTimer !== null) clearTimeout(themeTransitionTimer)
    root.classList.add('oc-theme-transitioning')
    const durationValue = getComputedStyle(root).getPropertyValue('--oc-duration-theme').trim()
    const durationMs = durationValue.endsWith('ms')
      ? Number.parseFloat(durationValue)
      : durationValue.endsWith('s')
        ? Number.parseFloat(durationValue) * 1000
        : 1200
    themeTransitionTimer = setTimeout(() => {
      root.classList.remove('oc-theme-transitioning')
      themeTransitionTimer = null
    }, Number.isFinite(durationMs) ? durationMs : 1200)
  } else if (shouldTransitionColors) {
    if (themeTransitionTimer !== null) clearTimeout(themeTransitionTimer)
    themeTransitionTimer = null
    root.classList.remove('oc-theme-transitioning')
  }
  const tokens = resolveOcThemeTokens(themeId, overrides, accentNeighborAngle, typography)
  for (const token of OC_THEME_TOKEN_KEYS) {
    const value = tokens[token]
    if (typeof value !== 'string') {
      console.warn(`[OpenCard/UI] Missing theme token "${token}" in theme "${themeId}".`)
      continue
    }
    if (root.style.getPropertyValue(token) !== value) root.style.setProperty(token, value)
  }

  root.style.colorScheme = themeId
  root.dataset.ocTheme = themeId
  currentTheme = themeId
  currentThemeColorSignature = colorSignature
}

export function setOcTheme(
  themeId: OcThemeId | string,
  overrides: OcThemeColorOverrides = {},
  accentNeighborAngle = -50,
  typography: OcThemeTypography = {},
): void {
  applyTheme(normalizeThemeId(themeId), overrides, accentNeighborAngle, typography)
}

export function setOcGlassIntensity(value: number): void {
  if (typeof document === 'undefined') return
  const intensity = Math.min(100, Math.max(0, Math.round(value)))
  const blur = intensity * 0.24
  const opacity = 100 - intensity * 0.4
  const saturation = 100 + intensity * 0.4
  const root = document.documentElement

  root.style.setProperty('--oc-bg-glass', `color-mix(in srgb, var(--oc-bg-surface) ${opacity}%, transparent)`)
  root.style.setProperty('--oc-bg-glass-blur', `${blur}px`)
  root.style.setProperty('--oc-blur-glass', `${blur}px`)
  root.style.setProperty('--oc-bg-glass-saturate', `${saturation}%`)
  root.dataset.ocGlassIntensity = String(intensity)
}

/**
 * 云母由 Windows 绘制在窗口底层：开启时让窗口基色透明，材质才透得上来。
 * 仅在效果确认应用成功后调用，避免留下一个没有任何材质的透明窗口。
 */
export function setOcMicaBackdrop(enabled: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--oc-bg-window', enabled ? 'transparent' : 'var(--oc-bg-base)')
  root.dataset.ocMicaBackdrop = enabled ? 'on' : 'off'
}

export function setOcPhaseImageSpeedMultiplier(value: number): void {
  if (typeof document === 'undefined') return
  const multiplier = Number.isFinite(value) ? Math.max(0.01, value) : 1
  document.documentElement.style.setProperty('--oc-phase-image-speed', String(multiplier))
}

export function getOcTheme(): OcThemeId {
  return currentTheme
}
