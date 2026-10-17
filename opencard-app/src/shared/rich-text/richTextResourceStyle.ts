import { fromCssFontFamily } from '../../features/workspace/model/projectFonts'

/** Resource URLs and scoped fonts are a rendering projection, never stored HTML. */
export function resolveRichTextStyle(
  attributes: Readonly<Record<string, string>>,
  resolveFont: (reference: string) => string | null,
  resolveImage: (reference: string) => string | null,
): string {
  const style = document.createElement('span').style
  style.cssText = attributes.style ?? ''
  if (attributes['data-oc-shadow-color']) style.textShadow = `${attributes['data-oc-shadow-offset-x'] || '0px'} ${attributes['data-oc-shadow-offset-y'] || '0px'} ${attributes['data-oc-shadow-blur'] || '0px'} ${attributes['data-oc-shadow-color']}`
  if (style.fontFamily) style.fontFamily = resolveFont(fromCssFontFamily(style.fontFamily)) ?? ''
  if (attributes['data-oc-fill-type'] === 'image' && style.backgroundImage !== 'none') {
    const source = attributes['data-oc-fill-source']
    const url = source ? resolveImage(source) : null
    if (url) {
      style.backgroundImage = `url(${JSON.stringify(url)})`
      style.webkitBackgroundClip = 'text'
      style.webkitTextFillColor = 'transparent'
      // Background and glyph paint remain independent even on a single source element.
      if (style.backgroundColor) {
        style.backgroundImage += `, linear-gradient(${style.backgroundColor}, ${style.backgroundColor})`
        style.webkitBackgroundClip = 'text, border-box'
        style.backgroundColor = ''
      }
    }
  }
  return style.cssText
}
