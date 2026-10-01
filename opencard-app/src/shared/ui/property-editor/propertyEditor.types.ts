import type { IconToken } from '../icon/iconRegistry'
import type { FilePathDirectoryProvider, FilePathFilter } from '../../model/filePath'
import type { ProjectIconCatalog } from '../../../features/workspace/services/projectIconCatalog'
import type { ProjectIconSource } from '../../../features/workspace/services/projectIconCompletion'
import type { OcNodeTailDisplayPart } from '../node/node.types'
import type { OcActionDefinition } from '../action/action.types'

export type PropertyEditorSortMode = 'category' | 'alphabetical'

export type PropertyInputPair = {
  open: string
  close: string
}

export type PropertyCompletionRequest = {
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

export type PropertyCompletion = {
  static?: {
    values: readonly string[]
    presentation?: 'ghost' | 'menu'
  }
  provider?: PropertyCompletionProvider
}

export type PropertyFieldConstraintMap = {
  string: {
    minLength?: number
    maxLength?: number
    options?: readonly string[]
    optionLabelKeys?: Readonly<Record<string, string>>
    presentation?: 'input' | 'select' | 'stepper' | 'option-group'
    optionLabels?: Readonly<Record<string, string>>
    placeholder?: string
    multiline?: boolean
    richText?: boolean
    /** 多项输入的分隔符。设置后这个字段按分隔符分项编辑：回车或该分隔符成一项，值仍是单个字符串。 */
    listSeparator?: 'semicolon' | 'comma' | 'newline'
    /** 判断一项是否可用；不可用项会被标出，输入框也带 aria-invalid。 */
    listInvalid?: (token: string) => boolean
  }
  filePath: {
    minLength?: number
    maxLength?: number
    filter?: FilePathFilter
    directoryProvider?: FilePathDirectoryProvider
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
  }
  object: {
    isArray?: boolean
  }
}

export type BasePropertyFieldType = keyof PropertyFieldConstraintMap
export type PropertyArrayElementType = Extract<
  BasePropertyFieldType,
  'string' | 'filePath' | 'number' | 'boolean' | 'color'
>
export type PropertyArrayFieldType = `${PropertyArrayElementType}[]`
export type PropertyFieldType = BasePropertyFieldType | PropertyArrayFieldType

type PropertyEditorFieldBase = {
  title: string
  category?: string
  order?: number
  defaultValue?: unknown
  required?: boolean
  isHidden?: boolean
  isReadonly?: boolean
  commitMode?: 'input' | 'blur'
  resettable?: boolean
  deletable?: boolean
  autoPairs?: readonly PropertyInputPair[]
  completion?: PropertyCompletion
  fontOptions?: readonly {
    label: string
    value: string
    cssFamily?: string
  }[]
  richTextBaseStyle?: {
    fontFamily?: string
    fontSize?: string
  }
  binding?: {
    provider?: PropertyCompletionProvider
  }
  projectIcon?: {
    provider?: PropertyCompletionProvider
    catalog?: ProjectIconCatalog
    /** Icon sources the editor may offer: the current project first, then packages that ship icons. */
    sources?: readonly ProjectIconSource[]
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

export type PropertyEditorRecord = Readonly<Record<string, unknown>>

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

export type EditorItemActionPart = OcActionDefinition & {
  type: 'action'
  iconOnly: boolean
  variant: 'solid' | 'soft' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export type EditorItemPart = string | EditorItemEditorPart | EditorItemActionPart

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
