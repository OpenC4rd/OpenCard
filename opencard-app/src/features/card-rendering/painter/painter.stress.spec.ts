// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import {
  createCanvasAssetStore,
  type CanvasAssetStore,
  type LoadedAsset,
} from './canvasAssetStore'
import { paintCardScene } from './paintCardScene'
import { roundRectPath, parsePaintStyle } from './paintStyle'
import { computeSceneLayout } from '../geometry'
import type {
  RenderReadyCardBlock,
  RenderReadyCardFace,
  RenderReadyImageBlock,
  RenderReadyQrCodeBlock,
  RenderReadyTextBlock,
} from '../render.types'
import { createCardRenderResourceContext } from '../cardRenderResources'

const { convertFileSrc } = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path.replace(/^\/workspace\//, '')}`),
}))

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc }))

// --- Mock Canvas Context Harness ---

function createSpyCanvasContext() {
  const calls: { method: string; args: unknown[] }[] = []
  const record = (name: string, impl?: (...args: unknown[]) => unknown) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method: name, args })
      return impl ? impl(...args) : undefined
    })

  const gradient = { addColorStop: vi.fn() }
  let saveDepth = 0

  return {
    calls,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    font: '10px sans-serif',
    textBaseline: 'alphabetic',
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,

    getSaveDepth: () => saveDepth,

    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    save: record('save', () => { saveDepth += 1 }),
    restore: record('restore', () => { saveDepth -= 1 }),
    transform: record('transform'),
    translate: record('translate'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    clip: record('clip'),
    fill: record('fill'),
    stroke: record('stroke'),
    ellipse: record('ellipse'),
    rect: record('rect'),
    arcTo: record('arcTo'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    setLineDash: record('setLineDash'),
    createLinearGradient: record('createLinearGradient', () => gradient),
    measureText: record('measureText', (text?: unknown) => ({
      width: typeof text === 'string' ? text.length * 8 : 0,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    })),
  } as unknown as CanvasRenderingContext2D & {
    calls: { method: string; args: unknown[] }[]
    getSaveDepth: () => number
  }
}

function createControllableAssetStore(
  images: Record<string, { width: number; height: number } | null> = {},
): CanvasAssetStore {
  const loaded = new Map<string, LoadedAsset>()
  for (const [src, size] of Object.entries(images)) {
    if (size) {
      loaded.set(src, {
        width: size.width,
        height: size.height,
        naturalWidth: size.width,
        naturalHeight: size.height,
        src,
      } as unknown as LoadedAsset)
    }
  }
  return {
    loadImage: vi.fn(async (src: string) => loaded.get(src) ?? null),
    getImage: vi.fn((src: string) => loaded.get(src) ?? null),
    preloadSceneAssets: vi.fn(async () => undefined),
    onAssetLoaded: vi.fn(() => () => undefined),
    clear: vi.fn(() => loaded.clear()),
  }
}

function block(id: string, extra: Record<string, unknown> = {}): RenderReadyCardBlock {
  return {
    type: 'shape-block',
    id,
    name: id,
    notes: '',
    visible: true,
    width: '100',
    height: '50',
    borderColor: '',
    borderWidth: 0,
    borderStyle: 'solid',
    borderRadius: '0',
    background: '',
    translateX: '0',
    translateY: '0',
    scaleX: 1,
    scaleY: 1,
    transformAnchor: 'cc',
    zIndex: 0,
    rotation: 0,
    opacity: 1,
    ...extra,
  } as unknown as RenderReadyCardBlock
}

const at = (b: RenderReadyCardBlock, anchor = 'lt', x = '0', y = '0') => ({
  block: b,
  location: { id: `loc-${b.id}`, type: 'simple-container-location' as const, anchor: anchor as never, x, y },
})

function face(...children: ReturnType<typeof at>[]): RenderReadyCardFace {
  return {
    type: 'card-face',
    id: 'face',
    faceKey: 'front',
    width: 600,
    height: 400,
    background: '#ffffff',
    children,
  } as RenderReadyCardFace
}

describe('Adversarial Stress Test: Nested Clip Hierarchy', () => {
  const dummyAssets = createControllableAssetStore()

  it('maintains stack balance (save/restore match) across multiple deeply nested clipped containers', () => {
    const ctx = createSpyCanvasContext()
    const leaf = block('leaf', { width: '40', height: '30', background: '#ff0000' })
    const inner = block('inner', {
      type: 'simple-container-block',
      width: '100',
      height: '80',
      clip: true,
      rotation: 15,
      children: [at(leaf, 'lt', '5', '5')],
    })
    const mid = block('mid', {
      type: 'simple-container-block',
      width: '200',
      height: '160',
      clip: true,
      scaleX: 1.5,
      scaleY: 1.5,
      children: [at(inner, 'lt', '20', '20')],
    })
    const outer = block('outer', {
      type: 'simple-container-block',
      width: '400',
      height: '300',
      clip: true,
      rotation: -30,
      children: [at(mid, 'lt', '50', '50')],
    })

    const scene = computeSceneLayout(face(at(outer)))
    paintCardScene(ctx, scene, dummyAssets)

    // Verify context save/restore state returns exactly to 0
    expect(ctx.getSaveDepth()).toBe(0)

    // For leaf, clip should have been called 3 times (outer, mid, inner)
    // For inner, clip should have been called 2 times (outer, mid)
    // For mid, clip should have been called 1 time (outer)
    // For outer, clip should have been called 0 times (has no clipped ancestors)
    // Total clips = 3 + 2 + 1 + 0 = 6
    expect(ctx.clip).toHaveBeenCalledTimes(6)
  })

  it('correctly traverses only ancestors that have clip: true enabled', () => {
    const ctx = createSpyCanvasContext()
    const target = block('target', { width: '50', height: '50' })
    const nonClippedParent = block('nonClipped', {
      type: 'simple-container-block',
      width: '100',
      height: '100',
      clip: false,
      children: [at(target)],
    })
    const clippedGrandparent = block('clippedGrandparent', {
      type: 'simple-container-block',
      width: '200',
      height: '200',
      clip: true,
      children: [at(nonClippedParent)],
    })

    const scene = computeSceneLayout(face(at(clippedGrandparent)))
    paintCardScene(ctx, scene, dummyAssets)

    // target has only 1 clipped ancestor (clippedGrandparent)
    // nonClipped has 1 clipped ancestor (clippedGrandparent)
    // clippedGrandparent has 0 clipped ancestors
    // Total clip calls across the scene = 1 + 1 = 2
    expect(ctx.clip).toHaveBeenCalledTimes(2)
  })

  it('resets path with beginPath after applying clips to prevent path pollution into subsequent fills', () => {
    const ctx = createSpyCanvasContext()
    const target = block('target', { width: '50', height: '50', background: '#00ff00' })
    const parent = block('clippedParent', {
      type: 'simple-container-block',
      width: '100',
      height: '100',
      clip: true,
      children: [at(target)],
    })

    const scene = computeSceneLayout(face(at(parent)))
    paintCardScene(ctx, scene, dummyAssets)

    // Check calls sequence: before filling target's background, beginPath should have been called
    const clipIndex = ctx.calls.findIndex(c => c.method === 'clip')
    const beginPathAfterClip = ctx.calls.findIndex((c, i) => i > clipIndex && c.method === 'beginPath')
    expect(beginPathAfterClip).toBeGreaterThan(clipIndex)
  })
})

describe('Adversarial Stress Test: Extreme and Negative Borders and Radii', () => {
  const dummyAssets = createControllableAssetStore()

  it('safely handles zero and negative border widths without rendering inner stroke', () => {
    const ctx = createSpyCanvasContext()
    const zeroBorder = block('zero', { borderWidth: 0, borderColor: '#ff0000' })
    const negBorder = block('neg', { borderWidth: -10, borderColor: '#ff0000' })
    const scene = computeSceneLayout(face(at(zeroBorder), at(negBorder)))

    paintCardScene(ctx, scene, dummyAssets)

    // Stroke should not be called because borderWidth <= 0
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('safely handles extreme border widths (e.g. 100000) using clipped double-stroke', () => {
    const ctx = createSpyCanvasContext()
    const extreme = block('extreme', {
      width: '100',
      height: '50',
      borderWidth: 100000,
      borderColor: '#0000ff',
      borderStyle: 'dashed',
    })
    const scene = computeSceneLayout(face(at(extreme)))

    expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()
    expect(ctx.lineWidth).toBe(200000)
    expect(ctx.setLineDash).toHaveBeenCalledWith([300000, 200000])
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.getSaveDepth()).toBe(0)
  })

  it('handles negative, zero, and extreme radii in roundRectPath', () => {
    const ctx = createSpyCanvasContext()

    // Negative radius -> clamped to 0 -> calls ctx.rect
    roundRectPath(ctx, 10, 20, 100, 60, -50)
    expect(ctx.rect).toHaveBeenCalledWith(10, 20, 100, 60)
    expect(ctx.arcTo).not.toHaveBeenCalled()

    // Zero radius -> calls ctx.rect
    roundRectPath(ctx, 0, 0, 80, 40, 0)
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 80, 40)

    // Extreme radius (999999) -> clamped to min(w, h)/2 = 20 -> calls arcTo with r=20
    roundRectPath(ctx, 0, 0, 80, 40, 999999)
    expect(ctx.arcTo).toHaveBeenCalledWith(80, 0, 80, 40, 20)
    expect(ctx.arcTo).toHaveBeenCalledWith(80, 40, 0, 40, 20)
    expect(ctx.arcTo).toHaveBeenCalledWith(0, 40, 0, 0, 20)
    expect(ctx.arcTo).toHaveBeenCalledWith(0, 0, 80, 0, 20)

    // Non-numeric string or invalid radius -> safeRadius = 0 -> rect
    roundRectPath(ctx, 5, 5, 50, 50, 'invalid-radius')
    expect(ctx.rect).toHaveBeenCalledWith(5, 5, 50, 50)
  })

  it('handles fractional border widths (e.g. 0.25mm) and dotted styles', () => {
    const ctx = createSpyCanvasContext()
    const fractional = block('frac', {
      width: '100',
      height: '50',
      borderWidth: 0.25,
      borderColor: '#333333',
      borderStyle: 'dotted',
    })
    const scene = computeSceneLayout(face(at(fractional)))

    paintCardScene(ctx, scene, dummyAssets)
    expect(ctx.lineWidth).toBe(0.5)
    expect(ctx.setLineDash).toHaveBeenCalledWith([0.25, 0.25])
    expect(ctx.stroke).toHaveBeenCalled()
  })
})

describe('Adversarial Stress Test: QR Code Matrix Generation', () => {
  const dummyAssets = createControllableAssetStore()

  it('handles empty string content without throwing and without rendering modules', () => {
    const ctx = createSpyCanvasContext()
    const emptyQr = {
      ...block('emptyQr', { type: 'qrcode-block', content: '' }),
    } as RenderReadyQrCodeBlock
    const scene = computeSceneLayout(face(at(emptyQr)))

    expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()
    // Only the face background is filled, no QR background or modules
    expect(ctx.fillRect).toHaveBeenCalledTimes(1)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 600, 400)
  })

  it('handles multi-byte UTF-8, Chinese, and emojis across all error correction levels (L, M, Q, H)', () => {
    const levels = ['L', 'M', 'Q', 'H'] as const
    const complexPayload = 'OpenCard 卡片渲染系统确定性几何布局树 🎴✨ 12345!@#'

    for (const ec of levels) {
      const ctx = createSpyCanvasContext()
      const qrBlock = {
        ...block(`qr-${ec}`, {
          type: 'qrcode-block',
          width: '120',
          height: '120',
          content: complexPayload,
          errorCorrection: ec,
          quietZone: 2,
          foreground: '#123456',
          backgroundColor: '#ffffff',
        }),
      } as RenderReadyQrCodeBlock

      const scene = computeSceneLayout(face(at(qrBlock)))
      expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()

      // Should have painted background
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 120, 120)

      // Should have painted dark modules
      const expectedQr = QRCode.create(complexPayload, { errorCorrectionLevel: ec })
      let expectedDarkCount = 0
      for (let r = 0; r < expectedQr.modules.size; r++) {
        for (let c = 0; c < expectedQr.modules.size; c++) {
          if (expectedQr.modules.get(r, c)) expectedDarkCount++
        }
      }

      const moduleCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.filter(
        c => (c[2] as number) < 120,
      )
      expect(moduleCalls.length).toBe(expectedDarkCount)
    }
  })

  it('gracefully degrades when QR content exceeds maximum QR Code capacity (overflow stress)', () => {
    const ctx = createSpyCanvasContext()
    // 10,000 alphanumeric characters far exceeds QR Code Version 40 capacity (~4296 chars)
    const giantPayload = 'A'.repeat(10000)
    const overflowQr = {
      ...block('overflowQr', {
        type: 'qrcode-block',
        width: '100',
        height: '100',
        content: giantPayload,
      }),
    } as RenderReadyQrCodeBlock
    const scene = computeSceneLayout(face(at(overflowQr)))

    // Must not crash the painter!
    expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()
  })

  it('handles boundary quietZone values (zero, negative, and extreme)', () => {
    const ctx = createSpyCanvasContext()
    const zeroQuiet = {
      ...block('zeroQuiet', {
        type: 'qrcode-block',
        width: '100',
        height: '100',
        content: 'OPENCARD',
        quietZone: 0,
      }),
    } as RenderReadyQrCodeBlock

    const negQuiet = {
      ...block('negQuiet', {
        type: 'qrcode-block',
        width: '100',
        height: '100',
        content: 'OPENCARD',
        quietZone: -10, // should clamp to 0
      }),
    } as RenderReadyQrCodeBlock

    const scene = computeSceneLayout(face(at(zeroQuiet), at(negQuiet)))
    expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()
  })
})

