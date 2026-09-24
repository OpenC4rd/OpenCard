/** Pure helpers for projecting Card Designer fields into PropertyEditor definitions. */
import { formatPackageCoordinate, formatPackageIdentity, parsePackageQualifier } from '../workspace/model/packageCoordinate'
import {
  exposesCardFieldReference,
  getCardFieldDefinition,
  getCardFieldKeys,
  getCardFieldValueKind,
} from '../../entities/card/model'
import type { FilePathDirectoryProvider } from '../../shared/model/filePath'
import type {
  PropertyCompletionProvider,
  PropertyEditorFieldDefinition,
} from '../../shared/ui/property-editor/propertyEditor.types'
import { chainPropertyCompletionProviders } from '../../shared/ui/property-editor/propertyCompletion'
import {
  exposesProjectFieldReference,
  getProjectFieldKeys,
  getProjectFieldValueKind,
  type ProjectInformation,
} from '../workspace/model/projectMetadata'
import type { ProjectFontRegistry } from '../workspace/model/projectFontRegistry'
import { toCssFontFamily, type FontCatalogEntry } from '../workspace/model/projectFonts'
import type { ProjectIconSeries } from '../workspace/model/projectIcons'
import { EMPTY_PROJECT_ICON_CATALOG, type ProjectIconCatalog } from '../workspace/services/projectIconCatalog'
import {
  createProjectIconCompletionProvider,
  type ProjectIconSource,
} from '../workspace/services/projectIconCompletion'
import type { ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import { resolveProjectResourcePackage } from '../workspace/services/projectResourceEnvironment'
import { buildResourceFontCatalog } from '../workspace/services/resourceReference'
import {
  resolveReferenceCompletion,
  type ReferenceCompletionContext,
  type ReferenceCompletionScope,
} from '../editor-runtime/services/referenceCompletion'
import type { CardPropertyFieldDefinition } from '../card-properties/cardPropertyFieldDefinitions'

type Translate = (messageKey: string, parameters?: Record<string, unknown>) => string

export type CdePropertyProjectContext = {
  fonts?: ProjectFontRegistry | null
  information?: ProjectInformation | null
  dictionary?: Readonly<Record<string, string>> | null
  iconSeries?: readonly ProjectIconSeries[] | null
  projectIconCatalog?: ProjectIconCatalog | null
  resourceEnvironment?: ProjectResourceEnvironment
}

export function createCdeCardReferenceScope(options: {
  label: string
  record: Readonly<Record<string, unknown>>
  translate: Translate
  hasMessage: (messageKey: string) => boolean
}): ReferenceCompletionScope {
  const additionalDefinitions = options.record.additionalFieldDefinition as
    | Readonly<Record<string, { title?: string }>>
    | undefined
  return {
    label: options.label,
    fields: getCardFieldKeys(options.record)
      .filter(fieldKey => exposesCardFieldReference(options.record, fieldKey))
      .map((fieldKey) => {
        const displayKey = getCardFieldDefinition(options.record, fieldKey)?.displayFieldKey ?? fieldKey
        const messageKey = `propertyEditor.fields.${displayKey}`
        return {
          key: fieldKey,
          label: additionalDefinitions?.[fieldKey]?.title
            ?? (options.hasMessage(messageKey) ? options.translate(messageKey) : fieldKey),
          valueKind: getCardFieldValueKind(options.record, fieldKey),
        }
      }),
  }
}

export function createCdeProjectReferenceScope(options: {
  label: string
  project: Readonly<ProjectInformation>
  translate: Translate
  hasMessage: (messageKey: string) => boolean
}): ReferenceCompletionScope {
  return {
    label: options.label,
    fields: getProjectFieldKeys(options.project)
      .filter(fieldKey => exposesProjectFieldReference(options.project, fieldKey))
      .map((fieldKey) => {
        const messageKey = `projectConfig.fields.${fieldKey}`
        return {
          key: fieldKey,
          label: options.hasMessage(messageKey) ? options.translate(messageKey) : fieldKey,
          valueKind: getProjectFieldValueKind(options.project, fieldKey),
        }
      }),
  }
}

export function createCdeDictionaryReferenceScope(
  label: string,
  dictionary: Readonly<Record<string, string>>,
): ReferenceCompletionScope {
  return {
    label,
    fields: Object.keys(dictionary).map(key => ({ key, valueKind: 'string' as const })),
  }
}

export function enrichCardPropertyFieldDefinition(options: {
  translate: Translate
  definition: CardPropertyFieldDefinition
  fieldKey: string
  record: Readonly<Record<string, unknown>>
  referenceContext?: ReferenceCompletionContext | null
  fontCatalog: readonly FontCatalogEntry[]
  directoryProvider?: FilePathDirectoryProvider
  projectIconCatalog?: ProjectIconCatalog | null
  resourceEnvironment?: ProjectResourceEnvironment
  project?: Readonly<ProjectInformation> | null
  dictionary?: Readonly<Record<string, string>> | null
}): PropertyEditorFieldDefinition {
  const bindingProvider = options.referenceContext
    && options.definition.acceptsBinding !== false
    && options.definition.fieldType !== 'object'
    ? createReferenceCompletionProvider(options.referenceContext)
    : undefined
  const fontCatalog = options.resourceEnvironment
    ? buildResourceFontCatalog(options.resourceEnvironment)
    : options.fontCatalog
  const fontProvider = options.fieldKey === 'fontFamily'
    ? createFontCompletionProvider(fontCatalog, options.translate('propertyEditor.references.project'), options.resourceEnvironment)
    : undefined
  const iconSources: readonly ProjectIconSource[] = [
    {
      packageKey: null,
      label: options.translate('propertyEditor.references.project'),
      catalog: options.projectIconCatalog ?? EMPTY_PROJECT_ICON_CATALOG,
    },
    ...Array.from(options.resourceEnvironment?.packageEnvironments ?? []).flatMap(([packageKey, environment]) => {
      const pkg = options.resourceEnvironment?.packages?.get(packageKey)
      return pkg && environment.iconCatalog.entries.length
        ? [{
          packageKey: formatPackageCoordinate(pkg.coordinate),
          label: pkg.manifest.title,
          catalog: environment.iconCatalog,
        }]
        : []
    }),
  ]
  // Rich text stores the `[[...]]` token; an image source stores the bare reference.
  const iconProvider = (options.fieldKey === 'content' || (options.fieldKey === 'source' && options.definition.fieldType === 'filePath'))
    ? createProjectIconCompletionProvider(iconSources, {
      mode: options.fieldKey === 'content' ? 'rich-text' : 'reference',
    })
    : undefined
  const provider = bindingProvider || fontProvider || iconProvider
    ? chainPropertyCompletionProviders([bindingProvider, fontProvider, iconProvider])
    : undefined
  const fontOptions = options.definition.fieldType === 'string' && options.definition.richText
    ? fontCatalog.map(font => ({
        label: font.label,
        value: font.value,
        cssFamily: font.cssFamily ?? toCssFontFamily(font.value),
      }))
    : undefined
  const richTextBaseStyle = options.definition.fieldType === 'string' && options.definition.richText
    ? {
        ...(typeof options.record.fontSize === 'string' && options.record.fontSize
          ? { fontSize: options.record.fontSize }
          : {}),
        ...(typeof options.record.fontFamily === 'string' && options.record.fontFamily
          ? { fontFamily: toCssFontFamily(options.record.fontFamily) }
          : {}),
      }
    : undefined
  const directoryProvider = options.definition.fieldType === 'filePath'
    ? options.directoryProvider
    : undefined

  if (!provider && !fontOptions && !richTextBaseStyle) return options.definition
  return {
    ...options.definition,
    ...(fontOptions ? { fontOptions } : {}),
    ...(richTextBaseStyle ? { richTextBaseStyle } : {}),
    ...(directoryProvider ? { directoryProvider } : {}),
    ...(bindingProvider || iconProvider ? { autoPairs: [
      ...(bindingProvider ? [{ open: '{{', close: '}}' }] : []),
      ...(iconProvider ? [{ open: '[[', close: ']]' }] : []),
    ] } : {}),
    ...(bindingProvider ? { binding: { provider: bindingProvider } } : {}),
    ...(iconProvider ? { projectIcon: { provider: iconProvider, catalog: options.projectIconCatalog ?? undefined, sources: iconSources } } : {}),
    ...(provider ? { completion: { ...options.definition.completion, provider } } : {}),
  } as PropertyEditorFieldDefinition
}

function createReferenceCompletionProvider(
  context: ReferenceCompletionContext,
): PropertyCompletionProvider {
  return async ({ value, cursor }) => {
    const state = resolveReferenceCompletion(value, cursor, context)
    if (!state) return null
    return {
      replaceStart: state.replaceStart,
      replaceEnd: state.replaceEnd,
      items: state.suggestions.map(suggestion => ({
        key: suggestion.key,
        label: suggestion.label,
        detail: suggestion.detail,
        insertText: suggestion.insertText,
        keepOpen: suggestion.kind === 'scope',
        ...(suggestion.kind === 'field' ? { value: `{{${suggestion.insertText}}}` } : {}),
      })),
    }
  }
}

function createFontCompletionProvider(
  fontCatalog: readonly FontCatalogEntry[],
  projectLabel: string,
  environment?: ProjectResourceEnvironment,
): PropertyCompletionProvider {
  const scopes = new Map<string, string>()
  for (const font of fontCatalog) {
    if (font.source === 'system') continue
    const prefix = font.value.slice(0, font.value.indexOf('font:') + 5)
    // 引用里写的是**完整坐标**，而资源环境也按坐标索引：解析出来那个包，才拿得到显示名。
    const qualifier = prefix.includes('#') ? parsePackageQualifier(prefix.slice(0, prefix.indexOf('#'))) : null
    const pkg = qualifier && environment ? resolveProjectResourcePackage(environment, qualifier) : null
    scopes.set(prefix, qualifier ? pkg?.manifest.title || formatPackageIdentity(qualifier) : projectLabel)
  }
  return async ({ value, cursor }) => {
    const position = Math.min(cursor, value.length)
    const replaceStart = value.lastIndexOf(';', Math.max(0, position - 1)) + 1
    const nextSeparator = value.indexOf(';', position)
    const replaceEnd = nextSeparator < 0 ? value.length : nextSeparator
    const fragment = value.slice(replaceStart, position).trim().toLocaleLowerCase()
    const insertionPrefix = replaceStart > 0 ? ' ' : ''
    const scope = [...scopes.keys()].find(prefix => fragment.startsWith(prefix.toLocaleLowerCase()))
    const query = scope ? fragment.slice(scope.length) : fragment
    return {
      replaceStart,
      replaceEnd,
      items: [
        ...(!scope ? [...scopes].filter(([prefix, label]) => !fragment
          || prefix.toLocaleLowerCase().includes(fragment) || label.toLocaleLowerCase().includes(fragment))
          .map(([prefix, label]) => ({
            key: `font-scope:${prefix}`, label,
            insertText: `${insertionPrefix}${prefix}`, keepOpen: true,
          })) : []),
        ...fontCatalog
        .filter(font => scope ? font.value.startsWith(scope) : font.source === 'system')
        .filter(font => !query
          || font.label.toLocaleLowerCase().includes(query)
          || (scope ? font.value.slice(scope.length) : font.value).toLocaleLowerCase().includes(query))
        .map(font => ({
          key: `font:${font.value}`,
          label: font.label,
          labelStyle: { fontFamily: font.cssFamily ?? toCssFontFamily(font.value) },
          insertText: `${insertionPrefix}${font.value}`,
          value: `${insertionPrefix}${font.value}`,
        })),
      ],
      ...(scope ? {
        parent: {
          key: 'font-scope:parent', label: '..', icon: 'nav.arrow-up' as const,
          insertText: insertionPrefix, keepOpen: true,
        },
      } : {}),
    }
  }
}
