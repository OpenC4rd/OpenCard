// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createBlock, type CardDocument } from './model'
import { findCardBlockInDocument, visitCardBlockTree } from './tree'

function createDocument(): CardDocument {
  const root = createBlock('simple-container-block', { id: 'root' })
  const nested = createBlock('flow-container-block', { id: 'nested' })
  nested.children.push({
    block: createBlock('text-block', { id: 'leaf' }),
    location: { id: 'leaf-location', type: 'flow-container-location', index: '0' },
  })
  root.children.push({
    block: nested,
    location: { id: 'nested-location', type: 'simple-container-location', anchor: 'lt' },
  })
  return {
    type: 'card-document', id: 'document', version: '1', width: '1', height: '1',
    instances: [],
    faces: {
      front: {
        type: 'card-face', id: 'front', background: '#fff',
        children: [{ block: root, location: { id: 'root-location', type: 'simple-container-location', anchor: 'lt' } }],
      },
      back: { type: 'card-face', id: 'back', background: '#fff', children: [] },
    },
  }
}

describe('card tree traversal', () => {
  it('visits a subtree in depth-first order with stable depths', () => {
    const root = createDocument().faces.front.children[0]!.block
    const visited: string[] = []
    visitCardBlockTree(root, (block, depth) => visited.push(`${depth}:${block.id}`))
    expect(visited).toEqual(['0:root', '1:nested', '2:leaf'])
  })

  it('locates a nested block together with its face', () => {
    expect(findCardBlockInDocument(createDocument(), 'leaf')).toMatchObject({
      faceKey: 'front', block: { id: 'leaf' },
    })
  })
})
