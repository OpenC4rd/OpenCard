import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupGlobalTooltip } from './globalTooltip'

const LAYER_SIZE = { width: 100, height: 30 }
const COLD_DELAY_MS = 350
const WARM_WINDOW_MS = 400
const GROUP_GAP_MS = 80

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

describe('globalTooltip warm groups', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits once per group, swaps siblings instantly, bridges gaps and freezes the side', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    document.body.innerHTML = `
      <div id="group" data-tooltip-group data-tooltip-anchor="target">
        <button id="first" data-tooltip="First">First</button>
        <div data-tooltip-placement="top"><button id="second" data-tooltip="Second">Second</button></div>
        <span id="gap">gap</span>
      </div>
      <button id="outsider" data-tooltip="Outside">Outside</button>
    `
    setupGlobalTooltip()

    const layer = document.getElementById('oc-tooltip-layer') as HTMLDivElement
    stubRect(layer, 0, 0, LAYER_SIZE.width, LAYER_SIZE.height)
    stubRect(document.getElementById('first')!, 200, 100, 40, 24)
    stubRect(document.getElementById('second')!, 300, 100, 40, 24)
    stubRect(document.getElementById('outsider')!, 200, 600, 40, 24)

    const isOpen = (): boolean => layer.getAttribute('aria-hidden') === 'false'

    const pointerEnter = (id: string): void => {
      document.getElementById(id)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    }
    const pointerLeave = (id: string, relatedId: string): void => {
      document.getElementById(id)!.dispatchEvent(new MouseEvent('mouseout', {
        bubbles: true,
        relatedTarget: document.getElementById(relatedId)!,
      }))
    }

    // Cold: the first control of the group pays the full delay and fades in normally.
    pointerEnter('first')
    vi.advanceTimersByTime(COLD_DELAY_MS - 1)
    expect(isOpen()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isOpen()).toBe(true)
    expect(layer.textContent).toBe('First')
    expect(layer.dataset.placement).toBe('bottom')

    // Sibling inside the same group: instant, no extra wait, and the side stays where it was even
    // though the second control declares the opposite side.
    pointerLeave('first', 'second')
    pointerEnter('second')
    expect(isOpen()).toBe(true)
    expect(layer.textContent).toBe('Second')
    // 窗口内换兄弟节点不付延迟，而且侧别停在第一次定下的那一边。
    expect(layer.dataset.placement).toBe('bottom')

    // Crossing a gap that holds no tooltip keeps the tooltip on screen instead of blinking.
    pointerLeave('second', 'gap')
    vi.advanceTimersByTime(GROUP_GAP_MS - 1)
    expect(isOpen()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(isOpen()).toBe(false)

    // Still warm after the gap hide: the next sibling swaps in instantly again.
    pointerEnter('first')
    expect(isOpen()).toBe(true)
    expect(layer.textContent).toBe('First')

    // Warm window expires: the same group is cold again and pays the delay.
    pointerLeave('first', 'gap')
    vi.advanceTimersByTime(GROUP_GAP_MS)
    expect(isOpen()).toBe(false)
    vi.advanceTimersByTime(WARM_WINDOW_MS)
    pointerEnter('second')
    expect(isOpen()).toBe(false)
    vi.advanceTimersByTime(COLD_DELAY_MS)
    expect(isOpen()).toBe(true)
    expect(layer.textContent).toBe('Second')

    // A control outside the group is cold even while the group window is still open.
    pointerEnter('outsider')
    vi.advanceTimersByTime(COLD_DELAY_MS)
    expect(layer.textContent).toBe('Outside')

    // Leaving the group ends the warm episode immediately: coming back pays the delay again.
    pointerLeave('outsider', 'group')
    expect(isOpen()).toBe(false)
    pointerEnter('first')
    expect(isOpen()).toBe(false)
    vi.advanceTimersByTime(COLD_DELAY_MS)
    expect(layer.textContent).toBe('First')
  })
})