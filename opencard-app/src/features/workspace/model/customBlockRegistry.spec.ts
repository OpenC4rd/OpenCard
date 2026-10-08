import { describe, expect, it } from 'vitest'
import {
  buildCustomBlockRegistry,
  parseCustomBlockRegistry,
  serializeCustomBlockRegistry,
} from './customBlockRegistry'

const source = '.opencard/blocks/status/warning.ocblock'

describe('custom block registry', () => {
  it('parses collections and keeps block keys scoped to their collection', () => {
    const document = parseCustomBlockRegistry({
      collections: [
        { key: 'status', name: 'Status', blocks: [{ key: 'warning', source }] },
        { key: 'layout', name: 'Layout', blocks: [{ key: 'warning', source: '.opencard/blocks/layout/warning.ocblock' }] },
      ],
    })
    expect(document?.collections).toHaveLength(2)
    expect(buildCustomBlockRegistry(document!)).toMatchObject({
      status: { warning: { source } },
      layout: { warning: { source: '.opencard/blocks/layout/warning.ocblock' } },
    })
  })

  it('projects the old flat registry into a default collection and writes the new shape', () => {
    const document = parseCustomBlockRegistry({ blocks: [{ key: 'button', name: 'Button', source: 'blocks/button.ocblock' }] })
    expect(document).toEqual({
      collections: [{ key: 'default', name: 'Custom Blocks', blocks: [{ key: 'button', source: 'blocks/button.ocblock' }] }],
    })
    expect(JSON.parse(serializeCustomBlockRegistry(document!))).toEqual(document)
  })

  it('drops duplicate collection and same-collection block keys while allowing cross-collection duplicates', () => {
    const document = parseCustomBlockRegistry({
      collections: [
        { key: 'status', name: 'Status', blocks: [{ key: 'same', source }, { key: 'SAME', source }] },
        { key: 'STATUS', name: 'Duplicate', blocks: [] },
        { key: 'layout', name: 'Layout', blocks: [{ key: 'same', source: '.opencard/blocks/layout/same.ocblock' }] },
      ],
    })
    expect(document?.collections?.map(collection => collection.key)).toEqual(['status', 'layout'])
    expect(document?.collections?.[0]?.blocks).toHaveLength(1)
    expect(document?.collections?.[1]?.blocks[0]?.key).toBe('same')
  })
})
