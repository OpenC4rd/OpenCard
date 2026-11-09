// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyBlockOverrides, applyInstance } from './instance'
import type { CardBlock, CardDocument, CardInstanceRecord } from './model'

const block = { id: 'title', type: 'text-block', name: 'Title', content: 'blueprint', color: '#fff' } as unknown as CardBlock

function documentWith(root: CardBlock): CardDocument {
  const face = { children: [{ block: root, location: {} }] }
  return { faces: { front: face, back: { children: [] } }, instances: [] } as unknown as CardDocument
}

function instanceWith(data: CardInstanceRecord['data']): CardInstanceRecord {
  return { type: 'card-instance', id: 'one', name: 'One', amount: '1', data }
}

describe('instance overrides', () => {
  it('replaces overridden fields, removes unset ones and keeps the rest of the blueprint', () => {
    expect(applyBlockOverrides({ content: 'blueprint', color: '#fff', size: '1' }, { content: 'mine', color: null }))
      .toEqual({ content: 'mine', size: '1' })
  })

  it('never lets an instance override its name or field definitions', () => {
    expect(applyBlockOverrides({ name: 'Title' }, { name: 'mine', additionalFieldDefinition: {} }))
      .toEqual({ name: 'Title' })
  })

  it('projects an unset field as missing so rendering falls back to the property default', () => {
    const projected = applyInstance(documentWith(block), instanceWith({ title: { content: null } }))
    const result = projected.faces.front.children[0]!.block as unknown as Record<string, unknown>

    expect(Object.prototype.hasOwnProperty.call(result, 'content')).toBe(false)
    expect(result.color).toBe('#fff')
    expect((block as unknown as Record<string, unknown>).content).toBe('blueprint')
  })
})
