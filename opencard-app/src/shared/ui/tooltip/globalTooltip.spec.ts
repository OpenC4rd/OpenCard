import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupGlobalTooltip } from './globalTooltip'

describe('globalTooltip', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('delays pointer tooltips but shows focus tooltips immediately and dismisses them', () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <button id="first" data-tooltip="First tooltip">First</button>
      <button id="second" data-tooltip="Second tooltip">Second</button>
      <button id="rich" data-tooltip="[b]Before[/b][br][i]Now[/i] [code]copy[/code] [icon:action.copy] [key]Alt[/key]">Rich</button>
      <span id="fitting" data-tooltip="Fits" data-tooltip-overflow>Fits</span>
      <span id="overflowing" data-tooltip="Complete clipped text" data-tooltip-overflow>Clipped</span>
      <div id="clipper" style="overflow-x: hidden; overflow-y: hidden">
        <span id="clipped-by-ancestor" data-tooltip="Cut by a parent" data-tooltip-overflow>Cut…</span>
        <span id="fitting-in-clipper" data-tooltip="Fits inside" data-tooltip-overflow>Fits</span>
      </div>
    `
    setupGlobalTooltip()

    const first = document.getElementById('first')!
    const second = document.getElementById('second')!
    const layer = document.getElementById('oc-tooltip-layer') as HTMLDivElement

    expect(layer.getAttribute('role')).toBe('tooltip')
    first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(349)
    expect(layer.hidden).toBe(true)

    second.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(350)
    expect(layer.hidden).toBe(false)
    expect(layer.textContent).toBe('Second tooltip')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(layer.classList.contains('open')).toBe(false)
    expect(layer.getAttribute('aria-hidden')).toBe('true')

    first.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(layer.hidden).toBe(false)
    expect(layer.getAttribute('aria-hidden')).toBe('false')
    expect(layer.textContent).toBe('First tooltip')

    first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(layer.classList.contains('open')).toBe(false)
    expect(layer.getAttribute('aria-hidden')).toBe('true')

    const rich = document.getElementById('rich')!
    rich.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(layer.textContent).toBe('BeforeNow copy  Alt')
    expect(layer.querySelector('strong')?.textContent).toBe('Before')
    expect(layer.querySelector('em')?.textContent).toBe('Now')
    expect(layer.querySelector('br')).not.toBeNull()
    expect(layer.querySelector('code')?.textContent).toBe('copy')
    expect(layer.querySelector('.oc-key')?.textContent).toBe('Alt')
    expect(layer.querySelector('.oc-inline-markup__icon path')).not.toBeNull()

    const fitting = document.getElementById('fitting')!
    Object.defineProperty(fitting, 'clientWidth', { configurable: true, value: 80 })
    Object.defineProperty(fitting, 'scrollWidth', { configurable: true, value: 80 })
    fitting.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(layer.getAttribute('aria-hidden')).toBe('true')

    const overflowing = document.getElementById('overflowing')!
    Object.defineProperty(overflowing, 'clientWidth', { configurable: true, value: 80 })
    Object.defineProperty(overflowing, 'scrollWidth', { configurable: true, value: 160 })
    overflowing.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(layer.getAttribute('aria-hidden')).toBe('false')
    expect(layer.textContent).toBe('Complete clipped text')

    // 省略也可以做在容器上（行标题、菜单项、下拉值）：文字自己没超出，但盒子探出了裁剪它的祖先。
    stubBox(document.getElementById('clipper')!, { left: 0, right: 100 })
    const clippedByAncestor = document.getElementById('clipped-by-ancestor')!
    stubBox(clippedByAncestor, { left: 0, right: 220 })
    clippedByAncestor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(layer.getAttribute('aria-hidden')).toBe('false')
    expect(layer.textContent).toBe('Cut by a parent')

    // 没探出去就不提示：裁剪盒里放得下的文字不该因为祖先裁剪就冒出来。
    const fittingInClipper = document.getElementById('fitting-in-clipper')!
    stubBox(fittingInClipper, { left: 0, right: 60 })
    fittingInClipper.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(layer.getAttribute('aria-hidden')).toBe('true')
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
