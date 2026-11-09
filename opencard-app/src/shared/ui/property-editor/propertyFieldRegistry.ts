import { defineAsyncComponent, type Component } from 'vue'
import type { IconToken } from '../icon/iconRegistry'
import type {
  BasePropertyFieldType,
  PropertyEditorFieldDefinition,
  PropertyFieldType,
} from './propertyEditor.types'
import {
  getArrayElementFieldType,
  getBasePropertyFieldType,
  isArrayPropertyFieldType,
} from './propertyEditor.types'
import AlignPositionPropertyField from './fields/AlignPositionPropertyField.vue'
import AnchorPositionPropertyField from './fields/AnchorPositionPropertyField.vue'
import ArrayPropertyField from './fields/ArrayPropertyField.vue'
import BooleanPropertyField from './fields/BooleanPropertyField.vue'
import ColorPropertyField from './fields/ColorPropertyField.vue'
import CustomBlockSourcePropertyField from './fields/CustomBlockSourcePropertyField.vue'
import FilePathPropertyField from './fields/FilePathPropertyField.vue'
import FlowDirectionPropertyField from './fields/FlowDirectionPropertyField.vue'
import FontFamilyPropertyField from './fields/FontFamilyPropertyField.vue'
import ImageSourcePropertyField from './fields/ImageSourcePropertyField.vue'
import NumberPropertyField from './fields/NumberPropertyField.vue'
import NumberSliderPropertyField from './fields/NumberSliderPropertyField.vue'
import ObjectPropertyField from './fields/ObjectPropertyField.vue'
import ReferenceStringTokenField from './fields/ReferenceStringTokenField.vue'
import StringPropertyField from './fields/StringPropertyField.vue'
import VerticalAlignPositionPropertyField from './fields/VerticalAlignPositionPropertyField.vue'

type PropertyFieldEditorRegistration = {
  component: Component
  icon: IconToken
  readonlyPresenter: (value: unknown) => string
  /** 列表新增一项时写入的值。 */
  emptyValue: unknown
}

const formatReadonlyValue = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}
const formatReadonlyBoolean = (value: unknown): string =>
  value === true ? 'true' : value === false ? 'false' : formatReadonlyValue(value)

const RichTextPropertyField = defineAsyncComponent(
  () => import('./fields/RichTextPropertyField.vue'),
)

const propertyFieldEditorMap: Record<BasePropertyFieldType, PropertyFieldEditorRegistration> = {
  string: { component: StringPropertyField, icon: 'mdiFormatText', readonlyPresenter: formatReadonlyValue, emptyValue: '' },
  richText: { component: RichTextPropertyField, icon: 'mdiFormatTextVariantOutline', readonlyPresenter: formatReadonlyValue, emptyValue: '' },
  filePath: { component: FilePathPropertyField, icon: 'mdiFileOutline', readonlyPresenter: formatReadonlyValue, emptyValue: '' },
  imageSource: { component: ImageSourcePropertyField, icon: 'mdiImageOutline', readonlyPresenter: formatReadonlyValue, emptyValue: '' },
  fontFamily: { component: FontFamilyPropertyField, icon: 'mdiFormatFont', readonlyPresenter: formatReadonlyValue, emptyValue: '' },
  customBlockSource: { component: CustomBlockSourcePropertyField, icon: 'mdiToyBrickOutline', readonlyPresenter: formatReadonlyValue, emptyValue: '' },
  anchorPosition: { component: AnchorPositionPropertyField, icon: 'mdiCompassOutline', readonlyPresenter: formatReadonlyValue, emptyValue: 'cc' },
  alignPosition: { component: AlignPositionPropertyField, icon: 'mdiFormatListBulletedSquare', readonlyPresenter: formatReadonlyValue, emptyValue: 'start' },
  verticalAlignPosition: { component: VerticalAlignPositionPropertyField, icon: 'mdiLayersOutline', readonlyPresenter: formatReadonlyValue, emptyValue: 'top' },
  flowDirection: { component: FlowDirectionPropertyField, icon: 'mdiArrowRight', readonlyPresenter: formatReadonlyValue, emptyValue: 'lr' },
  number: { component: NumberPropertyField, icon: 'mdiNumeric', readonlyPresenter: formatReadonlyValue, emptyValue: '0' },
  boolean: { component: BooleanPropertyField, icon: 'mdiToggleSwitchOutline', readonlyPresenter: formatReadonlyBoolean, emptyValue: 'false' },
  color: { component: ColorPropertyField, icon: 'mdiPaletteOutline', readonlyPresenter: formatReadonlyValue, emptyValue: '' },
  object: { component: ObjectPropertyField, icon: 'mdiCodeBraces', readonlyPresenter: formatReadonlyValue, emptyValue: {} },
}

/** 字段定义自带的 icon 优先，缺省时才按类型注册表取。 */
export function getPropertyFieldIcon(definition: {
  fieldType: PropertyFieldType
  icon?: IconToken
}): IconToken {
  if (definition.icon) return definition.icon
  return (propertyFieldEditorMap[getBasePropertyFieldType(definition.fieldType)] ?? propertyFieldEditorMap.string).icon
}

export function formatPropertyFieldReadonlyValue(definition: PropertyEditorFieldDefinition, value: unknown): string {
  // 枚举要显示和编辑时一样的文字，不能露出内部取值。
  const label = 'optionLabels' in definition ? definition.optionLabels?.[String(value)] : undefined
  if (label) return label
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value.join('\n')
  const text = (propertyFieldEditorMap[getBasePropertyFieldType(definition.fieldType)] ?? propertyFieldEditorMap.string).readonlyPresenter(value)
  return 'suffix' in definition && definition.suffix && text ? `${text} ${definition.suffix}` : text
}

export function getPropertyFieldComponent(definition: PropertyEditorFieldDefinition): Component {
  if (definition.fieldType === 'string[]' && definition.listSeparator) return ReferenceStringTokenField
  if (definition.fieldType === 'number' && definition.presentation === 'slider') {
    return NumberSliderPropertyField
  }
  if (isArrayPropertyFieldType(definition.fieldType)) return ArrayPropertyField
  return (propertyFieldEditorMap[definition.fieldType] ?? propertyFieldEditorMap.string).component
}

export function toArrayPropertyElementDefinition(
  definition: PropertyEditorFieldDefinition,
): PropertyEditorFieldDefinition {
  if (!isArrayPropertyFieldType(definition.fieldType)) {
    throw new Error(`Expected an array field type, received "${definition.fieldType}"`)
  }
  const fieldType = getArrayElementFieldType(definition.fieldType)
  if (isArrayPropertyFieldType(fieldType)) return { ...definition, fieldType, defaultValue: [] } as PropertyEditorFieldDefinition
  const firstOption = 'options' in definition ? definition.options?.[0] : undefined
  const minimum = 'min' in definition && definition.min !== undefined ? String(definition.min) : undefined
  return {
    ...definition,
    fieldType,
    defaultValue: firstOption ?? minimum ?? propertyFieldEditorMap[fieldType].emptyValue,
  } as PropertyEditorFieldDefinition
}
