import { describe, expect, it } from 'vitest'
import type {
  RenderReadyCardBlock,
  RenderReadyCardFace,
  RenderReadySimpleContainerBlock,
  RenderReadyTextBlock,
} from '../render.types'
import { buildCardLayerGroups } from './cardLayerModel'

function block(id: string, zIndex: number, visible = true): RenderReadyTextBlock {
  return {
    type: 'text-block',
    id,
    name: id,
    notes: '',
    visible,
    width: '100px',
    height: '40px',
    borderColor: '#000000',
    borderWidth: 0,
    borderStyle: 'solid',
    borderRadius: '',
    background: '',
    translateX: '0px',
    translateY: '0px',
    scaleX: 1,
    scaleY: 1,
    transformAnchor: 'cc',
    zIndex,
    rotation: 0,
    opacity: 1,
    content: id,
    fontSize: '16px',
    fontFamily: '',
    fontWeight: 'normal',
    color: '#000000',
    textAlign: 'start',
    verticalAlign: 'top',
    lineHeight: 'normal',
    writingMode: 'horizontal-tb',
  }
}

function container(
  id: string,
  zIndex: number,
  children: RenderReadyCardBlock[],
  visible = true,
): RenderReadySimpleContainerBlock {
  return {
    ...block(id, zIndex, visible),
    type: 'simple-container-block',
    clip: false,
    children: children.map(child => ({
      block: child,
      location: { id: `${child.id}-location`, type: 'simple-container-location', anchor: 'lt', x: '0px', y: '0px' },
    })),
  }
}

function face(children: RenderReadyCardBlock[]): RenderReadyCardFace {
  return {
    type: 'card-face',
    id: 'face',
    faceKey: 'front',
    width: 630,
    height: 880,
    background: '#ffffff',
    children: children.map(child => ({
      block: child,
      location: { id: `${child.id}-location`, type: 'simple-container-location', anchor: 'lt', x: '0px', y: '0px' },
    })),
  }
}

describe('buildCardLayerGroups', () => {
  it('groups nested blocks by zIndex and lists later-painted peers first', () => {
    const result = buildCardLayerGroups(face([
      block('root-high', 3),
      container('container', 1, [block('nested-high', 3), block('nested-low', -1)]),
      block('root-mid', 1),
    ]))

    expect(result.map(layer => layer.zIndex)).toEqual([3, 1, -1])
    expect(result[0]?.blocks.map(item => item.id)).toEqual(['nested-high', 'root-high'])
    expect(result[1]?.blocks.map(item => item.id)).toEqual(['root-mid', 'container'])
  })

  it('omits hidden blocks and every descendant of a hidden container', () => {
    const result = buildCardLayerGroups(face([
      block('visible', 0),
      block('hidden', 4, false),
      container('hidden-container', 2, [block('hidden-child', 8)], false),
    ]))

    expect(result).toHaveLength(1)
    expect(result[0]?.blocks.map(item => item.id)).toEqual(['visible'])
  })

  it('treats packaged containers as atomic layer planes', () => {
    const result = buildCardLayerGroups(face([
      container('package', 2, [block('packaged-child', 8)]),
      block('sibling', 1),
    ]), new Set(['package']))

    expect(result.map(layer => layer.zIndex)).toEqual([2, 1])
    expect(result.flatMap(layer => layer.blocks.map(item => item.id)))
      .toEqual(['package', 'sibling'])
  })

  it('supports decimal layers and an empty face', () => {
    expect(buildCardLayerGroups(face([block('fraction', 0.5), block('zero', 0)]))
      .map(layer => layer.zIndex)).toEqual([0.5, 0])
    expect(buildCardLayerGroups(face([]))).toEqual([])
  })
})
