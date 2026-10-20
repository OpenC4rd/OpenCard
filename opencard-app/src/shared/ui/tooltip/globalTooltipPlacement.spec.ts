import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupGlobalTooltip } from './globalTooltip'

const LAYER_SIZE = { width: 100, height: 30 }

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

function stubRect(element: Element, left: number, top: number, width: number, height: number): void {
  element.getBoundingClientRect = () => createRect(left, top, width, height)
}

describe('globalTooltip placement', () => {
  afterEach(() => vi.useRealTimers())
  it('follows the declared side, flips when it does not fit, and stays inside the viewport', () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <button id="plain" data-tooltip="Plain" data-tooltip-anchor="target">Plain</button>
      <button id="bogus" data-tooltip="Bogus" data-tooltip-placement="sideways">Bogus</button>
      <div id="rail" data-tooltip-placement="right"><button id="railed" data-tooltip="Rail">Rail</button></div>
      <div id="rows" data-tooltip-placement="top">
        <button id="rowed" data-tooltip="Row">Row</button>
        <button id="row-tight" data-tooltip="Row tight">Row tight</button>
      </div>
      <button id="edge-right" data-tooltip="Edge right" data-tooltip-placement="right">Edge right</button>
      <button id="edge-bottom" data-tooltip="Edge bottom" data-tooltip-placement="bottom">Edge bottom</button>
      <div id="pointer" role="separator" tabindex="0" data-tooltip="Pointer">Pointer</div>
    `
    setupGlobalTooltip()

    const layer = document.getElementById('oc-tooltip-layer') as HTMLDivElement
    stubRect(layer, 0, 0, LAYER_SIZE.width, LAYER_SIZE.height)

    const show = (id: string, left: number, top: number, width = 40, height = 24): void => {
      const element = document.getElementById(id)!
      stubRect(element, left, top, width, height)
      element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    }

    // Target anchor without a direction: centred on the control, below it.
    show('plain', 200, 100)
    expect(layer.dataset.placement).toBe('bottom')
    expect(layer.style.left).toBe('170px')
    expect(layer.style.top).toBe('134px')

    // An unknown value keeps the default instead of inventing a side.
    show('bogus', 500, 100)
    expect(layer.dataset.placement).toBe('bottom')
    expect(layer.style.left).toBe('470px')

    // A declaration on an ancestor applies to the controls inside it.
    show('railed', 60, 300, 24, 24)
    expect(layer.dataset.placement).toBe('right')
    expect(layer.style.left).toBe('94px')
    expect(layer.style.top).toBe('297px')

    // A declared side that fits is used as-is.
    show('rowed', 400, 400, 120)
    expect(layer.dataset.placement).toBe('top')
    expect(layer.style.left).toBe('410px')
    expect(layer.style.top).toBe('360px')

    // No room above: the opposite side of the same axis wins before the other axis.
    show('row-tight', 400, 12, 120)
    expect(layer.dataset.placement).toBe('bottom')
    expect(layer.style.top).toBe('46px')

    // No room on the declared horizontal side: flip, then clamp into the viewport.
    show('edge-right', 980, 300, 24, 24)
    expect(layer.dataset.placement).toBe('left')
    expect(layer.style.left).toBe('870px')

    // No room below on a deliberately bottom-placed control near the window edge.
    show('edge-bottom', 200, 730)
    expect(layer.dataset.placement).toBe('top')
    expect(layer.style.top).toBe('690px')

    // A target that moves without a scroll or resize keeps its visible tooltip attached.
    stubRect(document.getElementById('edge-bottom')!, 300, 500, 40, 24)
    vi.advanceTimersToNextFrame()
    expect(layer.style.left).toBe('270px')
    expect(layer.style.top).toBe('460px')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    const pointer = document.getElementById('pointer')!
    stubRect(pointer, 200, 100, 300, 300)
    const move = (type: string, x: number, y: number): void => {
      pointer.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))
    }
    move('mouseover', 210, 120)
    move('pointermove', 240, 150)
    vi.advanceTimersByTime(350)
    expect(layer.style.left).toBe('250px')
    expect(layer.style.top).toBe('160px')
    move('pointerdown', 310, 220)
    expect(layer.getAttribute('aria-hidden')).toBe('false')
    move('pointermove', 310, 220)
    expect(layer.style.left).toBe('320px')
    expect(layer.style.top).toBe('230px')
    move('pointermove', window.innerWidth - 5, window.innerHeight - 5)
    expect(layer.style.left).toBe(`${window.innerWidth - 115}px`)
    expect(layer.style.top).toBe(`${window.innerHeight - 45}px`)

    // Keyboard focus ignores the previous mouse position and uses the element's bounds.
    pointer.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(layer.style.left).toBe('300px')
    expect(layer.style.top).toBe('410px')

    // An explicit target anchor ignores the mouse, including subsequent movement.
    const fixed = document.getElementById('plain')!
    fixed.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 210, clientY: 110 }))
    vi.advanceTimersByTime(350)
    fixed.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 230, clientY: 120 }))
    expect(layer.style.left).toBe('170px')
    expect(layer.style.top).toBe('134px')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(vi.getTimerCount()).toBe(0)
  })
})
