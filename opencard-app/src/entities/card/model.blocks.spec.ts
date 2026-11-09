// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createBlock, getFlowDirection, type CardDocument, type CardInstanceRecord, type FlowContainerBlock } from './model'
import { applyInstance } from './instance'
import { buildParentLookup } from './tree'

describe('block seeds', () => {
  it('starts each block with only its declared fields', () => {
    expect(createBlock('shape-block', { id: 's' })).toMatchObject({ shape: 'rectangle', fill: '#7C6CFF' })
    expect(createBlock('shape-block', { id: 's' })).not.toHaveProperty('strokeWidth')
    expect(createBlock('qrcode-block', { id: 'q' })).toHaveProperty('content', '')
    expect(createBlock('qrcode-block', { id: 'q' })).not.toHaveProperty('quietZone')
    expect(createBlock('image-block', { id: 'i' })).toHaveProperty('source', '')
    expect(createBlock('image-block', { id: 'i' })).not.toHaveProperty('fit')
    expect(createBlock('flow-container-block', { id: 'f' })).not.toHaveProperty('gap')
  })

  it('keeps every field the caller passes explicitly', () => {
    expect(createBlock('shape-block', { id: 's', strokeWidth: '2' })).toHaveProperty('strokeWidth', '2')
    expect(createBlock('flow-container-block', { id: 'f', direction: 'tb' })).toHaveProperty('direction', 'tb')
  })

  it('reads a missing flow direction as the default one', () => {
    expect(getFlowDirection(createBlock('flow-container-block', { id: 'f' }) as FlowContainerBlock)).toBe('lr')
  })
})

describe('instance projection', () => {
  it('applies instance overrides without owning render materialization', () => {
    const qr = createBlock('qrcode-block', { id: 'qr', name: 'Blueprint QR', content: 'blueprint' })
    const document: CardDocument = {
      type: 'card-document',

      id: 'doc',
      name: 'Document',
      version: '1.0.0',
      width: '540',
      height: '850',
      instances: [],
      faces: {
        front: {
          type: 'card-face',
          id: 'front',
          background: '#FFFFFF',
          children: [{
            block: qr,
            location: { id: 'location', type: 'simple-container-location', anchor: 'lt' },
          }],
        },
        back: {
          type: 'card-face',
          id: 'back',
          background: '#000000',
          children: [{
            block: createBlock('qrcode-block', { id: 'back-qr', content: 'back-blueprint' }),
            location: { id: 'back-location', type: 'simple-container-location', anchor: 'lt' },
          }],
        },
      },
    }
    const instance: CardInstanceRecord = {
      type: 'card-instance',
      id: 'instance',
      name: 'Instance',
      amount: '1',
      data: {
        qr: { name: 'Instance QR', content: 'instance', errorCorrection: 'H' },
        'back-qr': { content: 'back-instance' },
      },
    }

    const projected = applyInstance(document, instance)
    expect(projected.faces.front.children[0]?.block).toMatchObject({
      type: 'qrcode-block',
      name: 'Blueprint QR',
      content: 'instance',
      errorCorrection: 'H',
    })
    expect(projected.faces.back.children[0]?.block).toMatchObject({
      type: 'qrcode-block',
      content: 'back-instance',
    })
    const parentLookup = buildParentLookup(projected)
    expect(parentLookup.get('qr')).toBe(projected.faces.front)
    expect(parentLookup.get('back-qr')).toBe(projected.faces.back)
  })
})
