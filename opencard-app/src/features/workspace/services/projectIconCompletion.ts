import type { PropertyCompletionItem, PropertyCompletionProvider } from '../../../shared/ui/property-editor/propertyEditor.types'
import {
  createProjectIconStyle,
  type ProjectIconCatalog,
  type ProjectIconDimensionReader,
} from './projectIconCatalog'
import { readProjectIconSize } from './projectIconDimensionResolver'

/**
 * One place project icons can come from: the current project, or a package that ships icons.
 * `packageKey` is `null` for the current project.
 */
export type ProjectIconSource = {
  packageKey: string | null
  label: string
  catalog: ProjectIconCatalog
}

export type ProjectIconCompletionMode =
  /** Rich text: emits the `[[[package@]icon:collection/icon]]` token. */
  | 'rich-text'
  /** A path field: emits the bare `[package@]icon:collection/icon` reference. */
  | 'reference'

export type ProjectIconCompletionOptions = {
  mode?: ProjectIconCompletionMode
  readDimensions?: ProjectIconDimensionReader
}

type Range = { start: number, end: number }

/** A completion item plus the extra names it can be filtered by; `searchKeys` never reaches the menu. */
type PreparedIcon = PropertyCompletionItem & { searchKeys: string[] }

/**
 * Where the cursor sits and which span each kind of choice replaces:
 * - a collection replaces the text after `[package@]icon:`
 * - a package qualifier replaces the reference, dropping the collection it had
 * - a finished reference replaces the whole token, brackets included
 */
type TokenState = {
  stage: 'prefix' | 'series' | 'icon'
  packageKey: string | null
  query: string
  body: Range
  reference: Range
  token: Range
  seriesKey?: string
}

const QUALIFIED_REFERENCE_PATTERN = /^(?:([a-z0-9._-]+)@)?icon:(.*)$/i
const PACKAGE_QUALIFIER_PATTERN = /([a-z0-9._-]+)@$/

function within(range: Range, item: PropertyCompletionItem): PropertyCompletionItem {
  return { ...item, replaceStart: range.start, replaceEnd: range.end }
}

/**
 * 光标只有落在 `[[` 与 `]]` 之间才算正在写这枚图标。
 * 停在 `]]` 之后说明 token 已经写完，这里直接返回 null：否则菜单会一直弹，
 * 回车也一直被菜单吃掉，换不了行。
 */
function locateRichTextToken(value: string, cursor: number): TokenState | null {
  const start = value.lastIndexOf('[[', cursor)
  if (start < 0 || value.slice(0, cursor).lastIndexOf(']]') > start) return null
  const contentStart = start + 2
  const content = value.slice(contentStart, cursor)
  const inner = { start: contentStart, end: cursor }
  const token = {
    start,
    end: value.slice(cursor, cursor + 2) === ']]' ? cursor + 2 : cursor,
  }
  const matched = QUALIFIED_REFERENCE_PATTERN.exec(content)
  if (!matched) {
    return { stage: 'prefix', packageKey: null, query: content, body: inner, reference: inner, token }
  }
  const rest = matched[2]!
  const packageKey = matched[1] ?? null
  const body = { start: cursor - rest.length, end: cursor }
  const slash = rest.indexOf('/')
  if (slash < 0) {
    return { stage: 'series', packageKey, query: rest, body, reference: inner, token }
  }
  return {
    stage: 'icon',
    packageKey,
    seriesKey: rest.slice(0, slash),
    query: rest.slice(slash + 1),
    body,
    reference: inner,
    token,
  }
}

function locateReferenceToken(value: string, cursor: number): TokenState | null {
  const head = value.slice(0, cursor)
  const iconAt = head.lastIndexOf('icon:')
  if (iconAt < 0) return null
  const qualifier = PACKAGE_QUALIFIER_PATTERN.exec(head.slice(0, iconAt))
  const packageKey = qualifier?.[1] ?? null
  const start = qualifier ? iconAt - qualifier[1]!.length - 1 : iconAt
  const whole = { start, end: value.length }
  const bodyStart = iconAt + 'icon:'.length
  const rest = value.slice(bodyStart)
  const body = { start: bodyStart, end: value.length }
  const slash = rest.indexOf('/')
  if (slash < 0) {
    return { stage: 'series', packageKey, query: rest, body, reference: whole, token: whole }
  }
  return {
    stage: 'icon',
    packageKey,
    seriesKey: rest.slice(0, slash),
    query: rest.slice(slash + 1),
    body,
    reference: whole,
    token: whole,
  }
}

function qualify(packageKey: string | null, reference: string): string {
  return `${packageKey ? `${packageKey}@` : ''}${reference}`
}

