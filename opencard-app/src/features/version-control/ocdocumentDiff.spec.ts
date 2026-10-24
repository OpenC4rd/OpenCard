// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createTextBlock, type CardDocument, type TextBlock } from '../../entities/card/model'
import { compareOcdocuments } from './ocdocumentDiff'

function textBlock(id: string, content = id): TextBlock {
  return createTextBlock({ id, content, name: id })
}

function document(blocks: TextBlock[] = [textBlock('title')]): CardDocument {
  return {
    type: 'card-document',
    id: 'document',
    version: '1',
    name: 'Card',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#fff',
        children: blocks.map((block, index) => ({
          block,
          location: {
            id: `location-${block.id}`,
            type: 'simple-container-location',
            anchor: 'lt',
            x: String(index),
            y: '0',
          },
        })),
      },
      back: { type: 'card-face', id: 'back', background: '#fff', children: [] },
    },
    instances: [],
  }
}

describe('compareOcdocuments', () => {
  it('ignores JSON formatting and object key order', () => {
    const source = document()
    const reordered = {
      height: source.height,
      width: source.width,
      version: source.version,
      id: source.id,
      faces: source.faces,
      instances: source.instances,
      name: source.name,
      type: source.type,
    }

    const result = compareOcdocuments(JSON.stringify(source), JSON.stringify(reordered, null, 4))

    expect(result.ok).toBe(true)
    expect(result.changes).toEqual([])
  })

  it('reports document, face, block, instance, and data table changes', () => {
    const before = document()
    const after = document([textBlock('title', 'Changed'), textBlock('subtitle')])
    after.width = '600'
    after.faces.back.background = '#000'
    after.instances = [{ type: 'card-instance', id: 'instance-a', name: 'A', amount: '2', data: {} }]
    after.dataTable = { blocks: { title: ['content'] } }

    const result = compareOcdocuments(JSON.stringify(before), JSON.stringify(after))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'document.width', kind: 'changed' }),
      expect.objectContaining({ path: 'faces.back.background', kind: 'changed', faceKey: 'back' }),
      expect.objectContaining({ path: 'blocks.title.content', kind: 'changed', blockId: 'title' }),
      expect.objectContaining({ path: 'blocks.subtitle', kind: 'added', blockId: 'subtitle' }),
      expect.objectContaining({ path: 'instances.instance-a', kind: 'added', instanceId: 'instance-a' }),
      expect.objectContaining({ path: 'dataTable', kind: 'added' }),
    ]))
  })

  it('reports location changes as moves', () => {
    const before = document()
    const after = document()
    after.faces.front.children[0]!.location.x = '20'

    const result = compareOcdocuments(JSON.stringify(before), JSON.stringify(after))

    expect(result.ok).toBe(true)
    expect(result.changes).toContainEqual(expect.objectContaining({
      path: 'blocks.title.location',
      kind: 'moved',
    }))
  })

  it('does not report existing blocks as moved when another block is inserted', () => {
    const before = document([textBlock('a'), textBlock('b')])
    const after = document([textBlock('new'), textBlock('a'), textBlock('b')])
    after.faces.front.children[1]!.location = before.faces.front.children[0]!.location
    after.faces.front.children[2]!.location = before.faces.front.children[1]!.location

    const result = compareOcdocuments(JSON.stringify(before), JSON.stringify(after))

    expect(result.ok).toBe(true)
    expect(result.changes.filter(change => change.kind === 'moved')).toEqual([])
  })

  it('returns the failing side for malformed JSON', () => {
    const result = compareOcdocuments('{', JSON.stringify(document()))

    expect(result).toMatchObject({ ok: false, error: { side: 'before' }, changes: [] })
  })
})
