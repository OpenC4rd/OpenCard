import type { IconToken } from '../icon/iconRegistry'
import type { FilePathFilter, FilePathScope } from '../../model/filePath'
import type { OcNodeTailDisplayPart } from '../node/node.types'
import type { OcActionDefinition } from '../action/action.types'

export type PropertyEditorSortMode = 'category' | 'alphabetical'

type PropertyInputPair = {
  open: string
  close: string
}

type PropertyCompletionRequest = {
  value: string
  cursor: number
}

export type PropertyCompletionItem = {
  key: string
  label: string
  detail?: string
  icon?: IconToken
  thumbnailStyle?: Readonly<Record<string, string>>
  thumbnailLabel?: string
  labelStyle?: Readonly<Record<string, string>>
  insertText: string
  /**
   * Range this item replaces when the result's range does not fit it: an item that rewrites the
   * whole token (rather than the part after a fixed prefix) carries its own range.
   */
  replaceStart?: number
  replaceEnd?: number
  value?: unknown
  keepOpen?: boolean
}

export type PropertyCompletionResult = {
  replaceStart: number
  replaceEnd: number
  items: readonly PropertyCompletionItem[]
  parent?: PropertyCompletionItem
}

export type PropertyCompletionProvider = (
  request: PropertyCompletionRequest,
) => PropertyCompletionResult | null | Promise<PropertyCompletionResult | null>

type PropertyCompletion = {
  static?: {
    values: readonly string[]
    presentation?: 'ghost' | 'menu'
  }
  provider?: PropertyCompletionProvider
}

export type PropertyFontEntry = {
  key: string
  label: string
  value: string
  cssFamily?: string
  detail?: string
}

export type PropertyFontScope = {
  key: string
  label: string
  packageKey: string | null
  entries: readonly PropertyFontEntry[]
  previewCss?: string
}

export type PropertyIconEntry = {
  key: string
  name: string
  seriesKey: string
  iconKey: string
  /** 写入字段的完整图标引用（如 `icon:<series>/<icon>` 或 `<coord>#icon:<series>/<icon>`）。 */
  value: string
  /** 富文本 `<span data-oc-icon-path="...">` 使用的图标路径（如 `<series>/<icon>` 或 `<coord>#<series>/<icon>`）。 */
  iconPath: string
  /** 行内文本/节点渲染用的样式。 */
  inlineStyle: Readonly<Record<string, string>>
  /** 按钮/缩略图预览用的样式。 */
  previewStyle: Readonly<Record<string, string>>
}

type PropertyIconSeriesGroup = {
  key: string
  name: string
  entries: readonly PropertyIconEntry[]
}

export type PropertyIconScope = {
  key: string
  label: string
  packageKey: string | null
  series: readonly PropertyIconSeriesGroup[]
}

export type PropertyCustomBlockEntry = {
  key: string
  name: string
  collectionKey: string
  blockKey: string
  /** 写入字段的完整引用（如 `block:<collection>/<block>` 或 `<coord>#block:<collection>/<block>`）。 */
  value: string
  source?: string
}

export type PropertyCustomBlockCollectionGroup = {
  key: string
  name: string
  entries: readonly PropertyCustomBlockEntry[]
}

export type PropertyCustomBlockScope = {
  key: string
  label: string
  packageKey: string | null
  collections: readonly PropertyCustomBlockCollectionGroup[]
}

export type PropertyFieldCapabilities = {
  files?: readonly FilePathScope[]
  fonts?: readonly PropertyFontScope[]
  icons?: readonly PropertyIconScope[]
  customBlocks?: readonly PropertyCustomBlockScope[]
  resolveImagePreview?: (reference: string) => string | null
}

type PropertyFieldConstraintMap = {
  string: {
    minLength?: number
    maxLength?: number
    options?: readonly string[]
    optionLabelKeys?: Readonly<Record<string, string>>
    presentation?: 'input' | 'select' | 'stepper' | 'option-group'
    optionLabels?: Readonly<Record<string, string>>
    placeholder?: string
    multiline?: boolean
    /** 多项输入的分隔符。设置后这个字段按分隔符分项编辑：回车或该分隔符成一项，值仍是单个字符串。 */
    listSeparator?: 'semicolon' | 'comma' | 'newline'
    /** 判断一项是否可用；不可用项会被标出，输入框也带 aria-invalid。 */
    listInvalid?: (token: string) => boolean
  }
  richText: {
    minLength?: number
    maxLength?: number
    placeholder?: string
    baseStyle?: {
      fontFamily?: string
      fontSize?: string
    }
  }
  filePath: {
    minLength?: number
    maxLength?: number
    placeholder?: string
    root?: string
    filter?: FilePathFilter
  }
  imageSource: {
    minLength?: number
    maxLength?: number
    placeholder?: string
    root?: string
    filter?: FilePathFilter
  }
  fontFamily: {
    placeholder?: string
  }
  customBlockSource: {
    placeholder?: string
    root?: string
    filter?: FilePathFilter
  }
  anchorPosition: Record<never, never>
  alignPosition: Record<never, never>
  verticalAlignPosition: Record<never, never>
  flowDirection: Record<never, never>
  number: {
    min?: number
    max?: number
    step?: number
    allowedValues?: readonly number[]
    presentation?: 'input' | 'slider'
    ticks?: readonly number[]
    suffix?: string
  }
  boolean: Record<never, never>
  color: {
    allowAlpha?: boolean
    placeholder?: string
  }
  object: {
    isArray?: boolean
  }
}

