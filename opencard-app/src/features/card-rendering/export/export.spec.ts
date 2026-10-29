// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderFaceToPng } from './renderFaceToPng'
import { computeSceneLayout } from '../geometry'
import type { RenderReadyCardFace } from '../render.types'
import type { CanvasAssetStore } from '../painter/canvasAssetStore'
import { createCardRenderResourceContext } from '../cardRenderResources'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../workspace/services/projectIconCatalog'

const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const MOCK_PNG_PAYLOAD = new Uint8Array([
  ...PNG_MAGIC_BYTES,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00,
])

function createMockContext() {
  const calls: { method: string; args: unknown[] }[] = []
  const record = (method: string) => vi.fn((...args: unknown[]) => {
    calls.push({ method, args })
  })

  return {
    calls,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    scale: record('scale'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    drawImage: record('drawImage'),
    save: record('save'),
    restore: record('restore'),
    transform: record('transform'),
    translate: record('translate'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    clip: record('clip'),
    fill: record('fill'),
    stroke: record('stroke'),
  }
}

class MockOffscreenCanvas {
  width: number
  height: number
  ctx: ReturnType<typeof createMockContext>

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.ctx = createMockContext()
  }

  getContext(type: string) {
    if (type === '2d') return this.ctx
    return null
  }

  async convertToBlob(options?: { type?: string }) {
    return new Blob([MOCK_PNG_PAYLOAD], { type: options?.type ?? 'image/png' })
  }
}

function createSampleFace(): RenderReadyCardFace {
  return {
    type: 'card-face',
    id: 'front',
    faceKey: 'front',
    width: 400,
    height: 600,
    background: '#ffffff',
    children: [],
  }
}

describe('renderFaceToPng', () => {
  const originalOffscreenCanvas = (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas
  let lastCanvasInstance: MockOffscreenCanvas | null = null

  beforeEach(() => {
    lastCanvasInstance = null
    const MockCanvasConstructor = class extends MockOffscreenCanvas {
      constructor(w: number, h: number) {
        super(w, h)
        lastCanvasInstance = this
      }
    }
    ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = MockCanvasConstructor
  })

  afterEach(() => {
    ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = originalOffscreenCanvas
    vi.restoreAllMocks()
  })

  it('returns standard PNG header signature bytes [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]', async () => {
    const face = createSampleFace()
    const bytes = await renderFaceToPng(face)

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThanOrEqual(8)
    expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_MAGIC_BYTES)
  })

  it('computes layout and exports from a raw card face', async () => {
    const face = createSampleFace()
    const bytes = await renderFaceToPng(face)

    expect(lastCanvasInstance).not.toBeNull()
    expect(lastCanvasInstance!.width).toBe(400)
    expect(lastCanvasInstance!.height).toBe(600)
    expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_MAGIC_BYTES)
  })

  it('exports directly from a pre-computed scene graph without recomputing', async () => {
    const face = createSampleFace()
    const scene = computeSceneLayout(face)

    const bytes = await renderFaceToPng(scene)

    expect(lastCanvasInstance).not.toBeNull()
    expect(lastCanvasInstance!.width).toBe(400)
    expect(lastCanvasInstance!.height).toBe(600)
    expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_MAGIC_BYTES)
  })

  it('scales canvas dimensions and transform matrix when scale option is provided', async () => {
    const face = createSampleFace()
    const bytes = await renderFaceToPng(face, { scale: 2 })

    expect(lastCanvasInstance).not.toBeNull()
    expect(lastCanvasInstance!.width).toBe(800)
    expect(lastCanvasInstance!.height).toBe(1200)
    expect(lastCanvasInstance!.ctx.scale).toHaveBeenCalledWith(2, 2)
    expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_MAGIC_BYTES)
  })

  it('defaults to 1x scale when scale option is omitted', async () => {
    const face = createSampleFace()
    await renderFaceToPng(face)

    expect(lastCanvasInstance!.width).toBe(400)
    expect(lastCanvasInstance!.height).toBe(600)
    expect(lastCanvasInstance!.ctx.scale).toHaveBeenCalledWith(1, 1)
  })

  it('awaits scene asset preloading before painting the card', async () => {
    const face = createSampleFace()
    const resourceContext = createCardRenderResourceContext({
      projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    })

    const sequence: string[] = []
    const mockAssets: CanvasAssetStore = {
      getImage: vi.fn(() => null),
      loadImage: vi.fn(async () => null),
      preloadSceneAssets: vi.fn(async (_scene, _resCtx) => {
        sequence.push('preloadSceneAssets')
      }),
      onAssetLoaded: vi.fn(() => () => {}),
      clear: vi.fn(),
    }

    const MockCanvasWithSequence = class extends MockOffscreenCanvas {
      constructor(w: number, h: number) {
        super(w, h)
        lastCanvasInstance = this
        const origFillRect = this.ctx.fillRect
        this.ctx.fillRect = vi.fn((...args: unknown[]) => {
          sequence.push('paintFillRect')
          return origFillRect(...args)
        })
      }
    }
    ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = MockCanvasWithSequence

    await renderFaceToPng(face, {
      assets: mockAssets,
      resourceContext,
    })

    expect(mockAssets.preloadSceneAssets).toHaveBeenCalledTimes(1)
    expect(mockAssets.preloadSceneAssets).toHaveBeenCalledWith(
      expect.objectContaining({ width: 400, height: 600 }),
      resourceContext,
    )
    expect(sequence[0]).toBe('preloadSceneAssets')
    expect(sequence[1]).toBe('paintFillRect')
  })

  it('forwards onlyBlockId slice filter to paintCardScene', async () => {
    const face = createSampleFace()
    await renderFaceToPng(face, { onlyBlockId: 'block-specific' })

    const fillRectCalls = lastCanvasInstance!.ctx.calls.filter(c => c.method === 'fillRect')
    expect(fillRectCalls.length).toBe(0)
  })

  it('falls back to HTMLCanvasElement and toDataURL when OffscreenCanvas is undefined', async () => {
    ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = undefined

    const mockCtx = createMockContext()
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL

    const base64Png = btoa(String.fromCharCode(...PNG_MAGIC_BYTES, 0x00, 0x01, 0x02))
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx as unknown as RenderingContext) as any
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => `data:image/png;base64,${base64Png}`)

    try {
      const face = createSampleFace()
      const bytes = await renderFaceToPng(face, { scale: 1.5 })

      expect(mockCtx.scale).toHaveBeenCalledWith(1.5, 1.5)
      expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png')
      expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_MAGIC_BYTES)
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL
    }
  })

  it('returns an empty byte array when canvas 2D context cannot be acquired', async () => {
    const MockNullCtxCanvas = class extends MockOffscreenCanvas {
      override getContext() {
        return null
      }
    }
    ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = MockNullCtxCanvas

    const face = createSampleFace()
    const bytes = await renderFaceToPng(face)

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(0)
  })
})
