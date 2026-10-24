import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from '../../locales/en-US'
import ImagePreviewEditor from './ImagePreviewEditor.vue'

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`,
}))

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(): void {
    this.callback([{
      contentRect: { width: 800, height: 600 },
    } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }

  disconnect(): void {}
}

type EditorWrapper = VueWrapper<InstanceType<typeof ImagePreviewEditor>>
type ViewportTransform = { x: number; y: number; scale: number }

/** 视口内容尺寸由 ResizeObserverMock 固定为 800x600；1000x500 的图片对应适应比例 0.768。 */
const CONTENT_WIDTH = 800
const CONTENT_HEIGHT = 600
const IMAGE_WIDTH = 1000
const IMAGE_HEIGHT = 500
const FIT_SCALE = Math.min((CONTENT_WIDTH - 32) / IMAGE_WIDTH, (CONTENT_HEIGHT - 32) / IMAGE_HEIGHT)

/** 与组件滚轮缩放表达式保持一致。 */
const WHEEL_ZOOM_SENSITIVITY = 0.0015

const VIEWPORT_RECT = {
  left: 40,
  top: 20,
  width: CONTENT_WIDTH,
  height: CONTENT_HEIGHT,
  right: 40 + CONTENT_WIDTH,
  bottom: 20 + CONTENT_HEIGHT,
}
/** 视口局部中心点 (400, 300) 对应的客户端坐标。 */
const CENTER_CLIENT_X = VIEWPORT_RECT.left + CONTENT_WIDTH / 2
const CENTER_CLIENT_Y = VIEWPORT_RECT.top + CONTENT_HEIGHT / 2

/** requestAnimationFrame 桩：只入队、不自动执行，由 flushAnimation 逐帧驱动。 */
let animationFrames: FrameRequestCallback[] = []

async function flushAnimation(): Promise<void> {
  for (let guard = 0; guard < 300 && animationFrames.length > 0; guard += 1) {
    animationFrames.shift()?.(guard * 16)
    await nextTick()
  }
  await nextTick()
}

function wheelTargetScale(startScale: number, deltaY: number): number {
  return startScale * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)
}

function createEditor(viewportTransform?: ViewportTransform): EditorWrapper {
  const wrapper = mount(ImagePreviewEditor, {
    props: { session: createTestSession({ path: 'assets/example.png', viewState: { 'image-preview': { viewportTransform } } }) },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
    },
  })
  vi.spyOn(wrapper.props('session'), 'updateViewState')
  return wrapper
}

async function loadImage(wrapper: EditorWrapper): Promise<void> {
  const image = wrapper.get('img').element as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { value: IMAGE_WIDTH })
  Object.defineProperty(image, 'naturalHeight', { value: IMAGE_HEIGHT })
  await wrapper.get('img').trigger('load')
}

function mockViewportRect(wrapper: EditorWrapper): void {
  Object.defineProperty(wrapper.get('.image-preview-editor').element, 'getBoundingClientRect', {
    value: () => VIEWPORT_RECT,
  })
}

function transformEmits(wrapper: EditorWrapper): unknown[][] {
  return vi.mocked(wrapper.props('session').updateViewState).mock.calls
    .filter(([id, patch]) => id === 'image-preview' && patch.viewportTransform)
    .map(([, patch]) => [patch.viewportTransform])
}

function lastTransform(wrapper: EditorWrapper): ViewportTransform | undefined {
  const emits = transformEmits(wrapper)
  return emits[emits.length - 1]?.[0] as ViewportTransform | undefined
}

/** 把视口局部坐标还原成图片空间坐标，用于验证缩放锚点是否保持不动。 */
function resolveImagePoint(
  transform: ViewportTransform,
  viewportX: number,
  viewportY: number,
): { x: number; y: number } {
  const renderedScale = FIT_SCALE * transform.scale
  const offsetX = (CONTENT_WIDTH - IMAGE_WIDTH * renderedScale) / 2
  const offsetY = (CONTENT_HEIGHT - IMAGE_HEIGHT * renderedScale) / 2
  return {
    x: (viewportX - offsetX - transform.x) / renderedScale,
    y: (viewportY - offsetY - transform.y) / renderedScale,
  }
}

/** WheelEvent 的 clientX/clientY 在 jsdom 中只读，只能经构造函数注入。 */
async function dispatchWheel(
  wrapper: EditorWrapper,
  deltaY: number,
  deltaMode: number = WheelEvent.DOM_DELTA_PIXEL,
  clientX = CENTER_CLIENT_X,
  clientY = CENTER_CLIENT_Y,
): Promise<void> {
  wrapper.get('.image-preview-editor').element.dispatchEvent(new WheelEvent('wheel', {
    deltaY,
    deltaMode,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  }))
  await nextTick()
}

/**
 * 动画最后一帧把内部状态精确吸附到目标值，但该次跃迁小于组件的 TRANSFORM_EPSILON，
 * 因此这次精确变换不会自己发出。用一次净位移为零的等量往返平移（每次都会发出）把稳态读回来。
 */
async function readSettledTransform(wrapper: EditorWrapper): Promise<ViewportTransform> {
  const viewport = wrapper.get('.image-preview-editor')
  await viewport.trigger('keydown', { key: 'ArrowLeft' })
  await viewport.trigger('keydown', { key: 'ArrowRight' })
  return lastTransform(wrapper)!
}

/** 滚轮缩放 → 动画收敛 → 读回精确稳态。 */
async function zoomByWheel(
  wrapper: EditorWrapper,
  deltaY: number,
  deltaMode: number = WheelEvent.DOM_DELTA_PIXEL,
  clientX = CENTER_CLIENT_X,
  clientY = CENTER_CLIENT_Y,
): Promise<ViewportTransform> {
  await dispatchWheel(wrapper, deltaY, deltaMode, clientX, clientY)
  await flushAnimation()
  return readSettledTransform(wrapper)
}

describe('ImagePreviewEditor zoom', () => {
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
    vi.restoreAllMocks()
  })

  it('keeps the anchored image point fixed while zooming with the wheel', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)
    mockViewportRect(wrapper)

    // 非中心锚点：视口局部 (210, 160)。
    const anchorX = 210
    const anchorY = 160
    const clientX = VIEWPORT_RECT.left + anchorX
    const clientY = VIEWPORT_RECT.top + anchorY

    const before = await zoomByWheel(wrapper, -100, WheelEvent.DOM_DELTA_PIXEL, clientX, clientY)
    const after = await zoomByWheel(wrapper, -100, WheelEvent.DOM_DELTA_PIXEL, clientX, clientY)

    expect(after.scale).toBeGreaterThan(before.scale)
    const beforePoint = resolveImagePoint(before, anchorX, anchorY)
    const afterPoint = resolveImagePoint(after, anchorX, anchorY)
    expect(afterPoint.x).toBeCloseTo(beforePoint.x, 6)
    expect(afterPoint.y).toBeCloseTo(beforePoint.y, 6)
  })

  it('treats wheel zoom as a multiplier on the fit scale', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)
    mockViewportRect(wrapper)

    const zoomed = await zoomByWheel(wrapper, -120)
    expect(zoomed.scale).toBe(wheelTargetScale(1, -120))

    const restored = await zoomByWheel(wrapper, 120)
    expect(restored.scale).toBeCloseTo(1, 12)
  })

  it('clamps wheel zoom at the maximum scale and ignores further zoom-in', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)
    mockViewportRect(wrapper)

    for (let index = 0; index < 12; index += 1) {
      await zoomByWheel(wrapper, -240)
    }
    expect((await readSettledTransform(wrapper)).scale).toBe(16)

    await dispatchWheel(wrapper, -240)
    // 已在上限：缩放不再改变目标值，也不会启动动画。
    expect(animationFrames).toHaveLength(0)
    expect((await readSettledTransform(wrapper)).scale).toBe(16)
  })

  it('clamps wheel zoom at the minimum scale and ignores further zoom-out', async () => {
    const wrapper = createEditor({ x: 0, y: 0, scale: 16 })
    await loadImage(wrapper)
    mockViewportRect(wrapper)

    for (let index = 0; index < 20; index += 1) {
      await zoomByWheel(wrapper, 240)
    }
    expect((await readSettledTransform(wrapper)).scale).toBe(0.1)

    await dispatchWheel(wrapper, 240)
    expect(animationFrames).toHaveLength(0)
    expect((await readSettledTransform(wrapper)).scale).toBe(0.1)
  })

  it('scales line-mode wheel deltas and caps oversized deltas', async () => {
    const pixelWrapper = createEditor()
    await loadImage(pixelWrapper)
    mockViewportRect(pixelWrapper)
    const pixel = await zoomByWheel(pixelWrapper, -128)

    const lineWrapper = createEditor()
    await loadImage(lineWrapper)
    mockViewportRect(lineWrapper)
    const line = await zoomByWheel(lineWrapper, -8, WheelEvent.DOM_DELTA_LINE)

    expect(line).toEqual(pixel)

    // 超过 ±240 的位移按 ±240 处理。
    const capWrapper = createEditor()
    await loadImage(capWrapper)
    mockViewportRect(capWrapper)
    const capped = await zoomByWheel(capWrapper, -240)

    const oversizedWrapper = createEditor()
    await loadImage(oversizedWrapper)
    mockViewportRect(oversizedWrapper)
    expect(await zoomByWheel(oversizedWrapper, -10000)).toEqual(capped)
    expect(capped.scale).toBeGreaterThan(pixel.scale)
  })

  it('animates wheel zoom toward the target and stops emitting once settled', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)
    mockViewportRect(wrapper)

    const targetScale = wheelTargetScale(1, -120)
    await dispatchWheel(wrapper, -120)

    const observed: number[] = []
    for (let guard = 0; guard < 300 && animationFrames.length > 0; guard += 1) {
      animationFrames.shift()?.(guard * 16)
      await nextTick()
      observed.push(lastTransform(wrapper)!.scale)
    }
    await nextTick()

    expect(observed.length).toBeGreaterThan(1)
    expect(observed[0]).toBeGreaterThan(1)
    expect(observed[0]).toBeLessThan(targetScale)
    for (let index = 1; index < observed.length; index += 1) {
      expect(observed[index]!).toBeGreaterThanOrEqual(observed[index - 1]!)
    }

    const settledCount = transformEmits(wrapper).length
    await flushAnimation()
    expect(animationFrames).toHaveLength(0)
    expect(transformEmits(wrapper).length).toBe(settledCount)
    expect((await readSettledTransform(wrapper)).scale).toBe(targetScale)
  })

  it('applies an incoming viewport transform and clamps its scale', async () => {
    const wrapper = createEditor({ x: 3, y: 4, scale: 2 })
    await loadImage(wrapper)

    expect(transformEmits(wrapper)).toHaveLength(0)

    wrapper.props('session').updateViewState('image-preview', { viewportTransform: { x: 10, y: 20, scale: 100 } })
    await nextTick()
    await nextTick()
    await flushAnimation()

    // 应用传入变换不会把同样的值回显出去。
    expect(transformEmits(wrapper)).toHaveLength(1)

    const applied = await readSettledTransform(wrapper)
    expect(applied.x).toBe(10)
    expect(applied.y).toBe(20)
    expect(applied.scale).toBe(16)
  })

  it('ignores an echo of the transform it just emitted', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)
    mockViewportRect(wrapper)

    const targetScale = wheelTargetScale(1, -120)
    await dispatchWheel(wrapper, -120)
    animationFrames.shift()?.(0)
    await nextTick()

    const echo = { ...lastTransform(wrapper)! }
    const emittedCount = transformEmits(wrapper).length
    expect(animationFrames).toHaveLength(1)

    wrapper.props('session').updateViewState('image-preview', { viewportTransform: echo })
    await nextTick()
    await nextTick()

    // 回显既不改动状态，也不打断在飞的动画。
    expect(animationFrames).toHaveLength(1)
    expect(transformEmits(wrapper).length).toBe(emittedCount + 1)

    await flushAnimation()
    expect(lastTransform(wrapper)!.scale).toBeGreaterThan(echo.scale)
    expect((await readSettledTransform(wrapper)).scale).toBe(targetScale)
  })

  it('zooms and pans from the keyboard and ignores unhandled keys', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)
    const viewport = wrapper.get('.image-preview-editor')

    const triggerKey = async (key: string): Promise<boolean> => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      const preventDefault = vi.spyOn(event, 'preventDefault')
      viewport.element.dispatchEvent(event)
      await nextTick()
      return preventDefault.mock.calls.length > 0
    }
    const pressAndSettle = async (key: string): Promise<ViewportTransform> => {
      expect(await triggerKey(key)).toBe(true)
      await flushAnimation()
      return readSettledTransform(wrapper)
    }

    expect((await pressAndSettle('+')).scale).toBe(1.25)
    expect((await pressAndSettle('=')).scale).toBe(1.5625)
    expect((await pressAndSettle('-')).scale).toBe(1.25)

    expect(await triggerKey('0')).toBe(true)
    const reset = lastTransform(wrapper)!
    expect(reset.x).toBe(0)
    expect(reset.y).toBe(0)
    expect(reset.scale).toBe(1)

    expect((await pressAndSettle('ArrowLeft')).x).toBeCloseTo(32, 6)
    expect((await pressAndSettle('ArrowRight')).x).toBeCloseTo(0, 6)
    expect((await pressAndSettle('ArrowUp')).y).toBeCloseTo(32, 6)
    expect((await pressAndSettle('ArrowDown')).y).toBeCloseTo(0, 6)

    const emittedCount = transformEmits(wrapper).length
    expect(await triggerKey('a')).toBe(false)
    expect(transformEmits(wrapper).length).toBe(emittedCount)
  })
})
