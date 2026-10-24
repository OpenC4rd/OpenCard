// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { CardDocument } from './model'
import { parseCardDocument, parseStoredCardBlock, stringifyCardDocument } from './storage'

function createDocument(): CardDocument {
  return {
    type: 'card-document', id: 'document', name: 'Document', version: '1', width: '540', height: '850',
    faces: {
      front: {
        type: 'card-face', id: 'front', background: '#fff',
        children: [{
          block: {
            type: 'text-block', id: 'custom',
            width: '100%', mystery: 'preserved',
            additionalFieldDefinition: { score: { fieldType: 'number', title: 'Score' } }, score: '12',
          } as any,
          location: { type: 'simple-container-location', id: 'location', anchor: 'lt', x: '0', y: '0' },
        }],
      },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [{ type: 'card-instance', id: 'instance', name: 'Instance', amount: '1', data: { custom: { width: '80%' } } }],
  }
}

describe('card document storage', () => {
  it('round-trips the in-memory document without schema projection', () => {
    const document = createDocument()
    const stored = JSON.parse(stringifyCardDocument(document))
    expect(stored).toEqual(document)
  })

  it('preserves unknown block fields during parsing', () => {
    const source = createDocument() as unknown as Record<string, unknown>
    source.extra = true
    const parsed = parseCardDocument(source)
    expect(parsed).toBe(source)
    expect(parsed).toHaveProperty('extra', true)
    expect(parsed.faces.front.children[0]?.block).toMatchObject({ width: '100%', mystery: 'preserved' })
  })

  it('only rejects a non-object document root', () => {
    expect(() => parseCardDocument(null)).toThrow('JSON object')
    expect(parseStoredCardBlock({ type: 'text-block', id: 'x' })).toMatchObject({
      type: 'text-block',
    })
    expect(parseStoredCardBlock({ type: 1 })).toBeNull()
  })
})
