// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createBlock, type CardDocument, type CardInstanceRecord } from './model'
import { applyInstance } from './instance'
import { buildParentLookup } from './tree'

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
