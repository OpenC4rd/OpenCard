import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setupGlobalTooltip } from './globalTooltip'

const FIXTURE = `
  <button id="first" data-tooltip="First tooltip">First</button>
  <button id="second" data-tooltip="Second tooltip">Second</button>
  <button id="rich" data-tooltip="[b]Before[/b][br][i]Now[/i] [code]copy[/code] [icon:mdiContentCopy] [key]Alt[/key]">Rich</button>
  <span id="fitting" data-tooltip="Fits" data-tooltip-overflow>Fits</span>
  <span id="overflowing" data-tooltip="Complete clipped text" data-tooltip-overflow>Clipped</span>
  <div id="clipper" style="overflow-x: hidden; overflow-y: hidden">
    <span id="clipped-by-ancestor" data-tooltip="Cut by a parent" data-tooltip-overflow>Cut…</span>
    <span id="fitting-in-clipper" data-tooltip="Fits inside" data-tooltip-overflow>Fits</span>
  </div>
`

function tooltipLayer(): HTMLDivElement {
  return document.getElementById('oc-tooltip-layer') as HTMLDivElement
}

function isVisible(): boolean {
  return tooltipLayer().getAttribute('aria-hidden') === 'false'
}

function focus(id: string): void {
  document.getElementById(id)!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
}

describe('globalTooltip', () => {
  // 全局提示只安装一次（模块内单例），宿主与 layer 因此在整组用例里共用。
  beforeAll(() => {
    document.body.innerHTML = FIXTURE
    setupGlobalTooltip()
  })

  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    vi.useRealTimers()
  })

  it('delays pointer tooltips but shows focus tooltips at once, and dismisses on Escape and pointerdown', () => {
    vi.useFakeTimers()
    const layer = tooltipLayer()
    const first = document.getElementById('first')!
    const second = document.getElementById('second')!

    expect(layer.getAttribute('role')).toBe('tooltip')
    first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(349)
    expect(isVisible()).toBe(false)

    second.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(350)
    expect(isVisible()).toBe(true)
    expect(layer.textContent).toBe('Second tooltip')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(isVisible()).toBe(false)

    focus('first')
    expect(isVisible()).toBe(true)
    expect(layer.textContent).toBe('First tooltip')

    first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(isVisible()).toBe(false)
  })

  it('shows an overflow tooltip only when the text is clipped by its own box or an ancestor', () => {
    const fitting = document.getElementById('fitting')!
    Object.defineProperty(fitting, 'clientWidth', { configurable: true, value: 80 })
    Object.defineProperty(fitting, 'scrollWidth', { configurable: true, value: 80 })
    focus('fitting')
    expect(isVisible()).toBe(false)

    const overflowing = document.getElementById('overflowing')!
    Object.defineProperty(overflowing, 'clientWidth', { configurable: true, value: 80 })
    Object.defineProperty(overflowing, 'scrollWidth', { configurable: true, value: 160 })
    focus('overflowing')
    expect(isVisible()).toBe(true)
    expect(tooltipLayer().textContent).toBe('Complete clipped text')

    // 省略也可以做在容器上（行标题、菜单项、下拉值）：文字自己没超出，但盒子探出了裁剪它的祖先。
    stubBox(document.getElementById('clipper')!, { left: 0, right: 100 })
    stubBox(document.getElementById('clipped-by-ancestor')!, { left: 0, right: 220 })
    focus('clipped-by-ancestor')
    expect(isVisible()).toBe(true)
    expect(tooltipLayer().textContent).toBe('Cut by a parent')

    // 没探出去就不提示：裁剪盒里放得下的文字不该因为祖先裁剪就冒出来。
    stubBox(document.getElementById('fitting-in-clipper')!, { left: 0, right: 60 })
    focus('fitting-in-clipper')
    expect(isVisible()).toBe(false)
  })

  it('renders inline tooltip markup instead of showing its brackets', () => {
    focus('rich')

    const layer = tooltipLayer()
    expect(layer.textContent).toBe('BeforeNow copy  Alt')
    expect(layer.querySelector('br')).not.toBeNull()
  })
})

/** jsdom 不做布局，盒子尺寸只能钉住：这两个数就是"文字有没有探出裁剪盒"的唯一依据。 */
function stubBox(element: HTMLElement, box: { left: number; right: number }): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: box.left,
      right: box.right,
      top: 0,
      bottom: 16,
      width: box.right - box.left,
      height: 16,
      x: box.left,
      y: 0,
      toJSON: () => ({}),
    }),
  })
}