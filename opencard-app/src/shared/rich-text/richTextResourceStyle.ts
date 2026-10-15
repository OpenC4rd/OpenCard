import { fromCssFontFamily } from '../../features/workspace/model/projectFonts'

/** Resource URLs and scoped fonts are a rendering projection, never stored HTML. */
export function resolveRichTextStyle(
  attributes: Readonly<Record<string, string>>,
  resolveFont: (reference: string) => string | null,
  resolveImage: (reference: string) => string | null,
): string {
  const style = document.createElement('span').style
  style.cssText = attributes.style ?? ''
  if (style.fontFamily) style.fontFamily = resolveFont(fromCssFontFamily(style.fontFamily)) ?? ''
  if (attributes['data-oc-fill-type'] === 'image') {
    const source = attributes['data-oc-fill-source']
    const url = source ? resolveImage(source) : null
    if (url) {
      style.backgroundImage = `url(${JSON.stringify(url)})`
      style.webkitBackgroundClip = 'text'
      style.color = 'transparent'
    }
  }
  return style.cssText
}
