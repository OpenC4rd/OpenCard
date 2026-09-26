import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderReadyCardFace } from '../render.types'
import { createTextBlock } from '../../../entities/card/model'
import CardViewport from './CardViewport.vue'
import { parseRenderReadyBlockForTest } from './renderTestUtils'
import { useFloatingMenu } from '../../../composables/useFloatingMenu'
import { createCardRenderResourceContext } from '../cardRenderResources'

const resourceContext = createCardRenderResourceContext({})

const face: RenderReadyCardFace = {
  type: 'card-face',
  id: 'test-face',
  faceKey: 'front',
  width: 630,
  height: 880,
  background: '#ffffff',
  children: [],
}

const layeredFace: RenderReadyCardFace = {
  ...face,
  children: [{
    block: parseRenderReadyBlockForTest(createTextBlock({ id: 'layer-block', zIndex: '2' })),
    location: {
      id: 'layer-location',
      type: 'simple-container-location',
      anchor: 'lt',
      x: '0px',
      y: '0px',
    },
  }],
}

const snappingFace: RenderReadyCardFace = {
  ...face,
  children: [
    {
      block: parseRenderReadyBlockForTest(createTextBlock({ id: 'selected' })),
      location: { id: 'selected-location', type: 'simple-container-location', anchor: 'lt', x: '50px', y: '50px' },
    },
    {
      block: parseRenderReadyBlockForTest(createTextBlock({ id: 'sibling' })),
      location: { id: 'sibling-location', type: 'simple-container-location', anchor: 'lt', x: '158px', y: '20px' },
    },
  ],
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
}

