import { describe, expect, it } from 'vitest'
import {
  createPropertyFieldEditorModeAction,
  USE_FIELD_EDITOR_ACTION_KEY,
  USE_RAW_STRING_EDITOR_ACTION_KEY,
  usePropertyFieldEditorModes,
} from './propertyFieldEditorMode'

const bindableNumber = {
  title: 'Width',
  fieldType: 'number' as const,
  binding: { provider: () => null },
}

describe('property field editor modes', () => {
  it('keeps editor preferences scoped to stable field identities', () => {
    const modes = usePropertyFieldEditorModes()

    expect(modes.resolve({ identity: 'a', definition: bindableNumber, value: 10 }))
      .toEqual({ editorId: 'field', switchTarget: 'raw-string' })
    expect(modes.select('a', USE_RAW_STRING_EDITOR_ACTION_KEY)).toBe(true)
    expect(modes.resolve({ identity: 'a', definition: bindableNumber, value: 10 }))
      .toEqual({ editorId: 'raw-string', switchTarget: 'field' })
    expect(modes.resolve({ identity: 'b', definition: bindableNumber, value: 10 }))
      .toEqual({ editorId: 'field', switchTarget: 'raw-string' })
  })

  it('forces binding expressions into raw-string without exposing an unsafe switch', () => {
    const modes = usePropertyFieldEditorModes()
    const state = modes.resolve({
      identity: 'width',
      definition: bindableNumber,
      value: '{{self:width}}',
      bindingInterpreter: { isExpression: value => String(value).startsWith('{{') },
    })

    expect(state).toEqual({ editorId: 'raw-string', switchTarget: null })
    expect(createPropertyFieldEditorModeAction(state, bindableNumber, {
      useFieldEditor: 'Use field editor',
      useRawStringEditor: 'Use raw string editor',
    })).toBeNull()
  })

  it('offers raw-string for every editable scalar while excluding arrays, objects, and readonly fields', () => {
    const modes = usePropertyFieldEditorModes()
    const scalarDefinitions = [
      { title: 'Enum', fieldType: 'string' as const, options: ['a', 'b'] },
      { title: 'Boolean', fieldType: 'boolean' as const },
      { title: 'Color', fieldType: 'color' as const },
      { title: 'Anchor', fieldType: 'anchorPosition' as const },
      { title: 'Path', fieldType: 'filePath' as const },
      { title: 'Number', fieldType: 'number' as const },
    ]
    for (const definition of scalarDefinitions) {
      expect(modes.resolve({ identity: definition.title, definition, value: '' }).switchTarget)
        .toBe('raw-string')
    }
    expect(modes.resolve({ identity: 'array', definition: { title: 'Values', fieldType: 'number[]' }, value: [] }).switchTarget)
      .toBeNull()
    expect(modes.resolve({ identity: 'object', definition: { title: 'Data', fieldType: 'object' }, value: {} }).switchTarget)
      .toBeNull()
    expect(modes.resolve({ identity: 'readonly', definition: { title: 'Id', fieldType: 'string', isReadonly: true }, value: 'id' }).switchTarget)
      .toBeNull()
  })

  it('lets the PropertyEditor default be overridden per field', () => {
    const modes = usePropertyFieldEditorModes()
    const field = { title: 'Value', fieldType: 'string' as const }

    expect(modes.resolve({ identity: 'off', definition: field, value: 'x', allowRawStringEditor: false }).switchTarget)
      .toBeNull()
    expect(modes.resolve({
      identity: 'on',
      definition: { ...field, allowRawStringEditor: true },
      value: 'x',
      allowRawStringEditor: false,
    }).switchTarget).toBe('raw-string')
    expect(modes.resolve({
      identity: 'field-off',
      definition: { ...field, allowRawStringEditor: false },
      value: 'x',
      allowRawStringEditor: true,
    }).switchTarget).toBeNull()
  })

  it('projects stable Action Definitions and preserves source editing after value changes', () => {
    const modes = usePropertyFieldEditorModes()
    const initial = modes.resolve({ identity: 'width', definition: bindableNumber, value: 10 })
    expect(createPropertyFieldEditorModeAction(initial, bindableNumber, {
      useFieldEditor: 'Use field editor',
      useRawStringEditor: 'Use raw string editor',
    })).toMatchObject({
      key: USE_RAW_STRING_EDITOR_ACTION_KEY,
      icon: 'mdiCursorText',
    })

    modes.preserveRawString('width')
    const source = modes.resolve({ identity: 'width', definition: bindableNumber, value: '10' })
    expect(createPropertyFieldEditorModeAction(source, bindableNumber, {
      useFieldEditor: 'Use field editor',
      useRawStringEditor: 'Use raw string editor',
    })).toMatchObject({
      key: USE_FIELD_EDITOR_ACTION_KEY,
      icon: 'mdiNumeric',
    })
  })
})
