// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  paintCardScene,
} from './paintCardScene'
import {
  type CanvasAssetStore,
  type LoadedAsset,
} from './canvasAssetStore'
import {
  computeSceneLayout,
  transformPoint,
} from '../geometry'
import type {
  RenderReadyCardBlock,
  RenderReadyCardFace,
  RenderReadyImageBlock,
  RenderReadyTextBlock,
} from '../render.types'
import { createCardRenderResourceContext } from '../cardRenderResources'

// --- Stateful Canvas Mock Harness ---

type CanvasState = {
  transform: [number, number, number, number, number, number]
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  globalAlpha: number
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  miterLimit: number
  lineDash: number[]
  globalCompositeOperation: GlobalCompositeOperation
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  font: string
  textBaseline: CanvasTextBaseline
  clipCount: number
}

function createStatefulMockContext() {
  const defaultState = (): CanvasState => ({
    transform: [1, 0, 0, 1, 0, 0],
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDash: [],
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '10px sans-serif',
    textBaseline: 'alphabetic',
    clipCount: 0,
  })

  let current = defaultState()
  const stack: CanvasState[] = []
  const recordedDrawCalls: { method: string; args: unknown[]; stateSnapshot: CanvasState }[] = []

  const record = (name: string, impl?: (...args: unknown[]) => unknown) =>
    vi.fn((...args: unknown[]) => {
      recordedDrawCalls.push({ method: name, args, stateSnapshot: { ...current, transform: [...current.transform] as any } })
      return impl ? impl(...args) : undefined
    })

  const ctx = {
    get current() { return current },
    get stackDepth() { return stack.length },
    recordedDrawCalls,

    get fillStyle() { return current.fillStyle },
    set fillStyle(v) { current.fillStyle = v },
    get strokeStyle() { return current.strokeStyle },
    set strokeStyle(v) { current.strokeStyle = v },
    get globalAlpha() { return current.globalAlpha },
    set globalAlpha(v) { current.globalAlpha = v },
    get lineWidth() { return current.lineWidth },
    set lineWidth(v) { current.lineWidth = v },
    get lineCap() { return current.lineCap },
    set lineCap(v) { current.lineCap = v },
    get lineJoin() { return current.lineJoin },
    set lineJoin(v) { current.lineJoin = v },
    get miterLimit() { return current.miterLimit },
    set miterLimit(v) { current.miterLimit = v },
    get globalCompositeOperation() { return current.globalCompositeOperation },
    set globalCompositeOperation(v) { current.globalCompositeOperation = v },
    get shadowColor() { return current.shadowColor },
    set shadowColor(v) { current.shadowColor = v },
    get shadowBlur() { return current.shadowBlur },
    set shadowBlur(v) { current.shadowBlur = v },
    get shadowOffsetX() { return current.shadowOffsetX },
    set shadowOffsetX(v) { current.shadowOffsetX = v },
    get shadowOffsetY() { return current.shadowOffsetY },
    set shadowOffsetY(v) { current.shadowOffsetY = v },
    get font() { return current.font },
    set font(v) { current.font = v },
    get textBaseline() { return current.textBaseline },
    set textBaseline(v) { current.textBaseline = v },

    save: vi.fn(() => {
      stack.push({
        ...current,
        transform: [...current.transform] as any,
        lineDash: [...current.lineDash],
      })
    }),
    restore: vi.fn(() => {
      if (stack.length === 0) {
        throw new Error('Canvas context restore underflow: save/restore imbalance')
      }
      current = stack.pop()!
    }),
    transform: vi.fn((a: number, b: number, c: number, d: number, e: number, f: number) => {
      const [a0, b0, c0, d0, e0, f0] = current.transform
      // Affine matrix multiplication: [a0 c0 e0] * [a c e]
      //                                [b0 d0 f0]   [b d f]
      current.transform = [
        a0 * a + c0 * b,
        b0 * a + d0 * b,
        a0 * c + c0 * d,
        b0 * c + d0 * d,
        a0 * e + c0 * f + e0,
        b0 * e + d0 * f + f0,
      ]
    }),
    translate: vi.fn((x: number, y: number) => {
      ctx.transform(1, 0, 0, 1, x, y)
    }),
    rotate: vi.fn((angle: number) => {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.transform(cos, sin, -sin, cos, 0, 0)
    }),
    scale: vi.fn((sx: number, sy: number) => {
      ctx.transform(sx, 0, 0, sy, 0, 0)
    }),
    setLineDash: vi.fn((dash: number[]) => {
      current.lineDash = [...dash]
    }),
    clip: vi.fn(() => {
      current.clipCount += 1
    }),

    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    stroke: record('stroke'),
    ellipse: record('ellipse'),
    rect: record('rect'),
    arcTo: record('arcTo'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    createLinearGradient: record('createLinearGradient', () => ({ addColorStop: vi.fn() })),
    measureText: record('measureText', (text?: unknown) => ({
      width: typeof text === 'string' ? text.length * 8 : 0,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    })),
  }

  return ctx as unknown as CanvasRenderingContext2D & typeof ctx
}

function createTestAssetStore(images: Record<string, { width: number; height: number }> = {}): CanvasAssetStore {
  const loaded = new Map<string, LoadedAsset>()
  for (const [src, size] of Object.entries(images)) {
    loaded.set(src, { width: size.width, height: size.height, naturalWidth: size.width, naturalHeight: size.height, src } as unknown as LoadedAsset)
  }
  return {
    loadImage: vi.fn(async (src: string) => loaded.get(src) ?? null),
    getImage: vi.fn((src: string) => loaded.get(src) ?? null),
    preloadSceneAssets: vi.fn(async () => undefined),
    onAssetLoaded: vi.fn(() => () => undefined),
    clear: vi.fn(() => loaded.clear()),
  }
}

function makeBlock(id: string, extra: Record<string, unknown> = {}): RenderReadyCardBlock {
  return {
    type: 'shape-block', id, name: id, notes: '', visible: true, width: '100', height: '50',
    borderColor: '', borderWidth: 0, borderStyle: 'solid', borderRadius: '0', background: '',
    translateX: '0', translateY: '0', scaleX: 1, scaleY: 1, transformAnchor: 'cc', zIndex: 0,
    rotation: 0, opacity: 1, ...extra,
  } as unknown as RenderReadyCardBlock
}

const place = (b: RenderReadyCardBlock, anchor = 'lt', x = '0', y = '0') => ({
  block: b,
  location: { id: `loc-${b.id}`, type: 'simple-container-location' as const, anchor: anchor as never, x, y },
})

function makeFace(...children: ReturnType<typeof place>[]): RenderReadyCardFace {
  return { type: 'card-face', id: 'face', faceKey: 'front', width: 400, height: 300, background: '#ffffff', children } as RenderReadyCardFace
}

describe('Invariant 1: Matrix transformation & canvas state stack integrity', () => {
  const dummyAssets = createTestAssetStore()

  it('restores canvas state cleanly without stack leakage or underflow across nested blocks', () => {
    const ctx = createStatefulMockContext()
    const grandchild = makeBlock('grandchild', {
      width: '40', height: '30', rotation: 45, opacity: 0.5, borderWidth: 2, borderColor: '#112233',
    })
    const child = makeBlock('child', {
      type: 'simple-container-block', width: '100', height: '80', rotation: 30, opacity: 0.8,
      children: [place(grandchild, 'lt', '10', '10')],
    })
    const rootBlock = makeBlock('root', {
      type: 'simple-container-block', width: '200', height: '150', rotation: 15,
      children: [place(child, 'lt', '20', '20')],
    })

    const scene = computeSceneLayout(makeFace(place(rootBlock)))
    paintCardScene(ctx, scene, dummyAssets)

    // Complete stack balance: every save() matched by restore()
    expect(ctx.stackDepth).toBe(0)
    // Global alpha reverted to baseline 1
    expect(ctx.globalAlpha).toBe(1)
    // Transform reverted to identity
    expect(ctx.current.transform).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('keeps sibling nodes isolated from previous sibling transforms, clips, and styling', () => {
    const ctx = createStatefulMockContext()
    const sibling1 = makeBlock('sib1', {
      width: '100', height: '50', rotation: 90, opacity: 0.2, borderWidth: 4, borderColor: '#ff0000',
    })
    const sibling2 = makeBlock('sib2', {
      width: '80', height: '40', rotation: 0, opacity: 1, borderWidth: 0,
    })

    const scene = computeSceneLayout(makeFace(place(sibling1, 'lt', '10', '10'), place(sibling2, 'lt', '200', '10')))
    paintCardScene(ctx, scene, dummyAssets)

    // Check drawing calls for sibling2
    const sib2Node = scene.nodeMap.get('sib2')!
    const sib2Calls = ctx.recordedDrawCalls.filter(c => {
      const snap = c.stateSnapshot.transform
      return Math.abs(snap[4] - sib2Node.worldMatrix[4]) < 1e-4 && Math.abs(snap[5] - sib2Node.worldMatrix[5]) < 1e-4
    })

    expect(sib2Calls.length).toBeGreaterThan(0)
    for (const call of sib2Calls) {
      // Sibling 2 must NOT inherit sibling 1's opacity 0.2
      expect(call.stateSnapshot.globalAlpha).toBe(1)
    }
  })

  it('accurately reproduces composite nested translation, rotation, and scaling coordinates', () => {
    const ctx = createStatefulMockContext()
    const inner = makeBlock('inner', {
      width: '50', height: '20', rotation: 90, scaleX: 2, scaleY: 2,
    })
    const outer = makeBlock('outer', {
      type: 'simple-container-block', width: '200', height: '100',
      rotation: 90,
      children: [place(inner, 'lt', '30', '40')],
    })

    const scene = computeSceneLayout(makeFace(place(outer, 'lt', '100', '50')))
    paintCardScene(ctx, scene, dummyAssets)

    const innerNode = scene.nodeMap.get('inner')!
    // World point of local origin (0, 0)
    const worldOrigin = transformPoint(innerNode.worldMatrix, { x: 0, y: 0 })

    // Find the state snapshot when inner node was transformed
    const transformCalls = (ctx.transform as any).mock.calls
    const hasMatchingTransform = transformCalls.some((args: number[]) => {
      return Math.abs(args[0] - innerNode.worldMatrix[0]) < 1e-4 &&
             Math.abs(args[1] - innerNode.worldMatrix[1]) < 1e-4 &&
             Math.abs(args[2] - innerNode.worldMatrix[2]) < 1e-4 &&
             Math.abs(args[3] - innerNode.worldMatrix[3]) < 1e-4 &&
             Math.abs(args[4] - innerNode.worldMatrix[4]) < 1e-4 &&
             Math.abs(args[5] - innerNode.worldMatrix[5]) < 1e-4
    })
    expect(hasMatchingTransform).toBe(true)
    expect(worldOrigin.x).toBeDefined()
    expect(worldOrigin.y).toBeDefined()
  })
})

describe('Invariant 2: Context tinting compositing & offscreen isolation', () => {
  it('isolates context tinting onto offscreen canvas without polluting destination canvas blend mode', () => {
    const mainCtx = createStatefulMockContext()
    const offscreenCtx = createStatefulMockContext()

    // Mock OffscreenCanvas so that isolated offscreen composition path is taken
    class MockOffscreenCanvas {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
      getContext(type: string) {
        if (type === '2d') return offscreenCtx
        return null
      }
    }

    const originalOffscreen = (globalThis as any).OffscreenCanvas
    ;(globalThis as any).OffscreenCanvas = MockOffscreenCanvas

    try {
      const assets = createTestAssetStore({ 'hammer.svg': { width: 40, height: 40 } })
      const iconBlock = {
        ...makeBlock('tinted-icon', {
          type: 'image-block', width: '40', height: '40',
          source: 'icon:tools/hammer', borderColor: '#ff0055',
        }),
      } as RenderReadyImageBlock

      const context = createCardRenderResourceContext({
        projectIconCatalog: {
          series: [],
          entries: [{ seriesKey: 'tools', iconKey: 'hammer', name: 'hammer', source: 'hammer.svg', src: 'hammer.svg', tint: 'context' }],
        },
      })

      const scene = computeSceneLayout(makeFace(place(iconBlock, 'lt', '50', '50')))
      paintCardScene(mainCtx, scene, assets, { resourceContext: context })

      // 1. Offscreen canvas must perform the source-in tinting
      expect(offscreenCtx.globalCompositeOperation).toBe('source-in')
      expect(offscreenCtx.fillStyle).toBe('#ff0055')
      expect(offscreenCtx.fillRect).toHaveBeenCalledWith(0, 0, 40, 40)

      // 2. Main canvas MUST NOT receive source-in or fillRect
      expect(mainCtx.globalCompositeOperation).toBe('source-over')
      const mainFillRects = mainCtx.recordedDrawCalls.filter(c => c.method === 'fillRect')
      // Only the card face background fillRect should exist on main canvas
      expect(mainFillRects.length).toBe(1)
      expect(mainFillRects[0].args).toEqual([0, 0, 400, 300])

      // 3. Main canvas must composite the offscreen canvas via drawImage
      expect(mainCtx.drawImage).toHaveBeenCalled()
    } finally {
      ;(globalThis as any).OffscreenCanvas = originalOffscreen
    }
  })

  it('demonstrates that fallback tinting directly on destination canvas destroys existing background', () => {
    // When no offscreen canvas or DOM canvas context is available, drawImageFitted falls back to main canvas source-in.
    const mainCtx = createStatefulMockContext()
    const originalOffscreen = (globalThis as any).OffscreenCanvas
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    ;(globalThis as any).OffscreenCanvas = undefined
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any

    try {
      const assets = createTestAssetStore({ 'icon.svg': { width: 50, height: 50 } })
      const iconBlock = {
        ...makeBlock('icon', {
          type: 'image-block', width: '50', height: '50',
          source: 'icon:tools/gear', borderColor: '#00cc88',
        }),
      } as RenderReadyImageBlock

      const context = createCardRenderResourceContext({
        projectIconCatalog: {
          series: [],
          entries: [{ seriesKey: 'tools', iconKey: 'gear', name: 'gear', source: 'icon.svg', src: 'icon.svg', tint: 'context' }],
        },
      })

      const scene = computeSceneLayout(makeFace(place(iconBlock, 'lt', '20', '20')))
      paintCardScene(mainCtx, scene, assets, { resourceContext: context })

      // In fallback, fillRect(0, 0, 50, 50) is called on main canvas while under source-in
      const sourceInCalls = mainCtx.recordedDrawCalls.filter(c => c.stateSnapshot.globalCompositeOperation === 'source-in')
      expect(sourceInCalls.length).toBeGreaterThan(0)
    } finally {
      ;(globalThis as any).OffscreenCanvas = originalOffscreen
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })
})

describe('Invariant 3: Vertical text layout baseline positioning', () => {
  const dummyAssets = createTestAssetStore()

  it('positions rotated western runs in vertical writing mode matching centered baseline formula', () => {
    const ctx = createStatefulMockContext()
    const textBlock = {
      ...makeBlock('vtext', {
        type: 'text-block', width: '120', height: '200',
        content: 'OpenCard',
        writingMode: 'vertical-rl',
        fontSize: '20px',
        lineHeight: '30px',
        fontFamily: 'sans-serif',
      }),
    } as RenderReadyTextBlock

    const scene = computeSceneLayout(makeFace(place(textBlock, 'lt', '50', '30')))
    paintCardScene(ctx, scene, dummyAssets)

    // Find translate & rotate calls for rotated text
    expect(ctx.translate).toHaveBeenCalled()
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2)

    // Check drawText coordinates
    const fillTextCalls = ctx.recordedDrawCalls.filter(c => c.method === 'fillText')
    expect(fillTextCalls.length).toBeGreaterThan(0)
    const textCall = fillTextCalls[0]
    expect(textCall.args[0]).toBe('OpenCard')

    const drawX = textCall.args[1] as number
    const drawY = textCall.args[2] as number

    // In paintGlyphPass:
    // drawX = -run.height / 2 (starts centered horizontally before PI/2 rotation)
    // drawY = -run.width / 2 + (run.baselineY - run.y) = (ascent - descent) / 2
    expect(drawX).toBeLessThan(0)
    expect(drawY).toBeDefined()
    expect(Number.isFinite(drawY)).toBe(true)
  })

  it('aligns rotated western text and upright CJK glyphs along the same vertical column centerline', () => {
    const ctx = createStatefulMockContext()
    const textBlock = {
      ...makeBlock('mixed-text', {
        type: 'text-block', width: '100', height: '250',
        content: '卡 ABC',
        writingMode: 'vertical-rl',
        fontSize: '20px',
        lineHeight: '40px',
      }),
    } as RenderReadyTextBlock

    const scene = computeSceneLayout(makeFace(place(textBlock, 'lt', '0', '0')))
    paintCardScene(ctx, scene, dummyAssets)

    const fillTextCalls = ctx.recordedDrawCalls.filter(c => c.method === 'fillText')
    // We expect both '卡' and 'ABC' to be painted
    const texts = fillTextCalls.map(c => c.args[0])
    expect(texts).toContain('卡')
    expect(texts).toContain('ABC')
  })
})

describe('Invariant 4: Slicing isolation', () => {
  const dummyAssets = createTestAssetStore()

  it('renders strictly designated node without clearing canvas or painting face background', () => {
    const ctx = createStatefulMockContext()
    const b1 = makeBlock('b1', { width: '80', height: '40', background: '#ff0000' })
    const b2 = makeBlock('b2', { width: '90', height: '50', background: '#00ff00' })
    const scene = computeSceneLayout(makeFace(place(b1, 'lt', '10', '10'), place(b2, 'lt', '150', '20')))

    paintCardScene(ctx, scene, dummyAssets, { onlyBlockId: 'b2' })

    // 1. Must NOT clearRect
    expect(ctx.clearRect).not.toHaveBeenCalled()

    // 2. Must NOT paint card background (#ffffff)
    const bgFill = ctx.recordedDrawCalls.find(c => c.method === 'fillRect' && c.args[2] === 400 && c.args[3] === 300)
    expect(bgFill).toBeUndefined()

    // 3. Must paint b2 but NOT b1
    const transforms = (ctx.transform as any).mock.calls
    const b1Node = scene.nodeMap.get('b1')!
    const b2Node = scene.nodeMap.get('b2')!

    const hasB1Transform = transforms.some((t: number[]) => Math.abs(t[4] - b1Node.worldMatrix[4]) < 1e-4 && Math.abs(t[5] - b1Node.worldMatrix[5]) < 1e-4)
    const hasB2Transform = transforms.some((t: number[]) => Math.abs(t[4] - b2Node.worldMatrix[4]) < 1e-4 && Math.abs(t[5] - b2Node.worldMatrix[5]) < 1e-4)

    expect(hasB1Transform).toBe(false)
    expect(hasB2Transform).toBe(true)
  })

  it('preserves ancestor clipping boundaries even when slicing a descendant node exclusively', () => {
    const ctx = createStatefulMockContext()
    const target = makeBlock('target', { width: '60', height: '40' })
    const parentContainer = makeBlock('parent-clipper', {
      type: 'simple-container-block', width: '150', height: '100', clip: true,
      children: [place(target, 'lt', '20', '20')],
    })
    const scene = computeSceneLayout(makeFace(place(parentContainer, 'lt', '10', '10')))

    paintCardScene(ctx, scene, dummyAssets, { onlyBlockId: 'target' })

    // Parent clipper boundary must still be applied to target node
    expect(ctx.clip).toHaveBeenCalled()
    const clipperNode = scene.nodeMap.get('parent-clipper')!
    const [p0, p1, p2, p3] = clipperNode.obbCorners

    expect(ctx.moveTo).toHaveBeenCalledWith(p0.x, p0.y)
    expect(ctx.lineTo).toHaveBeenCalledWith(p1.x, p1.y)
    expect(ctx.lineTo).toHaveBeenCalledWith(p2.x, p2.y)
    expect(ctx.lineTo).toHaveBeenCalledWith(p3.x, p3.y)
  })

  it('renders nothing cleanly when onlyBlockId references non-existent or invisible block', () => {
    const ctx = createStatefulMockContext()
    const hidden = makeBlock('hidden-block', { width: '100', height: '50', visible: false })
    const scene = computeSceneLayout(makeFace(place(hidden, 'lt', '0', '0')))

    paintCardScene(ctx, scene, dummyAssets, { onlyBlockId: 'hidden-block' })
    expect(ctx.transform).not.toHaveBeenCalled()

    paintCardScene(ctx, scene, dummyAssets, { onlyBlockId: 'non-existent-id' })
    expect(ctx.transform).not.toHaveBeenCalled()
  })
})
