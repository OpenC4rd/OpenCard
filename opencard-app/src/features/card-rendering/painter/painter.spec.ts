// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import {
  createCanvasAssetStore,
  type CanvasAssetStore,
  type LoadedAsset,
  isSvgSource,
  boostSvgResolution,
} from './canvasAssetStore'
import { paintCardScene } from './paintCardScene'
import { computeSceneLayout } from '../geometry'
import type {
  RenderReadyCardBlock,
  RenderReadyCardFace,
  RenderReadyImageBlock,
  RenderReadyQrCodeBlock,
} from '../render.types'
import { createCardRenderResourceContext } from '../cardRenderResources'

const { convertFileSrc } = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path.replace(/^\/workspace\//, '')}`),
}))

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc }))

// --- Mock Canvas & Asset Utilities ---

export function createMockCanvasContext() {
  const calls: { method: string; args: unknown[] }[] = []
  const record = (name: string, impl?: (...args: unknown[]) => unknown) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method: name, args })
      return impl ? impl(...args) : undefined
    })

  const gradient = { addColorStop: vi.fn() }

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

    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    save: record('save'),
    restore: record('restore'),
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
  } as unknown as CanvasRenderingContext2D & { calls: { method: string; args: unknown[] }[] }
}

export function createMockAssetStore(images: Record<string, { width: number; height: number }> = {}): CanvasAssetStore {
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

// --- Test Fixtures ---

function block(id: string, extra: Record<string, unknown> = {}): RenderReadyCardBlock {
  return {
    type: 'shape-block', id, name: id, notes: '', visible: true, width: '100', height: '50',
    borderColor: '', borderWidth: 0, borderStyle: 'solid', borderRadius: '0', background: '',
    translateX: '0', translateY: '0', scaleX: 1, scaleY: 1, transformAnchor: 'cc', zIndex: 0,
    rotation: 0, opacity: 1, ...extra,
  } as unknown as RenderReadyCardBlock
}

const at = (b: RenderReadyCardBlock, anchor = 'lt', x = '0', y = '0') => ({
  block: b,
  location: { id: `loc-${b.id}`, type: 'simple-container-location' as const, anchor: anchor as never, x, y },
})

function face(...children: ReturnType<typeof at>[]): RenderReadyCardFace {
  return { type: 'card-face', id: 'face', faceKey: 'front', width: 400, height: 300, background: '#ffffff', children } as RenderReadyCardFace
}

// --- Test Suites ---

describe('canvasAssetStore', () => {
  class MockImage {
    private _src = ''
    naturalWidth = 100
    naturalHeight = 100
    width = 100
    height = 100
    crossOrigin = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    get src() { return this._src }
    set src(val: string) {
      this._src = val
      queueMicrotask(() => {
        if (val.includes('error')) this.onerror?.()
        else this.onload?.()
      })
    }
  }

  const originalImage = globalThis.Image
  beforeEach(() => {
    globalThis.Image = MockImage as unknown as typeof Image
  })
  afterEach(() => {
    globalThis.Image = originalImage
  })

  it('caches and deduplicates concurrent loads for the same image source', async () => {
    const store = createCanvasAssetStore()
    const p1 = store.loadImage('avatar.png')
    const p2 = store.loadImage('avatar.png')
    expect(p1).toBe(p2)
    const img = await p1
    expect(img).not.toBeNull()
    expect(store.getImage('avatar.png')).toBe(img)
  })

  it('returns null immediately when loading empty or whitespace source', async () => {
    const store = createCanvasAssetStore()
    expect(await store.loadImage('')).toBeNull()
    expect(await store.loadImage('   ')).toBeNull()
    expect(store.getImage('missing.png')).toBeNull()
  })

  it('notifies registered asset listeners and supports clean unsubscription', async () => {
    const store = createCanvasAssetStore()
    const listener = vi.fn()
    const unsubscribe = store.onAssetLoaded(listener)

    await store.loadImage('a.png')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    await store.loadImage('b.png')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('swallows errors thrown by asset listeners without breaking notification loop', async () => {
    const store = createCanvasAssetStore()
    const bad = vi.fn(() => { throw new Error('fail') })
    const good = vi.fn()
    store.onAssetLoaded(bad)
    store.onAssetLoaded(good)

    await store.loadImage('c.png')
    expect(bad).toHaveBeenCalled()
    expect(good).toHaveBeenCalled()
  })

  it('preloads images, masks, and inline markup icons across the scene graph', async () => {
    const store = createCanvasAssetStore()
    const img = block('pic', { type: 'image-block', source: 'img.png', maskSource: 'mask.png' })
    const txt = block('doc', { type: 'text-block', content: 'See @img(src="icon.png") @icon(tools/gear)' })
    const scene = computeSceneLayout(face(at(img), at(txt)))

    const context = createCardRenderResourceContext({
      resourceRootPath: '/workspace',
      projectIconCatalog: {
        series: [],
        entries: [{ seriesKey: 'tools', iconKey: 'gear', name: 'gear', source: 'gear.svg', src: 'gear.svg', tint: 'original' }],
      },
    })

    await store.preloadSceneAssets(scene, context)
    expect(store.getImage('asset://img.png')).not.toBeNull()
    expect(store.getImage('asset://mask.png')).not.toBeNull()
    expect(store.getImage('asset://icon.png')).not.toBeNull()
    expect(store.getImage('gear.svg')).not.toBeNull()
  })
})

describe('paintCardScene canvas frame & slicing', () => {
  const dummyAssets = createMockAssetStore()

  it('clears canvas and paints face background when no slice filter is active', () => {
    const ctx = createMockCanvasContext()
    const scene = computeSceneLayout(face())
    paintCardScene(ctx, scene, dummyAssets)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 300)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 400, 300)
    expect(ctx.fillStyle).toBe('#ffffff')
  })

  it('skips canvas clear and background when onlyBlockId slice filter is set', () => {
    const ctx = createMockCanvasContext()
    const scene = computeSceneLayout(face(at(block('solo', { width: '80', height: '40' }))))
    paintCardScene(ctx, scene, dummyAssets, { onlyBlockId: 'solo' })
    expect(ctx.clearRect).not.toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalledWith(0, 0, 400, 300)
  })

  it('filters painting to a single node when onlyBlockId is specified', () => {
    const ctx = createMockCanvasContext()
    const first = block('first', { width: '50', height: '50' })
    const second = block('second', { width: '80', height: '80' })
    const scene = computeSceneLayout(face(at(first), at(second)))
    paintCardScene(ctx, scene, dummyAssets, { onlyBlockId: 'second' })
    const secondNode = scene.nodeMap.get('second')!
    expect(ctx.transform).toHaveBeenCalledTimes(1)
    expect(ctx.transform).toHaveBeenCalledWith(...secondNode.worldMatrix)
  })
})

describe('paintCardScene geometry & clipping', () => {
  const dummyAssets = createMockAssetStore()

  it('applies affine world matrix and multiplies globalAlpha for visible blocks', () => {
    const ctx = createMockCanvasContext()
    const b = block('item', { width: '100', height: '50', opacity: 0.6, rotation: 90 })
    const scene = computeSceneLayout(face(at(b, 'lt', '20', '30')))
    paintCardScene(ctx, scene, dummyAssets)
    const node = scene.nodeMap.get('item')!
    expect(ctx.transform).toHaveBeenCalledWith(...node.worldMatrix)
    expect(ctx.globalAlpha).toBeCloseTo(0.6)
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('skips rendering for invisible blocks or blocks with zero dimension', () => {
    const ctx = createMockCanvasContext()
    const hidden = block('hidden', { visible: false })
    const zero = block('zero', { width: '0', height: '50' })
    const scene = computeSceneLayout(face(at(hidden), at(zero)))
    paintCardScene(ctx, scene, dummyAssets)
    expect(ctx.transform).not.toHaveBeenCalled()
  })

  it('clips rendering to ancestor oriented bounding box when ancestor has clip enabled', () => {
    const ctx = createMockCanvasContext()
    const kid = block('child', { width: '80', height: '40' })
    const parent = block('clipper', {
      type: 'simple-container-block',
      width: '200', height: '150', clip: true,
      children: [at(kid)],
    })
    const scene = computeSceneLayout(face(at(parent, 'lt', '10', '10')))
    paintCardScene(ctx, scene, dummyAssets)
    const clipperNode = scene.nodeMap.get('clipper')!
    const [p0, p1, p2, p3] = clipperNode.obbCorners
    expect(ctx.moveTo).toHaveBeenCalledWith(p0.x, p0.y)
    expect(ctx.lineTo).toHaveBeenCalledWith(p1.x, p1.y)
    expect(ctx.lineTo).toHaveBeenCalledWith(p2.x, p2.y)
    expect(ctx.lineTo).toHaveBeenCalledWith(p3.x, p3.y)
    expect(ctx.clip).toHaveBeenCalled()
  })
})

describe('paintCardScene shapes & styling', () => {
  const dummyAssets = createMockAssetStore()

  it('draws geometric shapes using their characteristic paths', () => {
    const ctx = createMockCanvasContext()
    const ellipse = block('e', { shape: 'ellipse', width: '100', height: '60', fill: '#ff0000' })
    const triangle = block('t', { shape: 'triangle', width: '100', height: '80', fill: '#00ff00' })
    const scene = computeSceneLayout(face(at(ellipse), at(triangle)))
    paintCardScene(ctx, scene, dummyAssets)
    expect(ctx.ellipse).toHaveBeenCalledWith(50, 30, 50, 30, 0, 0, Math.PI * 2)
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 80)
    expect(ctx.fill).toHaveBeenCalled()
  })

  it('clips inside border with double stroke width when borderWidth is greater than zero', () => {
    const ctx = createMockCanvasContext()
    const bordered = block('b', {
      width: '100', height: '50', borderWidth: 3, borderColor: '#334455', borderStyle: 'dashed',
    })
    const scene = computeSceneLayout(face(at(bordered)))
    paintCardScene(ctx, scene, dummyAssets)
    expect(ctx.lineWidth).toBe(6)
    expect(ctx.strokeStyle).toBe('#334455')
    expect(ctx.setLineDash).toHaveBeenCalledWith([9, 6])
    expect(ctx.clip).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('parses linear gradient fill with angle and color stops', () => {
    const ctx = createMockCanvasContext()
    const grad = block('g', { width: '100', height: '100', fill: 'linear-gradient(90deg, #f00 0%, #00f 100%)' })
    const scene = computeSceneLayout(face(at(grad)))
    paintCardScene(ctx, scene, dummyAssets)
    expect(ctx.createLinearGradient).toHaveBeenCalled()
  })
})

describe('paintCardScene QR code matrix', () => {
  const dummyAssets = createMockAssetStore()

  it('draws QR code matrix cells with quiet zone and foreground color', () => {
    const ctx = createMockCanvasContext()
    const qrBlock = {
      ...block('qr', {
        type: 'qrcode-block', width: '100', height: '100', content: 'OPENCARD',
        errorCorrection: 'M', quietZone: 2, foreground: '#112233', backgroundColor: '#f0f0f0',
      }),
    } as RenderReadyQrCodeBlock
    const scene = computeSceneLayout(face(at(qrBlock)))
    paintCardScene(ctx, scene, dummyAssets)

    const expectedQr = QRCode.create('OPENCARD', { errorCorrectionLevel: 'M' })
    let darkModules = 0
    for (let r = 0; r < expectedQr.modules.size; r++) {
      for (let c = 0; c < expectedQr.modules.size; c++) {
        if (expectedQr.modules.get(r, c)) darkModules++
      }
    }

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100) // background
    const moduleFills = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => (c[2] as number) < 100)
    expect(moduleFills.length).toBe(darkModules)
    expect(ctx.fillStyle).toBe('#112233')
  })

  it('handles malformed QR code content gracefully without throwing', () => {
    const ctx = createMockCanvasContext()
    const badQr = {
      ...block('bad', { type: 'qrcode-block', width: '100', height: '100', content: '' }),
    } as RenderReadyQrCodeBlock
    const scene = computeSceneLayout(face(at(badQr)))
    expect(() => paintCardScene(ctx, scene, dummyAssets)).not.toThrow()
  })
})

describe('paintCardScene images, masking & tinting', () => {
  it('draws image fitted to target dimensions according to fit mode', () => {
    const ctx = createMockCanvasContext()
    const assets = createMockAssetStore({ 'photo.png': { width: 200, height: 100 } })
    const imgBlock = {
      ...block('img', { type: 'image-block', width: '100', height: '100', source: 'photo.png', fit: 'contain' }),
    } as RenderReadyImageBlock
    const scene = computeSceneLayout(face(at(imgBlock)))
    paintCardScene(ctx, scene, assets)
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 25, 100, 50)
  })

  it('composites image mask using destination-in on an offscreen surface', () => {
    const ctx = createMockCanvasContext()
    const offCtx = createMockCanvasContext()
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn(() => offCtx as unknown as RenderingContext) as any

    const assets = createMockAssetStore({
      'avatar.png': { width: 100, height: 100 },
      'mask.png': { width: 100, height: 100 },
    })
    const imgBlock = {
      ...block('masked', {
        type: 'image-block', width: '100', height: '100',
        source: 'avatar.png', maskSource: 'mask.png',
      }),
    } as RenderReadyImageBlock
    const scene = computeSceneLayout(face(at(imgBlock)))
    paintCardScene(ctx, scene, assets)

    expect(offCtx.globalCompositeOperation).toBe('destination-in')
    expect(ctx.drawImage).toHaveBeenCalled()
    HTMLCanvasElement.prototype.getContext = originalGetContext
  })

  it('tints context icons with borderColor using source-in compositing', () => {
    const ctx = createMockCanvasContext()
    const assets = createMockAssetStore({ 'icon.svg': { width: 50, height: 50 } })
    const iconBlock = {
      ...block('icon', {
        type: 'image-block', width: '50', height: '50',
        source: 'icon:tools/hammer', borderColor: '#e11d48',
      }),
    } as RenderReadyImageBlock
    const context = createCardRenderResourceContext({
      projectIconCatalog: {
        series: [],
        entries: [{ seriesKey: 'tools', iconKey: 'hammer', name: 'hammer', source: 'icon.svg', src: 'icon.svg', tint: 'context' }],
      },
    })

    const scene = computeSceneLayout(face(at(iconBlock)))
    paintCardScene(ctx, scene, assets, { resourceContext: context })

    expect(ctx.globalCompositeOperation).toBe('source-in')
    expect(ctx.fillStyle).toBe('#e11d48')
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 50, 50)
  })

  it('identifies SVG sources correctly', () => {
    expect(isSvgSource('icon.svg')).toBe(true)
    expect(isSvgSource('/workspace/assets/logo.SVG?v=123')).toBe(true)
    expect(isSvgSource('data:image/svg+xml;utf8,<svg></svg>')).toBe(true)
    expect(isSvgSource('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true)
    expect(isSvgSource('photo.png')).toBe(false)
    expect(isSvgSource('photo.jpg?ext=.svg.jpg')).toBe(false)
  })

  it('boosts SVG resolution while preserving viewBox and aspect ratio', () => {
    const rawSvg = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
    const boosted = boostSvgResolution(rawSvg, 2048)
    expect(boosted).toBeTruthy()
    expect(boosted).toContain('width="2048"')
    expect(boosted).toContain('height="2048"')
    expect(boosted).toContain('viewBox="0 0 24 24"')
  })

  it('boosts non-square SVG resolution preserving proportional dimensions', () => {
    const rawSvg = '<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>'
    const boosted = boostSvgResolution(rawSvg, 2048)
    expect(boosted).toBeTruthy()
    expect(boosted).toContain('width="2048"')
    expect(boosted).toContain('height="1024"')
  })

  it('synthesizes viewBox when boosting SVG that only declares width and height', () => {
    const rawSvg = '<svg width="40" height="20"><rect width="40" height="20"/></svg>'
    const boosted = boostSvgResolution(rawSvg, 2048)
    expect(boosted).toBeTruthy()
    expect(boosted).toContain('viewBox="0 0 40 20"')
    expect(boosted).toContain('width="2048"')
    expect(boosted).toContain('height="1024"')
  })
})
