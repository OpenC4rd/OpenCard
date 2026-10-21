import type {
  PropertyEditorFieldDefinition,
  PropertyEditorInput,
} from '../../shared/ui/property-editor/propertyEditor.types'
import {
  createPropertyDefaultValue,
  resolvePropertyEditorSchema,
  type EditorPropertyDefinition,
} from '../../entities/card/schema'
import type { BindingScopeKind } from '../editor-runtime/model/bindingExpression'

export type CardPropertyFieldDefinition = PropertyEditorFieldDefinition & {
  acceptsBinding?: false
  bindingScopes?: readonly BindingScopeKind[]
}

export type CardPropertyEditorInput = Omit<PropertyEditorInput, 'fields'> & {
  fields: Readonly<Record<string, CardPropertyFieldDefinition>>
}

export type CardPropertyFieldDefinitionOptions = {
  translate: (messageKey: string) => string
  hasMessage: (messageKey: string) => boolean
  override?: Readonly<Record<string, Partial<EditorPropertyDefinition>>>
  labels?: Readonly<Record<string, string>>
  customKeys?: ReadonlySet<string>
}

export function resolveCardPropertyFields(
  record: Readonly<Record<string, unknown>>,
  options: CardPropertyFieldDefinitionOptions,
): Record<string, CardPropertyFieldDefinition> {
  const resolved = resolvePropertyEditorSchema(record)
  const definitions: Record<string, EditorPropertyDefinition> = { ...resolved.fields }
  const labels = { ...resolved.labels, ...options.labels }
  const customKeys = new Set([...resolved.customKeys, ...(options.customKeys ?? [])])
  for (const [fieldKey, fieldOverride] of Object.entries(options.override ?? {})) {
    const base = definitions[fieldKey]
    if (base) definitions[fieldKey] = { ...base, ...fieldOverride } as EditorPropertyDefinition
    else if (fieldOverride.fieldType) definitions[fieldKey] = fieldOverride as EditorPropertyDefinition
  }
  for (const fieldKey of Object.keys(record)) {
    if (!definitions[fieldKey]) definitions[fieldKey] = { fieldType: 'string', isReadonly: true }
  }

  return Object.fromEntries(Object.entries(definitions).map(([fieldKey, definition], order) => {
    const displayKey = definition.displayFieldKey ?? fieldKey
    const messageKey = `propertyEditor.fields.${displayKey}`
    const title = labels[fieldKey]
      ?? (options.hasMessage(messageKey) ? options.translate(messageKey) : fieldKey)
    return [fieldKey, {
      ...definition,
      defaultValue: createPropertyDefaultValue(definition),
      title,
      category: customKeys.has(fieldKey) ? 'customFields' : definition.categoryId,
      order,
      ...(definition.fieldType === 'string' && definition.autocomplete?.length
        ? {
            completion: {
              static: {
                values: definition.autocomplete,
                presentation: 'ghost' as const,
              },
            },
          }
        : {}),
    }]
  }))
}
