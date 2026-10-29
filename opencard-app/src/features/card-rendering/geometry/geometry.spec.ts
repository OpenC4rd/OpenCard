// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { RenderReadyCardBlock, RenderReadyCardFace } from '../render.types'
import {
  computeResizedBlockGeometry,
  computeSceneLayout,
  evaluateRenderLength,
  hitTestScene,
  invertMatrix,
  multiplyMatrix,
  projectWorldDeltaToParentLocation,
  transformPoint,
  type ResizeHandleDirection,
} from '.'

function block(id: string, extra: Record<string, unknown> = {}): RenderReadyCardBlock {
  return {
    type: 'shape-block', id, name: id, notes: '', visible: true, width: '100', height: '50',
    borderColor: '', borderWidth: 0, borderStyle: 'solid', borderRadius: '0', background: '',
    translateX: '0', translateY: '0', scaleX: 1, scaleY: 1, transformAnchor: 'cc', zIndex: 0,
    rotation: 0, opacity: 1, ...extra,
  } as unknown as RenderReadyCardBlock
}

const at = (b: RenderReadyCardBlock, anchor = 'lt', x = '0', y = '0') => ({
  block: b,
  location: { id: `loc-${b.id}`, type: 'simple-container-location' as const, anchor: anchor as never, x, y },
})

function face(...children: ReturnType<typeof at>[]): RenderReadyCardFace {
  return { type: 'card-face', id: 'face', faceKey: 'front', width: 400, height: 300, background: '#fff', children } as RenderReadyCardFace
}

describe('evaluateRenderLength', () => {
  it('resolves percent and arithmetic against the parent span', () => {
    expect(evaluateRenderLength('50%', 200)).toBe(100)
    expect(evaluateRenderLength('calc(100% - 2 * (5px + 5))', 200)).toBe(180)
    expect(evaluateRenderLength('12', 200)).toBe(12)
  })

  it('resolves physical units mm, cm, in, pt to millimeter numbers', () => {
    expect(evaluateRenderLength('63mm', 200)).toBe(63)
    expect(evaluateRenderLength('6.3cm', 200)).toBe(63)
    expect(evaluateRenderLength('2.5in', 200)).toBeCloseTo(63.5)
    expect(evaluateRenderLength('10pt', 200)).toBeCloseTo((10 * 25.4) / 72)
    expect(evaluateRenderLength('100% - 4mm', 63)).toBe(59)
  })

  it('falls back on unknown units, division by zero and malformed input', () => {
    for (const bad of ['auto', '10vw', '1em', '1/0', '(1+', '', '1 2']) {
      expect(evaluateRenderLength(bad, 100, -7)).toBe(-7)
    }
  })
})

describe('matrix inversion', () => {
  it('returns identity for a degenerate matrix instead of NaN', () => {
    expect(invertMatrix([0, 0, 0, 0, 5, 5])).toEqual([1, 0, 0, 1, 0, 0])
  })
})

describe('computeSceneLayout', () => {
  it('places simple-container children by 9-grid anchor, offsetting inward from the far edges', () => {
    const scene = computeSceneLayout(face(at(block('a'), 'rb', '10', '20'), at(block('b'), 'cc')))
    expect(scene.nodeMap.get('a')!.localRect).toEqual({ x: 290, y: 230, width: 100, height: 50 })
    expect(scene.nodeMap.get('b')!.localRect).toEqual({ x: 150, y: 125, width: 100, height: 50 })
  })

  it('lays flow children out by index with gap, reversed direction and cross alignment', () => {
    const flow = block('flow', {
      type: 'flow-container-block', width: '300', height: '100', direction: 'rl', gap: '10', clip: false,
      children: [
        { block: block('second', { width: '50', height: '20' }), location: { id: 'l2', type: 'flow-container-location', index: 2, align: 'end' } },
        { block: block('first', { width: '40', height: '20' }), location: { id: 'l1', type: 'flow-container-location', index: 1, align: 'center' } },
        { block: block('hidden', { visible: false }), location: { id: 'l0', type: 'flow-container-location', index: 0, align: 'start' } },
      ],
    })
    const scene = computeSceneLayout(face(at(flow)))
    expect(scene.nodeMap.get('first')!.localRect).toEqual({ x: 260, y: 40, width: 40, height: 20 })
    expect(scene.nodeMap.get('second')!.localRect).toEqual({ x: 200, y: 80, width: 50, height: 20 })
  })

  it('paints by zIndex and leaves hidden subtrees out of paint order', () => {
    const scene = computeSceneLayout(face(at(block('low', { zIndex: 5 })), at(block('high', { zIndex: 9 })), at(block('gone', { visible: false }))))
    expect(scene.paintOrderNodes.map((n) => n.id)).toEqual(['low', 'high'])
  })
})

