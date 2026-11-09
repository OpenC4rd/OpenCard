// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  acceptsPropertyBinding,
  createPropertyDefaultValue,
  exposesPropertyReference,
  getPropertyValueKind,
  getTypePropertyEditorSchema,
  isReferenceFieldExposed,
  propertyEditorCategoryDefinitions,
} from './schema'

describe('property binding schema policy', () => {
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

  it('treats any `T[]` field as a non-bindable list that defaults to empty', () => {
    const { children } = getTypePropertyEditorSchema('simple-container-block')

    expect(children).toMatchObject({ fieldType: 'object[]', objectType: 'CardBlock' })
    for (const definition of [children!, { fieldType: 'string[]' } as const, { fieldType: 'boolean[]' } as const]) {
      expect(getPropertyValueKind(definition)).toBe('object')
      expect(acceptsPropertyBinding(definition)).toBe(false)
      expect(createPropertyDefaultValue(definition)).toEqual([])
    }
  })

  it('keeps only structural fields unremovable on blocks', () => {
    const unremovable = (type: string) => Object.entries(getTypePropertyEditorSchema(type))
      .filter(([, definition]) => definition.unremovable).map(([key]) => key).sort()

    expect(unremovable('shape-block')).toEqual(['id', 'type'])
    expect(unremovable('qrcode-block')).toEqual(['id', 'type'])
    expect(unremovable('image-block')).toEqual(['id', 'type'])
    expect(unremovable('flow-container-block')).toEqual(['children', 'id', 'type'])
    expect(unremovable('custom-block')).toEqual(['id', 'source', 'type'])
  })

  it('exposes face background but hides face structure and document faces', () => {
    const faceSchema = getTypePropertyEditorSchema('card-face')
    const documentSchema = getTypePropertyEditorSchema('card-document')

    expect(exposesPropertyReference(faceSchema.background)).toBe(true)
    expect(faceSchema.background).toMatchObject({ fieldType: 'color' })
    expect(acceptsPropertyBinding(faceSchema.children)).toBe(false)
    expect(exposesPropertyReference(documentSchema.faces)).toBe(false)
    expect(documentSchema).not.toHaveProperty('schemaVersion')
  })

  it('assigns every visible native field to a registered category', () => {
    const typeNames = [
      'text-block',
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

  it('marks only text block content as rich-editable', () => {
    expect(getTypePropertyEditorSchema('text-block').content).toMatchObject({
      fieldType: 'richText',
    })
  })
})