describe('CardViewport wheel zoom API', () => {
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
    useFloatingMenu().closeMenu()
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
      },
    }
  }

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
    const zoomedIn = zoomEvents[zoomEvents.length - 1]?.[0] as {
      x: number
      y: number
      scale: number
    }
    expect(zoomedIn.scale).toBeGreaterThan(1)
    const zoomedWorldX = (
      anchorX - (1000 - face.width * zoomedIn.scale) / 2 - zoomedIn.x
    ) / zoomedIn.scale
    const zoomedWorldY = (
      anchorY - (800 - face.height * zoomedIn.scale) / 2 - zoomedIn.y
    ) / zoomedIn.scale
    expect(zoomedWorldX).toBeCloseTo(initialWorldX, 4)
    expect(zoomedWorldY).toBeCloseTo(initialWorldY, 4)
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
    const fitted = transformEvents[transformEvents.length - 1]?.[0] as {
      x: number
      y: number
      scale: number
    }
    expect(fitted.scale).toBeCloseTo(536 / face.height, 4)
    expect(fitted.scale).not.toBe(1)
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

  it('forwards face clipping to the face renderer', () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face, clipToFace: true },
    })

    expect(wrapper.find('.card-canvas').classes()).toContain('card-canvas--clipped')
  })

  it('renders comparison revisions inside one viewport stage and preserves blank selection', async () => {
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
      global: { stubs: { CardFaceRenderer: defineComponent({ name: 'CardFaceRenderer', render: () => h('div') }) } },
    })

    expect(wrapper.findAllComponents({ name: 'CardFaceRenderer' })).toHaveLength(1)
    expect(wrapper.find('.card-comparison-placeholder').exists()).toBe(true)
    expect(wrapper.findAll('.card-viewport')).toHaveLength(1)
    expect(wrapper.findAll('.card-viewport-comparison-layer')).toHaveLength(2)
    expect(wrapper.findAll('.card-viewport-comparison-layer')[1]!.attributes('style')).toContain('inset(0 0 0 40%)')
    expect(wrapper.find('.card-viewport-stage--before').exists()).toBe(true)
    expect(wrapper.find('.card-viewport-stage--after').exists()).toBe(true)
    expect(wrapper.find('.card-viewport-comparison-divider').exists()).toBe(true)
    wrapper.element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('blank-click')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps the comparison divider inside the viewport safe region', async () => {
    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face,
        viewportInsets: { left: 200, right: 300 },
        comparison: {
          before: { face, resourceContext },
          after: { face, resourceContext },
          divider: 0.5,
          viewMode: 'split',
        },
      },
      global: { stubs: { CardFaceRenderer: true } },
    })
    await nextTick()
    expect(wrapper.find('.card-viewport-comparison-divider').attributes('style')).toContain('left: 450px')
  })

  it('centers side-by-side revisions inside equal safe-region halves', async () => {
    const wrapper = mount(CardViewport, {
      props: {
        resourceContext,
        face,
        viewportInsets: { left: 200, right: 300 },
        comparison: {
          before: { face, resourceContext },
          after: { face, resourceContext },
          divider: 0.2,
          viewMode: 'side-by-side',
        },
      },
      global: { stubs: { CardFaceRenderer: true } },
    })
    await nextTick()
    const stages = wrapper.findAll('.card-viewport-comparison-layer .card-viewport-stage')
    expect(stages[0]!.attributes('style')).toContain('translate(10px, -40px)')
    expect(stages[1]!.attributes('style')).toContain('translate(260px, -40px)')
    expect(wrapper.get('.card-viewport-comparison-divider').classes()).toContain('is-static')
    expect(wrapper.get('.card-viewport-comparison-divider').attributes('style')).toContain('left: 450px')
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

  it('flashes and replaces centered viewport status feedback', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face },
      global: { stubs: { CardFaceRenderer: true } },
    })
    const viewport = wrapper.vm as unknown as {
      flashStatus(status: { icon: 'tool.flip-to-back' | 'tool.snap-grid-on'; message: string }): void
    }

    viewport.flashStatus({ icon: 'tool.flip-to-back', message: 'Switched to back face' })
    await nextTick()
    expect(wrapper.get('.card-viewport-status-flash').text()).toContain('Switched to back face')

    viewport.flashStatus({ icon: 'tool.snap-grid-on', message: 'Alignment snapping enabled' })
    await nextTick()
    const flash = wrapper.get('.card-viewport-status-flash')
    expect(flash.text()).toContain('Alignment snapping enabled')
    await flash.trigger('animationend')
    expect(wrapper.find('.card-viewport-status-flash').exists()).toBe(false)
  })

  it('pauses viewport zoom while layer view is active and restores it on exit', async () => {
    const LayerSourceStub = defineComponent({
      name: 'CardFaceRenderer',
      template: '<div data-block-id="layer-block">Layer</div>',
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face: layeredFace, layerViewActive: true, layerViewBasePlaneLabel: 'Base plate' },
      global: { stubs: { CardFaceRenderer: LayerSourceStub } },
    })
    const viewport = wrapper.vm as unknown as {
      zoomBy: (factor: number) => void
      cycleLayerByInitial: (initial: string, currentLayerOnly?: boolean) => boolean
    }

    const candidateName = layeredFace.children[0]!.block.name
    const layerName = typeof candidateName === 'string' && candidateName ? candidateName : 'layer-block'
    expect(wrapper.get('.card-layer-view__base-index').text()).toBe('Base plate')
    expect(viewport.cycleLayerByInitial(Array.from(layerName.trimStart())[0]!)).toBe(true)

    viewport.zoomBy(1.25)
    await flushAnimation()
    expect(wrapper.emitted('viewport-transform-change')).toBeUndefined()
    expect(wrapper.get('.card-viewport').classes()).toContain('card-viewport--layer-view')

    await wrapper.setProps({ layerViewActive: false })
    viewport.zoomBy(1.25)
    await flushAnimation()
    expect(wrapper.emitted('viewport-transform-change')?.length).toBeGreaterThan(0)
    expect(wrapper.get('.card-viewport').classes()).not.toContain('card-viewport--layer-view')
  })

  it('anchors supplemental information to the top-right of the face', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face },
      slots: {
        info: '<div data-test="face-info">Details</div>',
        'left-info': '<div data-test="height-info">Height</div>',
        'bottom-info': '<div data-test="width-info">Width</div>',
      },
      global: { stubs: { CardFaceRenderer: true } },
    })

    const info = wrapper.find('.card-viewport-info')
    expect(info.exists()).toBe(true)
    expect(info.attributes('style')).toContain(`left: ${face.width + 16}px`)
    expect(info.find('[data-test="face-info"]').text()).toBe('Details')
    expect(wrapper.find('.card-viewport-left-info').attributes('style'))
      .toContain(`top: ${face.height / 2}px`)
    expect(wrapper.find('.card-viewport-left-info .card-viewport-dimension-line').classes())
      .toContain('card-viewport-dimension-line--vertical')
    expect(wrapper.find('[data-test="height-info"]').text()).toBe('Height')
    expect(wrapper.find('.card-viewport-bottom-info').attributes('style'))
      .toContain(`left: ${face.width / 2}px`)
    expect(wrapper.find('[data-test="width-info"]').text()).toBe('Width')
    expect(wrapper.find('.card-viewport-left-info .card-viewport-dimension-line').attributes('style'))
      .toContain(`height: ${face.height}px`)
    expect(wrapper.find('.card-viewport-bottom-info .card-viewport-dimension-line').attributes('style'))
      .toContain(`width: ${face.width}px`)

    await wrapper.setProps({ showInfo: false })
    expect(wrapper.find('.card-viewport-info').exists()).toBe(false)
    expect(wrapper.find('.card-viewport-left-info').exists()).toBe(false)
    expect(wrapper.find('.card-viewport-bottom-info').exists()).toBe(false)
  })

  it('emits anchor-preserving geometry actions from the selection toolbar', async () => {
    const SelectionRendererStub = defineComponent({
      name: 'CardFaceRenderer',
      setup() {
        return () => h('div', { 'data-block-id': 'parent' }, [
          h('div', { 'data-block-id': 'selected' }),
        ])
      },
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext,
        face,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'rb',
        selectedParentBlockId: 'parent',
        selectionInfo: {
          icon: 'entity.block-text',
          iconTone: 'block-text',
          name: 'Title',
          notes: 'Primary heading',
        },
        selectionCommandActions: [{
          key: 'content.edit-rich-text',
          icon: 'format.text-variant-outline',
          title: 'Edit rich text',
        }],
      },
      global: { stubs: { CardFaceRenderer: SelectionRendererStub } },
    })
    const viewport = wrapper.get('.card-viewport').element
    const parent = wrapper.get('[data-block-id="parent"]').element
    const selected = wrapper.get('[data-block-id="selected"]').element
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    })
    Object.defineProperty(parent, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 }),
    })
    Object.defineProperty(selected, 'getBoundingClientRect', {
      value: () => ({ left: 150, top: 150, width: 100, height: 80, right: 250, bottom: 230 }),
    })

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    const actions = wrapper.findAllComponents({ name: 'OcActionButton' })
    expect(actions.map((action) => action.props('action').key))
      .toEqual(['content.edit-rich-text', 'fill-parent', 'center', 'inset', 'outset'])
    expect(actions.map((action) => action.props('action').icon))
      .toEqual([
        'format.text-variant-outline',
        'layout.fill',
        'layout.center',
        'layout.inset',
        'layout.outset',
      ])
    expect(wrapper.get('.selection-block-info__title').text()).toContain('Title')
    expect(wrapper.get('.selection-block-info__notes').text()).toBe('Primary heading')
    expect(wrapper.get('.selection-block-info').attributes('data-tooltip')).toBeUndefined()
    await wrapper.get('.selection-block-info').trigger('pointerdown')
    expect(wrapper.get('.selection-frame').classes()).not.toContain('is-moving')

    actions.find((action) => action.props('action').key === 'fill-parent')
      ?.vm.$emit('select', { key: 'fill-parent' })
    actions.find((action) => action.props('action').key === 'center')
      ?.vm.$emit('select', { key: 'center' })
    actions.find((action) => action.props('action').key === 'content.edit-rich-text')
      ?.vm.$emit('select', { key: 'content.edit-rich-text' })

    expect(wrapper.emitted('selection-action')).toEqual([
      [{ type: 'fill-parent', blockId: 'selected', width: true, height: true }],
      [{
        type: 'geometry.apply',
        operation: 'center',
        blockId: 'selected',
        x: 150,
        y: 110,
      }],
    ])
    expect(wrapper.emitted('selection-command')).toEqual([[
      { key: 'content.edit-rich-text', blockId: 'selected' },
    ]])

    expect(wrapper.vm.runSelectionQuickAction('outset')).toBe(true)
    expect(wrapper.vm.nudgeSelection(1, -1)).toBe(true)
    const selectionActions = wrapper.emitted('selection-action') ?? []
    expect(selectionActions[selectionActions.length - 1]).toEqual([{
      type: 'geometry.apply',
      operation: 'outset',
      blockId: 'selected',
      width: 120,
      height: 100,
      x: 240,
      y: 160,
    }])
    expect(wrapper.emitted('move-selection')).toEqual([[{
      blockId: 'selected',
      x: 249,
      y: 171,
    }]])

    await wrapper.get('.selection-frame').trigger('contextmenu')
    const menu = useFloatingMenu()
    expect(menu.state.value.items.map(item => item.key))
      .toEqual([
        'content.edit-rich-text',
        'selection-layout-divider',
        'fill-parent',
        'center',
        'inset',
        'outset',
      ])
    menu.selectMenuItem('fill-parent')
    const contextSelectionActions = wrapper.emitted('selection-action') ?? []
    expect(contextSelectionActions[contextSelectionActions.length - 1]).toEqual([
      { type: 'fill-parent', blockId: 'selected', width: true, height: true },
    ])

    await wrapper.get('.selection-handle-t').trigger('pointerdown')
    expect(wrapper.find('.selection-block-info').exists()).toBe(false)
    expect(wrapper.find('.selection-size-label--width').exists()).toBe(false)
    expect(wrapper.get('.selection-size-label--height').text()).toBe('80px')
    await wrapper.setProps({ selectedBlockId: 'other' })
    const resizeDrag = createSelectionDrag()
    resizeDrag.begin()
    resizeDrag.moveBy(0, -10)
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toMatchObject({
      blockId: 'selected',
      width: 100,
      height: 90,
    })
    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()

    await wrapper.get('.selection-frame').trigger('pointerdown')
    expect(wrapper.find('.selection-block-info').exists()).toBe(false)
    expect(wrapper.get('.selection-frame').classes()).toContain('is-moving')
    expect(wrapper.get('.selection-anchor-guide-label--x').text()).toBe('x 250px')
    expect(wrapper.get('.selection-anchor-guide-label--y').text()).toBe('y 170px')
    expect(wrapper.get('.selection-anchor-badge').text()).toBe('RB')
    window.dispatchEvent(new Event('pointercancel'))
    await wrapper.setProps({ showPositionOnMove: false, showSizeOnResize: false })
    await wrapper.get('.selection-handle-t').trigger('pointerdown')
    expect(wrapper.find('.selection-size-label').exists()).toBe(false)
    window.dispatchEvent(new Event('pointercancel'))
    await nextTick()
    await wrapper.get('.selection-frame').trigger('pointerdown')
    expect(wrapper.find('.selection-anchor-guide').exists()).toBe(false)
    window.dispatchEvent(new Event('pointercancel'))

    await wrapper.setProps({ widthLocked: true, heightLocked: false })
    expect(wrapper.findAll('.selection-handle').map(handle => handle.classes()[1]))
      .toEqual(['selection-handle-t', 'selection-handle-b'])
    expect(wrapper.vm.runSelectionQuickAction('outset')).toBe(true)
    const lockedActions = wrapper.emitted('selection-action') ?? []
    expect(lockedActions[lockedActions.length - 1]).toEqual([{
      type: 'geometry.apply', operation: 'outset', blockId: 'selected',
      height: 100, y: 160,
    }])
    await wrapper.setProps({ heightLocked: true })
    expect(wrapper.findAll('.selection-handle')).toHaveLength(0)
    expect(wrapper.findAllComponents({ name: 'OcActionButton' }).map(action => action.props('action').key))
      .toEqual(['content.edit-rich-text', 'center'])
  })

  it('uses direction-aware flow handles and emits only the resized axis', async () => {
    const SelectionRendererStub = defineComponent({
      name: 'CardFaceRenderer',
      setup() {
        return () => h('div', { 'data-block-id': 'parent' }, [
          h('div', { 'data-block-id': 'selected' }),
        ])
      },
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext,
        face,
        selectedBlockId: null,
        selectedLocationType: 'flow-container-location',
        selectedParentBlockId: 'parent',
        selectedParentFlowDirection: 'lr',
        selectedFlowAlign: 'start',
      },
      global: { stubs: { CardFaceRenderer: SelectionRendererStub } },
    })
    const viewport = wrapper.get('.card-viewport').element
    const parent = wrapper.get('[data-block-id="parent"]').element
    const selected = wrapper.get('[data-block-id="selected"]').element
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    })
    Object.defineProperty(parent, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 }),
    })
    Object.defineProperty(selected, 'getBoundingClientRect', {
      value: () => ({ left: 150, top: 150, width: 225, height: 80, right: 375, bottom: 230 }),
    })

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    expect(wrapper.findAll('.selection-handle').map(handle => handle.classes()[1]))
      .toEqual(['selection-handle-r', 'selection-handle-b'])

    await wrapper.get('.selection-handle-b').trigger('pointerdown')
    const crossAxisDrag = createSelectionDrag()
    crossAxisDrag.begin()
    crossAxisDrag.moveBy(0, 20)
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      height: 100,
    })

    await wrapper.setProps({ selectedParentFlowDirection: 'rl', selectedFlowAlign: 'end' })
    expect(wrapper.findAll('.selection-handle').map(handle => handle.classes()[1]))
      .toEqual(['selection-handle-l', 'selection-handle-t'])
    await wrapper.setProps({ selectedFlowAlign: 'justify' })
    expect(wrapper.findAll('.selection-handle').map(handle => handle.classes()[1]))
      .toEqual(['selection-handle-l'])
    await wrapper.setProps({ selectedParentFlowDirection: 'lr', selectedFlowAlign: 'center' })
    expect(wrapper.findAll('.selection-handle').map(handle => handle.classes()[1]))
      .toEqual(['selection-handle-r', 'selection-handle-t', 'selection-handle-b'])
    await wrapper.get('.selection-handle-b').trigger('pointerdown')
    const centeredCrossAxisDrag = createSelectionDrag()
    centeredCrossAxisDrag.begin()
    centeredCrossAxisDrag.moveBy(0, 10)
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[1]?.[0]).toEqual({
      blockId: 'selected',
      height: 100,
    })
    await wrapper.setProps({ widthLocked: true, heightLocked: false })
    expect(wrapper.findAll('.selection-handle').map(handle => handle.classes()[1]))
      .toEqual(['selection-handle-t', 'selection-handle-b'])
    await wrapper.setProps({ widthLocked: false, heightLocked: true })
    expect(wrapper.findAll('.selection-handle').map(handle => handle.classes()[1]))
      .toEqual(['selection-handle-r'])
    expect(wrapper.findAllComponents({ name: 'OcActionButton' }).map(action => action.props('action').key))
      .not.toContain('fill-cross-axis')
  })

  it('keeps a minimum-size resize handle pinned until the pointer catches up', async () => {
    const SelectionRendererStub = defineComponent({
      name: 'CardFaceRenderer',
      setup() {
        return () => h('div', { class: 'card-canvas' }, [
          h('div', { 'data-block-id': 'selected' }),
        ])
      },
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
        alignmentSnappingEnabled: false,
      },
      global: { stubs: { CardFaceRenderer: SelectionRendererStub } },
    })
    const viewport = wrapper.get<HTMLElement>('.card-viewport')
    const parent = wrapper.get('.card-canvas')
    const selected = wrapper.get('[data-block-id="selected"]')
    Object.defineProperty(viewport.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    })
    Object.defineProperty(parent.element, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 }),
    })
    Object.defineProperty(selected.element, 'getBoundingClientRect', {
      value: () => ({ left: 150, top: 150, width: 100, height: 80, right: 250, bottom: 230 }),
    })

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-r').trigger('pointerdown')

    const selectionDrag = createSelectionDrag()
    selectionDrag.begin()
    const moveBy = async (movementX: number) => {
      selectionDrag.moveBy(movementX, 0)
      await nextTick()
    }

    await moveBy(-100)
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('width: 24px')
    await moveBy(-40)
    await moveBy(20)
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('width: 24px')
    await moveBy(45)
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('width: 25px')

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
    const SelectionRendererStub = defineComponent({
      name: 'CardFaceRenderer',
      setup() {
        return () => h('div', { class: 'card-canvas' }, [
          h('div', { 'data-block-id': 'selected' }),
        ])
      },
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
        alignmentSnappingEnabled: false,
      },
      global: { stubs: { CardFaceRenderer: SelectionRendererStub } },
    })
    const viewport = wrapper.get<HTMLElement>('.card-viewport')
    const parent = wrapper.get('.card-canvas')
    const selected = wrapper.get('[data-block-id="selected"]')
    Object.defineProperty(viewport.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    })
    Object.defineProperty(parent.element, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 }),
    })
    Object.defineProperty(selected.element, 'getBoundingClientRect', {
      value: () => ({ left: 150, top: 150, width: 100, height: 80, right: 250, bottom: 230 }),
    })

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-rb').trigger('pointerdown')

    const drag = createSelectionDrag()
    drag.begin()
    // 100×80 是"宽的那边"更长，所以跟手的是宽：只往右拉 40，高按比例跟到 112，左上角待着不动。
    drag.moveBy(40, 0, { shiftKey: true })
    await nextTick()
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('height: 112px')

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
    const SelectionRendererStub = defineComponent({
      name: 'CardFaceRenderer',
      setup() {
        return () => h('div', { class: 'card-canvas' }, [
          h('div', { 'data-block-id': 'selected' }),
        ])
      },
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
        alignmentSnappingEnabled: false,
      },
      global: { stubs: { CardFaceRenderer: SelectionRendererStub } },
    })
    const viewport = wrapper.get<HTMLElement>('.card-viewport')
    const parent = wrapper.get('.card-canvas')
    const selected = wrapper.get('[data-block-id="selected"]')
    Object.defineProperty(viewport.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    })
    Object.defineProperty(parent.element, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 }),
    })
    Object.defineProperty(selected.element, 'getBoundingClientRect', {
      value: () => ({ left: 150, top: 150, width: 60, height: 150, right: 210, bottom: 300 }),
    })

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-rb').trigger('pointerdown')

    const drag = createSelectionDrag()
    drag.begin()
    // 竖着比横着长，所以这一回跟手的是高：往下拉 30 就是高 +30，宽按 60:150 跟到 72。
    drag.moveBy(0, 30, { shiftKey: true })
    await nextTick()
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('width: 72px')

    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 72,
      height: 180,
      x: 50,
      y: 50,
    })
  })

  it('snaps the ratio-driven edge while Shift resizing, and claims only the edge that really landed on the target', async () => {
    const SelectionRendererStub = defineComponent({
      name: 'CardFaceRenderer',
      setup() {
        return () => h('div', { class: 'card-canvas' }, [
          h('div', { 'data-block-id': 'selected' }),
          h('div', { 'data-block-id': 'sibling' }),
        ])
      },
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
      },
      global: { stubs: { CardFaceRenderer: SelectionRendererStub } },
    })
    const viewport = wrapper.get<HTMLElement>('.card-viewport')
    const parent = wrapper.get('[class="card-canvas"]')
    const selected = wrapper.get('[data-block-id="selected"]')
    const sibling = wrapper.get('[data-block-id="sibling"]')
    viewport.element.style.setProperty('--oc-viewport-alignment-snap-distance', '8px')
    viewport.element.style.setProperty('--oc-viewport-alignment-snap-release-distance', '12px')
    Object.defineProperty(viewport.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    })
    Object.defineProperty(parent.element, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 }),
    })
    Object.defineProperty(selected.element, 'getBoundingClientRect', {
      value: () => ({ left: 150, top: 150, width: 100, height: 80, right: 250, bottom: 230 }),
    })
    // 兄弟块上边在世界坐标 165：等比缩放后的底边（162）离它 3px，宽的那条边离另一条线 6px —— 该吸的是底边。
    Object.defineProperty(sibling.element, 'getBoundingClientRect', {
      value: () => ({ left: 300, top: 265, width: 80, height: 60, right: 380, bottom: 325 }),
    })

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-rb').trigger('pointerdown')

    const drag = createSelectionDrag()
    drag.begin()
    // 跟手的是宽（100 > 80）：横拉 40 本会让 100×80 变成 140×112，底边 162 被兄弟块吸到 165。
    drag.moveBy(40, 0, { shiftKey: true })
    await nextTick()

    expect(wrapper.get('.selection-frame').attributes('style')).toContain('width: 143.75px')
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('height: 115px')
    // 只有真的落在线上的那条边有引导线：另一条边只是按比例跟过来，不该画在目标上。
    const guides = wrapper.findAll('.selection-alignment-guides line')
    expect(guides).toHaveLength(1)
    expect(guides[0]!.attributes()).toMatchObject({ x1: '150', x2: '380', y1: '265', y2: '265' })

    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 143.75,
      height: 115,
      x: 50,
      y: 50,
    })
  })

  it('snaps absolute resize and move edges to a direct sibling with aligned previews', async () => {
    const SelectionRendererStub = defineComponent({
      name: 'CardFaceRenderer',
      setup() {
        return () => h('div', { class: 'card-canvas' }, [
          h('div', { 'data-block-id': 'selected' }),
          h('div', { 'data-block-id': 'sibling' }),
        ])
      },
    })
    const wrapper = mount(CardViewport, {
      props: { resourceContext,
        face: snappingFace,
        selectedBlockId: null,
        selectedLocationType: 'simple-container-location',
        selectedAnchor: 'lt',
      },
      global: { stubs: { CardFaceRenderer: SelectionRendererStub } },
    })
    const viewport = wrapper.get<HTMLElement>('.card-viewport')
    const parent = wrapper.get('[class="card-canvas"]')
    const selected = wrapper.get('[data-block-id="selected"]')
    const sibling = wrapper.get('[data-block-id="sibling"]')
    viewport.element.style.setProperty('--oc-viewport-alignment-snap-distance', '8px')
    viewport.element.style.setProperty('--oc-viewport-alignment-snap-release-distance', '12px')
    Object.defineProperty(viewport.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    })
    Object.defineProperty(parent.element, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 }),
    })
    Object.defineProperty(selected.element, 'getBoundingClientRect', {
      value: () => ({ left: 150, top: 150, width: 100, height: 80, right: 250, bottom: 230 }),
    })
    Object.defineProperty(sibling.element, 'getBoundingClientRect', {
      value: () => ({ left: 258, top: 120, width: 80, height: 60, right: 338, bottom: 180 }),
    })

    await wrapper.setProps({ selectedBlockId: 'selected' })
    await nextTick()
    await flushPromises()
    await wrapper.get('.selection-handle-r').trigger('pointerdown')
    const resizeDrag = createSelectionDrag()
    resizeDrag.begin()
    resizeDrag.moveBy(5, 0)
    await nextTick()

    const guide = wrapper.get('.selection-alignment-guides line')
    expect(guide.attributes()).toMatchObject({ x1: '258', x2: '258', y1: '120', y2: '230' })
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('width: 108px')

    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    expect(wrapper.emitted('resize-selection')?.[0]?.[0]).toEqual({
      blockId: 'selected',
      width: 108,
      height: 80,
      x: 50,
      y: 50,
    })
    expect(wrapper.find('.selection-alignment-guides').exists()).toBe(false)

    await wrapper.get('.selection-frame').trigger('pointerdown')
    const moveDrag = createSelectionDrag()
    moveDrag.begin()
    moveDrag.moveBy(5, 0)
    await nextTick()
    expect(wrapper.get('.selection-alignment-guides line').attributes())
      .toMatchObject({ x1: '258', x2: '258', y1: '120', y2: '230' })
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('left: 158px')

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
    await nextTick()
    expect(wrapper.find('.selection-alignment-guides').exists()).toBe(false)
    expect(wrapper.get('.selection-frame').attributes('style')).toContain('left: 155px')
    window.dispatchEvent(new Event('pointerup'))
    expect(wrapper.emitted('move-selection')?.[1]?.[0]).toEqual({
      blockId: 'selected',
      x: 55,
      y: 50,
    })
  })

  it('drags dimensions by axis, changes cursors, and snaps to tens with Shift', async () => {
    const wrapper = mount(CardViewport, {
      props: { resourceContext, face },
      slots: {
        'left-info': 'Height',
        'bottom-info': 'Width',
      },
      global: { stubs: { CardFaceRenderer: true } },
    })

    wrapper.find('.card-viewport-bottom-info').element.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0,
      clientX: 100,
      bubbles: true,
    }))
    expect(document.body.style.cursor).toBe('ew-resize')
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 135, shiftKey: true }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    wrapper.find('.card-viewport-left-info').element.dispatchEvent(new MouseEvent('pointerdown', {
      button: 0,
      clientY: 100,
      bubbles: true,
    }))
    expect(document.body.style.cursor).toBe('ns-resize')
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 70 }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(document.body.style.cursor).toBe('')
    expect(wrapper.emitted('face-dimension-change')).toEqual([
      [{ dimension: 'width', value: face.width + 40, final: false }],
      [{ dimension: 'width', value: face.width + 40, final: true }],
      [{ dimension: 'height', value: face.height + 30, final: false }],
      [{ dimension: 'height', value: face.height + 30, final: true }],
    ])
  })

})
