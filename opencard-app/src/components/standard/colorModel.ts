import { getReadableForegroundColor, getReadableForegroundTone } from '../../shared/ui/foundation'

export { getReadableForegroundColor, getReadableForegroundTone }

interface HsvColor {
  hue: number
  saturation: number
  value: number
}

export interface HsvaColor extends HsvColor {
  alpha: number
}

interface RgbaColor {
  red: number
  green: number
  blue: number
  alpha: number
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()
  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(trimmed)) return trimmed.toUpperCase()
  if (!/^#[\da-f]{3}([\da-f])?$/i.test(trimmed)) return null
  return `#${trimmed.slice(1).split('').map(channel => channel.repeat(2)).join('')}`.toUpperCase()
}

export function hexToHsv(value: string): HsvColor | null {
  const hsva = hexToHsva(value)
  if (!hsva) return null
  const { alpha: _alpha, ...hsv } = hsva
  return hsv
}

export function hexToHsva(value: string): HsvaColor | null {
  const rgba = hexToRgba(value)
  return rgba ? rgbaToHsva(rgba) : null
}

export function hexToRgba(value: string): RgbaColor | null {
  const normalized = normalizeHexColor(value)
  if (!normalized) return null
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
    alpha: normalized.length === 9 ? Number.parseInt(normalized.slice(7, 9), 16) / 255 : 1,
  }
}

export function rgbaToHsva(color: RgbaColor): HsvaColor {
  const red = clampChannel(color.red) / 255
  const green = clampChannel(color.green) / 255
  const blue = clampChannel(color.blue) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  let hue = 0

  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2)
    else hue = 60 * (((red - green) / delta) + 4)
  }
  if (hue < 0) hue += 360

  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
    alpha: clampUnit(color.alpha),
  }
}

export function hsvToHex(color: HsvColor): string {
  return hsvaToHex({ ...color, alpha: 1 })
}

export function hsvaToHex(color: HsvaColor): string {
  return rgbaToHex(hsvaToRgba(color))
}

export function hsvaToRgba(color: HsvaColor): RgbaColor {
  const hue = ((color.hue % 360) + 360) % 360
  const saturation = clampUnit(color.saturation)
  const value = clampUnit(color.value)
  const chroma = value * saturation
  const sector = hue / 60
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = value - chroma
  let channels: [number, number, number]

  if (sector < 1) channels = [chroma, secondary, 0]
  else if (sector < 2) channels = [secondary, chroma, 0]
  else if (sector < 3) channels = [0, chroma, secondary]
  else if (sector < 4) channels = [0, secondary, chroma]
  else if (sector < 5) channels = [secondary, 0, chroma]
  else channels = [chroma, 0, secondary]

  return {
    red: Math.round((channels[0] + offset) * 255),
    green: Math.round((channels[1] + offset) * 255),
    blue: Math.round((channels[2] + offset) * 255),
    alpha: clampUnit(color.alpha),
  }
}

export function rgbaToHex(color: RgbaColor): string {
  const channels = [color.red, color.green, color.blue]
    .map(channel => clampChannel(channel).toString(16).padStart(2, '0'))
  const alpha = Math.round(clampUnit(color.alpha) * 255)
  if (alpha < 255) channels.push(alpha.toString(16).padStart(2, '0'))
  return `#${channels.join('')}`.toUpperCase()
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampChannel(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)))
}
