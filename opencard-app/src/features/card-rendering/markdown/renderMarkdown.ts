import MarkdownIt from 'markdown-it'
import markdownItAttrs from 'markdown-it-attrs'
import type Token from 'markdown-it/lib/token.mjs'
import {
  createProjectIconCssProperties,
  findProjectIcon,
  type ProjectIconCatalogEntry,
  type ProjectIconCatalog,
  type ProjectIconDimensionReader,
} from '../../workspace/services/projectIconCatalog'
import { formatProjectIconPath, parseProjectIconPath } from '../../../shared/rich-text/projectIconReference'

const IMAGE_ATTRIBUTE_NAMES = new Set(['width', 'height', 'fit', 'align'])
const CSS_LENGTH_PATTERN = /^(?:auto|0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc))$/i
const IMAGE_FIT_VALUES = new Set(['contain', 'cover', 'fill'])
const IMAGE_ALIGN_VALUES = new Set(['start', 'center', 'end'])

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false,
  typographer: false,
})

markdown.use(markdownItAttrs, {
  allowedAttributes: [...IMAGE_ATTRIBUTE_NAMES],
})

markdown.inline.ruler.before('emphasis', 'opencard_project_icon', (state, silent) => {
  if (!state.src.startsWith('[[', state.pos)) return false
  const end = state.src.indexOf(']]', state.pos + 2)
  if (end < 0) return false
  const source = state.src.slice(state.pos, end + 2)
  // The icon reference module owns the spelling, so the token rule only asks it what `[[…]]` holds.
  const parsed = parseProjectIconPath(source.slice(2, -2))
  if (!parsed) return false
  if (!silent) {
    const token = state.push('opencard_project_icon', '', 0)
    token.content = source
    token.meta = { reference: formatProjectIconPath(parsed) }
  }
  state.pos = end + 2
  return true
})

function removeImageAttributesFromNonImageTokens(tokens: Token[]): void {
  for (const token of tokens) {
    if (token.type !== 'image' && token.attrs) {
      token.attrs = token.attrs.filter(([name]) => !IMAGE_ATTRIBUTE_NAMES.has(name))
    }
    if (token.children) {
      removeImageAttributesFromNonImageTokens(token.children)
    }
  }
}

markdown.core.ruler.after('curly_attributes', 'opencard_image_attributes', (state) => {
  removeImageAttributesFromNonImageTokens(state.tokens)
})

export type MarkdownRenderOptions = {
  resolveImageSrc?: (path: string) => string
  projectIconCatalog?: ProjectIconCatalog
  resolveIconReference?: (source: string) => ProjectIconCatalogEntry | null
  /** Reads an icon's size, which is what asks for it. */
  readIconDimensions?: ProjectIconDimensionReader
  missingProjectIconLabel?: string
}

type MarkdownEnvironment = {
  resolveImageSrc?: (path: string) => string
  projectIconCatalog?: ProjectIconCatalog
  resolveIconReference?: (source: string) => ProjectIconCatalogEntry | null
  readIconDimensions?: ProjectIconDimensionReader
  missingProjectIconLabel?: string
}

markdown.renderer.rules.opencard_project_icon = (tokens, index, _options, environment) => {
  const token = tokens[index]
  const source = (token?.meta as { reference?: string } | undefined)?.reference ?? ''
  const reference = source ? parseProjectIconPath(source) : null
  const markdownEnvironment = environment as MarkdownEnvironment
  const entry = reference
    ? markdownEnvironment.resolveIconReference?.(source)
      ?? (reference.packageKey
        ? null
        : findProjectIcon(markdownEnvironment.projectIconCatalog, reference.seriesKey, reference.iconKey))
    : null
  if (!entry) {
    const label = markdown.utils.escapeHtml(
      markdownEnvironment.missingProjectIconLabel ?? 'Project icon unavailable',
    )
    return `<span class="project-inline-icon project-inline-icon--missing" role="img" aria-label="${label}" data-oc-icon-missing="true"></span>`
  }
  const style = Object.entries(createProjectIconCssProperties(entry, markdownEnvironment.readIconDimensions))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
  return `<span class="project-inline-icon oc-project-icon" role="img" aria-label="${markdown.utils.escapeHtml(entry.name)}" style="${markdown.utils.escapeHtml(style)}"></span>`
}

function readCssLength(token: Token, name: 'width' | 'height'): string | null {
  const value = token.attrGet(name)?.trim() ?? ''
  return CSS_LENGTH_PATTERN.test(value) ? value : null
}

function createImageStyle(token: Token): string {
  const declarations: string[] = []
  const width = readCssLength(token, 'width')
  const height = readCssLength(token, 'height')
  const fit = token.attrGet('fit')?.trim().toLowerCase() ?? ''
  const align = token.attrGet('align')?.trim().toLowerCase() ?? ''

  if (width) declarations.push(`width:${width}`)
  if (height) declarations.push(`height:${height}`)
  if (IMAGE_FIT_VALUES.has(fit)) declarations.push(`object-fit:${fit}`)
  if (IMAGE_ALIGN_VALUES.has(align)) {
    declarations.push('display:block')
    if (align === 'start') declarations.push('margin-inline-end:auto')
    if (align === 'center') declarations.push('margin-inline:auto')
    if (align === 'end') declarations.push('margin-inline-start:auto')
  }

  return declarations.join(';')
}

markdown.renderer.rules.image = (tokens, index, _options, environment) => {
  const token = tokens[index]
  const alt = markdown.utils.escapeHtml(token?.content ?? '')
  const encodedSourcePath = token?.attrGet('src') ?? ''
  let sourcePath = encodedSourcePath
  try {
    sourcePath = decodeURI(encodedSourcePath)
  } catch {
    // Keep the original path when Markdown contains malformed URL escapes.
  }

  let resolvedSource = ''
  try {
    resolvedSource = (environment as MarkdownEnvironment).resolveImageSrc?.(sourcePath) ?? ''
  } catch {
    // Missing project context or invalid paths degrade to the image alt text.
  }
  if (!resolvedSource) {
    return alt
  }

  const title = token?.attrGet('title')
  const titleAttribute = title
    ? ` title="${markdown.utils.escapeHtml(title)}"`
    : ''
  const style = createImageStyle(token)
  const styleAttribute = style
    ? ` style="${markdown.utils.escapeHtml(style)}"`
    : ''
  return `<img class="text-block-markdown-image" src="${markdown.utils.escapeHtml(resolvedSource)}" alt="${alt}"${titleAttribute}${styleAttribute}>`
}

export function renderMarkdown(source: string, options: MarkdownRenderOptions = {}): string {
  return markdown.render(source, {
    resolveImageSrc: options.resolveImageSrc,
    projectIconCatalog: options.projectIconCatalog,
    resolveIconReference: options.resolveIconReference,
    readIconDimensions: options.readIconDimensions,
    missingProjectIconLabel: options.missingProjectIconLabel,
  } satisfies MarkdownEnvironment)
}
