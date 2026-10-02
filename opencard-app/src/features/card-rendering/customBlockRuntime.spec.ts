import { describe, expect, it } from 'vitest'
import {
  createCustomBlock,
  createSimpleContainerBlock,
  createTextBlock,
  type CardDocument,
} from '../../entities/card/model'
import {
  CUSTOM_BLOCK_MAX_DEPTH,
  materializeCustomBlocks,
  parseOcBlock,
  type CustomBlockSource,
} from './customBlockRuntime'

function location(id: string) {
  return { id, type: 'simple-container-location' as const, anchor: 'lt' as const, x: '0', y: '0' }
}

function documentWith(block: CardDocument['faces']['front']['children'][number]['block']): CardDocument {
  return {
    type: 'card-document', id: 'doc', name: 'Document', description: '', notes: '', version: '1',
    width: '100', height: '100', instances: [],
    faces: {
      front: { type: 'card-face', id: 'front', background: '#fff', children: [{ block, location: location('location') }] },
      back: { type: 'card-face', id: 'back', background: '#fff', children: [] },
    },
  }
}

function source(block: ReturnType<typeof createSimpleContainerBlock>, publicFields: Record<string, unknown> = {}): CustomBlockSource {
  return { scope: 'project', document: parseOcBlock({ type: 'ocblock', block, publicFields })! }
}

describe('customBlockRuntime', () => {
  it('parses a tolerant ocblock and overlays only declared public fields', () => {
    const template = createSimpleContainerBlock({ id: 'root', background: '#fff', children: [
      { block: createTextBlock({ id: 'title', content: 'Title' }), location: location('title-location') },
    ] })
    const parsed = source(template, { background: { fieldType: 'color' }, children: { fieldType: 'string' } })
    const instance = createCustomBlock({ id: 'panel-1', source: 'panel.ocblock', background: '#def' } as never)
    const original = structuredClone(instance)
    const result = materializeCustomBlocks(documentWith(instance), { catalog: { resolve: () => parsed } })
    const root = result.document.faces.front.children[0]!.block

    expect(root).toMatchObject({ type: 'simple-container-block', id: 'panel-1', background: '#def' })
    expect((root as ReturnType<typeof createSimpleContainerBlock>).children[0]!.block).toMatchObject({ id: 'panel-1/title', content: 'Title' })
    expect(result.descriptors.get('panel-1')).toMatchObject({ state: 'ready', source: 'panel.ocblock' })
    expect(instance).toEqual(original)
    expect(parsed.document.publicFields).toHaveProperty('background')
    expect(parsed.document.publicFields).not.toHaveProperty('children')
  })

  it('allows recursive sources and limits expansion by depth', () => {
    const recursive = createSimpleContainerBlock({ id: 'root', children: [
      { block: createCustomBlock({ id: 'again', source: 'panel.ocblock' }), location: location('again-location') },
    ] })
    const entry = source(recursive)
    const result = materializeCustomBlocks(documentWith(createCustomBlock({ id: 'panel-1', source: 'panel.ocblock' })), {
      maxDepth: CUSTOM_BLOCK_MAX_DEPTH,
      catalog: { resolve: () => entry },
    })
    const limited = [...result.descriptors.values()].find((descriptor) => descriptor.state === 'limited')

    expect(limited).toBeDefined()
    expect([...result.descriptors.values()].some((descriptor) => descriptor.state === 'source-unavailable')).toBe(false)
  })
})
