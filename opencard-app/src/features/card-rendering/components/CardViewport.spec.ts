import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorPosition } from '../../../entities/card/model'
import {
  createFlowContainerBlock,
  createSimpleContainerBlock,
  createTextBlock,
} from '../../../entities/card/model'
import type { RenderReadyCardFace } from '../render.types'
import CardViewport from './CardViewport.vue'
import { createCardRenderResourceContext } from '../cardRenderResources'
import { parseRenderReadyBlockForTest } from './renderTestUtils'

const resourceContext = createCardRenderResourceContext({})

const face: RenderReadyCardFace = {
  type: 'card-face',
  id: 'test-face',
  faceKey: 'front',
  width: 63,
  height: 88,
  background: '#ffffff',
  children: [],
}

function textChild(
  id: string,
  x: string,
  y: string,
  width = '100px',
  height = '80px',
  options: {
    anchor?: AnchorPosition
    rotation?: number
    visible?: boolean
    zIndex?: number
  } = {},
) {
  const { anchor = 'lt', rotation = 0, visible = true, zIndex = 0 } = options
  return {
    block: parseRenderReadyBlockForTest(
      createTextBlock({ id, width, height, rotation, visible, zIndex } as unknown as Parameters<typeof createTextBlock>[0]),
    ),
    location: {
      id: `${id}-location`,
      type: 'simple-container-location' as const,
      anchor,
      x,
      y,
    },
  }
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

describe('CardViewport', () => {
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

  async function flushAnimation(): Promise<void> {
    for (let index = 0; index < 100 && animationFrames.length > 0; index += 1) {
      animationFrames.shift()?.(index * 16)
    }
    await nextTick()
  }

  /**
   * 选择框拖拽按 client 坐标差量计算位移（CardViewport.vue:1695-1698），
   * 且手势中的首个 pointermove 只用于建立基准位置，
   * 因此一次位移需要先落一次基准事件再落实际位移事件。
   */
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

  it('coalesces pan input into one transform per frame without re-measuring content', async () => {
    const wrapper = mount(CardViewport, { props: {
      resourceContext,
      face: { ...face, children: [textChild('selected', '0px', '0px')] },
      selectedBlockId: 'selected',
      selectedLocationType: 'simple-container-location',
      selectedAnchor: 'lt',
    } })
    await flushPromises()
    await flushAnimation()

    await wrapper.get('.card-viewport').trigger('mousedown', { button: 1, clientX: 400, clientY: 300 })
    const before = wrapper.emitted('viewport-transform-change')?.length ?? 0
    for (let index = 1; index <= 20; index++) {
      await wrapper.get('.card-viewport').trigger('mousemove', { clientX: 400 + index * 5, clientY: 300 })
    }
    expect(wrapper.emitted('viewport-transform-change')?.length ?? 0).toBe(before)
    await flushAnimation()
    expect(wrapper.emitted('viewport-transform-change')?.length).toBe(before + 1)

    const emitted = wrapper.emitted('viewport-transform-change') ?? []
    const lastTransform = emitted[emitted.length - 1]?.[0] as { x: number; y: number; scale: number }
    expect(lastTransform.x).toBeDefined()
    expect(lastTransform.scale).toBe(1)

    await wrapper.get('.card-viewport').trigger('mouseup', { button: 1 })
    wrapper.unmount()
  })

  it('zooms in around the supplied viewport anchor', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face },
      global: { stubs: { CardFaceRenderer: true } },
    })
    const viewport = wrapper.vm as unknown as {
      zoomByWheelAt(deltaY: number, deltaMode: number, viewportX: number, viewportY: number): void
    }
    const anchorX = 250
    const anchorY = 200
    const initialWorldX = anchorX - (1000 - face.width) / 2
    const initialWorldY = anchorY - (800 - face.height) / 2

    viewport.zoomByWheelAt(-120, WheelEvent.DOM_DELTA_PIXEL, anchorX, anchorY)
    await flushAnimation()
    const zoomEvents = wrapper.emitted('viewport-transform-change') ?? []
    const zoomedIn = zoomEvents[zoomEvents.length - 1]?.[0] as { x: number; y: number; scale: number }
    expect(zoomedIn.scale).toBeGreaterThan(1)
    const zoomedWorldX = (anchorX - (1000 - face.width * zoomedIn.scale) / 2 - zoomedIn.x) / zoomedIn.scale
    const zoomedWorldY = (anchorY - (800 - face.height * zoomedIn.scale) / 2 - zoomedIn.y) / zoomedIn.scale
    expect(zoomedWorldX).toBeCloseTo(initialWorldX, 4)
    expect(zoomedWorldY).toBeCloseTo(initialWorldY, 4)
  })

  it('zooms around the pointer within the active side-by-side half', async () => {
    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face,
        viewportInsets: { left: 200, right: 300 },
        comparison: {
          before: { face, resourceContext },
          after: { face, resourceContext },
          divider: 0.5,
          viewMode: 'side-by-side',
        },
      },
      global: { stubs: { CardFaceRenderer: true } },
    })
    const viewport = wrapper.vm as unknown as {
      zoomByWheelAt(deltaY: number, deltaMode: number, viewportX: number, viewportY: number): void
    }
    const anchorX = 325
    const anchorY = 400
    viewport.zoomByWheelAt(-120, WheelEvent.DOM_DELTA_PIXEL, anchorX, anchorY)
    await flushAnimation()

    const events = wrapper.emitted('viewport-transform-change') ?? []
    const zoomed = events[events.length - 1]?.[0] as { x: number; y: number; scale: number }
    const leftOrigin = 200 + 125 - face.width * zoomed.scale / 2
    const preservedWorldX = (anchorX - leftOrigin - zoomed.x) / zoomed.scale
    const initialWorldX = (anchorX - (200 + 125 - face.width / 2))
    expect(preservedWorldX).toBeCloseTo(initialWorldX, 3)
  })

  it('fits the face into a supplied visible region instead of resetting to 100%', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face },
      global: { stubs: { CardFaceRenderer: true } },
    })
    const viewport = wrapper.vm as unknown as {
      fitView(targetRect?: { left: number; top: number; width: number; height: number }): void
    }

    viewport.fitView({ left: 200, top: 100, width: 500, height: 600 })
    await nextTick()

    const transformEvents = wrapper.emitted('viewport-transform-change') ?? []
    const fitted = transformEvents[transformEvents.length - 1]?.[0] as { x: number; y: number; scale: number }
    expect(fitted.scale).toBeCloseTo(536 / face.height, 4)
    expect(fitted.x).toBe(-50)
    expect(fitted.y).toBe(0)
  })

  it('fits content inside viewport insets without centering it behind an inspector', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face, viewportInsets: { bottom: 300 } },
      global: { stubs: { CardFaceRenderer: true } },
    })
    const viewport = wrapper.vm as unknown as {
      fitContent(rect: { left: number; top: number; width: number; height: number }): void
    }
    const content = { left: 20, top: 30, width: 100, height: 100 }

    viewport.fitContent(content)
    await nextTick()

    const transformEvents = wrapper.emitted('viewport-transform-change') ?? []
    const fitted = transformEvents[transformEvents.length - 1]?.[0] as { x: number; y: number; scale: number }
    const baseX = (1000 - face.width * fitted.scale) / 2
    const baseY = (800 - face.height * fitted.scale) / 2
    expect(baseX + fitted.x + (content.left + content.width / 2) * fitted.scale).toBeCloseTo(500)
    expect(baseY + fitted.y + (content.top + content.height / 2) * fitted.scale).toBeCloseTo(250)
  })

  it('still emits one blank click when the comparison stage covers the canvas', async () => {
    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face,
        comparison: {
          before: { face, resourceContext, placeholder: true },
          after: { face: { ...face, background: '#000000' }, resourceContext },
          divider: 0.4,
          viewMode: 'split',
        },
      },
      global: { stubs: { CardFaceRenderer: true } },
    })

    wrapper.element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('blank-click')).toHaveLength(1)
    wrapper.unmount()
  })

  it('pauses viewport zoom while layer view is active and restores it on exit', async () => {
    const layerFace: RenderReadyCardFace = { ...face, children: [textChild('layer-block', '0px', '0px')] }
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face: layerFace, layerViewActive: true },
    })
    const viewport = wrapper.vm as unknown as {
      zoomBy: (factor: number) => void
      cycleLayerByInitial: (initial: string, currentLayerOnly?: boolean) => boolean
    }

    const layerName = String(layerFace.children[0]!.block.name)
    expect(viewport.cycleLayerByInitial(Array.from(layerName.trimStart())[0]!.toUpperCase())).toBe(true)

    viewport.zoomBy(1.25)
    await flushAnimation()
    expect(wrapper.emitted('viewport-transform-change')).toBeUndefined()

    await wrapper.setProps({ layerViewActive: false })
    viewport.zoomBy(1.25)
    await flushAnimation()
    expect(wrapper.emitted('viewport-transform-change')?.length).toBeGreaterThan(0)
  })

  it('emits anchor-preserving geometry actions and nudges from the public viewport API', async () => {
    const parentContainer = parseRenderReadyBlockForTest(createSimpleContainerBlock({
      id: 'parent',
      width: '400px',
      height: '300px',
      children: [{
        block: parseRenderReadyBlockForTest(createTextBlock({ id: 'selected', width: '100px', height: '80px' } as unknown as Parameters<typeof createTextBlock>[0])),
        location: {
          id: 'selected-location',
          type: 'simple-container-location',
          anchor: 'lt',
          x: '50px',
          y: '50px',
        },
      }],
    }))

    const actionFace: RenderReadyCardFace = {
      ...face,
      children: [{
        block: parentContainer,
        location: { id: 'parent-location', type: 'simple-container-location', anchor: 'lt', x: '100px', y: '100px' },
      }],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: actionFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'rb',
        selectedParentBlockId: 'parent',
      },
    })
    await flushPromises()

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()

    wrapper.vm.runSelectionQuickAction('fill-parent')
    expect(wrapper.emitted('selection-action')?.[0]).toEqual([
      { type: 'fill-parent', blockId: 'selected', width: true, height: true },
    ])

    expect(wrapper.vm.runSelectionQuickAction('outset')).toBe(true)
    const selectionActions = wrapper.emitted('selection-action') ?? []
    expect(selectionActions[selectionActions.length - 1]).toEqual([{
      type: 'geometry.apply', operation: 'outset', blockId: 'selected',
      width: 120, height: 100, x: 240, y: 160,
    }])

    expect(wrapper.vm.nudgeSelection(1, -1)).toBe(true)
    expect(wrapper.emitted('move-selection')).toEqual([[{ blockId: 'selected', x: 249, y: 171 }]])
  })

  it('drops a locked axis from the emitted quick action', async () => {
    const parentContainer = parseRenderReadyBlockForTest(createSimpleContainerBlock({
      id: 'parent',
      width: '400px',
      height: '300px',
      children: [{
        block: parseRenderReadyBlockForTest(createTextBlock({ id: 'selected', width: '100px', height: '80px' } as unknown as Parameters<typeof createTextBlock>[0])),
        location: {
          id: 'selected-location',
          type: 'simple-container-location',
          anchor: 'lt',
          x: '50px',
          y: '50px',
        },
      }],
    }))

    const actionFace: RenderReadyCardFace = {
      ...face,
      children: [{
        block: parentContainer,
        location: { id: 'parent-location', type: 'simple-container-location', anchor: 'lt', x: '100px', y: '100px' },
      }],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: actionFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'rb',
        selectedParentBlockId: 'parent',
      },
    })
    await flushPromises()

    await wrapper.setProps({ selectedBlockId: 'selected', widthLocked: true, heightLocked: false })
    await nextTick()
    await flushPromises()

    expect(wrapper.vm.runSelectionQuickAction('outset')).toBe(true)
    const actions = wrapper.emitted('selection-action') ?? []
    expect(actions[actions.length - 1]).toEqual([{
      type: 'geometry.apply', operation: 'outset', blockId: 'selected',
      height: 100, y: 160,
    }])
  })

  it('emits only the resized axis for a flow child', async () => {
    const flowContainer = parseRenderReadyBlockForTest(createFlowContainerBlock({
      id: 'parent',
      width: '400px',
      height: '300px',
      direction: 'lr',
      children: [{
        block: parseRenderReadyBlockForTest(createTextBlock({ id: 'selected', width: '225px', height: '80px' } as unknown as Parameters<typeof createTextBlock>[0])),
        location: {
          id: 'selected-location',
          type: 'flow-container-location',
          index: '0',
          align: 'start',
        },
      }],
    }))

    const flowFace: RenderReadyCardFace = {
      ...face,
      children: [{
        block: flowContainer,
        location: { id: 'parent-location', type: 'simple-container-location', anchor: 'lt', x: '100px', y: '100px' },
      }],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: flowFace,
        selectedBlockId: null,
        selectedLocationType: 'flow-container-location',
        selectedParentBlockId: 'parent',
        selectedParentFlowDirection: 'lr',
        selectedFlowAlign: 'start',
      },
    })
    await flushPromises()

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()

    await wrapper.get('.selection-handle-b').trigger('pointerdown')
    const drag = createSelectionDrag()
    drag.begin()
    drag.moveBy(0, 20)
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      height: 100,
    })
  })

  it('keeps a minimum-size resize handle pinned until the pointer catches up', async () => {
    const snappingFace: RenderReadyCardFace = {
      ...face,
      children: [
        textChild('selected', '50px', '50px', '100px', '80px'),
      ],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
        alignmentSnappingEnabled: false,
      },
    })
    await flushPromises()

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-r').trigger('pointerdown')

    const drag = createSelectionDrag()
    drag.begin()
    drag.moveBy(-100, 0)
    drag.moveBy(-40, 0)
    drag.moveBy(20, 0)
    drag.moveBy(45, 0)

    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 25,
      height: 80,
      x: 50,
      y: 50,
    })
  })

  it('keeps the original aspect ratio while Shift resizes from a corner', async () => {
    const snappingFace: RenderReadyCardFace = {
      ...face,
      children: [
        textChild('selected', '50px', '50px', '100px', '80px'),
      ],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
        alignmentSnappingEnabled: false,
      },
    })
    await flushPromises()

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-rb').trigger('pointerdown')

    const drag = createSelectionDrag()
    drag.begin()
    drag.moveBy(40, 0, { shiftKey: true })
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 140,
      height: 112,
      x: 50,
      y: 50,
    })
  })

  it('follows the taller edge when Shift resizing a selection that is taller than it is wide', async () => {
    const snappingFace: RenderReadyCardFace = {
      ...face,
      children: [
        textChild('selected', '50px', '50px', '60px', '150px'),
      ],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
        alignmentSnappingEnabled: false,
      },
    })
    await flushPromises()

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-rb').trigger('pointerdown')

    const drag = createSelectionDrag()
    drag.begin()
    drag.moveBy(0, 30, { shiftKey: true })
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 72,
      height: 180,
      x: 50,
      y: 50,
    })
  })

  it('snaps the ratio-driven edge while Shift resizing and commits only the snapped size', async () => {
    const snappingFace: RenderReadyCardFace = {
      ...face,
      children: [
        textChild('selected', '50px', '150px', '100px', '80px'),
        textChild('sibling', '200px', '265px', '80px', '60px'),
      ],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
      },
    })
    const viewportEl = wrapper.get('.card-viewport').element as HTMLElement
    viewportEl.style.setProperty('--oc-viewport-alignment-snap-distance', '8px')
    viewportEl.style.setProperty('--oc-viewport-alignment-snap-release-distance', '12px')

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-rb').trigger('pointerdown')

    const drag = createSelectionDrag()
    drag.begin()
    drag.moveBy(40, 0, { shiftKey: true })
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 143.75,
      height: 115,
      x: 50,
      y: 150,
    })
  })

  it('snaps absolute resize and move edges to a direct sibling', async () => {
    const snappingFace: RenderReadyCardFace = {
      ...face,
      children: [
        textChild('selected', '50px', '50px', '100px', '80px'),
        textChild('sibling', '158px', '20px', '80px', '60px'),
      ],
    }

    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
      },
    })
    const viewportEl = wrapper.get('.card-viewport').element as HTMLElement
    viewportEl.style.setProperty('--oc-viewport-alignment-snap-distance', '8px')
    viewportEl.style.setProperty('--oc-viewport-alignment-snap-release-distance', '12px')

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-r').trigger('pointerdown')
    const resizeDrag = createSelectionDrag()
    resizeDrag.begin()
    resizeDrag.moveBy(5, 0)
    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 108,
      height: 80,
      x: 50,
      y: 50,
    })

    await wrapper.get('.selection-frame').trigger('pointerdown')
    const moveDrag = createSelectionDrag()
    moveDrag.begin()
    moveDrag.moveBy(5, 0)
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('move-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      x: 58,
      y: 50,
    })

    await wrapper.setProps({ alignmentSnappingEnabled: false })
    await wrapper.get('.selection-frame').trigger('pointerdown')
    const unsnappedDrag = createSelectionDrag()
    unsnappedDrag.begin()
    unsnappedDrag.moveBy(5, 0)
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('move-selection')?.[1]?.[0]).toEqual({
      blockId: 'selected',
      x: 55,
      y: 50,
    })
  })

  it('drags face dimensions by axis and snaps to half-millimeters with Shift', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face },
      slots: { 'left-info': 'Height', 'bottom-info': 'Width' },
      global: { stubs: { CardFaceRenderer: true } },
    })

    wrapper.find('.card-viewport-bottom-info').element.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0,
      clientX: 100,
      bubbles: true,
    }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 135.3, shiftKey: true }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    wrapper.find('.card-viewport-left-info').element.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0,
      clientY: 100,
      bubbles: true,
    }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 70 }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(wrapper.emitted('face-dimension-change')).toEqual([
      [{ dimension: 'width', value: face.width + 35.5, final: false }],
      [{ dimension: 'width', value: face.width + 35.5, final: true }],
      [{ dimension: 'height', value: face.height + 30, final: false }],
      [{ dimension: 'height', value: face.height + 30, final: true }],
    ])
  })

  it('drags face dimensions outward by dragging downward for width and leftward for height', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face },
      slots: { 'left-info': 'Height', 'bottom-info': 'Width' },
      global: { stubs: { CardFaceRenderer: true } },
    })

    // Pulling bottom resizer downward increases width
    wrapper.find('.card-viewport-bottom-info').element.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 150 }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    // Pulling left resizer leftward increases height
    wrapper.find('.card-viewport-left-info').element.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0,
      clientX: 100,
      clientY: 100,
      bubbles: true,
    }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 100 }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(wrapper.emitted('face-dimension-change')).toEqual([
      [{ dimension: 'width', value: face.width + 50, final: false }],
      [{ dimension: 'width', value: face.width + 50, final: true }],
      [{ dimension: 'height', value: face.height + 40, final: false }],
      [{ dimension: 'height', value: face.height + 40, final: true }],
    ])
  })

  it('isolates the HUD from the stage and hides HUD elements when zooming past fit scale threshold', async () => {
    const normalWrapper = mount(CardViewport, {
      props: { resourceContext, face, transform: { x: 0, y: 0, scale: 1 } },
      slots: { info: 'Card Info', 'left-info': 'Height', 'bottom-info': 'Width' },
      global: { stubs: { CardFaceRenderer: true } },
    })

    // Stage does not contain HUD elements
    expect(normalWrapper.find('.card-viewport-stage .card-viewport-info').exists()).toBe(false)
    expect(normalWrapper.find('.card-viewport-stage .card-viewport-left-info').exists()).toBe(false)
    expect(normalWrapper.find('.card-viewport-stage .card-viewport-bottom-info').exists()).toBe(false)

    // HUD layer contains all items at normal scale
    expect(normalWrapper.find('.card-viewport-hud .card-viewport-info').exists()).toBe(true)
    expect(normalWrapper.find('.card-viewport-hud .card-viewport-left-info').exists()).toBe(true)
    expect(normalWrapper.find('.card-viewport-hud .card-viewport-bottom-info').exists()).toBe(true)

    // Zoomed in past fit scale threshold (scale 15 > maxHudScale ~11.4)
    const zoomedWrapper = mount(CardViewport, {
      props: { resourceContext, face, transform: { x: 0, y: 0, scale: 15 } },
      slots: { info: 'Card Info', 'left-info': 'Height', 'bottom-info': 'Width' },
      global: { stubs: { CardFaceRenderer: true } },
    })

    expect(zoomedWrapper.find('.card-viewport-hud .card-viewport-info').exists()).toBe(false)
    expect(zoomedWrapper.find('.card-viewport-hud .card-viewport-left-info').exists()).toBe(false)
    expect(zoomedWrapper.find('.card-viewport-hud .card-viewport-bottom-info').exists()).toBe(false)
  })

  it('hits the topmost block in z-order when blocks overlap on the canvas', async () => {
    const overlappingFace: RenderReadyCardFace = {
      ...face,
      children: [
        textChild('under', '50px', '50px', '200px', '200px', { zIndex: 1 }),
        textChild('top', '100px', '100px', '100px', '100px', { zIndex: 10 }),
      ],
    }
    const wrapper = mount(CardViewport, { props: { resourceContext, face: overlappingFace } })
    await flushPromises()

    const canvas = wrapper.get('.card-canvas')
    // Click at world (150, 150)
    canvas.element.dispatchEvent(new MouseEvent('click', {
      clientX: 150,
      clientY: 150,
      bubbles: true,
    }))
    await nextTick()

    expect(wrapper.emitted('block-click')?.[0]?.[0]).toBe('top')
  })

  it('emits blank-click when canvas click misses all blocks', async () => {
    const faceWithBlock: RenderReadyCardFace = {
      ...face,
      children: [textChild('single', '50px', '50px', '100px', '50px')],
    }
    const wrapper = mount(CardViewport, { props: { resourceContext, face: faceWithBlock } })
    await flushPromises()

    const canvas = wrapper.get('.card-canvas')
    // Click at world (500, 700) where no block exists
    canvas.element.dispatchEvent(new MouseEvent('click', {
      clientX: 500,
      clientY: 700,
      bubbles: true,
    }))
    await nextTick()

    expect(wrapper.emitted('blank-click')).toHaveLength(1)
  })
})