describe('Adversarial Stress Test: Missing or Broken Assets', () => {
  it('does not throw when image source is null, empty string, or whitespace', () => {
    const ctx = createSpyCanvasContext()
    const emptyAssets = createControllableAssetStore({})
    const b1 = { ...block('b1', { type: 'image-block', source: '' }) } as RenderReadyImageBlock
    const b2 = { ...block('b2', { type: 'image-block', source: '   ' }) } as RenderReadyImageBlock
    const b3 = { ...block('b3', { type: 'image-block', source: 'missing.png' }) } as RenderReadyImageBlock

    const scene = computeSceneLayout(face(at(b1), at(b2), at(b3)))
    expect(() => paintCardScene(ctx, scene, emptyAssets)).not.toThrow()
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  it('handles image asset load error (404/network error) in asset store without rejecting preloadSceneAssets', async () => {
    class FailingImage {
      private _src = ''
      crossOrigin = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      get src() { return this._src }
      set src(val: string) {
        this._src = val
        queueMicrotask(() => {
          this.onerror?.()
        })
      }
    }

    const origImage = globalThis.Image
    globalThis.Image = FailingImage as unknown as typeof Image
    try {
      const store = createCanvasAssetStore()
      const imgBlock = block('failing', { type: 'image-block', source: 'broken.png' })
      const scene = computeSceneLayout(face(at(imgBlock)))
      const context = createCardRenderResourceContext({ resourceRootPath: '/workspace' })

      // Preload should resolve cleanly without throwing even when all images 404
      await expect(store.preloadSceneAssets(scene, context)).resolves.toBeUndefined()

      // Image in store should be null
      expect(store.getImage('asset://broken.png')).toBeNull()

      // Painting with missing image should be a no-op without errors
      const ctx = createSpyCanvasContext()
      expect(() => paintCardScene(ctx, scene, store)).not.toThrow()
      expect(ctx.drawImage).not.toHaveBeenCalled()
    } finally {
      globalThis.Image = origImage
    }
  })

  it('draws image directly when mask source is missing or fails to load', () => {
    const ctx = createSpyCanvasContext()
    const assets = createControllableAssetStore({
      'valid.png': { width: 100, height: 100 },
      'broken_mask.png': null, // mask is missing
    })
    const imgBlock = {
      ...block('masked', {
        type: 'image-block',
        width: '100',
        height: '100',
        source: 'valid.png',
        maskSource: 'broken_mask.png',
      }),
    } as RenderReadyImageBlock

    const scene = computeSceneLayout(face(at(imgBlock)))
    expect(() => paintCardScene(ctx, scene, assets)).not.toThrow()
    // Image was drawn directly without mask
    expect(ctx.drawImage).toHaveBeenCalled()
  })

  it('handles zero or negative natural image dimensions safely without division by zero', () => {
    const ctx = createSpyCanvasContext()
    const assets = createControllableAssetStore({
      'zero.png': { width: 0, height: 0 },
    })
    const imgBlock = {
      ...block('zeroImg', {
        type: 'image-block',
        width: '100',
        height: '100',
        source: 'zero.png',
      }),
    } as RenderReadyImageBlock

    const scene = computeSceneLayout(face(at(imgBlock)))
    expect(() => paintCardScene(ctx, scene, assets)).not.toThrow()
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  it('handles text block with missing inline icons and images gracefully', () => {
    const ctx = createSpyCanvasContext()
    const emptyAssets = createControllableAssetStore({})
    const txtBlock = {
      ...block('txt', {
        type: 'text-block',
        width: '200',
        height: '100',
        content: 'Hello @icon(missing/none) and @img(src="missing.png") world',
      }),
    } as RenderReadyTextBlock

    const scene = computeSceneLayout(face(at(txtBlock)))
    expect(() => paintCardScene(ctx, scene, emptyAssets)).not.toThrow()
    expect(ctx.fillText).toHaveBeenCalled()
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })
})

describe('Adversarial Stress Test: Matrix Property Testing & Fuzzing', () => {
  const dummyAssets = createControllableAssetStore()

  it('preserves numerical stability and non-NaN transform matrices across randomized nested hierarchies', () => {
    // Generate 25 pseudo-random nested hierarchies with extreme transforms
    for (let seed = 1; seed <= 25; seed += 1) {
      const rot1 = (seed * 47) % 360 - 180
      const rot2 = (seed * 83) % 360 - 180
      const scale1 = ((seed * 17) % 50) / 10 + 0.1
      const scale2 = ((seed * 29) % 50) / 10 + 0.1
      const tx = (seed * 31) % 200 - 100
      const ty = (seed * 41) % 200 - 100

      const leaf = block(`leaf-${seed}`, {
        width: '30',
        height: '20',
        background: '#123456',
        translateX: String(tx),
        translateY: String(ty),
      })
      const mid = block(`mid-${seed}`, {
        type: 'simple-container-block',
        width: '120',
        height: '100',
        clip: seed % 2 === 0,
        rotation: rot2,
        scaleX: scale2,
        scaleY: scale2,
        children: [at(leaf, 'lt', '10', '10')],
      })
      const outer = block(`outer-${seed}`, {
        type: 'simple-container-block',
        width: '300',
        height: '250',
        clip: seed % 3 === 0,
        rotation: rot1,
        scaleX: scale1,
        scaleY: scale1,
        children: [at(mid, 'lt', '20', '20')],
      })

      const scene = computeSceneLayout(face(at(outer)))
      const ctx = createSpyCanvasContext()

      expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()
      expect(ctx.getSaveDepth()).toBe(0)

      // Ensure no NaN in any transform call arguments
      const transformCalls = ctx.calls.filter(c => c.method === 'transform')
      for (const call of transformCalls) {
        for (const arg of call.args) {
          expect(Number.isFinite(arg)).toBe(true)
        }
      }
    }
  })

  it('handles degenerate zero-dimension clipped parent container without errors', () => {
    const ctx = createSpyCanvasContext()
    const child = block('kid', { width: '50', height: '50', background: '#aabbcc' })
    const degenerateParent = block('degenerate', {
      type: 'simple-container-block',
      width: '0',
      height: '0',
      clip: true,
      children: [at(child)],
    })

    const scene = computeSceneLayout(face(at(degenerateParent)))
    expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()
    expect(ctx.getSaveDepth()).toBe(0)
  })
})

describe('Adversarial Stress Test: PaintStyle Parsing Resilience', () => {
  it('parses malformed, extreme, and unusual linear-gradient strings without crashing', () => {
    const ctx = createSpyCanvasContext()
    const dummyBox = { x: 0, y: 0, width: 100, height: 100 }

    // Empty or nonsense strings fall back to transparent
    expect(parsePaintStyle('', ctx, dummyBox)).toBe('transparent')
    expect(parsePaintStyle('   ', ctx, dummyBox)).toBe('transparent')
    expect(parsePaintStyle(null as unknown as string, ctx, dummyBox)).toBe('transparent')
    expect(parsePaintStyle(undefined as unknown as string, ctx, dummyBox)).toBe('transparent')

    // Incomplete linear gradients return source string without crashing
    expect(parsePaintStyle('linear-gradient()', ctx, dummyBox)).toBe('linear-gradient()')
    expect(parsePaintStyle('linear-gradient(red)', ctx, dummyBox)).toBe('linear-gradient(red)')

    // Valid directional words
    expect(parsePaintStyle('linear-gradient(to right, red, blue)', ctx, dummyBox)).toBeDefined()
    expect(parsePaintStyle('linear-gradient(to top, #ff0000 0%, #0000ff 100%)', ctx, dummyBox)).toBeDefined()
    expect(parsePaintStyle('linear-gradient(to bottom, #ff0000 0%, #0000ff 100%)', ctx, dummyBox)).toBeDefined()
    expect(parsePaintStyle('linear-gradient(to left, #ff0000 0%, #0000ff 100%)', ctx, dummyBox)).toBeDefined()

    // Arbitrary degrees
    expect(parsePaintStyle('linear-gradient(45deg, #111 0%, #222 50%, #333 100%)', ctx, dummyBox)).toBeDefined()
    expect(parsePaintStyle('linear-gradient(-135deg, rgba(0,0,0,0.5), rgba(255,255,255,1))', ctx, dummyBox)).toBeDefined()
  })
})

