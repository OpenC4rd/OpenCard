import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderReadyCardBlock, RenderReadyCardFace } from '../render.types'
import OcIcon from '../../../components/base/OcIcon.vue'
import CardLayerView from './CardLayerView.vue'

function block(id: string, zIndex: number): RenderReadyCardBlock {
  return {
    type: 'text-block',
    id,
    name: id,
    notes: '',
    visible: true,
    width: '100px',
    height: '40px',
    borderColor: '#000000',
    borderWidth: 0,
    borderStyle: 'solid',
    borderRadius: '',
    background: '#ffffff',
    translateX: '0px',
    translateY: '0px',
    scaleX: 1,
    scaleY: 1,
    transformAnchor: 'cc',
    zIndex,
    rotation: 0,
    opacity: 1,
    customCss: '',
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

function createFace(): RenderReadyCardFace {
  return {
    type: 'card-face',
    id: 'face',
    faceKey: 'front',
    width: 630,
    height: 880,
    background: '#ffffff',
    children: [block('high-a', 3), block('high-b', 3), block('low', 1)].map(item => ({
      block: item,
      location: { id: `${item.id}-location`, type: 'simple-container-location', anchor: 'lt', x: '0px', y: '0px' },
    })),
  }
}

function createSourceRoot(): HTMLElement {
  const root = document.createElement('div')
  const canvas = document.createElement('div')
  canvas.className = 'card-canvas'
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 10, top: 20, width: 630, height: 880, right: 640, bottom: 900 }),
  })
  const positions = new Map([
    ['high-a', { left: 70, top: 100 }],
    ['high-b', { left: 270, top: 340 }],
    ['low', { left: 110, top: 520 }],
  ])
  for (const id of positions.keys()) {
    const element = document.createElement('div')
    element.dataset.blockId = id
    element.textContent = id
    const position = positions.get(id)!
    Object.defineProperties(element, {
      offsetWidth: { configurable: true, value: 100 },
      offsetHeight: { configurable: true, value: 40 },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({
          left: position.left,
          top: position.top,
          width: 100,
          height: 40,
          right: position.left + 100,
          bottom: position.top + 40,
        }),
      },
    })
    canvas.appendChild(element)
  }
  root.appendChild(canvas)
  return root
}

function dispatchPointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: MouseEventInit & { pointerId: number },
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId })
  element.dispatchEvent(event)
}

