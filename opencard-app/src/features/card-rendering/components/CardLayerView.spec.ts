import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import type { RenderReadyCardBlock, RenderReadyCardFace } from '../render.types'
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

function mountView(face: RenderReadyCardFace, selectedBlockId: string | null, extra = {}) {
  return mount(CardLayerView, {
    props: {
      face,
      sourceRoot: createSourceRoot(),
      selectedBlockId,
      viewportWidth: 1000,
      viewportHeight: 800,
      ...extra,
    },
  })
}

describe('CardLayerView', () => {
  it('cycles matching name initials with wraparound and optional layer scope', async () => {
    const namedFace = createFace()
    namedFace.children[0]!.block.name = 'Alpha'
    namedFace.children[1]!.block.name = 'Atlas'
    namedFace.children[2]!.block.name = ' amber'
    const wrapper = mountView(namedFace, 'high-a')
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
    const wrapper = mountView(namedFace, 'high-a')
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

  it('maps Space-modified wheel input to zIndex intents without scrolling', async () => {
    const wrapper = mountView(createFace(), 'high-a', { spaceModifierActive: true })
    await nextTick()

    await wrapper.get('.card-layer-view').trigger('wheel', {
      deltaY: -180,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    })
    expect(wrapper.emitted('z-index-step')?.[0]).toEqual([{ delta: 1, existingLayersOnly: false }])
  })

  it('keeps the zIndex direction when only one plane exists', async () => {
    const singlePlaneFace = createFace()
    singlePlaneFace.children = singlePlaneFace.children.slice(0, 1)
    const wrapper = mountView(singlePlaneFace, 'high-a', { spaceModifierActive: true })
    await nextTick()

    await wrapper.get('.card-layer-view').trigger('wheel', {
      deltaY: 180,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    })
    expect(wrapper.emitted('z-index-step')?.[0]).toEqual([{ delta: -1, existingLayersOnly: false }])
  })

  it('emits block clicks only from the active layer', async () => {
    const wrapper = mountView(createFace(), 'low')
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
