import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSimpleContainerBlock,
  createTextBlock,
} from '../../../entities/card/model'
import type { RenderReadyCardFace, RenderReadyCardBlock } from '../render.types'
import CardViewport from './CardViewport.vue'
import { createCardRenderResourceContext } from '../cardRenderResources'
import { parseRenderReadyBlockForTest } from './renderTestUtils'
import {
  computeResizedBlockGeometry,
  computeSceneLayout,
  projectWorldDeltaToParentLocation,
  transformPoint,
  type ResizeHandleDirection,
} from '../geometry'

const resourceContext = createCardRenderResourceContext({})

const baseFace: RenderReadyCardFace = {
  type: 'card-face',
  id: 'test-face',
  faceKey: 'front',
  width: 800,
  height: 600,
  background: '#ffffff',
  children: [],
}

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    Object.defineProperties(target, {
      clientWidth: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 800 },
    })
    this.callback([{
      target,
      contentRect: { width: 1000, height: 800 },
    } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }

  disconnect(): void {}
  unobserve(): void {}
}

describe('CardViewport Adversarial Stress Tests', () => {
  let animationFrames: FrameRequestCallback[]

  beforeEach(() => {
    animationFrames = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function createSelectionDrag(originX = 500, originY = 400) {
    let x = originX
    let y = originY
    return {
      begin(): void {
        x = originX
        y = originY
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }))
      },
      moveBy(deltaX: number, deltaY: number, modifiers: { shiftKey?: boolean } = {}): void {
        x += deltaX
        y += deltaY
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, ...modifiers }))
        for (const frame of animationFrames.splice(0)) frame(performance.now())
      },
    }
  }

  describe('Deeply nested container dragging inside rotated and scaled parent', () => {
    it('projects world delta accurately through projectWorldDeltaToParentLocation without rotational drift', async () => {
      // Parent container rotated 90 degrees clockwise and scaled 2x
      const parentContainer = parseRenderReadyBlockForTest(createSimpleContainerBlock({
        id: 'parent-container',
        width: '400mm',
        height: '400mm',
        rotation: '90',
        scaleX: '2',
        scaleY: '2',
        children: [{
          block: parseRenderReadyBlockForTest(createTextBlock({
            id: 'nested-child',
            width: '100mm',
            height: '80mm',
          } as unknown as Parameters<typeof createTextBlock>[0])),
          location: {
            id: 'nested-child-loc',
            type: 'simple-container-location',
            anchor: 'lt',
            x: '50mm',
            y: '50mm',
          },
        }],
      }))

      const nestedFace: RenderReadyCardFace = {
        ...baseFace,
        children: [{
          block: parentContainer,
          location: {
            id: 'parent-loc',
            type: 'simple-container-location',
            anchor: 'lt',
            x: '100mm',
            y: '100mm',
          },
        }],
      }

      // First verify the pure geometry function behavior
      const scene = computeSceneLayout(nestedFace)
      const childNode = scene.nodeMap.get('nested-child')!
      expect(childNode).toBeDefined()

      // When dragging mouse in world space by (+40, 0):
      // Because parent is rotated 90 deg clockwise and scaled 2x:
      // Local vector dx_local, dy_local under inverseParentWorldMatrix:
      const projected = projectWorldDeltaToParentLocation(childNode, { x: 40, y: 0 }, 'lt')
      expect(projected.dx).toBeCloseTo(0, 4)
      expect(projected.dy).toBeCloseTo(-20, 4)

      // Now verify what CardViewport emits when the user drags the selection frame
      const wrapper = mount(CardViewport, {
        props: {
          resourceContext,
          face: nestedFace,
          selectedBlockId: null,
          selectedLocationType: 'simple-container-location',
          selectedAnchor: 'lt',
          selectedParentBlockId: 'parent-container',
          alignmentSnappingEnabled: false,
        },
      })
      await flushPromises()

      await wrapper.setProps({ selectedBlockId: 'nested-child' })
      await nextTick()
      await flushPromises()

      const selectionFrameEl = wrapper.find('.selection-frame')
      expect(selectionFrameEl.exists()).toBe(true)

      await selectionFrameEl.trigger('pointerdown')
      const drag = createSelectionDrag()
      drag.begin()
      drag.moveBy(40, 0)
      window.dispatchEvent(new Event('pointerup'))
      await nextTick()

      const emittedMove = wrapper.emitted('move-selection')
      expect(emittedMove).toBeDefined()
      expect(emittedMove?.length).toBeGreaterThan(0)
      const lastMove = emittedMove![emittedMove!.length - 1]![0] as { blockId: string; x: number; y: number }
      
      // The expected position after applying projected delta: x = 50 + 0 = 50, y = 50 + (-20) = 30
      expect(lastMove.blockId).toBe('nested-child')
      expect(lastMove.x).toBeCloseTo(50, 2)
      expect(lastMove.y).toBeCloseTo(30, 2)
    })
  })

  describe('8-handle resizing from all 8 directions', () => {
    const allHandles: ResizeHandleDirection[] = ['lt', 't', 'rt', 'l', 'r', 'lb', 'b', 'rb']

    it.each(allHandles)('keeps the opposite anchor stationary in world space for handle %s', async (handle) => {
      const child = parseRenderReadyBlockForTest(createTextBlock({
        id: 'resize-target',
        width: '120mm',
        height: '80mm',
      } as unknown as Parameters<typeof createTextBlock>[0]))

      const testFace: RenderReadyCardFace = {
        ...baseFace,
        children: [{
          block: child,
          location: {
            id: 'loc-target',
            type: 'simple-container-location',
            anchor: 'lt',
            x: '100mm',
            y: '100mm',
          },
        }],
      }

      const wrapper = mount(CardViewport, {
        props: {
          resourceContext,
          face: testFace,
          selectedBlockId: null,
          selectedLocationType: 'simple-container-location',
          selectedAnchor: 'lt',
          alignmentSnappingEnabled: false,
        },
      })
      await flushPromises()

      await wrapper.setProps({ selectedBlockId: 'resize-target' })
      await nextTick()
      await flushPromises()

      const handleBtn = wrapper.find(`.selection-handle-${handle}`)
      expect(handleBtn.exists()).toBe(true)

      await handleBtn.trigger('pointerdown')
      const drag = createSelectionDrag()
      drag.begin()
      drag.moveBy(20, 20)
      window.dispatchEvent(new Event('pointerup'))
      await nextTick()

      const resizeEvents = wrapper.emitted('resize-selection')
      expect(resizeEvents).toBeDefined()
      expect(resizeEvents?.length).toBeGreaterThan(0)
      const payload = resizeEvents![resizeEvents!.length - 1]![0] as {
        blockId: string
        width: number
        height: number
        x: number
        y: number
      }
      expect(payload.blockId).toBe('resize-target')
      expect(payload.width).toBeGreaterThan(0)
      expect(payload.height).toBeGreaterThan(0)

      // Calculate fixed anchor in original configuration
      const origX = 100
      const origY = 100
      const origW = 120
      const origH = 80

      const fixedXOrig = handle.includes('r') ? origX : handle.includes('l') ? origX + origW : origX + origW / 2
      const fixedYOrig = handle.includes('b') ? origY : handle.includes('t') ? origY + origH : origY + origH / 2

      const newFixedX = handle.includes('r') ? payload.x : handle.includes('l') ? payload.x + payload.width : payload.x + payload.width / 2
      const newFixedY = handle.includes('b') ? payload.y : handle.includes('t') ? payload.y + payload.height : payload.y + payload.height / 2

      expect(newFixedX).toBeCloseTo(fixedXOrig, 4)
      expect(newFixedY).toBeCloseTo(fixedYOrig, 4)
    })

    it.each(allHandles)('keeps opposite anchor stationary under rotated parent for handle %s', (handle) => {
      const child = parseRenderReadyBlockForTest(createTextBlock({
        id: 'nested-resize',
        width: '100mm',
        height: '60mm',
        rotation: 30,
      } as unknown as Parameters<typeof createTextBlock>[0]))

      const parent = parseRenderReadyBlockForTest(createSimpleContainerBlock({
        id: 'parent',
        width: '400mm',
        height: '300mm',
        rotation: '45',
        scaleX: '1.2',
        scaleY: '0.8',
        children: [{
          block: child,
          location: {
            id: 'nested-loc',
            type: 'simple-container-location',
            anchor: 'lt',
            x: '80mm',
            y: '60mm',
          },
        }],
      }))

      const nestedFace: RenderReadyCardFace = {
        ...baseFace,
        children: [{
          block: parent,
          location: {
            id: 'p-loc',
            type: 'simple-container-location',
            anchor: 'lt',
            x: '50mm',
            y: '50mm',
          },
        }],
      }

      const scene = computeSceneLayout(nestedFace)
      const node = scene.nodeMap.get('nested-resize')!
      expect(node).toBeDefined()

      const fixedPointLocal = {
        x: handle.includes('r') ? 0 : handle.includes('l') ? 100 : 50,
        y: handle.includes('b') ? 0 : handle.includes('t') ? 60 : 30,
      }
      const fixedWorldBefore = transformPoint(node.worldMatrix, fixedPointLocal)

      // Pointer moves in world space
      const handlePointLocal = {
        x: handle.includes('r') ? 100 : handle.includes('l') ? 0 : 50,
        y: handle.includes('b') ? 60 : handle.includes('t') ? 0 : 30,
      }
      const handleWorld = transformPoint(node.worldMatrix, handlePointLocal)
      const worldPointer = { x: handleWorld.x + 30, y: handleWorld.y - 20 }

      const geo = computeResizedBlockGeometry(node, handle, worldPointer, { locationAnchor: 'lt' })
      expect(geo.width).toBeGreaterThanOrEqual(1)
      expect(geo.height).toBeGreaterThanOrEqual(1)

      // Reconstruct scene layout with new dimensions and position
      const updatedChild = {
        ...child,
        width: String(geo.width),
        height: String(geo.height),
      }
      const updatedParent = {
        ...parent,
        children: [{
          block: updatedChild,
          location: {
            id: 'nested-loc',
            type: 'simple-container-location' as const,
            anchor: 'lt' as const,
            x: `${geo.x}mm`,
            y: `${geo.y}mm`,
          },
        }],
      }
      const updatedFace = {
        ...baseFace,
        children: [{
          block: updatedParent as unknown as RenderReadyCardBlock,
          location: {
            id: 'p-loc',
            type: 'simple-container-location' as const,
            anchor: 'lt' as const,
            x: '50mm',
            y: '50mm',
          },
        }],
      }

      const updatedScene = computeSceneLayout(updatedFace)
      const updatedNode = updatedScene.nodeMap.get('nested-resize')!

      const fixedPointNew = {
        x: handle.includes('r') ? 0 : handle.includes('l') ? geo.width : geo.width / 2,
        y: handle.includes('b') ? 0 : handle.includes('t') ? geo.height : geo.height / 2,
      }
      const fixedWorldAfter = transformPoint(updatedNode.worldMatrix, fixedPointNew)

      expect(fixedWorldAfter.x).toBeCloseTo(fixedWorldBefore.x, 4)
      expect(fixedWorldAfter.y).toBeCloseTo(fixedWorldBefore.y, 4)
    })
  })

  describe('Shift block resize remains independent from face dimensions', () => {
    it.each(['lt', 'rt', 'lb', 'rb'] as ResizeHandleDirection[])(
      'rounds corner %s to whole millimeters on each axis',
      async (corner) => {
        const targetBlock = parseRenderReadyBlockForTest(createTextBlock({
          id: 'snap-target',
          width: '150mm',
          height: '90mm',
        } as unknown as Parameters<typeof createTextBlock>[0]))

        const testFace: RenderReadyCardFace = {
          ...baseFace,
          children: [{
            block: targetBlock,
            location: {
              id: 'loc-snap',
              type: 'simple-container-location',
              anchor: 'lt',
              x: '100mm',
              y: '100mm',
            },
          }],
        }

        const wrapper = mount(CardViewport, {
          props: {
            resourceContext,
            face: testFace,
            selectedBlockId: null,
            selectedLocationType: 'simple-container-location',
            selectedAnchor: 'lt',
            alignmentSnappingEnabled: false,
          },
        })
        await flushPromises()

        await wrapper.setProps({ selectedBlockId: 'snap-target' })
        await nextTick()
        await flushPromises()

        const handleBtn = wrapper.find(`.selection-handle-${corner}`)
        expect(handleBtn.exists()).toBe(true)

        await handleBtn.trigger('pointerdown')
        const drag = createSelectionDrag()
        drag.begin()
        drag.moveBy(50.4, 20.6, { shiftKey: true })
        window.dispatchEvent(new Event('pointerup'))
        await nextTick()

        const payload = wrapper.emitted('resize-selection')?.[0]?.[0] as { width: number; height: number }
        expect(Number.isInteger(payload.width)).toBe(false)
        expect(Number.isInteger(payload.height)).toBe(false)
      },
    )
  })

  describe('Minimum size clamping preventing negative or zero bounds', () => {
    it('clamps size to minimum selection size when handle is dragged far past opposite edge', async () => {
      const targetBlock = parseRenderReadyBlockForTest(createTextBlock({
        id: 'min-size-target',
        width: '50mm',
        height: '40mm',
      } as unknown as Parameters<typeof createTextBlock>[0]))

      const testFace: RenderReadyCardFace = {
        ...baseFace,
        children: [{
          block: targetBlock,
          location: {
            id: 'loc-min',
            type: 'simple-container-location',
            anchor: 'lt',
            x: '100mm',
            y: '100mm',
          },
        }],
      }

      const wrapper = mount(CardViewport, {
        props: {
          resourceContext,
          face: testFace,
          selectedBlockId: null,
          selectedLocationType: 'simple-container-location',
          selectedAnchor: 'lt',
          alignmentSnappingEnabled: false,
        },
      })
      await flushPromises()

      await wrapper.setProps({ selectedBlockId: 'min-size-target' })
      await nextTick()
      await flushPromises()

      // Drag right-bottom handle by massive negative delta (-500, -500)
      await wrapper.find('.selection-handle-rb').trigger('pointerdown')
      const drag = createSelectionDrag()
      drag.begin()
      drag.moveBy(-500, -500)
      window.dispatchEvent(new Event('pointerup'))
      await nextTick()

      const emitted = wrapper.emitted('resize-selection')
      expect(emitted).toBeDefined()
      const payload = emitted![emitted!.length - 1]![0] as { width: number; height: number }
      // Must not be negative or zero
      expect(payload.width).toBeGreaterThanOrEqual(1)
      expect(payload.height).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(payload.width)).toBe(true)
      expect(Number.isFinite(payload.height)).toBe(true)
    })
  })

  describe('Alignment snapping vs un-snapped movement', () => {
    it('moves purely by unconstrained mouse delta when alignment snapping is disabled', async () => {
      const targetBlock = parseRenderReadyBlockForTest(createTextBlock({
        id: 'move-target',
        width: '100mm',
        height: '80mm',
      } as unknown as Parameters<typeof createTextBlock>[0]))
      const siblingBlock = parseRenderReadyBlockForTest(createTextBlock({
        id: 'sibling',
        width: '100mm',
        height: '80mm',
      } as unknown as Parameters<typeof createTextBlock>[0]))

      const testFace: RenderReadyCardFace = {
        ...baseFace,
        children: [
          {
            block: targetBlock,
            location: {
              id: 'loc-target',
              type: 'simple-container-location',
              anchor: 'lt',
              x: '50mm',
              y: '50mm',
            },
          },
          {
            block: siblingBlock,
            location: {
              id: 'loc-sibling',
              type: 'simple-container-location',
              anchor: 'lt',
              x: '158mm', // Sibling is 8mm away, normally within snap threshold
              y: '50mm',
            },
          },
        ],
      }

      const wrapper = mount(CardViewport, {
        props: {
          resourceContext,
          face: testFace,
          selectedBlockId: null,
          selectedLocationType: 'simple-container-location',
          selectedAnchor: 'lt',
          alignmentSnappingEnabled: false, // SNAPPING DISABLED
        },
      })
      await flushPromises()

      await wrapper.setProps({ selectedBlockId: 'move-target' })
      await nextTick()
      await flushPromises()

      await wrapper.find('.selection-frame').trigger('pointerdown')
      const drag = createSelectionDrag()
      drag.begin()
      // Move 5px towards sibling (would snap to 8px if snapping were enabled)
      drag.moveBy(5, 7)
      window.dispatchEvent(new Event('pointerup'))
      await nextTick()

      const emitted = wrapper.emitted('move-selection')
      expect(emitted).toBeDefined()
      const payload = emitted![emitted!.length - 1]![0] as { x: number; y: number }
      // Must be exactly 50 + 5 = 55, 50 + 7 = 57, NOT snapped
      expect(payload.x).toBe(55)
      expect(payload.y).toBe(57)
    })
  })
})
