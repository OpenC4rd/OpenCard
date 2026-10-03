import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_BASE_FONT_SIZE, MIN_BASE_FONT_SIZE } from './baseFontSize'
import { DEFAULT_OC_THEME, OC_THEME_REGISTRY } from './themes'
import {
  deriveAccentNeighborColor,
  getOcTheme,
  getReadableForegroundColor,
  getReadableForegroundTone,
  setOcTheme,
} from './theme'

const srcRoot = join(process.cwd(), 'src')
const sourceExtensions = new Set(['.css', '.ts', '.vue'])
const fileIconColorTokens = [
  '--oc-icon-file-opencard',
  '--oc-icon-file-json',
  '--oc-icon-file-markdown',
  '--oc-icon-file-typescript',
  '--oc-icon-file-javascript',
  '--oc-icon-file-vue',
  '--oc-icon-file-html',
  '--oc-icon-file-css',
  '--oc-icon-file-image',
  '--oc-icon-file-config',
  '--oc-icon-folder',
] as const
const blockIconColorTokens = [
  '--oc-icon-block-text',
  '--oc-icon-block-markdown',
  '--oc-icon-block-image',
  '--oc-icon-block-qrcode',
  '--oc-icon-block-shape',
  '--oc-icon-block-simple-container',
  '--oc-icon-block-flow-container',
] as const

