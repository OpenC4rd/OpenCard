import { describe, expect, it } from 'vitest'
import { createTextBlock } from '../../../entities/card/model'
import { parseRenderReadyBlockForTest } from './renderTestUtils'
import { getBlockRenderPlacementStyles } from './blockRenderPlacement'

const block = parseRenderReadyBlockForTest(createTextBlock({
  id: 'placed',
  width: '120px',
  height: '80px',
  translateX: '4px',
  rotation: '15',
}))

describe('blockRenderPlacement', () => {
  it('combines absolute anchor placement with the block transform', () => {
    const style = getBlockRenderPlacementStyles(block, {
      kind: 'absolute',
      location: { id: 'location', type: 'simple-container-location', anchor: 'cc', x: '10px', y: '20px' },
    }, false)
    expect(style).toContain('position: absolute')
    expect(style).toContain('left: calc(50% + 10px)')
    expect(style).toContain('top: calc(50% + 20px)')
    expect(style).toContain('translate: -50% -50%')
    expect(style).toContain('transform: translate(4px, 0px) rotate(15deg)')
  })

  it('applies flow location without replacing block geometry', () => {
    const style = getBlockRenderPlacementStyles(block, {
      kind: 'flow',
      location: { id: 'location', type: 'flow-container-location', index: 3, align: 'center' },
    }, false)
    expect(style).toContain('width: 120px')
    expect(style).toContain('order: 3')
    expect(style).toContain('flex-shrink: 0')
    expect(style).toContain('align-self: center')
  })
})