export function createProjectIconCompletionProvider(
  sources: readonly ProjectIconSource[],
  options: ProjectIconCompletionOptions = {},
): PropertyCompletionProvider {
  const richText = (options.mode ?? 'rich-text') === 'rich-text'
  const readDimensions = options.readDimensions ?? readProjectIconSize

  const catalogByPackage = new Map<string, ProjectIconCatalog>(
    sources.map(source => [source.packageKey ?? '', source.catalog]),
  )
  const preparedIconsByCollection = new Map<string, PreparedIcon[]>()

  function catalogFor(packageKey: string | null): ProjectIconCatalog | null {
    return catalogByPackage.get(packageKey ?? '') ?? null
  }

  function findCollection(packageKey: string | null, seriesKey: string) {
    const needle = seriesKey.toLocaleLowerCase()
    return catalogFor(packageKey)?.series.find(series => series.key.toLocaleLowerCase() === needle) ?? null
  }

  function collectionItems(packageKey: string | null, query: string): PropertyCompletionItem[] {
    const catalog = catalogFor(packageKey)
    if (!catalog) return []
    const needle = query.toLocaleLowerCase()
    return catalog.series
      .filter(series => !needle
        || series.key.toLocaleLowerCase().startsWith(needle)
        || series.name.toLocaleLowerCase().includes(needle))
      .map(series => ({
        key: `project-icon-collection:${packageKey ?? ''}:${series.key}`,
        label: series.name,
        insertText: `${series.key}/`,
        keepOpen: true,
      }))
  }

  /** Packages that ship icons, offered while the caller has not named a package yet. */
  function packageItems(query: string): PropertyCompletionItem[] {
    const needle = query.toLocaleLowerCase()
    return sources
      .filter(source => source.packageKey !== null)
      .filter(source => !needle
        || (source.packageKey ?? '').toLocaleLowerCase().startsWith(needle)
        || source.label.toLocaleLowerCase().includes(needle))
      .map(source => ({
        key: `project-icon-package:${source.packageKey}`,
        label: source.label,
        icon: 'file.package' as const,
        insertText: qualify(source.packageKey, 'icon:'),
        keepOpen: true,
      }))
  }

  function iconItems(packageKey: string | null, seriesKey: string, query: string): PropertyCompletionItem[] {
    const catalog = catalogFor(packageKey)
    const collection = findCollection(packageKey, seriesKey)
    if (!catalog || !collection) return []
    // Thumbnails are measured once per collection and reused while the query filters them.
    const cacheKey = `${packageKey ?? ''}\u0000${collection.key.toLocaleLowerCase()}`
    let prepared = preparedIconsByCollection.get(cacheKey)
    if (!prepared) {
      prepared = catalog.entries
        .filter(entry => entry.seriesKey.toLocaleLowerCase() === collection.key.toLocaleLowerCase())
        .map(entry => {
          const reference = qualify(packageKey, `icon:${entry.seriesKey}/${entry.iconKey}`)
          return {
            key: `project-icon:${packageKey ?? ''}:${entry.seriesKey}/${entry.iconKey}`,
            label: entry.name,
            insertText: richText ? `[[${reference}]]` : reference,
            searchKeys: [entry.iconKey.toLocaleLowerCase(), entry.name.toLocaleLowerCase()],
            thumbnailStyle: createProjectIconStyle(entry, readDimensions),
            thumbnailLabel: entry.name,
          }
        })
      preparedIconsByCollection.set(cacheKey, prepared)
    }
    const needle = query.toLocaleLowerCase()
    return prepared
      .filter(icon => !needle || icon.searchKeys.some(searchKey => searchKey.includes(needle)))
      .map(({ searchKeys: _searchKeys, ...icon }) => icon)
  }

  function referenceToken(packageKey: string | null): string {
    const reference = qualify(packageKey, 'icon:')
    return richText ? `[[${reference}]]` : reference
  }

  return ({ value, cursor }) => {
    const state = richText ? locateRichTextToken(value, cursor) : locateReferenceToken(value, cursor)
    if (!state) return null

    if (state.stage === 'prefix') {
      // Nothing after `[[` is a reference yet, so a collection choice has to write the `icon:`
      // prefix as well. Packages rewrite the whole content.
      const collections = collectionItems(null, state.query).map(item => ({
        ...item,
        insertText: `icon:${item.insertText}`,
      }))
      return {
        replaceStart: state.reference.start,
        replaceEnd: state.reference.end,
        items: [...collections, ...packageItems(state.query)],
      }
    }

    if (state.stage === 'series') {
      // Naming a package rewrites the reference, so its items carry their own span.
      const packages = state.packageKey === null
        ? packageItems(state.query).map(item => within(state.reference, item))
        : []
      const parent = state.packageKey === null
        ? undefined
        : within(state.reference, {
          key: 'project-icon-parent:',
          label: '..',
          insertText: richText ? '[[icon:]]' : 'icon:',
          keepOpen: true,
        })
      const items = [...collectionItems(state.packageKey, state.query), ...packages]
      if (!items.length && !parent) return null
      return {
        replaceStart: state.body.start,
        replaceEnd: state.body.end,
        items,
        ...(parent ? { parent } : {}),
      }
    }

    const items = iconItems(state.packageKey!, state.seriesKey!, state.query)
    if (!items.length) return null
    return {
      replaceStart: state.token.start,
      replaceEnd: state.token.end,
      items,
      parent: {
        key: 'project-icon-parent:',
        label: '..',
        insertText: referenceToken(state.packageKey),
        keepOpen: true,
      },
    }
  }
}
