/** Maps the OC visual foundation into Monaco's concrete theme contract. */
import {
  resolveOcThemeTokens,
  type OcThemeColorOverrides,
  type OcThemeId,
} from '../../../shared/ui/foundation'

type MonacoApi = typeof import('monaco-editor')
type MonacoThemeData = import('monaco-editor').editor.IStandaloneThemeData

interface OcMonacoAppearance {
  themeName: string
  fontFamily: string
}

function toMonacoColor(value: string): string {
  if (value.startsWith('#')) return value

  const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (!match) return value

  const channels = match.slice(1, 4).map((channel) =>
    Math.min(255, Math.max(0, Number(channel))).toString(16).padStart(2, '0'))
  const alpha = match[4] == null
    ? ''
    : Math.round(Math.min(1, Math.max(0, Number(match[4]))) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channels.join('')}${alpha}`
}

function createOcMonacoTheme(
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides = {},
): MonacoThemeData {
  const tokens = resolveOcThemeTokens(themeId, overrides)
  const color = (key: keyof typeof tokens) => toMonacoColor(tokens[key])

  return {
    base: themeId === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'focusBorder': color('--oc-border-accent'),
      'editor.background': color('--oc-bg-raised'),
      'editor.foreground': color('--oc-fg-default'),
      'editorCursor.foreground': color('--oc-accent'),
      'editor.lineHighlightBackground': color('--oc-bg-hover'),
      'editor.selectionBackground': color('--oc-bg-selected'),
      'editor.inactiveSelectionBackground': color('--oc-bg-accent-subtle'),
      'editorLineNumber.foreground': color('--oc-fg-subtle'),
      'editorLineNumber.activeForeground': color('--oc-fg-muted'),
      'editorGutter.background': color('--oc-bg-raised'),
      'editorIndentGuide.background1': color('--oc-border-muted'),
      'editorIndentGuide.activeBackground1': color('--oc-border-default'),
      'editorWhitespace.foreground': color('--oc-border-muted'),
      'editorWidget.background': color('--oc-bg-surface'),
      'editorWidget.border': color('--oc-border-default'),
      'editorSuggestWidget.background': color('--oc-bg-surface'),
      'editorSuggestWidget.border': color('--oc-border-default'),
      'editorSuggestWidget.selectedBackground': color('--oc-bg-selected'),
      'editorHoverWidget.background': color('--oc-bg-surface'),
      'editorHoverWidget.border': color('--oc-border-default'),
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': color('--oc-scrollbar-thumb'),
      'scrollbarSlider.hoverBackground': color('--oc-scrollbar-thumb-hover'),
      'scrollbarSlider.activeBackground': color('--oc-accent-glow'),
      'minimap.background': color('--oc-bg-raised'),
      'minimapSlider.background': color('--oc-scrollbar-thumb'),
      'minimapSlider.hoverBackground': color('--oc-scrollbar-thumb-hover'),
      'minimapSlider.activeBackground': color('--oc-accent-glow'),
    },
  }
}

export function registerOcMonacoTheme(
  monaco: MonacoApi,
  themeId: OcThemeId,
  overrides: OcThemeColorOverrides = {},
): OcMonacoAppearance {
  const themeName = `opencard-${themeId}`
  const tokens = resolveOcThemeTokens(themeId, overrides)
  monaco.editor.defineTheme(themeName, createOcMonacoTheme(themeId, overrides))
  return {
    themeName,
    fontFamily: tokens['--oc-font-mono'],
  }
}
