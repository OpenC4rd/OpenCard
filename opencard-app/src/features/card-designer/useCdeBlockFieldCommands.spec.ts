import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createTextBlock, type CardDocument } from '../../entities/card/model'
import { useCdeBlockFieldCommands } from './useCdeBlockFieldCommands'

function createHarness() {
  const block = createTextBlock({ id: 'text', content: 'Blueprint', name: 'Title' })
  const document: CardDocument = {
    type: 'card-document',

    id: 'document',
    name: 'Document',
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#fff',
        children: [{ block, location: { id: 'location', type: 'simple-container-location', anchor: 'lt' } }],
      },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [
      { type: 'card-instance', id: 'one', name: 'One', amount: '1', data: {} },
      { type: 'card-instance', id: 'two', name: 'Two', amount: '1', data: {} },
    ],
  }
  const revision = ref(0)
  const markDocumentChanged = vi.fn()
  const commands = useCdeBlockFieldCommands({
    cardDoc: ref(document),
    blueprintCardId: '__blueprint__',
    refreshDocumentState: () => { revision.value += 1 },
    markDocumentChanged,
  })
  return { block, document, revision, markDocumentChanged, commands }
}

describe('useCdeBlockFieldCommands', () => {
  it('writes explicit blueprint and instance targets without selection state', () => {
    const { block, document, commands, markDocumentChanged } = createHarness()

    expect(commands.updateField({
      cardId: '__blueprint__', blockId: 'text', fieldKey: 'content',
    }, 'Changed')).toBe(true)
    expect(block.content).toBe('Changed')

    expect(commands.updateField({ cardId: 'two', blockId: 'text', fieldKey: 'content' }, 'Override')).toBe(true)
    expect(document.instances[0]!.data.text).toBeUndefined()
    expect(document.instances[1]!.data.text?.content).toBe('Override')
    expect(commands.updateField({ cardId: 'two', blockId: 'text', fieldKey: 'name' }, 'Instance title')).toBe(false)
    expect(document.instances[1]!.data.text).not.toHaveProperty('name')
    expect(markDocumentChanged).toHaveBeenLastCalledWith('typing', 'block-field:two:text:content')
  })

  it('resets overrides and deletes blueprint fields across every instance', () => {
    const { block, document, commands } = createHarness()
    expect(commands.createField({
      cardId: '__blueprint__', blockId: 'text', fieldKey: 'score',
      definition: { fieldType: 'number', title: 'Score', min: 5, max: 100, step: 5 },
    })).toBeNull()
    expect(block.additionalFieldDefinition?.score).toEqual({
      fieldType: 'number', title: 'Score', min: 5, max: 100, step: 5,
    })
    expect((block as unknown as Record<string, unknown>).score).toBe('5')
    commands.updateField({ cardId: 'one', blockId: 'text', fieldKey: 'score' }, '10')
    commands.updateField({ cardId: 'two', blockId: 'text', fieldKey: 'score' }, '20')

    expect(commands.resetField({ cardId: 'one', blockId: 'text', fieldKey: 'score' })).toBe(true)
    expect(document.instances[0]!.data.text).toBeUndefined()
    expect(document.instances[1]!.data.text?.score).toBe('20')

    expect(commands.resetBlueprintField({ cardId: '__blueprint__', blockId: 'text', fieldKey: 'score' })).toBe(true)
    expect(block.additionalFieldDefinition?.score).toBeDefined()
    expect((block as unknown as Record<string, unknown>).score).toBeUndefined()
    expect(document.instances[1]!.data.text?.score).toBe('20')

    expect(commands.removeFieldDefinition({ cardId: '__blueprint__', blockId: 'text', fieldKey: 'score' })).toBe(true)
    expect(block.additionalFieldDefinition).toBeUndefined()
    expect(document.instances[1]!.data.text).toBeUndefined()
  })

  it('updates a custom field definition in place and removes it with its value', () => {
    const { block, document, commands } = createHarness()
    expect(commands.createField({
      cardId: '__blueprint__', blockId: 'text', fieldKey: 'score',
      definition: { fieldType: 'number', title: 'Score', min: 5, max: 100, step: 5 },
    })).toBeNull()
    commands.updateField({ cardId: 'one', blockId: 'text', fieldKey: 'score' }, '10')
    const blueprintValue = (block as unknown as Record<string, unknown>).score

    expect(commands.updateFieldDefinition({ cardId: '__blueprint__', blockId: 'text', fieldKey: 'score' },
      { fieldType: 'number', title: 'Points', min: 0, max: 10 })).toBe(true)
    expect(block.additionalFieldDefinition?.score).toEqual({
      fieldType: 'number', title: 'Points', min: 0, max: 10,
    })
    expect((block as unknown as Record<string, unknown>).score).toBe(blueprintValue)
    expect(document.instances[0]!.data.text?.score).toBe('10')

    expect(commands.updateFieldDefinition({ cardId: '__blueprint__', blockId: 'text', fieldKey: 'score' },
      { fieldType: 'string', title: 'Points' })).toBe(false)

    expect(commands.removeFieldDefinition({ cardId: '__blueprint__', blockId: 'text', fieldKey: 'score' })).toBe(true)
    expect(block.additionalFieldDefinition).toBeUndefined()
    expect((block as unknown as Record<string, unknown>).score).toBeUndefined()
    expect(document.instances[0]!.data.text).toBeUndefined()
  })
})