function testLuminance(value: string): number {
  const channels = [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function testContrast(left: string, right: string): number {
  const brighter = Math.max(testLuminance(left), testLuminance(right))
  const darker = Math.min(testLuminance(left), testLuminance(right))
  return (brighter + 0.05) / (darker + 0.05)
}

function readProductionSources(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return readProductionSources(path)
      if (!sourceExtensions.has(extname(entry.name)) || entry.name.endsWith('.spec.ts')) return ''
      return readFileSync(path, 'utf8')
    })
    .join('\n')
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
  delete document.documentElement.dataset.ocTheme
  document.documentElement.classList.remove('oc-theme-transitioning')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('OC theme runtime', () => {
  it('derives an accent neighbor at the configurable hue offset', () => {
    expect(deriveAccentNeighborColor('#FF0000')).toBe('#FF00D4')
    expect(deriveAccentNeighborColor('#FF0000', 50)).toBe('#FFD500')
    expect(deriveAccentNeighborColor('#808080')).toBe('#808080')
  })

  it('biases the foreground boundary toward the active theme near the midpoint', () => {
    expect(getReadableForegroundTone('#808080', 'light')).toBe('light')
    expect(getReadableForegroundTone('#808080', 'dark')).toBe('dark')
    expect(getReadableForegroundTone('#111111', 'light')).toBe('light')
    expect(getReadableForegroundTone('#F5F6FB', 'dark')).toBe('dark')
  })

  it('uses the theme-aware foreground tone on primary accent surfaces', () => {
    setOcTheme('light', { '--oc-accent': '#5879FA' })

    const style = document.documentElement.style
    const foreground = style.getPropertyValue('--oc-accent-fg')
    const restingBackground = style.getPropertyValue('--oc-bg-accent')
    const hoverBackground = style.getPropertyValue('--oc-bg-accent-hover')
    expect(getReadableForegroundColor('#5879FA', 'light')).toBe('#F5F2FF')
    expect(foreground).toBe('#F5F2FF')
    expect(hoverBackground).toBe('#516FE6')
    expect(testContrast(foreground, hoverBackground))
      .toBeGreaterThanOrEqual(testContrast(foreground, restingBackground))
  })

  it.each(['dark', 'light'] as const)('applies %s tokens and native color scheme', (themeId) => {
    setOcTheme(themeId)

    expect(getOcTheme()).toBe(themeId)
    expect(document.documentElement.dataset.ocTheme).toBe(themeId)
    expect(document.documentElement.style.colorScheme).toBe(themeId)
    expect(document.documentElement.style.getPropertyValue('--oc-bg-base'))
      .toBe(OC_THEME_REGISTRY[themeId]['--oc-bg-base'])
    expect(document.documentElement.style.getPropertyValue('--oc-bg-block'))
      .toBe(OC_THEME_REGISTRY[themeId]['--oc-bg-block'])
    expect(document.documentElement.style.getPropertyValue('--oc-table-row-height'))
      .toBe(OC_THEME_REGISTRY[themeId]['--oc-table-row-height'])
    expect(document.documentElement.style.getPropertyValue('--oc-border-width'))
      .toBe(OC_THEME_REGISTRY[themeId]['--oc-border-width'])
    expect(document.documentElement.style.getPropertyValue('--oc-viewport-dot-pattern'))
      .toBe(OC_THEME_REGISTRY[themeId]['--oc-viewport-dot-pattern'])
  })

  it.each(['dark', 'light'] as const)('uses distinct OKLCH file and Block icon colors in %s', (themeId) => {
    const fileColors = fileIconColorTokens.map(token => OC_THEME_REGISTRY[themeId][token])
    const blockColors = blockIconColorTokens.map(token => OC_THEME_REGISTRY[themeId][token])
    const isOklchColor = (value: string) => /^oklch\([\d.]+% [\d.]+ [\d.]+\)$/.test(value)

    expect(fileColors.every(isOklchColor)).toBe(true)
    expect(blockColors.every(isOklchColor)).toBe(true)
    expect(new Set(fileColors).size).toBe(fileColors.length)
    expect(new Set(blockColors).size).toBe(blockColors.length)
  })

  it('keeps light-theme file and Block icons within a balanced lightness range', () => {
    const colors = [...fileIconColorTokens, ...blockIconColorTokens]
      .map(token => OC_THEME_REGISTRY.light[token])
    const lightnessValues = colors.map(color => Number(/^oklch\(([\d.]+)%/.exec(color)?.[1]))

    expect(Math.min(...lightnessValues)).toBeGreaterThanOrEqual(67)
    expect(Math.max(...lightnessValues)).toBeLessThanOrEqual(77)
  })

  it('falls back unknown themes to the default theme', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    setOcTheme('unknown')

    expect(getOcTheme()).toBe(DEFAULT_OC_THEME)
    expect(document.documentElement.dataset.ocTheme).toBe(DEFAULT_OC_THEME)
    expect(document.documentElement.style.colorScheme).toBe(DEFAULT_OC_THEME)
  })

  it('applies editable overrides after the built-in theme', () => {
    setOcTheme('light', { '--oc-accent': '#123456', '--oc-bg-base': '#ABCDEF' })

    expect(document.documentElement.style.getPropertyValue('--oc-accent')).toBe('#123456')
    expect(document.documentElement.style.getPropertyValue('--oc-bg-accent')).toBe('#123456')
    expect(document.documentElement.style.getPropertyValue('--oc-border-accent')).toBe('#123456')
    expect(document.documentElement.style.getPropertyValue('--oc-accent-neighbor'))
      .toBe(deriveAccentNeighborColor('#123456'))
    expect(document.documentElement.style.getPropertyValue('--oc-bg-active')).toBe('#1234562E')
    expect(document.documentElement.style.getPropertyValue('--oc-bg-selected')).toBe('#1234561F')
    expect(document.documentElement.style.getPropertyValue('--oc-fg-accent')).not.toBe('#5a4fd6')
    expect(document.documentElement.style.getPropertyValue('--oc-icon-accent')).not.toBe('#5b6de8')
    expect(document.documentElement.style.getPropertyValue('--oc-bg-base')).toBe('#ABCDEF')
  })

  it('derives surface, border, and muted text families from background and foreground', () => {
    setOcTheme('light', { '--oc-bg-base': '#EFEFEF', '--oc-fg-default': '#202020' })

    expect(document.documentElement.style.getPropertyValue('--oc-bg-surface')).toBe('#FAFAFA')
    expect(document.documentElement.style.getPropertyValue('--oc-bg-raised')).toBe('#F5F5F5')
    expect(document.documentElement.style.getPropertyValue('--oc-bg-input')).toBe('#FBFBFB')
    expect(document.documentElement.style.getPropertyValue('--oc-bg-block')).toBe('#F5F5F5')
    expect(document.documentElement.style.getPropertyValue('--oc-border-default')).toBe('#CECECE')
    expect(document.documentElement.style.getPropertyValue('--oc-fg-muted')).toBe('#737373')
    expect(document.documentElement.style.getPropertyValue('--oc-fg-subtle')).toBe('#A0A0A0')
  })

  it('keeps Block surfaces in the selected dark background family', () => {
    setOcTheme('dark', { '--oc-bg-base': '#34251A' })

    expect(document.documentElement.style.getPropertyValue('--oc-bg-surface')).toBe('#3D2F24')
    expect(document.documentElement.style.getPropertyValue('--oc-bg-block')).toBe('#392A1F')
  })

  it('derives the type scale and font family from typography preferences', () => {
    setOcTheme('dark', {}, -50, { fontFamily: 'Inter; Noto Serif CJK SC', baseFontSize: 14 })

    expect(document.documentElement.style.getPropertyValue('--oc-font-sans')).toContain('Noto Serif')
    expect(document.documentElement.style.getPropertyValue('--oc-font-sans')).toContain('"Inter", "Noto Serif CJK SC"')
    expect(document.documentElement.style.getPropertyValue('--oc-text-xs')).toBe('12px')
    expect(document.documentElement.style.getPropertyValue('--oc-text-sm')).toBe('13px')
    expect(document.documentElement.style.getPropertyValue('--oc-text-base')).toBe('14px')
    expect(document.documentElement.style.getPropertyValue('--oc-text-lg')).toBe('15px')
    expect(document.documentElement.style.getPropertyValue('--oc-text-xl')).toBe('19px')
    expect(document.documentElement.style.getPropertyValue('--oc-font-preview-size')).toBe('56px')
  })

  /**
   * 字号范围只有一处定义（`baseFontSize.ts`）：设置滑块能拉到 19，这里就必须真的按 19 出 token。
   * 以前这里自带一份 10–16 的钳制，只改设置就会出现"滑块能拉、界面不变"。
   */
  it('honours the configured base font size range', () => {
    setOcTheme('dark', {}, -50, { baseFontSize: MAX_BASE_FONT_SIZE })
    expect(document.documentElement.style.getPropertyValue('--oc-text-base'))
      .toBe(`${MAX_BASE_FONT_SIZE}px`)

    setOcTheme('dark', {}, -50, { baseFontSize: 1 })
    expect(document.documentElement.style.getPropertyValue('--oc-text-base'))
      .toBe(`${MIN_BASE_FONT_SIZE}px`)
  })

  it('only starts a transition after the resolved theme colors actually change', async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const { setOcTheme: setIsolatedTheme } = await import('./theme')
    const root = document.documentElement

    setIsolatedTheme('dark')
    expect(root.classList.contains('oc-theme-transitioning')).toBe(false)

    setIsolatedTheme('dark', {}, -50, { fontFamily: 'Inter', baseFontSize: 14 })
    expect(root.classList.contains('oc-theme-transitioning')).toBe(false)

    setIsolatedTheme('light')
    expect(root.classList.contains('oc-theme-transitioning')).toBe(true)

    vi.advanceTimersByTime(1200)
    expect(root.classList.contains('oc-theme-transitioning')).toBe(false)
  })
})

describe('theme source boundary', () => {
  it('does not restore legacy Shell color aliases or theme classes', () => {
    const source = readProductionSources(srcRoot)

    expect(source).not.toContain('--color-')
    expect(source).not.toContain('shell-theme-graphite')
    expect(source).not.toContain('shell-theme-light')
  })
})
