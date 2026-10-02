import { describe, expect, it } from 'vitest'
import {
  acceptsPropertyBinding,
  additionalFieldTypes,
  createPropertyDefaultValue,
  exposesPropertyReference,
  getPropertyValueKind,
  getTypePropertyEditorSchema,
  isReferenceFieldExposed,
  propertyEditorCategoryDefinitions,
} from './schema'

describe('property binding schema policy', () => {
  function visibleFieldsByCategory(typeName: string): Record<string, string[]> {
    const groups: Record<string, string[]> = {}
    for (const [fieldKey, definition] of Object.entries(getTypePropertyEditorSchema(typeName))) {
      if (definition.isHidden) continue
      const category = definition.categoryId ?? 'uncategorized'
      ;(groups[category] ??= []).push(fieldKey)
    }
    return groups
  }

  it('allows scalar fields by default and requires explicit blacklisting', () => {
    const schema = getTypePropertyEditorSchema('text-block')

    expect(acceptsPropertyBinding(schema.content)).toBe(true)
    expect(exposesPropertyReference(schema.content)).toBe(true)
    expect(acceptsPropertyBinding(schema.type)).toBe(false)
    expect(exposesPropertyReference(schema.type)).toBe(false)
    expect(acceptsPropertyBinding(undefined)).toBe(true)
    expect(exposesPropertyReference(undefined)).toBe(true)
  })

  it('never exposes object fields and derives primitive value kinds', () => {
    const containerSchema = getTypePropertyEditorSchema('simple-container-block')
    const textSchema = getTypePropertyEditorSchema('text-block')

    expect(acceptsPropertyBinding(containerSchema.children)).toBe(false)
    expect(isReferenceFieldExposed('simple-container-block', 'children')).toBe(false)
    expect(getPropertyValueKind(textSchema.opacity)).toBe('number')
    expect(getPropertyValueKind(textSchema.content)).toBe('string')
  })

  it('exposes face background but hides face structure and document faces', () => {
    const faceSchema = getTypePropertyEditorSchema('card-face')
    const documentSchema = getTypePropertyEditorSchema('card-document')

    expect(exposesPropertyReference(faceSchema.background)).toBe(true)
    expect(acceptsPropertyBinding(faceSchema.children)).toBe(false)
    expect(exposesPropertyReference(documentSchema.faces)).toBe(false)
    expect(documentSchema).not.toHaveProperty('schemaVersion')
  })

  it('keeps optional document metadata addable in one category', () => {
    const schema = getTypePropertyEditorSchema('card-document')

    expect(schema.name).toMatchObject({ fieldType: 'string', categoryId: 'general' })
    expect(schema.description).toMatchObject({
      fieldType: 'string',
      categoryId: 'general',
      multiline: true,
    })
    expect(schema.notes).toMatchObject({
      fieldType: 'string',
      categoryId: 'general',
      multiline: true,
    })
    expect(schema.name?.deletable).toBeUndefined()
    expect(schema.description?.deletable).toBeUndefined()
    expect(schema.notes?.deletable).toBeUndefined()
    for (const fieldKey of ['name', 'description', 'notes', 'version', 'width', 'height']) {
      expect(schema[fieldKey]?.bindingScopes).toEqual(['project'])
    }
    expect(schema.name?.defaultValue).toBeUndefined()
    expect(schema.description?.defaultValue).toBeUndefined()
    expect(schema.notes?.defaultValue).toBeUndefined()
  })

  it('uses the standard fieldType system for every creatable additional field', () => {
    expect(additionalFieldTypes).toEqual([
      'string',
      'filePath',
      'anchorPosition',
      'alignPosition',
      'verticalAlignPosition',
      'flowDirection',
      'number',
      'boolean',
      'color',
    ])
    expect(createPropertyDefaultValue({ fieldType: 'number' })).toBe('0')
    expect(createPropertyDefaultValue({ fieldType: 'boolean' })).toBe('false')
  })

  it('defines notes and visibility for every block type', () => {
    const blockTypes = [
      'text-block',
      'markdown-text-block',
      'image-block',
      'qrcode-block',
      'shape-block',
      'simple-container-block',
      'flow-container-block',
    ]

    for (const blockType of blockTypes) {
      const schema = getTypePropertyEditorSchema(blockType)
      expect(schema.notes).toMatchObject({ fieldType: 'string', multiline: true, defaultValue: '' })
      expect(schema.visible).toMatchObject({ fieldType: 'boolean', defaultValue: 'true' })
    }
  })

  it('groups disputed visual fields by their user-facing editing task', () => {
    const textSchema = getTypePropertyEditorSchema('text-block')
    const shapeSchema = getTypePropertyEditorSchema('shape-block')

    expect(textSchema.fontFamily?.categoryId).toBe('textStyle')
    expect(textSchema.fontSize?.categoryId).toBe('textStyle')
    expect(textSchema.fontWeight?.categoryId).toBe('textStyle')
    expect(textSchema.color?.categoryId).toBe('textStyle')
    expect(textSchema.textAlign?.categoryId).toBe('textLayout')
    expect(textSchema.customCss?.categoryId).toBe('advanced')
    expect(shapeSchema.shape?.categoryId).toBe('content')
    expect(shapeSchema.fill?.categoryId).toBe('graphicStyle')
    expect(getTypePropertyEditorSchema('flow-container-block').clip?.categoryId).toBe('container')
  })

  it('maps every visible Block and Location field to the task-oriented category contract', () => {
    const commonBlock = {
      general: ['name', 'notes'],
      size: ['width', 'height'],
      transform: ['transformAnchor', 'translateX', 'translateY', 'rotation', 'scaleX', 'scaleY'],
      layer: ['visible', 'zIndex', 'opacity'],
      surface: ['background', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius'],
      advanced: ['customCss'],
    }
    const expected = {
      'text-block': {
        ...commonBlock,
        content: ['content'],
        textStyle: ['fontFamily', 'fontSize', 'fontWeight', 'color'],
        textLayout: ['lineHeight', 'textAlign', 'verticalAlign', 'writingMode'],
      },
      'markdown-text-block': {
        ...commonBlock,
        content: ['content'],
        textStyle: ['fontFamily', 'fontSize', 'fontWeight', 'color'],
        textLayout: ['lineHeight', 'textAlign', 'verticalAlign', 'writingMode'],
      },
      'image-block': { ...commonBlock, content: ['source', 'fit'] },
      'qrcode-block': {
        ...commonBlock,
        content: ['content', 'errorCorrection', 'quietZone'],
        graphicStyle: ['foreground', 'backgroundColor'],
      },
      'shape-block': {
        ...commonBlock,
        content: ['shape'],
        graphicStyle: [
          'fill', 'stroke', 'strokeWidth', 'strokeStyle', 'strokeAlignment',
          'strokeJoin', 'strokeCap', 'strokeMiterLimit',
        ],
      },
      'simple-container-block': { ...commonBlock, container: ['clip'] },
      'flow-container-block': { ...commonBlock, container: ['clip', 'direction', 'gap'] },
      'simple-container-location': {
        advanced: ['id', 'type'],
        position: ['anchor', 'x', 'y'],
      },
      'flow-container-location': {
        advanced: ['id', 'type'],
        position: ['index', 'align'],
      },
    }

    for (const [typeName, categories] of Object.entries(expected)) {
      expect(visibleFieldsByCategory(typeName), typeName).toEqual(categories)
    }
  })

  it('assigns every visible native field to a registered category', () => {
    const typeNames = [
      'text-block',
      'markdown-text-block',
      'image-block',
      'qrcode-block',
      'shape-block',
      'simple-container-block',
      'flow-container-block',
      'simple-container-location',
      'flow-container-location',
      'card-document',
      'card-face',
      'card-instance',
    ]

    for (const typeName of typeNames) {
      for (const [fieldKey, definition] of Object.entries(getTypePropertyEditorSchema(typeName))) {
        if (definition.isHidden) continue
        expect(
          definition.categoryId,
          `${typeName}.${fieldKey} should have a registered category`,
        ).toBeDefined()
        if (definition.categoryId) {
          expect(propertyEditorCategoryDefinitions).toHaveProperty(definition.categoryId)
        }
      }
    }
  })

  it('keeps categories in the task workflow order used by PropertyEditor', () => {
    expect(Object.keys(propertyEditorCategoryDefinitions)).toEqual([
      'general',
      'content',
      'size',
      'container',
      'position',
      'transform',
      'layer',
      'textStyle',
      'textLayout',
      'surface',
      'graphicStyle',
      'customFields',
      'advanced',
      'data',
      'uncategorized',
    ])
  })

  it('marks text content with explicit rich-text editing capability', () => {
    expect(getTypePropertyEditorSchema('text-block').content).toMatchObject({
      fieldType: 'string',
      multiline: true,
      richText: true,
    })
    expect(getTypePropertyEditorSchema('markdown-text-block').content).toMatchObject({
      fieldType: 'string',
      multiline: true,
    })
    expect(getTypePropertyEditorSchema('markdown-text-block').content?.richText).toBeUndefined()
    expect(getTypePropertyEditorSchema('text-block').content?.required).toBeUndefined()
    expect(getTypePropertyEditorSchema('markdown-text-block').content?.required).toBeUndefined()
  })
})
