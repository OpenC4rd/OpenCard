import { defineAsyncComponent, type Component } from 'vue'
import type { IconToken } from '../icon/iconRegistry'
import type {
  BasePropertyFieldType,
  PropertyEditorFieldDefinition,
  PropertyFieldType,
} from './propertyEditor.types'
import {
  getArrayElementFieldType,
  isArrayPropertyFieldType,
} from './propertyEditor.types'
import AlignPositionPropertyField from './fields/AlignPositionPropertyField.vue'
import AnchorPositionPropertyField from './fields/AnchorPositionPropertyField.vue'
import ArrayPropertyField from './fields/ArrayPropertyField.vue'
import BooleanPropertyField from './fields/BooleanPropertyField.vue'
import ColorPropertyField from './fields/ColorPropertyField.vue'
import FilePathPropertyField from './fields/FilePathPropertyField.vue'
import FlowDirectionPropertyField from './fields/FlowDirectionPropertyField.vue'
import NumberPropertyField from './fields/NumberPropertyField.vue'
import NumberSliderPropertyField from './fields/NumberSliderPropertyField.vue'
import ObjectPropertyField from './fields/ObjectPropertyField.vue'
import ReferenceStringPropertyField from './fields/ReferenceStringPropertyField.vue'
import StringPropertyField from './fields/StringPropertyField.vue'
import VerticalAlignPositionPropertyField from './fields/VerticalAlignPositionPropertyField.vue'

type PropertyFieldEditorRegistration = {
  component: Component
  icon: IconToken
  readonlyPresenter: (value: unknown) => string
}

const formatReadonlyValue = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}
const formatReadonlyBoolean = (value: unknown): string => value === true ? 'true' : value === false ? 'false' : formatReadonlyValue(value)

const RichTextStringPropertyField = defineAsyncComponent(
  () => import('./fields/RichTextStringPropertyField.vue'),
)

const propertyFieldEditorMap: Record<BasePropertyFieldType, PropertyFieldEditorRegistration> = {
  string: { component: StringPropertyField, icon: 'data.symbol-string', readonlyPresenter: formatReadonlyValue },
  anchorPosition: { component: AnchorPositionPropertyField, icon: 'nav.compass', readonlyPresenter: formatReadonlyValue },
  alignPosition: { component: AlignPositionPropertyField, icon: 'data.list-selection', readonlyPresenter: formatReadonlyValue },
  verticalAlignPosition: { component: VerticalAlignPositionPropertyField, icon: 'data.layers', readonlyPresenter: formatReadonlyValue },
  flowDirection: { component: FlowDirectionPropertyField, icon: 'nav.arrow-right', readonlyPresenter: formatReadonlyValue },
  number: { component: NumberPropertyField, icon: 'data.symbol-number', readonlyPresenter: formatReadonlyValue },
  boolean: { component: BooleanPropertyField, icon: 'data.symbol-boolean', readonlyPresenter: formatReadonlyBoolean },
  color: { component: ColorPropertyField, icon: 'data.symbol-color', readonlyPresenter: formatReadonlyValue },
  filePath: { component: FilePathPropertyField, icon: 'file.generic', readonlyPresenter: formatReadonlyValue },
  object: { component: ObjectPropertyField, icon: 'data.symbol-class', readonlyPresenter: formatReadonlyValue },
}

export function getPropertyFieldIcon(fieldType: PropertyFieldType): IconToken {
  const resolvedType = isArrayPropertyFieldType(fieldType)
    ? getArrayElementFieldType(fieldType)
    : fieldType
  return (propertyFieldEditorMap[resolvedType] ?? propertyFieldEditorMap.string).icon
}

export function formatPropertyFieldReadonlyValue(definition: PropertyEditorFieldDefinition, value: unknown): string {
  const resolvedType = isArrayPropertyFieldType(definition.fieldType)
    ? getArrayElementFieldType(definition.fieldType)
    : definition.fieldType
  return (propertyFieldEditorMap[resolvedType] ?? propertyFieldEditorMap.string).readonlyPresenter(value)
}

export function getPropertyFieldComponent(definition: PropertyEditorFieldDefinition): Component {
  if (definition.fieldType === 'number' && definition.presentation === 'slider') {
    return NumberSliderPropertyField
  }
  if (definition.fieldType === 'string' && definition.richText) return RichTextStringPropertyField
  if (definition.fieldType === 'string' && !definition.options
    && (definition.completion?.provider || definition.listSeparator)) {
    return ReferenceStringPropertyField
  }
  if (isArrayPropertyFieldType(definition.fieldType)) return ArrayPropertyField
  return (propertyFieldEditorMap[definition.fieldType] ?? propertyFieldEditorMap.string).component
}

export function getArrayPropertyElementComponent(fieldType: PropertyFieldType): Component {
  if (!isArrayPropertyFieldType(fieldType)) return propertyFieldEditorMap.string.component
  return propertyFieldEditorMap[getArrayElementFieldType(fieldType)].component
}

export function toArrayPropertyElementDefinition(
  definition: PropertyEditorFieldDefinition,
): Extract<PropertyEditorFieldDefinition, { fieldType: BasePropertyFieldType }> {
  if (!isArrayPropertyFieldType(definition.fieldType)) {
    throw new Error(`Expected an array field type, received "${definition.fieldType}"`)
  }
  const fieldType = getArrayElementFieldType(definition.fieldType)
  const defaultValue = fieldType === 'boolean'
    ? 'false'
    : fieldType === 'number'
      ? '0'
      : ''
  return {
    ...definition,
    fieldType,
    defaultValue,
  } as Extract<PropertyEditorFieldDefinition, { fieldType: BasePropertyFieldType }>
}
