import { describe, expect, it } from 'vitest'
import type { PropertyEditorFieldDefinition } from './propertyEditor.types'
import { formatPropertyFieldReadonlyValue, getPropertyFieldIcon, toArrayPropertyElementDefinition } from './propertyFieldRegistry'

const elementOf = (fieldType: string) => toArrayPropertyElementDefinition(
  { title: 'items', fieldType } as PropertyEditorFieldDefinition,
)

describe('array property elements', () => {
  it('derives each element editor and stored value from the `T[]` suffix', () => {
    expect(elementOf('string[]')).toMatchObject({ fieldType: 'string', defaultValue: '' })
    expect(elementOf('boolean[]')).toMatchObject({ fieldType: 'boolean', defaultValue: 'false' })
    expect(elementOf('number[]')).toMatchObject({ fieldType: 'number', defaultValue: '0' })
    expect(elementOf('anchorPosition[]')).toMatchObject({ fieldType: 'anchorPosition', defaultValue: 'cc' })
    expect(elementOf('object[]')).toMatchObject({ fieldType: 'object', defaultValue: {} })
  })

  it('peels one `[]` at a time and keeps the base type at any depth', () => {
    expect(elementOf('imageSource[][][]')).toMatchObject({ fieldType: 'imageSource[][]', defaultValue: [] })
    expect(elementOf('string[][]')).toMatchObject({ fieldType: 'string[]', defaultValue: [] })
    expect(getPropertyFieldIcon({ fieldType: 'imageSource[][]' })).toBe('mdiImageOutline')
    expect(formatPropertyFieldReadonlyValue(
      { title: 'items', fieldType: 'string[][]' } as PropertyEditorFieldDefinition,
      [['a'], ['b']],
    )).toBe('[["a"],["b"]]')
  })

  it('prefers the constraints of the element type', () => {
    const element = (definition: object) => toArrayPropertyElementDefinition(
      { title: 'items', ...definition } as PropertyEditorFieldDefinition,
    )

    expect(element({ fieldType: 'string[]', options: ['a', 'b'] }).defaultValue).toBe('a')
    expect(element({ fieldType: 'number[]', min: 3 }).defaultValue).toBe('3')
  })
})