describe('CardLayerView', () => {
  let animationFrames: FrameRequestCallback[]

  beforeEach(() => {
    animationFrames = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => vi.unstubAllGlobals())

  async function flushAnimation(): Promise<void> {
    for (let index = 0; index < 100 && animationFrames.length > 0; index += 1) {
      animationFrames.shift()?.(index * 16)
    }
    await nextTick()
  }

  it('starts at the selected block layer and lays same-z blocks in one level', async () => {
    const wrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'low',
        basePlaneLabel: 'Base plate',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()

    const preview = wrapper.get('.card-layer-view__card-preview')
    expect(preview.text()).toContain('high-a')
    expect(preview.find('[data-block-id]').exists()).toBe(false)
    expect(Number.parseFloat((preview.element as HTMLElement).style.width)).toBeCloseTo(252)
    expect(Number.parseFloat((preview.element as HTMLElement).style.height)).toBeCloseTo(352)
    expect((preview.element as HTMLElement).style.zIndex).toBe('300')
    const basePlane = wrapper.get('.card-layer-view__base-plane')
    expect(basePlane.classes()).toContain('card-layer-view__block-plane')
    expect(basePlane.attributes('tabindex')).toBeUndefined()
    expect(basePlane.attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.card-layer-view__base-index').text()).toBe('Base plate')
    expect(wrapper.get('.card-layer-view__base-face').attributes('style')).toContain('background: rgb(255, 255, 255)')
    expect(wrapper.findAll('.card-layer-view__level')).toHaveLength(2)
    expect(wrapper.findAll('.card-layer-view__level')[0]?.findAll('.card-layer-view__block')).toHaveLength(2)
    expect(wrapper.findAll('.card-layer-view__level')[0]?.findAll('.card-layer-view__block-plane')).toHaveLength(2)
    const highBlocks = wrapper.findAll('.card-layer-view__level')[0]!.findAll('.card-layer-view__block')
    const highPlanes = wrapper.findAll('.card-layer-view__level')[0]!.findAll('.card-layer-view__block-plane')
    const scale = Number.parseFloat((highPlanes[0]!.element as HTMLElement).style.width) / 630
    expect(Number.parseFloat((basePlane.element as HTMLElement).style.width) / 630).toBeCloseTo(scale)
    expect(Number.parseFloat((highBlocks[0]!.element as HTMLElement).style.left) / scale).toBeCloseTo(260)
    expect(Number.parseFloat((highBlocks[0]!.element as HTMLElement).style.top) / scale).toBeCloseTo(320)
    expect(Number.parseFloat((highBlocks[1]!.element as HTMLElement).style.left) / scale).toBeCloseTo(60)
    expect(Number.parseFloat((highBlocks[1]!.element as HTMLElement).style.top) / scale).toBeCloseTo(80)
    expect((highPlanes[0]!.element as HTMLElement).style.transform)
      .toContain('translate3d(0, -416px, -108px)')
    expect((highPlanes[1]!.element as HTMLElement).style.transform)
      .toContain('translate3d(0, -288px, -54px)')
    expect(Number((highPlanes[0]!.element as HTMLElement).style.opacity)).toBe(0.015)
    expect(Number((highPlanes[1]!.element as HTMLElement).style.opacity)).toBeCloseTo(Math.exp(-1.0))
    expect((wrapper.findAll('[data-layer-block-id]')[2]!.element as HTMLElement).style.opacity).toBe('1')
    expect(wrapper.findAll('[data-layer-block-id]')[2]?.classes()).toContain('is-selected')
    expect(wrapper.findAll('.card-layer-view__block')[2]?.classes()).not.toContain('is-selected')
    expect(wrapper.findAll('.card-layer-view__tick')).toHaveLength(3)
    expect(wrapper.findAll('.card-layer-view__tick')[2]?.classes()).toContain('is-active')
    expect(wrapper.findAll('.card-layer-view__tick')[2]?.classes()).toContain('is-selected')
    expect(wrapper.findAll('.card-layer-view__tick-name').map(item => item.text()))
      .toEqual(['high-b', 'high-a', 'low'])
    expect(wrapper.findAll('.card-layer-view__level .card-layer-view__plane-index').map(item => item.text()))
      .toEqual(['Layer 3', 'Layer 1'])
    const railSegments = wrapper.findAll('.card-layer-view__rail-segment')
    expect(railSegments).toHaveLength(2)
    expect(wrapper.findAll('.card-layer-view__rail-segment-index').map(item => item.text()))
      .toEqual(['3'])
    expect(wrapper.get('.card-layer-view__rail-active-index').text()).toBe('1')
    expect((wrapper.get('.card-layer-view__rail-active-index').element as HTMLElement).style.top)
      .toBe('400px')
    expect(railSegments[1]?.classes()).toContain('is-active')
    expect((railSegments[0]!.element as HTMLElement).style.top).toBe('283px')
    expect((railSegments[0]!.element as HTMLElement).style.height).toBe('60px')
    expect((railSegments[1]!.element as HTMLElement).style.top).toBe('385px')
    expect((railSegments[1]!.element as HTMLElement).style.height).toBe('30px')
    expect((wrapper.findAll('.card-layer-view__tick')[1]!.element as HTMLElement).style.top).toBe('328px')
    expect((wrapper.findAll('.card-layer-view__tick')[2]!.element as HTMLElement).style.top).toBe('400px')
    const tickFontSizes = wrapper.findAll('.card-layer-view__tick')
      .map(item => Number.parseFloat((item.element as HTMLElement).style.fontSize))
    expect(tickFontSizes[2]).toBeCloseTo(24)
    expect(tickFontSizes[1]).toBeCloseTo(10.5 + 13.5 * Math.exp(-1.4))
    expect(tickFontSizes[2]).toBeGreaterThan(tickFontSizes[1]!)
    expect(tickFontSizes[1]).toBeGreaterThan(tickFontSizes[0]!)
    const railLeft = Number.parseFloat((wrapper.get('.card-layer-view__rail').element as HTMLElement).style.left)
    const radians = Math.PI / 180
    const projectedHalfWidth = (
      630 * scale * Math.cos(24 * radians)
      + 880 * scale * Math.cos(56 * radians) * Math.sin(24 * radians)
    ) / 2
    expect(railLeft).toBeCloseTo(500 - 40 + projectedHalfWidth + 78)

    await wrapper.setProps({ selectedBlockId: 'high-a' })
    expect(wrapper.get('[data-layer-block-id="high-a"]').classes()).toContain('is-selected')
    expect(wrapper.findAll('.card-layer-view__tick')[1]?.classes()).toContain('is-selected')
    expect(wrapper.findAll('.card-layer-view__tick')[2]?.classes()).not.toContain('is-selected')
    expect(wrapper.findAll('.card-layer-view__tick')[2]?.classes()).toContain('is-active')
  })

  it('places the non-focusable Face after Layer 0 and before negative layers', async () => {
    const face = createFace()
    face.background = 'transparent'
    face.children[0]!.block.zIndex = 1
    face.children[1]!.block.zIndex = 0
    face.children[2]!.block.zIndex = -1
    const wrapper = mount(CardLayerView, {
      props: {
        face,
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-b',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()

    const base = wrapper.get('.card-layer-view__base-plane')
    const high = wrapper.get('[data-layer-block-id="high-a"]')
    const negative = wrapper.get('[data-layer-block-id="low"]')
    expect((base.element as HTMLElement).style.transform)
      .toContain('translate3d(0, 128px, -54px)')
    expect((negative.element as HTMLElement).style.transform)
      .toContain('translate3d(0, 416px, -108px)')
    expect((base.element as HTMLElement).style.opacity)
      .toBe((high.element as HTMLElement).style.opacity)
    expect((base.element as HTMLElement).style.transform)
      .toContain('translate3d(0, 128px, -54px) rotateX(56deg) rotateZ(-24deg)')
    expect((high.element as HTMLElement).style.transform)
      .toContain('translate3d(0, -288px, -54px) rotateX(56deg) rotateZ(-24deg)')
    expect((base.element as HTMLElement).style.transform).toMatch(/^perspective\(1400px\)/)
    expect((high.element as HTMLElement).style.transform).toMatch(/^perspective\(1400px\)/)
    expect(wrapper.findAll('.card-layer-view__tick')).toHaveLength(3)
    expect(base.attributes('tabindex')).toBeUndefined()
    expect(wrapper.get('.card-layer-view__base-face').attributes('style'))
      .toContain('background: transparent')
  })

  it('cycles matching name initials with wraparound and optional layer scope', async () => {
    const namedFace = createFace()
    namedFace.children[0]!.block.name = 'Alpha'
    namedFace.children[1]!.block.name = 'Atlas'
    namedFace.children[2]!.block.name = ' amber'
    const wrapper = mount(CardLayerView, {
      props: {
        face: namedFace,
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-a',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()
    const view = wrapper.vm as unknown as {
      cycleLayerByInitial: (initial: string, currentLayerOnly?: boolean) => boolean
      getFocusedBlockId: () => string | null
    }

    expect(view.cycleLayerByInitial('a')).toBe(true)
    expect(view.getFocusedBlockId()).toBe('low')
    expect(view.cycleLayerByInitial('A')).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-b')
    expect(view.cycleLayerByInitial('a')).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-a')

    expect(view.cycleLayerByInitial('a', true)).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-b')
    expect(view.cycleLayerByInitial('a', true)).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-a')
    expect(view.cycleLayerByInitial('z')).toBe(false)
    expect(view.getFocusedBlockId()).toBe('high-a')
  })

  it('cycles Chinese block names by their Pinyin initial', async () => {
    const namedFace = createFace()
    namedFace.children[0]!.block.name = '标题'
    namedFace.children[1]!.block.name = '背景'
    namedFace.children[2]!.block.name = 'Button'
    const wrapper = mount(CardLayerView, {
      props: {
        face: namedFace,
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-a',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()
    const view = wrapper.vm as unknown as {
      cycleLayerByInitial: (initial: string, currentLayerOnly?: boolean) => boolean
      getFocusedBlockId: () => string | null
    }

    expect(view.cycleLayerByInitial('b')).toBe(true)
    expect(view.getFocusedBlockId()).toBe('low')
    expect(view.cycleLayerByInitial('B')).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-b')
    expect(view.cycleLayerByInitial('b')).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-a')

    expect(view.cycleLayerByInitial('b', true)).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-b')
    expect(view.cycleLayerByInitial('b', true)).toBe(true)
    expect(view.getFocusedBlockId()).toBe('high-a')
  })

  it('centers the selected plane or the middle plane when selection is empty', async () => {
    const selectedWrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-b',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()
    const selectedPlane = selectedWrapper.get('[data-layer-block-id="high-b"]').element as HTMLElement
    expect(selectedPlane.style.transform).toContain('translate3d(0, 0px, 0px)')

    const defaultWrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: null,
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()
    expect(defaultWrapper.findAll('.card-layer-view__tick')[1]?.classes()).toContain('is-active')
    expect((defaultWrapper.findAll('[data-layer-block-id]')[1]!.element as HTMLElement).style.transform)
      .toContain('translate3d(0, 0px, 0px)')
  })

  it('normalizes oversized card planes to the viewport', async () => {
    const oversizedFace = { ...createFace(), width: 10000, height: 12000 }
    const wrapper = mount(CardLayerView, {
      props: {
        face: oversizedFace,
        sourceRoot: createSourceRoot(),
        selectedBlockId: null,
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()

    const plane = wrapper.get('[data-layer-block-id]').element as HTMLElement
    expect(Number.parseFloat(plane.style.width)).toBeLessThan(1000)
    expect(Number.parseFloat(plane.style.height)).toBeLessThan(1000)
  })

  it('renders the localized shortcut legend through the shared shortcut contract', async () => {
    const wrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: null,
        viewportWidth: 1000,
        viewportHeight: 800,
        shortcutLegendLabel: 'Layer view shortcuts',
        shortcutHints: [
          {
            keys: [{ icon: 'mdiMouseScrollWheel' }, { separator: 'or' }, '↑ / ↓'],
            label: 'Step through planes',
          },
          {
            keys: [
              { icon: 'mdiAppleKeyboardShift' },
              { icon: 'mdiMouseScrollWheel' },
              { separator: 'or' },
              '↑ / ↓',
            ],
            label: 'Jump between layers',
          },
        ],
      },
    })
    await nextTick()

    const legend = wrapper.get('.card-layer-view__shortcut-legend')
    expect(legend.attributes('aria-label')).toBe('Layer view shortcuts')
    expect(legend.findAll('.card-layer-view__shortcut-row')).toHaveLength(2)
    expect(legend.findAll('.oc-key').map(key => key.text()))
      .toEqual(['', '↑ / ↓', '', '', '↑ / ↓'])
    expect(legend.findAll('.oc-shortcut__separator').map(separator => separator.text()))
      .toEqual(['or', 'or'])
    expect(legend.findAllComponents(OcIcon).map(
      (icon: VueWrapper) => (icon.props() as { name: string }).name,
    ))
      .toEqual(['mdiMouseScrollWheel', 'mdiAppleKeyboardShift', 'mdiMouseScrollWheel'])
    expect(legend.findAll('.card-layer-view__shortcut-label').map(label => label.text()))
      .toEqual(['Step through planes', 'Jump between layers'])
  })

  it('scrolls between block planes that share the same zIndex', async () => {
    const wrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-b',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()

    await wrapper.get('.card-layer-view').trigger('wheel', {
      deltaY: 180,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    })
    await flushAnimation()
    expect((wrapper.findAll('[data-layer-block-id]')[1]!.element as HTMLElement).style.transform)
      .toContain('translate3d(0, 0px, 0px)')
    expect(wrapper.findAll('.card-layer-view__tick')[1]?.classes()).toContain('is-active')
    expect((wrapper.get('.card-layer-view__thumb').element as HTMLElement).style.top)
      .toBe((wrapper.findAll('.card-layer-view__tick')[1]!.element as HTMLElement).style.top)
  })

  it('steps across an entire zIndex layer when requested', async () => {
    const wrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-a',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()
    const view = wrapper.vm as unknown as {
      stepLayer: (direction: -1 | 1, wholeLayer?: boolean) => void
    }

    wrapper.get('.card-layer-view').element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 180,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      shiftKey: true,
    }))
    await flushAnimation()
    expect((wrapper.findAll('[data-layer-block-id]')[2]!.element as HTMLElement).style.transform)
      .toContain('translate3d(0, 0px, 0px)')

    view.stepLayer(-1, true)
    await flushAnimation()
    expect((wrapper.findAll('[data-layer-block-id]')[1]!.element as HTMLElement).style.transform)
      .toContain('translate3d(0, 0px, 0px)')
  })

  it('maps Space-modified wheel input to zIndex intents without scrolling', async () => {
    const wrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-a',
        viewportWidth: 1000,
        viewportHeight: 800,
        spaceModifierActive: true,
      },
    })
    await nextTick()

    await wrapper.get('.card-layer-view').trigger('wheel', {
      deltaY: -180,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    })
    expect(wrapper.emitted('z-index-step')?.[0]).toEqual([{ delta: 1, existingLayersOnly: false }])
    expect(wrapper.findAll('.card-layer-view__tick')[1]?.classes()).toContain('is-active')
  })

  it('maps Space-modified wheel input with only one plane', async () => {
    const singlePlaneFace = createFace()
    singlePlaneFace.children = singlePlaneFace.children.slice(0, 1)
    const wrapper = mount(CardLayerView, {
      props: {
        face: singlePlaneFace,
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'high-a',
        viewportWidth: 1000,
        viewportHeight: 800,
        spaceModifierActive: true,
      },
    })
    await nextTick()

    await wrapper.get('.card-layer-view').trigger('wheel', {
      deltaY: 180,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    })
    expect(wrapper.emitted('z-index-step')?.[0]).toEqual([{ delta: -1, existingLayersOnly: false }])
  })

  it('switches layers by wheel and rail click without canvas drag navigation', async () => {
    const wrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'low',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()

    await wrapper.get('.card-layer-view').trigger('wheel', { deltaY: -180, deltaMode: WheelEvent.DOM_DELTA_PIXEL })
    await flushAnimation()
    expect(wrapper.findAll('.card-layer-view__tick')[1]?.classes()).toContain('is-active')

    const lowTick = wrapper.findAll('.card-layer-view__tick')[2]!
    dispatchPointer(lowTick.element, 'pointerdown', { button: 0, pointerId: 1, clientX: 980, clientY: 650 })
    dispatchPointer(lowTick.element, 'pointerup', { button: 0, pointerId: 1, clientX: 980, clientY: 650 })
    await flushAnimation()
    expect(lowTick.classes()).toContain('is-active')

    const root = wrapper.get('.card-layer-view')
    dispatchPointer(root.element, 'pointerdown', { button: 0, pointerId: 2, clientX: 400, clientY: 400 })
    dispatchPointer(root.element, 'pointermove', { button: 0, pointerId: 2, clientX: 400, clientY: 240 })
    dispatchPointer(root.element, 'pointerup', { button: 0, pointerId: 2, clientX: 400, clientY: 240 })
    await flushAnimation()
    expect(lowTick.classes()).toContain('is-active')
  })

  it('emits clicks only from the active layer', async () => {
    const wrapper = mount(CardLayerView, {
      props: {
        face: createFace(),
        sourceRoot: createSourceRoot(),
        selectedBlockId: 'low',
        viewportWidth: 1000,
        viewportHeight: 800,
      },
    })
    await nextTick()

    const blocks = wrapper.findAll('.card-layer-view__block')
    const planes = wrapper.findAll('[data-layer-block-id]')
    dispatchPointer(blocks[0]!.element, 'pointerdown', { button: 0, pointerId: 3, clientX: 100, clientY: 100 })
    dispatchPointer(blocks[0]!.element, 'pointerup', { button: 0, pointerId: 3, clientX: 100, clientY: 100 })
    expect(wrapper.emitted('block-click')).toBeUndefined()

    dispatchPointer(planes[2]!.element, 'pointerdown', { button: 0, pointerId: 4, clientX: 420, clientY: 360 })
    dispatchPointer(planes[2]!.element, 'pointerup', { button: 0, pointerId: 4, clientX: 420, clientY: 360 })
    expect(wrapper.emitted('block-click')?.[0]?.[0]).toBe('low')
  })
})