export type BasePropertyFieldType = keyof PropertyFieldConstraintMap
type PropertyArrayElementType = Extract<
  BasePropertyFieldType,
  | 'string'
  | 'richText'
  | 'filePath'
  | 'imageSource'
  | 'fontFamily'
  | 'customBlockSource'
  | 'number'
  | 'boolean'
  | 'color'
>
type PropertyArrayFieldType = `${PropertyArrayElementType}[]`
export type PropertyFieldType = BasePropertyFieldType | PropertyArrayFieldType

type PropertyEditorFieldBase = {
  title: string
  /** 覆盖按 fieldType 注册的字段图标；缺省时用类型图标。 */
  icon?: IconToken
  /** Display state of a projected value; never written back as field data. */
  valueState?: 'unset' | 'value' | 'mixed'
  category?: string
  order?: number
  defaultValue?: unknown
  unremovable?: boolean
  isHidden?: boolean
  isReadonly?: boolean
  /** Whether this field may switch to the raw string editor; omitted inherits PropertyEditor. */
  allowRawStringEditor?: boolean
  commitMode?: 'input' | 'blur'
  resettable?: boolean
  autoPairs?: readonly PropertyInputPair[]
  completion?: PropertyCompletion
  binding?: {
    provider?: PropertyCompletionProvider
  }
  /** Display-only tail; a property row's commands go through its action rail instead. */
  tail?: OcNodeTailDisplayPart | readonly OcNodeTailDisplayPart[]
}

type ScalarPropertyEditorFieldDefinition = {
  [K in BasePropertyFieldType]: PropertyEditorFieldBase & {
    fieldType: K
  } & PropertyFieldConstraintMap[K]
}[BasePropertyFieldType]

type ArrayPropertyEditorFieldDefinition = {
  [K in PropertyArrayElementType]: PropertyEditorFieldBase & {
    fieldType: `${K}[]`
  } & PropertyFieldConstraintMap[K]
}[PropertyArrayElementType]

export type PropertyEditorFieldDefinition =
  | ScalarPropertyEditorFieldDefinition
  | ArrayPropertyEditorFieldDefinition

export function isArrayPropertyFieldType(fieldType: PropertyFieldType): fieldType is PropertyArrayFieldType {
  return fieldType.endsWith('[]') && !fieldType.slice(0, -2).endsWith('[]')
}

export function getArrayElementFieldType(fieldType: PropertyArrayFieldType): PropertyArrayElementType {
  return fieldType.slice(0, -2) as PropertyArrayElementType
}

export type PropertyEditorBindingInterpreter = {
  isExpression(value: unknown): boolean
}

type PropertyEditorRecord = Readonly<Record<string, unknown>>

export type PropertyEditorInput = {
  key: string
  title?: string
  record: PropertyEditorRecord
  fields: Readonly<Record<string, PropertyEditorFieldDefinition>>
}

export type PropertyEditorCategoryDefinition = {
  title: string
  icon?: IconToken
}

export type PropertyEditorMutation = {
  key: string
  fieldKey: string
  value: unknown
}

export type PropertyEditorAddMutation = Omit<PropertyEditorMutation, 'value'>

export type PropertyEditorFieldIntent = {
  key: string
  fieldKey: string
}

export type EditorItemEditorPart = {
  type: 'editor'
  key: string
  definition: PropertyEditorFieldDefinition
  value: unknown
}

type EditorItemActionPart = OcActionDefinition & {
  type: 'action'
  iconOnly: boolean
  variant: 'solid' | 'soft' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

/** 只读用量展示：value/max 决定填充比例，max 为 null 表示无上限（不画填充）。 */
export type EditorItemMeterPart = {
  type: 'meter'
  key: string
  value: number
  max: number | null
  text: string
}

export type EditorItemPart = string | EditorItemEditorPart | EditorItemActionPart | EditorItemMeterPart

export interface EditorItem {
  key: string
  title: string
  /** 标题下的次要说明：标题保持简短，解释放这里。 */
  subtitle?: string
  content?: readonly EditorItemPart[]
  children?: readonly EditorItem[]
}

export type EditorItemValueIntent = {
  itemPath: readonly string[]
  editorKey: string
  value: unknown
}

export type EditorItemCancelIntent = Omit<EditorItemValueIntent, 'value'>

export type EditorItemActionIntent = {
  itemPath: readonly string[]
  actionKey: string
}
