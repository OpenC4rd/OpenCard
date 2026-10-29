// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fflate from 'fflate'
import { renderFaceToPng, type RenderFaceToPngOptions } from './renderFaceToPng'
import type {
  RenderReadyCardFace,
  RenderReadyImageBlock,
  RenderReadyQrCodeBlock,
  RenderReadyShapeBlock,
  RenderReadyTextBlock,
} from '../render.types'
import type { CanvasAssetStore } from '../painter/canvasAssetStore'
import { createCardRenderResourceContext } from '../cardRenderResources'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../workspace/services/projectIconCatalog'

// --- Binary PNG Generator & Oracle ---

const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  CRC_TABLE[n] = c >>> 0
}

function calculateCrc32(buf: Uint8Array): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]!) & 0xff]!
  }
  return (c ^ -1) >>> 0
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length
  const chunk = new Uint8Array(4 + 4 + len + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, len)
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i)
  }
  chunk.set(data, 8)
  const crc = calculateCrc32(chunk.subarray(4, 8 + len))
  view.setUint32(8 + len, crc)
  return chunk
}

export function buildRealisticPng(width: number, height: number): Uint8Array {
  const safeW = Math.max(1, Math.round(width))
  const safeH = Math.max(1, Math.round(height))

  const header = new Uint8Array(PNG_MAGIC)
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, safeW)
  ihdrView.setUint32(4, safeH)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const rawScanlines = new Uint8Array(safeH * (1 + safeW * 4))
  const compressed = fflate.deflateSync(rawScanlines)

  const ihdrChunk = createPngChunk('IHDR', ihdr)
  const idatChunk = createPngChunk('IDAT', compressed)
  const iendChunk = createPngChunk('IEND', new Uint8Array(0))

  const totalLen = header.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const part of [header, ihdrChunk, idatChunk, iendChunk]) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export type ParsedPng = {
  validSignature: boolean
  width: number
  height: number
  bitDepth: number
  colorType: number
  hasIend: boolean
  totalBytes: number
}

export function parsePngStructure(bytes: Uint8Array): ParsedPng {
  if (bytes.length < 8) {
    return { validSignature: false, width: 0, height: 0, bitDepth: 0, colorType: 0, hasIend: false, totalBytes: bytes.length }
  }
  const validSignature = PNG_MAGIC.every((expected, i) => bytes[i] === expected)
  if (!validSignature || bytes.length < 33) {
    return { validSignature, width: 0, height: 0, bitDepth: 0, colorType: 0, hasIend: false, totalBytes: bytes.length }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ihdrLength = view.getUint32(8)
  const ihdrType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!)
  if (ihdrLength !== 13 || ihdrType !== 'IHDR') {
    return { validSignature, width: 0, height: 0, bitDepth: 0, colorType: 0, hasIend: false, totalBytes: bytes.length }
  }

  const width = view.getUint32(16)
  const height = view.getUint32(20)
  const bitDepth = bytes[24]!
  const colorType = bytes[25]!

  let hasIend = false
  let pos = 8
  while (pos + 8 <= bytes.length) {
    const chunkLen = view.getUint32(pos)
    const chunkType = String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!)
    if (chunkType === 'IEND') {
      hasIend = true
      break
    }
    pos += 12 + chunkLen
  }

  return {
    validSignature,
    width,
    height,
    bitDepth,
    colorType,
    hasIend,
    totalBytes: bytes.length,
  }
}

