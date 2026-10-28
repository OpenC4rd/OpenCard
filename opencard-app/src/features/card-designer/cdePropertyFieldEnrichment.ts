/** Pure helpers for projecting Card Designer fields into PropertyEditor definitions. */
import {
  exposesCardFieldReference,
  getCardFieldDefinition,
  getCardFieldKeys,
  getCardFieldValueKind,
} from '../../entities/card/model'
import type {
  PropertyCompletionProvider,
  PropertyEditorFieldDefinition,
} from '../../shared/ui/property-editor/propertyEditor.types'
import {
  exposesProjectFieldReference,
  getProjectFieldKeys,
  getProjectFieldValueKind,
  type ProjectInformation,
} from '../workspace/model/projectMetadata'
import type { ProjectFontRegistry } from '../workspace/model/projectFontRegistry'
import { toCssFontFamily } from '../workspace/model/projectFonts'
import type { ProjectIconSeries } from '../workspace/model/projectIcons'
import type { ProjectIconCatalog } from '../workspace/services/projectIconCatalog'
import type { ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import { resolveProjectEnvironmentFontFamily } from '../workspace/services/projectResourceEnvironment'
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
  definition: CardPropertyFieldDefinition
  record: Readonly<Record<string, unknown>>
  referenceContext?: ReferenceCompletionContext | null
  resourceEnvironment?: ProjectResourceEnvironment
}): PropertyEditorFieldDefinition {
  const bindingProvider = options.referenceContext
    && options.definition.acceptsBinding !== false
    && options.definition.fieldType !== 'object'
    ? createReferenceCompletionProvider(options.referenceContext)
    : undefined
  const richTextBaseStyle = options.definition.fieldType === 'richText'
    ? {
        ...(typeof options.record.fontSize === 'string' && options.record.fontSize
          ? { fontSize: options.record.fontSize }
          : {}),
        ...(typeof options.record.fontFamily === 'string' && options.record.fontFamily
          ? {
              fontFamily: options.resourceEnvironment
                ? resolveProjectEnvironmentFontFamily(options.record.fontFamily, options.resourceEnvironment)
                : toCssFontFamily(options.record.fontFamily),
            }
          : {}),
      }
    : undefined

  if (!bindingProvider && !richTextBaseStyle) return options.definition
  return {
    ...options.definition,
    ...(richTextBaseStyle ? { richTextBaseStyle } : {}),
    ...(bindingProvider
      ? {
          autoPairs: [{ open: '{{', close: '}}' }],
          binding: { provider: bindingProvider },
          completion: { ...options.definition.completion, provider: bindingProvider },
        }
      : {}),
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
