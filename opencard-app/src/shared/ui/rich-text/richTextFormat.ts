import type { FilePathDirectoryProvider } from '../../model/filePath'
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
  ['typography', { title: labels('propertyEditor.richText.groupTypography', '文字') }],
  ['fill', { title: labels('propertyEditor.richText.groupColorAndFill', '填充') }],
  ['outline', { title: labels('propertyEditor.richText.groupOutline', '轮廓') }],
  ['shadow', { title: labels('propertyEditor.richText.groupShadow', '阴影') }],
])

export function createRichTextFormatInput(options: {
  labels: RichTextFormatLabels
  record: Readonly<Record<string, string>>
  fields: RichTextFormatOptions
}): PropertyEditorInput {
  const { labels, record } = options
  const format = options.fields
  const fillType = record.fillType
  const fields: Record<string, PropertyEditorFieldDefinition> = {
    fontFamily: { ...format.fontField, category: 'typography' },
    fontSize: { ...format.fontSizeField, category: 'typography' },
    color: {
      title: labels('propertyEditor.richText.foregroundColor', '文字颜色'),
      fieldType: 'color', category: 'typography', allowAlpha: true,
    },
    fillType: {
      title: labels('propertyEditor.richText.fill', '填充方式'),
      fieldType: 'string', category: 'fill', presentation: 'select',
      options: ['none', 'solid', 'image'],
      optionLabels: {
        none: labels('propertyEditor.richText.fillNone', '无填充'),
        solid: labels('propertyEditor.richText.fillSolid', '纯色填充'),
        image: labels('propertyEditor.richText.fillImage', '图片填充'),
      },
    },
    ...fillType === 'solid' ? {
      backgroundColor: {
        title: labels('propertyEditor.richText.textBackgroundColor', '填充颜色'),
        fieldType: 'color', category: 'fill', allowAlpha: true,
      } satisfies PropertyEditorFieldDefinition,
    } : {},
    ...fillType === 'image' ? {
      fillSource: {
        title: labels('propertyEditor.richText.fillSource', '图片来源'),
        fieldType: 'filePath', category: 'fill',
        directoryProvider: format.imageDirectoryProvider,
        completion: format.imageCompletionProvider ? { provider: format.imageCompletionProvider } : undefined,
      } satisfies PropertyEditorFieldDefinition,
    } : {},
    strokeWidth: { ...format.strokeWidthField, category: 'outline' },
    strokeColor: {
      title: labels('propertyEditor.richText.strokeColor', '描边颜色'),
      fieldType: 'color', category: 'outline', allowAlpha: true,
    },
    shadowColor: {
      title: labels('propertyEditor.richText.shadowColor', '阴影颜色'),
      fieldType: 'color', category: 'shadow', allowAlpha: true,
    },
    shadowOffsetX: {
      title: labels('propertyEditor.richText.shadowOffsetX', '水平偏移'),
      fieldType: 'string', category: 'shadow',
      completion: { provider: format.lengthCompletionProvider },
    },
    shadowOffsetY: {
      title: labels('propertyEditor.richText.shadowOffsetY', '垂直偏移'),
      fieldType: 'string', category: 'shadow',
      completion: { provider: format.lengthCompletionProvider },
    },
    shadowBlur: {
      title: labels('propertyEditor.richText.shadowBlur', '模糊'),
      fieldType: 'string', category: 'shadow',
      completion: { provider: format.lengthCompletionProvider },
    },
  }
  return {
    key: 'rich-text-selection',
    title: labels('propertyEditor.richText.selectionProperties', '选中文本'),
    record,
    fields,
  }
}
