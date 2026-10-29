// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createShapeBlock,
  createTextBlock,
  type CardDocument,
} from '../../entities/card/model'
import type { CardMarkupParagraphNode } from './markup'
import { prepareRichText } from './prepareRichText'

function createTestCardDocument(faces: CardDocument['faces']): CardDocument {
  return {
    type: 'card-document',
    id: 'test-doc-1',
    name: 'Test Document',
    description: '',
    notes: '',
    version: '1.0.0',
    width: '400',
    height: '600',
    instances: [],
    faces,
  }
}

describe('prepareRichText', () => {
  it('parses markup into a valid CardMarkupDocument with blocks', () => {
    const document = createTestCardDocument({
      front: {
        type: 'card-face',
        id: 'front',
        background: '#ffffff',
        children: [
          {
            block: createTextBlock({
              id: 'text-1',
              content: '@b{Hello} world\nSecond line',
            }),
            location: { id: 'loc-1', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
          },
        ],
      },
      back: { type: 'card-face', id: 'back', background: '#000000', children: [] },
    })

    const { catalog, issues } = prepareRichText({ document })
    expect(issues).toHaveLength(0)

    const prepared = catalog.get('text-1')
    expect(prepared).toBeDefined()
    expect(prepared!.valid).toBe(true)
    expect(prepared!.document.blocks).toHaveLength(2)
    expect(prepared!.document.blocks![0]!.type).toBe('paragraph')
    expect(prepared!.document.children).toBeDefined()
  })

  it('reports pipeline issues with diagnostic offset and details for invalid markup', () => {
    const document = createTestCardDocument({
      front: {
        type: 'card-face',
        id: 'front',
        background: '#ffffff',
        children: [
          {
            block: createTextBlock({
              id: 'broken-block',
              content: '@b{Unclosed tag',
            }),
            location: { id: 'loc-1', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
          },
        ],
      },
      back: { type: 'card-face', id: 'back', background: '#000000', children: [] },
    })

    const { catalog, issues } = prepareRichText({ document })
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]!.type).toBe('card-designer.rich-text.invalid-html')
    expect(issues[0]!.location.blockId).toBe('broken-block')
    expect(issues[0]!.location.characterOffset).toBeDefined()

    const prepared = catalog.get('broken-block')
    expect(prepared?.valid).toBe(false)
  })

  it('scans multiple faces and ignores non-text blocks', () => {
    const document = createTestCardDocument({
      front: {
        type: 'card-face',
        id: 'front',
        background: '#ffffff',
        children: [
          {
            block: createShapeBlock({ id: 'shape-1' }),
            location: { id: 'loc-1', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
          },
          {
            block: createTextBlock({
              id: 'front-text',
              content: 'Front text',
            }),
            location: { id: 'loc-2', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
          },
        ],
      },
      back: {
        type: 'card-face',
        id: 'back',
        background: '#000000',
        children: [
          {
            block: createTextBlock({
              id: 'back-text',
              content: 'Back text with {{binding}}',
            }),
            location: { id: 'loc-3', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
          },
        ],
      },
    })

    const { catalog, issues } = prepareRichText({ document })
    expect(issues).toHaveLength(0)
    expect(catalog.has('shape-1')).toBe(false)
    expect(catalog.has('front-text')).toBe(true)
    expect(catalog.has('back-text')).toBe(true)

    const backPrepared = catalog.get('back-text')!
    const backParagraph = backPrepared.document.blocks![0] as CardMarkupParagraphNode
    expect(backParagraph.children).toEqual([
      { type: 'text', value: 'Back text with ' },
      { type: 'binding', expression: 'binding' },
    ])
  })

  it('preserves icon and image metadata in the prepared document', () => {
    const document = createTestCardDocument({
      front: {
        type: 'card-face',
        id: 'front',
        background: '#ffffff',
        children: [
          {
            block: createTextBlock({
              id: 'icon-text',
              content: 'Icon: @icon(key=star,pkg=rpg) Img: @img(src=art.png)',
            }),
            location: { id: 'loc-1', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
          },
        ],
      },
      back: { type: 'card-face', id: 'back', background: '#000000', children: [] },
    })

    const { catalog } = prepareRichText({ document })
    const prepared = catalog.get('icon-text')!
    expect(prepared.valid).toBe(true)
    const paragraph = prepared.document.blocks![0] as CardMarkupParagraphNode
    expect(paragraph.children).toEqual([
      { type: 'text', value: 'Icon: ' },
      { type: 'icon', key: 'star', pkg: 'rpg' },
      { type: 'text', value: ' Img: ' },
      { type: 'img', src: 'art.png' },
    ])
  })
})