// --- Stateful Mock Canvas Harness ---

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
    setTransform: record('setTransform'),
    resetTransform: record('resetTransform'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arcTo: record('arcTo'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    roundRect: record('roundRect'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    measureText: vi.fn((text: string) => ({ width: text.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
  }
}

class RealisticMockOffscreenCanvas {
  width: number
  height: number
  ctx: ReturnType<typeof createMockContext>
  blobRejection: Error | null = null

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
    if (this.blobRejection) {
      throw this.blobRejection
    }
    const realPng = buildRealisticPng(this.width, this.height)
    return new Blob([realPng], { type: options?.type ?? 'image/png' })
  }
}

function createSampleFace(width = 400, height = 600): RenderReadyCardFace {
  return {
    type: 'card-face',
    id: 'front',
    faceKey: 'front',
    width,
    height,
    background: '#ffffff',
    children: [],
  }
}

describe('Milestone 2 Headless Export Adversarial Suite', () => {
  const originalOffscreenCanvas = (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas
  let lastCanvasInstance: RealisticMockOffscreenCanvas | null = null

  beforeEach(() => {
    lastCanvasInstance = null
    const MockCanvasConstructor = class extends RealisticMockOffscreenCanvas {
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

  describe('Dimension 1: High-Resolution & Fractional Scaling Multipliers', () => {
    it('scale = 4 (high-res 300 DPI): canvas dimensions and PNG IHDR both match 4x scale', async () => {
      const face = createSampleFace(400, 600)
      const bytes = await renderFaceToPng(face, { scale: 4 })

      expect(lastCanvasInstance).not.toBeNull()
      expect(lastCanvasInstance!.width).toBe(1600)
      expect(lastCanvasInstance!.height).toBe(2400)
      expect(lastCanvasInstance!.ctx.scale).toHaveBeenCalledWith(4, 4)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(1600)
      expect(parsed.height).toBe(2400)
      expect(parsed.hasIend).toBe(true)
    })

    it('scale = 0.5 (thumbnail downscale): canvas dimensions and PNG IHDR match 0.5x scale', async () => {
      const face = createSampleFace(401, 601)
      const bytes = await renderFaceToPng(face, { scale: 0.5 })

      // Math.round(401 * 0.5) = 201, Math.round(601 * 0.5) = 301
      expect(lastCanvasInstance!.width).toBe(201)
      expect(lastCanvasInstance!.height).toBe(301)
      expect(lastCanvasInstance!.ctx.scale).toHaveBeenCalledWith(0.5, 0.5)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(201)
      expect(parsed.height).toBe(301)
    })

    it('fractional scale = 1.33: canvas dimensions and PNG IHDR match rounded fractional dimensions', async () => {
      const face = createSampleFace(400, 600)
      const bytes = await renderFaceToPng(face, { scale: 1.33 })

      const expectedW = Math.round(400 * 1.33) // 532
      const expectedH = Math.round(600 * 1.33) // 798

      expect(lastCanvasInstance!.width).toBe(expectedW)
      expect(lastCanvasInstance!.height).toBe(expectedH)
      expect(lastCanvasInstance!.ctx.scale).toHaveBeenCalledWith(1.33, 1.33)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(expectedW)
      expect(parsed.height).toBe(expectedH)
    })

    it('sub-pixel scale = 0.001: clamps canvas dimensions to at least 1x1 without throwing', async () => {
      const face = createSampleFace(400, 600)
      const bytes = await renderFaceToPng(face, { scale: 0.001 })

      expect(lastCanvasInstance!.width).toBe(1)
      expect(lastCanvasInstance!.height).toBe(1)
      expect(lastCanvasInstance!.ctx.scale).toHaveBeenCalledWith(0.001, 0.001)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(1)
      expect(parsed.height).toBe(1)
    })

    it('scale = 0: clamps canvas dimensions to at least 1x1', async () => {
      const face = createSampleFace(400, 600)
      const bytes = await renderFaceToPng(face, { scale: 0 })

      expect(lastCanvasInstance!.width).toBe(1)
      expect(lastCanvasInstance!.height).toBe(1)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(1)
      expect(parsed.height).toBe(1)
    })

    it('negative scale = -1: clamps canvas dimensions to at least 1x1', async () => {
      const face = createSampleFace(400, 600)
      const bytes = await renderFaceToPng(face, { scale: -1 })

      expect(lastCanvasInstance!.width).toBe(1)
      expect(lastCanvasInstance!.height).toBe(1)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(1)
      expect(parsed.height).toBe(1)
    })

    it('scale = NaN or non-finite: safely falls back to default 1x scale without throwing', async () => {
      const face = createSampleFace(400, 600)
      let threw = false
      try {
        await renderFaceToPng(face, { scale: NaN })
      } catch {
        threw = true
      }
      // If renderFaceToPng does not validate scale, OffscreenCanvas(NaN, NaN) throws or creates invalid canvas
      expect(threw).toBe(false)
      expect(lastCanvasInstance!.width).toBeGreaterThanOrEqual(1)
      expect(lastCanvasInstance!.height).toBeGreaterThanOrEqual(1)
    })

    it('scale = Infinity: safely falls back without throwing TypeError', async () => {
      const face = createSampleFace(400, 600)
      let threw = false
      try {
        await renderFaceToPng(face, { scale: Infinity })
      } catch {
        threw = true
      }
      expect(threw).toBe(false)
    })
  })

  describe('Dimension 2: Output Byte Stream & Fallback Backends', () => {
    it('HTMLCanvasElement fallback path: produces valid PNG header, IHDR chunk, and dimensions', async () => {
      ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = undefined

      const mockCtx = createMockContext()
      const originalGetContext = HTMLCanvasElement.prototype.getContext
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL

      const realFallbackPng = buildRealisticPng(600, 900)
      const base64Data = Buffer.from(realFallbackPng).toString('base64')

      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx as unknown as RenderingContext) as any
      HTMLCanvasElement.prototype.toDataURL = vi.fn(() => `data:image/png;base64,${base64Data}`)

      try {
        const face = createSampleFace(400, 600)
        const bytes = await renderFaceToPng(face, { scale: 1.5 })

        expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png')
        expect(mockCtx.scale).toHaveBeenCalledWith(1.5, 1.5)

        const parsed = parsePngStructure(bytes)
        expect(parsed.validSignature).toBe(true)
        expect(parsed.width).toBe(600)
        expect(parsed.height).toBe(900)
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext
        HTMLCanvasElement.prototype.toDataURL = originalToDataURL
      }
    })

    it('returns empty Uint8Array when convertToBlob rejects without unhandled rejection', async () => {
      const MockFailingCanvas = class extends RealisticMockOffscreenCanvas {
        constructor(w: number, h: number) {
          super(w, h)
          this.blobRejection = new Error('Out of GPU memory during blob conversion')
        }
      }
      ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = MockFailingCanvas

      const face = createSampleFace(400, 600)
      const bytes = await renderFaceToPng(face)

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBe(0)
    })

    it('returns empty Uint8Array when environment has no OffscreenCanvas and no document', async () => {
      ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = undefined
      const origDocument = globalThis.document
      try {
        // @ts-expect-error simulating worker without DOM
        delete globalThis.document

        const face = createSampleFace(400, 600)
        const bytes = await renderFaceToPng(face)

        expect(bytes).toBeInstanceOf(Uint8Array)
        expect(bytes.length).toBe(0)
      } finally {
        globalThis.document = origDocument
      }
    })
  })

  describe('Dimension 3: Complex Multi-Layer Cards', () => {
    it('renders a multi-layer card with shape, QR code, masked image, and rich text without errors', async () => {
      const shapeBlock: RenderReadyShapeBlock = {
        type: 'shape-block',
        id: 'shape-1',
        name: 'Shape',
        notes: '',
        visible: true,
        width: '200',
        height: '100',
        translateX: '0',
        translateY: '0',
        scaleX: 1,
        scaleY: 1,
        transformAnchor: 'cc',
        rotation: 15,
        opacity: 1,
        zIndex: 1,
        borderColor: '',
        borderWidth: 0,
        borderStyle: 'solid',
        borderRadius: '8',
        background: '',
        shape: 'rectangle',
        fill: '#3b82f6',
        stroke: '#1d4ed8',
        strokeWidth: 3,
        strokeStyle: 'solid',
        strokeAlignment: 'inside',
        strokeJoin: 'round',
        strokeCap: 'round',
        strokeMiterLimit: 10,
      }

      const qrBlock: RenderReadyQrCodeBlock = {
        type: 'qrcode-block',
        id: 'qr-1',
        name: 'QR',
        notes: '',
        visible: true,
        width: '120',
        height: '120',
        translateX: '0',
        translateY: '0',
        scaleX: 1,
        scaleY: 1,
        transformAnchor: 'cc',
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        borderColor: '',
        borderWidth: 0,
        borderStyle: 'solid',
        borderRadius: '0',
        background: '',
        content: 'https://opencard.app/verify/challenger-m2',
        foreground: '#0f172a',
        backgroundColor: '#ffffff',
        errorCorrection: 'M',
        quietZone: 1,
      }

      const imageBlock: RenderReadyImageBlock = {
        type: 'image-block',
        id: 'img-1',
        name: 'Image',
        notes: '',
        visible: true,
        width: '150',
        height: '150',
        translateX: '0',
        translateY: '0',
        scaleX: 1,
        scaleY: 1,
        transformAnchor: 'cc',
        rotation: 0,
        opacity: 0.9,
        zIndex: 3,
        borderColor: '',
        borderWidth: 0,
        borderStyle: 'solid',
        borderRadius: '0',
        background: '',
        source: 'project://cards/hero.png',
        maskSource: 'project://cards/mask.png',
        maskFit: 'cover',
        fit: 'cover',
      }

      const textBlock: RenderReadyTextBlock = {
        type: 'text-block',
        id: 'text-1',
        name: 'Text',
        notes: '',
        visible: true,
        width: '300',
        height: '80',
        translateX: '0',
        translateY: '0',
        scaleX: 1,
        scaleY: 1,
        transformAnchor: 'cc',
        rotation: 0,
        opacity: 1,
        zIndex: 4,
        borderColor: '',
        borderWidth: 0,
        borderStyle: 'solid',
        borderRadius: '0',
        background: '',
        content: 'Card Title\nSubtitle with text formatting',
        color: '#1e293b',
        fontSize: '16',
        fontFamily: 'Inter',
        fontWeight: 'bold',
        textAlign: 'start',
        verticalAlign: 'top',
        lineHeight: '24',
        writingMode: 'horizontal-tb',
      }

      const complexFace: RenderReadyCardFace = {
        type: 'card-face',
        id: 'front-complex',
        faceKey: 'front',
        width: 400,
        height: 600,
        background: '#f8fafc',
        children: [
          {
            block: shapeBlock,
            location: { id: 'loc-1', type: 'simple-container-location', anchor: 'lt', x: '50', y: '50' },
          },
          {
            block: qrBlock,
            location: { id: 'loc-2', type: 'simple-container-location', anchor: 'lt', x: '50', y: '200' },
          },
          {
            block: imageBlock,
            location: { id: 'loc-3', type: 'simple-container-location', anchor: 'lt', x: '50', y: '350' },
          },
          {
            block: textBlock,
            location: { id: 'loc-4', type: 'simple-container-location', anchor: 'lt', x: '50', y: '510' },
          },
        ],
      }

      const preloadedScenes: unknown[] = []
      const mockAssetStore: CanvasAssetStore = {
        getImage: vi.fn(() => null),
        loadImage: vi.fn(async () => null),
        preloadSceneAssets: vi.fn(async (scene, _resCtx) => {
          preloadedScenes.push(scene)
        }),
        onAssetLoaded: vi.fn(() => () => {}),
        clear: vi.fn(),
      }

      const resourceContext = createCardRenderResourceContext({
        projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG,
      })

      const bytes = await renderFaceToPng(complexFace, {
        scale: 2,
        assets: mockAssetStore,
        resourceContext,
      })

      expect(mockAssetStore.preloadSceneAssets).toHaveBeenCalledTimes(1)
      expect(preloadedScenes.length).toBe(1)
      expect(lastCanvasInstance).not.toBeNull()
      expect(lastCanvasInstance!.width).toBe(800)
      expect(lastCanvasInstance!.height).toBe(1200)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(800)
      expect(parsed.height).toBe(1200)
      expect(parsed.hasIend).toBe(true)

      // Ensure draw/transform calls were made across all layers
      const methods = lastCanvasInstance!.ctx.calls.map(c => c.method)
      expect(methods).toContain('fillRect')
      expect(methods).toContain('save')
      expect(methods).toContain('restore')
    })
  })

  describe('Dimension 4: Empty Cards & Boundary Geometries', () => {
    it('empty card face (0 children): renders background and produces valid PNG stream', async () => {
      const face = createSampleFace(400, 600)
      const bytes = await renderFaceToPng(face)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(400)
      expect(parsed.height).toBe(600)
      expect(parsed.hasIend).toBe(true)
    })

    it('zero dimension card face (0x0): clamps to 1x1 to prevent IndexSizeError', async () => {
      const face = createSampleFace(0, 0)
      const bytes = await renderFaceToPng(face)

      expect(lastCanvasInstance!.width).toBe(1)
      expect(lastCanvasInstance!.height).toBe(1)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(1)
      expect(parsed.height).toBe(1)
    })

    it('negative dimension card face (-100 x -200): clamps to 1x1 without throwing', async () => {
      const face = createSampleFace(-100, -200)
      const bytes = await renderFaceToPng(face)

      expect(lastCanvasInstance!.width).toBe(1)
      expect(lastCanvasInstance!.height).toBe(1)

      const parsed = parsePngStructure(bytes)
      expect(parsed.validSignature).toBe(true)
      expect(parsed.width).toBe(1)
      expect(parsed.height).toBe(1)
    })
  })

  describe('Dimension 5: AbortSignal Cancellation Invariants', () => {
    it('aborts and throws AbortError when options.signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const face = createSampleFace(400, 600)
      const optionsWithSignal = {
        signal: controller.signal,
      } as RenderFaceToPngOptions & { signal?: AbortSignal }

      await expect(renderFaceToPng(face, optionsWithSignal)).rejects.toMatchObject({
        name: 'AbortError',
      })
      expect(lastCanvasInstance).toBeNull()
    })

    it('cancels mid-flight and stops rendering when signal aborts during preloadSceneAssets', async () => {
      const controller = new AbortController()

      const slowAssets: CanvasAssetStore = {
        getImage: vi.fn(() => null),
        loadImage: vi.fn(async () => null),
        preloadSceneAssets: vi.fn(async () => {
          controller.abort()
        }),
        onAssetLoaded: vi.fn(() => () => {}),
        clear: vi.fn(),
      }

      const face = createSampleFace(400, 600)
      const optionsWithSignal = {
        assets: slowAssets,
        signal: controller.signal,
      } as RenderFaceToPngOptions & { signal?: AbortSignal }

      await expect(renderFaceToPng(face, optionsWithSignal)).rejects.toMatchObject({
        name: 'AbortError',
      })
      expect(lastCanvasInstance).toBeNull()
    })
  })
})
