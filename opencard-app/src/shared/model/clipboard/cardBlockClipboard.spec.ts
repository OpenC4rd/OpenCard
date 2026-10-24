// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTextBlock, createSimpleContainerBlock } from '../../../entities/card/model'
import {
  cloneClipboardBlocksWithNewIds,
  createCardBlocksClipboard,
  getClipboardBlockPayloads,
  parseOcClipboardText,
  serializeOcClipboard,
} from './cardBlockClipboard'

describe('cardBlockClipboard', () => {
  it('round trips a block envelope with nested children', () => {
    const block = createSimpleContainerBlock({
      id: 'container',
      children: [{
        block: createTextBlock({ id: 'child', content: 'hello' }),
        location: { id: 'location', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
      }],
    })
    const envelope = createCardBlocksClipboard([{
      block,
      location: { id: 'root-location', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
    }])
    expect(parseOcClipboardText(serializeOcClipboard(envelope))?.kind).toBe('card-block')
    expect(getClipboardBlockPayloads(envelope)[0]?.block).toMatchObject({ id: 'container', children: [{ block: { id: 'child' } }] })
  })

  it('rejects invalid protocol data', () => {
    expect(parseOcClipboardText('{"protocol":"wrong","version":1,"kind":"card-block"}')).toBeNull()
    expect(parseOcClipboardText('not json')).toBeNull()
  })

  it('remaps every block and location id when cloning', () => {
    const envelope = createCardBlocksClipboard([{
      block: createSimpleContainerBlock({
        id: 'container',
        children: [{
          block: createTextBlock({ id: 'child' }),
          location: { id: 'location', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
        }],
      }),
      location: { id: 'root-location', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
    }])
    const cloned = cloneClipboardBlocksWithNewIds(getClipboardBlockPayloads(envelope))
    expect(cloned[0]?.block.id).not.toBe('container')
    expect(cloned[0]?.block).toMatchObject({ children: [{ block: { id: expect.not.stringMatching(/^child$/) } }] })
    expect(cloned[0]?.location.id).not.toBe('root-location')
  })
})