describe('hitTestScene', () => {
  it('hits the topmost block inside its rotated outline and misses outside it', () => {
    const rotated = block('r', { width: '100', height: '20', rotation: 90, zIndex: 1 })
    const scene = computeSceneLayout(face(at(block('under', { width: '400', height: '300' })), at(rotated, 'cc')))
    expect(hitTestScene(scene, { x: 200, y: 160 })?.id).toBe('r')
    expect(hitTestScene(scene, { x: 245, y: 150 })?.id).toBe('under')
    expect(hitTestScene(scene, { x: 500, y: 500 })).toBeNull()
  })

  it('ignores a child outside its clipping ancestor', () => {
    const outer = block('clipper', { type: 'simple-container-block', width: '50', height: '50', clip: true, children: [at(block('kid', { width: '200', height: '200' }))] })
    const scene = computeSceneLayout(face(at(outer)))
    expect(hitTestScene(scene, { x: 25, y: 25 })?.id).toBe('kid')
    expect(hitTestScene(scene, { x: 100, y: 100 })).toBeNull()
  })
})

describe('projectWorldDeltaToParentLocation', () => {
  it('undoes parent scale and mirrors the sign for far-edge anchors', () => {
    const parent = block('p', { type: 'simple-container-block', scaleX: 2, scaleY: 2, clip: false, children: [at(block('c'))] })
    const node = computeSceneLayout(face(at(parent))).nodeMap.get('c')!
    expect(projectWorldDeltaToParentLocation(node, { x: 10, y: 4 })).toEqual({ dx: 5, dy: 2 })
    expect(projectWorldDeltaToParentLocation(node, { x: 10, y: 4 }, 'rb')).toEqual({ dx: -5, dy: -2 })
  })
})

describe('computeResizedBlockGeometry', () => {
  const handles: ResizeHandleDirection[] = ['lt', 'rt', 'lb', 'rb', 'l', 'r', 't', 'b']
  const fixedPointOf = (handle: ResizeHandleDirection, w: number, h: number) => ({
    x: handle.includes('r') ? 0 : handle.includes('l') ? w : w / 2,
    y: handle.includes('b') ? 0 : handle.includes('t') ? h : h / 2,
  })

  it.each(handles)('keeps the opposite anchor still in world space for handle %s under nested rotation and scale', (handle) => {
    const child = block('c', { rotation: 33, scaleX: 1.5, scaleY: 0.8, translateX: '7', translateY: '-3', transformAnchor: 'rb' })
    const parent = block('p', { type: 'simple-container-block', width: '300', height: '200', rotation: -20, scaleX: 0.9, scaleY: 1.3, clip: false, children: [at(child, 'rc', '12', '9')] })
    const build = (c: RenderReadyCardBlock) => computeSceneLayout(face(at({ ...parent, children: [at(c, 'rc', '12', '9')] } as RenderReadyCardBlock, 'cc'))).nodeMap.get('c')!
    const before = build(child)
    const fixedBefore = transformPoint(before.worldMatrix, fixedPointOf(handle, 100, 50))
    const pointer = transformPoint(multiplyMatrix(before.worldMatrix, [1, 0, 0, 1, 0, 0]), { x: 140, y: 90 })

    const geo = computeResizedBlockGeometry(before, handle, pointer, { locationAnchor: 'rc' })
    const after = build({ ...child, width: String(geo.width), height: String(geo.height) } as RenderReadyCardBlock)
    // 重新套用 x/y 偏移：替换 location
    const applied = computeSceneLayout(face(at({ ...parent, children: [at({ ...child, width: String(geo.width), height: String(geo.height) } as RenderReadyCardBlock, 'rc', String(geo.x), String(geo.y))] } as RenderReadyCardBlock, 'cc'))).nodeMap.get('c')!
    const fixedAfter = transformPoint(applied.worldMatrix, fixedPointOf(handle, geo.width, geo.height))
    expect(after.localRect.width).toBeCloseTo(geo.width)
    expect(fixedAfter.x).toBeCloseTo(fixedBefore.x, 6)
    expect(fixedAfter.y).toBeCloseTo(fixedBefore.y, 6)
  })

  it('never shrinks below minSize', () => {
    const node = computeSceneLayout(face(at(block('a')))).nodeMap.get('a')!
    const geo = computeResizedBlockGeometry(node, 'rb', { x: -500, y: -500 }, { minSize: 8 })
    expect([geo.width, geo.height]).toEqual([8, 8])
  })
})
