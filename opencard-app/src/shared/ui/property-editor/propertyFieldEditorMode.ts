import { reactive } from 'vue'
import type { OcActionDefinition } from '../action/action.types'
import type {
  PropertyEditorBindingInterpreter,
  PropertyEditorFieldDefinition,
} from './propertyEditor.types'
import { isArrayPropertyFieldType } from './propertyEditor.types'
import { getPropertyFieldIcon } from './propertyFieldRegistry'

export const USE_FIELD_EDITOR_ACTION_KEY = 'field-editor.use-field'
export const USE_RAW_STRING_EDITOR_ACTION_KEY = 'field-editor.use-raw-string'

export type PropertyFieldEditorId = 'field' | 'raw-string'

export type PropertyFieldEditorState = {
  editorId: PropertyFieldEditorId
  switchTarget: PropertyFieldEditorId | null
}

type ResolvePropertyFieldEditorOptions = {
  identity: string
  definition: PropertyEditorFieldDefinition
  value: unknown
  bindingInterpreter?: PropertyEditorBindingInterpreter
}

type PropertyFieldEditorModeLabels = {
  useFieldEditor: string
  useRawStringEditor: string
}

function supportsRawStringEditor(definition: PropertyEditorFieldDefinition): boolean {
  return !definition.isReadonly
    && !isArrayPropertyFieldType(definition.fieldType)
    && definition.fieldType !== 'object'
}

export function usePropertyFieldEditorModes() {
  const preferences = reactive(new Map<string, PropertyFieldEditorId>())

  function resolve(options: ResolvePropertyFieldEditorOptions): PropertyFieldEditorState {
    if (!supportsRawStringEditor(options.definition)) {
      return { editorId: 'field', switchTarget: null }
    }

    const isBindingValue = options.bindingInterpreter?.isExpression(options.value) ?? false
    if (isBindingValue) {
      return { editorId: 'raw-string', switchTarget: null }
    }

    const editorId = preferences.get(options.identity) ?? 'field'
    return {
      editorId,
      switchTarget: editorId === 'field' ? 'raw-string' : 'field',
    }
  }

  function select(identity: string, actionKey: string): boolean {
    if (actionKey === USE_FIELD_EDITOR_ACTION_KEY) {
      preferences.set(identity, 'field')
      return true
    }
    if (actionKey === USE_RAW_STRING_EDITOR_ACTION_KEY) {
      preferences.set(identity, 'raw-string')
      return true
    }
    return false
  }

  function preserveRawString(identity: string): void {
    preferences.set(identity, 'raw-string')
  }

  return { resolve, select, preserveRawString }
}

export function createPropertyFieldEditorModeAction(
  state: PropertyFieldEditorState,
  definition: PropertyEditorFieldDefinition,
  labels: PropertyFieldEditorModeLabels,
): OcActionDefinition | null {
  if (state.switchTarget === null) return null
  if (state.switchTarget === 'raw-string') {
    return {
      key: USE_RAW_STRING_EDITOR_ACTION_KEY,
      icon: 'data.code-string',
      title: labels.useRawStringEditor,
    }
  }
  return {
    key: USE_FIELD_EDITOR_ACTION_KEY,
    icon: getPropertyFieldIcon(definition.fieldType),
    title: labels.useFieldEditor,
  }
}
