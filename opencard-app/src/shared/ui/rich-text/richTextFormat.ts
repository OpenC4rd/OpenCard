import type { FilePathDirectoryProvider } from '../../model/filePath'
import type { RichTextFormatValue } from './useRichTextFormatting'
import type {
  PropertyCompletionProvider,
  PropertyEditorCategoryDefinition,
  PropertyEditorFieldDefinition,
  PropertyEditorInput,
} from '../property-editor/propertyEditor.types'

export type RichTextFormatLabels = (key: string, fallback: string) => string

export type RichTextFormatOptions = {
  fontField: PropertyEditorFieldDefinition
  fontSizeField: PropertyEditorFieldDefinition
  strokeWidthField: PropertyEditorFieldDefinition
  imageDirectoryProvider?: FilePathDirectoryProvider
  imageCompletionProvider?: PropertyCompletionProvider
  lengthCompletionProvider: PropertyCompletionProvider
}

export const richTextFormatCategories = (labels: RichTextFormatLabels): Map<string, PropertyEditorCategoryDefinition> => new Map([
  ['typography', { title: labels('propertyEditor.richText.groupTypography', '字体') }],
  ['foreground', { title: labels('propertyEditor.richText.groupColorAndFill', '前景色') }],
  ['background', { title: labels('propertyEditor.richText.groupBackground', '文字背景') }],
  ['outline', { title: labels('propertyEditor.richText.groupOutline', '轮廓') }],
  ['shadow', { title: labels('propertyEditor.richText.groupShadow', '阴影') }],
  ['paragraph', { title: labels('propertyEditor.richText.groupParagraph', '段落') }],
])

export function createRichTextFormatInput(options: {
  labels: RichTextFormatLabels
  title: string
  state: Readonly<Record<string, RichTextFormatValue>>
  fields: RichTextFormatOptions
}): PropertyEditorInput {
  const { labels, state } = options
  const record = Object.fromEntries(Object.entries(state).map(([key, entry]) => [key, entry.value]))
  const format = options.fields
  const foregroundType = record.foregroundType
  const fields: Record<string, PropertyEditorFieldDefinition> = {
    fontFamily: { ...format.fontField, title: labels('propertyEditor.richText.family', '名称'), category: 'typography' },
    fontSize: { ...format.fontSizeField, title: labels('propertyEditor.richText.size', '大小'), category: 'typography' },
    foregroundType: {
      title: labels('propertyEditor.richText.fill', '类型'),
      fieldType: 'string', category: 'foreground', presentation: 'select',
      options: ['solid', 'image'],
      optionLabels: {
        solid: labels('propertyEditor.richText.fillSolid', '纯色'),
        image: labels('propertyEditor.richText.fillImage', '图片'),
      },
    },
    ...foregroundType === 'solid' ? {
      foregroundColor: {
        title: labels('propertyEditor.richText.color', '颜色'),
        fieldType: 'color', category: 'foreground', allowAlpha: true,
      } satisfies PropertyEditorFieldDefinition,
    } : {},
    backgroundColor: {
      title: labels('propertyEditor.richText.color', '颜色'),
      fieldType: 'color', category: 'background', allowAlpha: true,
    },
    ...foregroundType === 'image' ? {
      foregroundSource: {
        title: labels('propertyEditor.richText.fillSource', '来源'),
        fieldType: 'filePath', category: 'foreground',
        directoryProvider: format.imageDirectoryProvider,
        completion: format.imageCompletionProvider ? { provider: format.imageCompletionProvider } : undefined,
      } satisfies PropertyEditorFieldDefinition,
    } : {},
    strokeWidth: { ...format.strokeWidthField, title: labels('propertyEditor.richText.width', '宽度'), category: 'outline' },
    strokeColor: {
      title: labels('propertyEditor.richText.color', '颜色'),
      fieldType: 'color', category: 'outline', allowAlpha: true,
    },
    shadowColor: {
      title: labels('propertyEditor.richText.color', '颜色'),
      fieldType: 'color', category: 'shadow', allowAlpha: true,
    },
    shadowOffsetX: {
      title: labels('propertyEditor.richText.shadowOffsetX', '水平偏移'),
      fieldType: 'string', category: 'shadow', commitMode: 'blur',
      completion: { provider: format.lengthCompletionProvider },
    },
    shadowOffsetY: {
      title: labels('propertyEditor.richText.shadowOffsetY', '垂直偏移'),
      fieldType: 'string', category: 'shadow', commitMode: 'blur',
      completion: { provider: format.lengthCompletionProvider },
    },
    shadowBlur: {
      title: labels('propertyEditor.richText.shadowBlur', '模糊'),
      fieldType: 'string', category: 'shadow', commitMode: 'blur',
      completion: { provider: format.lengthCompletionProvider },
    },
    textAlign: {
      title: labels('propertyEditor.richText.alignment', '对齐'),
      fieldType: 'string', category: 'paragraph', presentation: 'select',
      options: ['left', 'center', 'right', 'justify'],
      optionLabels: {
        left: labels('propertyEditor.richText.alignLeft', '左对齐'),
        center: labels('propertyEditor.richText.alignCenter', '居中'),
        right: labels('propertyEditor.richText.alignRight', '右对齐'),
        justify: labels('propertyEditor.richText.alignJustify', '两端对齐'),
      },
    },
  }
  for (const [order, [key, field]] of Object.entries(fields).entries()) {
    field.order = order
    field.valueState = state[key]?.kind
    field.resettable = state[key]?.explicit ?? false
    if (field.fieldType === 'string' || field.fieldType === 'color') {
      field.placeholder = state[key]?.kind === 'mixed'
        ? labels('propertyEditor.richText.mixed', '混合')
        : state[key]?.kind === 'unset' ? labels('propertyEditor.richText.inherited', '继承') : undefined
    }
  }
  return {
    key: 'rich-text-selection',
    title: options.title,
    record,
    fields,
  }
}
