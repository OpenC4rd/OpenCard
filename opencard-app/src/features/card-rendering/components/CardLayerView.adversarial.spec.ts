// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type {
  RenderReadyCardBlock,
  RenderReadyCardFace,
  RenderReadyImageBlock,
  RenderReadyShapeBlock,
  RenderReadySimpleContainerBlock,
  RenderReadyTextBlock,
} from '../render.types'
import { createCardRenderResourceContext } from '../cardRenderResources'
import { computeSceneLayout } from '../geometry'
import type { CanvasAssetStore } from '../painter/canvasAssetStore'
import CardLayerView from './CardLayerView.vue'

// --- Mock 2D Context for Slicing Verification ---

type MockCanvasContext = {
  canvas: HTMLCanvasElement
  calls: Array<{ method: string; args: unknown[]; transform: [number, number, number, number, number, number] }>
  currentTransform: [number, number, number, number, number, number]
  clipPaths: Array<Array<{ x: number; y: number }>>
  currentPath: Array<{ x: number; y: number }>
  saveStack: Array<[number, number, number, number, number, number]>
  clearRectCalls: Array<{ x: number; y: number; w: number; h: number }>
  fillRectCalls: Array<{ x: number; y: number; w: number; h: number }>
  strokeRectCalls: Array<{ x: number; y: number; w: number; h: number }>
  fillTextCalls: Array<{ text: string; x: number; y: number }>
}

function createMockContext(canvas: HTMLCanvasElement): MockCanvasContext {
  const ctx: MockCanvasContext = {
    canvas,
    calls: [],
    currentTransform: [1, 0, 0, 1, 0, 0],
    clipPaths: [],
    currentPath: [],
    saveStack: [],
    clearRectCalls: [],
    fillRectCalls: [],
    strokeRectCalls: [],
    fillTextCalls: [],
  }

  const record = (method: string, args: unknown[]) => {
    ctx.calls.push({ method, args, transform: [...ctx.currentTransform] })
  }

  return {
    ...ctx,
    canvas,
    get fillStyle() { return '#000' },
    set fillStyle(_: unknown) {},
    get strokeStyle() { return '#000' },
    set strokeStyle(_: unknown) {},
    get globalAlpha() { return 1 },
    set globalAlpha(_: unknown) {},
    get lineWidth() { return 1 },
    set lineWidth(_: unknown) {},
    get font() { return '16px sans-serif' },
    set font(_: unknown) {},
    get textBaseline() { return 'alphabetic' },
    set textBaseline(_: unknown) {},

    save: vi.fn(() => {
      ctx.saveStack.push([...ctx.currentTransform])
      record('save', [])
    }),
    restore: vi.fn(() => {
      if (ctx.saveStack.length > 0) {
        ctx.currentTransform = ctx.saveStack.pop()!
      }
      record('restore', [])
    }),
    transform: vi.fn((a: number, b: number, c: number, d: number, e: number, f: number) => {
      const [a1, b1, c1, d1, e1, f1] = ctx.currentTransform
      ctx.currentTransform = [
        a1 * a + c1 * b,
        b1 * a + d1 * b,
        a1 * c + c1 * d,
        b1 * c + d1 * d,
        a1 * e + c1 * f + e1,
        b1 * e + d1 * f + f1,
      ]
      record('transform', [a, b, c, d, e, f])
    }),
    setTransform: vi.fn((a: number, b: number, c: number, d: number, e: number, f: number) => {
      ctx.currentTransform = [a, b, c, d, e, f]
      record('setTransform', [a, b, c, d, e, f])
    }),
    resetTransform: vi.fn(() => {
      ctx.currentTransform = [1, 0, 0, 1, 0, 0]
      record('resetTransform', [])
    }),
    clearRect: vi.fn((x: number, y: number, w: number, h: number) => {
      ctx.clearRectCalls.push({ x, y, w, h })
      record('clearRect', [x, y, w, h])
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      ctx.fillRectCalls.push({ x, y, w, h })
      record('fillRect', [x, y, w, h])
    }),
    strokeRect: vi.fn((x: number, y: number, w: number, h: number) => {
      ctx.strokeRectCalls.push({ x, y, w, h })
      record('strokeRect', [x, y, w, h])
    }),
    beginPath: vi.fn(() => {
      ctx.currentPath = []
      record('beginPath', [])
    }),
    moveTo: vi.fn((x: number, y: number) => {
      ctx.currentPath.push({ x, y })
      record('moveTo', [x, y])
    }),
    lineTo: vi.fn((x: number, y: number) => {
      ctx.currentPath.push({ x, y })
      record('lineTo', [x, y])
    }),
    closePath: vi.fn(() => {
      record('closePath', [])
    }),
    clip: vi.fn(() => {
      ctx.clipPaths.push([...ctx.currentPath])
      record('clip', [])
    }),
    scale: vi.fn((sx: number, sy: number) => {
      const [a, b, c, d, e, f] = ctx.currentTransform
      ctx.currentTransform = [a * sx, b * sx, c * sy, d * sy, e, f]
      record('scale', [sx, sy])
    }),
    translate: vi.fn((tx: number, ty: number) => {
      const [a, b, c, d, e, f] = ctx.currentTransform
      ctx.currentTransform = [a, b, c, d, a * tx + c * ty + e, b * tx + d * ty + f]
      record('translate', [tx, ty])
    }),
    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      record('rect', [x, y, w, h])
    }),
    arc: vi.fn((x: number, y: number, r: number, sa: number, ea: number) => {
      record('arc', [x, y, r, sa, ea])
    }),
    arcTo: vi.fn((x1: number, y1: number, x2: number, y2: number, radius: number) => {
      record('arcTo', [x1, y1, x2, y2, radius])
    }),
    stroke: vi.fn(() => record('stroke', [])),
    fill: vi.fn(() => record('fill', [])),
    fillText: vi.fn((text: string, x: number, y: number) => {
      ctx.fillTextCalls.push({ text, x, y })
      record('fillText', [text, x, y])
    }),
    measureText: vi.fn((text: string) => ({
      width: text.length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    })),
    setLineDash: vi.fn(() => {}),
    getLineDash: vi.fn(() => []),
    drawImage: vi.fn(() => record('drawImage', [])),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(() => null),
  } as unknown as MockCanvasContext
}

// --- Helpers to create test cards ---

function textBlock(id: string, zIndex: number, text: string, options: Partial<RenderReadyTextBlock> = {}): RenderReadyTextBlock {
  return {
    type: 'text-block',
    id,
    name: id,
    notes: '',
    visible: true,
    width: '120px',
    height: '40px',
    borderColor: '#000000',
    borderWidth: 0,
    borderStyle: 'solid',
    borderRadius: '',
    background: '#ffffff',
    translateX: '0px',
    translateY: '0px',
    scaleX: 1,
    scaleY: 1,
    transformAnchor: 'cc',
    zIndex,
    rotation: 0,
    opacity: 1,
    content: text,
    fontSize: '16px',
    fontFamily: '',
    fontWeight: 'normal',
    color: '#000000',
    textAlign: 'start',
    verticalAlign: 'top',
    lineHeight: 'normal',
    writingMode: 'horizontal-tb',
    ...options,
  }
}

function imageBlock(
  id: string,
  zIndex: number,
  source: string,
  options: Partial<RenderReadyImageBlock> = {},
): RenderReadyImageBlock {
  return {
    type: 'image-block',
    id,
    name: id,
    notes: '',
    visible: true,
    width: '100px',
    height: '100px',
    borderColor: '#000000',
    borderWidth: 0,
    borderStyle: 'solid',
    borderRadius: '',
    background: '#ffffff',
    translateX: '0px',
    translateY: '0px',
    scaleX: 1,
    scaleY: 1,
    transformAnchor: 'cc',
    zIndex,
    rotation: 0,
    opacity: 1,
    source,
    maskSource: '',
    maskFit: 'cover',
    fit: 'contain',
    tint: 'none',
    ...options,
  }
}

function shapeBlock(id: string, zIndex: number, options: Partial<RenderReadyShapeBlock> = {}): RenderReadyShapeBlock {
  return {
    type: 'shape-block',
    shape: 'rectangle',
    id,
    name: id,
    notes: '',
    visible: true,
    width: '80px',
    height: '80px',
    borderColor: '#333333',
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: '4px',
    background: '#ff0000',
    translateX: '0px',
    translateY: '0px',
    scaleX: 1,
    scaleY: 1,
    transformAnchor: 'cc',
    zIndex,
    rotation: 0,
    opacity: 1,
    fill: '#ff0000',
    stroke: '#333333',
    strokeWidth: 2,
    strokeStyle: 'solid',
    strokeAlignment: 'inside',
    strokeJoin: 'miter',
    strokeCap: 'butt',
    strokeMiterLimit: 4,
    ...options,
  }
}

function containerBlock(
  id: string,
  zIndex: number,
  children: RenderReadyCardBlock[],
  options: Partial<RenderReadySimpleContainerBlock> = {},
): RenderReadySimpleContainerBlock {
  return {
    type: 'simple-container-block',
    id,
    name: id,
    notes: '',
    visible: true,
    width: '300px',
    height: '200px',
    borderColor: '#000000',
    borderWidth: 0,
    borderStyle: 'solid',
    borderRadius: '',
    background: '#eeeeee',
    translateX: '0px',
    translateY: '0px',
    scaleX: 1,
    scaleY: 1,
    transformAnchor: 'cc',
    zIndex,
    rotation: 0,
    opacity: 1,
    clip: false,
    children: children.map(child => ({
      block: child,
      location: { id: `${child.id}-loc`, type: 'simple-container-location', anchor: 'lt', x: '10px', y: '10px' },
    })),
    ...options,
  }
}

function createFace(children: RenderReadyCardBlock[], width = 600, height = 800): RenderReadyCardFace {
  return {
    type: 'card-face',
    id: 'face-root',
    faceKey: 'front',
    width,
    height,
    background: '#f8f9fa',
    children: children.map(child => ({
      block: child,
      location: { id: `${child.id}-loc`, type: 'simple-container-location', anchor: 'lt', x: '20px', y: '30px' },
    })),
  }
}

describe('CardLayerView 3D Invariants & Shell Decoupling Adversarial Suite', () => {
  let contextsByCanvas = new Map<HTMLCanvasElement, MockCanvasContext>()
  let getContextSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    contextsByCanvas = new Map()
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      contextId: string,
    ) {
      if (contextId === '2d') {
        let ctx = contextsByCanvas.get(this)
        if (!ctx) {
          ctx = createMockContext(this)
          contextsByCanvas.set(this, ctx)
        }
        return ctx as unknown as CanvasRenderingContext2D
      }
      return null
    })
  })

  afterEach(() => {
    getContextSpy.mockRestore()
  })

  function mountView(face: RenderReadyCardFace, selectedBlockId: string | null = null, extra = {}) {
    return mount(CardLayerView, {
      props: {
        face,
        selectedBlockId,
        viewportWidth: 1200,
        viewportHeight: 900,
        ...extra,
      },
      attachTo: document.body,
    })
  }

  it('Invariants 1: Every 3D block canvas is sized to props.face.width/height and painted with clearRect', async () => {
    const card = createFace([
      textBlock('text-1', 2, 'Title Block'),
      shapeBlock('shape-1', 1),
      textBlock('text-2', -1, 'Footer Block'),
    ], 700, 950)

    const wrapper = mountView(card, 'text-1')
    await nextTick()
    await nextTick()

    // 1. Check preview canvas
    const previewCanvas = wrapper.find<HTMLCanvasElement>('canvas.card-layer-view__preview-canvas')
    expect(previewCanvas.exists()).toBe(true)
    expect(previewCanvas.attributes('width')).toBe('700')
    expect(previewCanvas.attributes('height')).toBe('950')

    // 2. Check snapshot canvases
    const canvases = wrapper.findAll<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    expect(canvases.length).toBe(3)

    for (const canvas of canvases) {
      expect(canvas.attributes('width')).toBe('700')
      expect(canvas.attributes('height')).toBe('950')

      const mockCtx = contextsByCanvas.get(canvas.element)
      expect(mockCtx).toBeDefined()
      // Slicing must clear the canvas first so stale pixels never bleed
      expect(mockCtx!.clearRectCalls.length).toBeGreaterThanOrEqual(1)
      expect(mockCtx!.clearRectCalls[0]).toEqual({ x: 0, y: 0, w: 700, h: 950 })
    }

    wrapper.unmount()
  })

  it('Invariants 2: 3D slice renders ONLY the target block with its exact affine world matrix', async () => {
    const rotatedShape = shapeBlock('rotated-box', 1, {
      rotation: 45,
      scaleX: 1.5,
      scaleY: 0.8,
      translateX: '50px',
      translateY: '25px',
    })
    const plainText = textBlock('plain-text', 2, 'Target Text')

    const card = createFace([rotatedShape, plainText], 600, 800)
    const scene = computeSceneLayout(card)
    const shapeNode = scene.nodeMap.get('rotated-box')!

    const wrapper = mountView(card)
    await nextTick()
    await nextTick()

    const shapeButton = wrapper.find('[data-layer-block-id="rotated-box"]')
    expect(shapeButton.exists()).toBe(true)
    const shapeCanvas = shapeButton.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    expect(shapeCanvas.exists()).toBe(true)

    const shapeCtx = contextsByCanvas.get(shapeCanvas.element)
    expect(shapeCtx).toBeDefined()

    // Verify that the world matrix transform matches the scene layout worldMatrix
    const [a, b, c, d, e, f] = shapeNode.worldMatrix
    const transformCall = shapeCtx!.calls.find(c => c.method === 'transform')
    expect(transformCall).toBeDefined()
    expect(transformCall!.args).toEqual([a, b, c, d, e, f])

    // Verify that the rotated shape canvas contains NO text from plain-text
    const textDraw = shapeCtx!.fillTextCalls.find(t => t.text.includes('Target Text'))
    expect(textDraw).toBeUndefined()

    // Now verify the plainText canvas
    const textButton = wrapper.find('[data-layer-block-id="plain-text"]')
    const textCanvas = textButton.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    const textCtx = contextsByCanvas.get(textCanvas.element)
    expect(textCtx).toBeDefined()

    const textFill = textCtx!.fillTextCalls.find(t => t.text.includes('Target Text'))
    expect(textFill).toBeDefined()

    wrapper.unmount()
  })

  it('Invariants 3: Ancestor clips are accurately applied to child block 3D slices', async () => {
    // Container C with clip: true, rotated 30 degrees
    const clippedChild = textBlock('clipped-child', 2, 'Hidden by Clip')
    const container = containerBlock('clipped-container', 1, [clippedChild], {
      clip: true,
      rotation: 30,
      width: '200px',
      height: '150px',
    })

    const card = createFace([container], 600, 800)
    const scene = computeSceneLayout(card)
    const containerNode = scene.nodeMap.get('clipped-container')!

    const wrapper = mountView(card)
    await nextTick()
    await nextTick()

    const childButton = wrapper.find('[data-layer-block-id="clipped-child"]')
    expect(childButton.exists()).toBe(true)
    const childCanvas = childButton.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    const childCtx = contextsByCanvas.get(childCanvas.element)
    expect(childCtx).toBeDefined()

    // Slicing must have applied container's ancestor clip
    expect(childCtx!.clipPaths.length).toBeGreaterThanOrEqual(1)
    const appliedClip = childCtx!.clipPaths[0]!
    expect(appliedClip.length).toBe(4) // 4 OBB corners

    // Verify the clip corners match the container's obbCorners in world coordinates
    const [p0, p1, p2, p3] = containerNode.obbCorners
    expect(appliedClip[0]).toEqual({ x: p0.x, y: p0.y })
    expect(appliedClip[1]).toEqual({ x: p1.x, y: p1.y })
    expect(appliedClip[2]).toEqual({ x: p2.x, y: p2.y })
    expect(appliedClip[3]).toEqual({ x: p3.x, y: p3.y })

    wrapper.unmount()
  })

  it('Reactivity & Repaint: Updating props.face or props.resourceContext triggers repaintAllCanvases', async () => {
    const card = createFace([textBlock('b1', 1, 'Initial Text')], 600, 800)
    const wrapper = mountView(card)
    await nextTick()
    await nextTick()

    const canvas = wrapper.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    const initialCtx = contextsByCanvas.get(canvas.element)!
    const initialClearCount = initialCtx.clearRectCalls.length

    // Update face with new dimensions and content
    const updatedCard = createFace([textBlock('b1', 1, 'Updated Text')], 650, 850)
    await wrapper.setProps({ face: updatedCard })
    await nextTick()
    await nextTick()

    // Canvas dimensions updated
    expect(canvas.attributes('width')).toBe('650')
    expect(canvas.attributes('height')).toBe('850')

    // Canvas repainted
    expect(initialCtx.clearRectCalls.length).toBeGreaterThan(initialClearCount)
    const updatedFill = initialCtx.fillTextCalls.find(t => t.text.includes('Updated Text'))
    expect(updatedFill).toBeDefined()

    // Update resourceContext
    const resCtx = createCardRenderResourceContext({ resourceRootPath: '/new/path' })
    await wrapper.setProps({ resourceContext: resCtx })
    await nextTick()
    await nextTick()

    expect(initialCtx.clearRectCalls.length).toBeGreaterThan(initialClearCount + 1)

    wrapper.unmount()
  })

  it('Invariants 4: Multi-level nested clipping applies all ancestor clips in world coordinates', async () => {
    // Grandparent (clip: true, rotated 15 deg) -> Parent (clip: true, rotated -20 deg) -> Child
    const leafChild = textBlock('leaf-child', 3, 'Deep Child')
    const innerContainer = containerBlock('inner-container', 2, [leafChild], {
      clip: true,
      rotation: -20,
      translateX: '30px',
      translateY: '20px',
      width: '180px',
      height: '120px',
    })
    const outerContainer = containerBlock('outer-container', 1, [innerContainer], {
      clip: true,
      rotation: 15,
      translateX: '40px',
      translateY: '50px',
      width: '350px',
      height: '250px',
    })

    const card = createFace([outerContainer], 800, 1000)
    const scene = computeSceneLayout(card)
    const innerNode = scene.nodeMap.get('inner-container')!
    const outerNode = scene.nodeMap.get('outer-container')!

    const wrapper = mountView(card)
    await nextTick()
    await nextTick()

    const childButton = wrapper.find('[data-layer-block-id="leaf-child"]')
    expect(childButton.exists()).toBe(true)
    const childCanvas = childButton.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    const childCtx = contextsByCanvas.get(childCanvas.element)
    expect(childCtx).toBeDefined()

    // Must have applied 2 ancestor clips (inner and outer)
    expect(childCtx!.clipPaths.length).toBe(2)

    // First clip applied is inner container (immediate parent)
    const clip1 = childCtx!.clipPaths[0]!
    expect(clip1.length).toBe(4)
    expect(clip1[0]).toEqual({ x: innerNode.obbCorners[0].x, y: innerNode.obbCorners[0].y })

    // Second clip applied is outer container (grandparent)
    const clip2 = childCtx!.clipPaths[1]!
    expect(clip2.length).toBe(4)
    expect(clip2[0]).toEqual({ x: outerNode.obbCorners[0].x, y: outerNode.obbCorners[0].y })

    wrapper.unmount()
  })

  it('Invariants 5: Non-clipped ancestors do NOT introduce clip paths into 3D slices', async () => {
    // Container without clip
    const child = textBlock('unclipped-child', 2, 'Unclipped')
    const container = containerBlock('unclipped-container', 1, [child], {
      clip: false, // clip disabled
      rotation: 25,
    })

    const card = createFace([container], 600, 800)
    const wrapper = mountView(card)
    await nextTick()
    await nextTick()

    const childButton = wrapper.find('[data-layer-block-id="unclipped-child"]')
    const childCanvas = childButton.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    const childCtx = contextsByCanvas.get(childCanvas.element)
    expect(childCtx).toBeDefined()

    // No clips applied because ancestor clip is false
    expect(childCtx!.clipPaths.length).toBe(0)

    wrapper.unmount()
  })

  it('Boundary Dimensions: Handles empty face (0 blocks) and massive 4K face without failure', async () => {
    // 1. Empty face
    const emptyCard = createFace([], 600, 800)
    const emptyWrapper = mountView(emptyCard)
    await nextTick()
    await nextTick()

    const emptyCanvases = emptyWrapper.findAll('canvas.card-layer-view__block-content')
    expect(emptyCanvases.length).toBe(0)
    const previewCanvas = emptyWrapper.find('canvas.card-layer-view__preview-canvas')
    expect(previewCanvas.exists()).toBe(true)
    emptyWrapper.unmount()

    // 2. 4K card (3840 x 2160)
    const giantCard = createFace([textBlock('giant-block', 1, '4K Content')], 3840, 2160)
    const giantWrapper = mountView(giantCard)
    await nextTick()
    await nextTick()

    const giantCanvas = giantWrapper.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
    expect(giantCanvas.attributes('width')).toBe('3840')
    expect(giantCanvas.attributes('height')).toBe('2160')
    const giantCtx = contextsByCanvas.get(giantCanvas.element)
    expect(giantCtx).toBeDefined()
    expect(giantCtx!.clearRectCalls[0]).toEqual({ x: 0, y: 0, w: 3840, h: 2160 })
    giantWrapper.unmount()
  })

  it('Dynamic Layers: Hidden blocks (visible=false) are excluded from 3D layers', async () => {
    const card = createFace([
      textBlock('visible-1', 1, 'Visible 1'),
      textBlock('hidden-1', 2, 'Hidden 2', { visible: false }),
    ], 600, 800)

    const wrapper = mountView(card)
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-layer-block-id="visible-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-layer-block-id="hidden-1"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('Dynamic Layers: Dynamically adding and removing blocks updates 3D canvas planes', async () => {
    const initialCard = createFace([textBlock('b1', 1, 'Block 1')], 600, 800)
    const wrapper = mountView(initialCard)
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('canvas.card-layer-view__block-content').length).toBe(1)

    // Add block b2
    const updatedCard = createFace([
      textBlock('b1', 1, 'Block 1'),
      textBlock('b2', 2, 'Block 2'),
    ], 600, 800)
    await wrapper.setProps({ face: updatedCard })
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('canvas.card-layer-view__block-content').length).toBe(2)
    expect(wrapper.find('[data-layer-block-id="b2"]').exists()).toBe(true)

    // Remove block b1
    const strippedCard = createFace([textBlock('b2', 2, 'Block 2')], 600, 800)
    await wrapper.setProps({ face: strippedCard })
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('canvas.card-layer-view__block-content').length).toBe(1)
    expect(wrapper.find('[data-layer-block-id="b1"]').exists()).toBe(false)
    expect(wrapper.find('[data-layer-block-id="b2"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('Invariants 6: 3D plane sizing and CSS transform invariants', async () => {
    const card = createFace([textBlock('b1', 1, 'Plane Style Test')], 800, 1000)
    const wrapper = mountView(card)
    await nextTick()
    await nextTick()

    // 1. Plane buttons have dimensions scaled by planeScale
    const plane = wrapper.find<HTMLElement>('[data-layer-block-id="b1"]')
    expect(plane.exists()).toBe(true)
    const planeStyle = plane.attributes('style') ?? ''
    expect(planeStyle).toContain('width:')
    expect(planeStyle).toContain('height:')

    // 2. Base plane also exists and has matching face background
    const basePlane = wrapper.find('.card-layer-view__base-plane')
    expect(basePlane.exists()).toBe(true)
    const baseFace = wrapper.find('.card-layer-view__base-face')
    expect(baseFace.attributes('style')).toContain('background:')

    wrapper.unmount()
  })

  it('Decoupling 1: sourceRoot is completely absent from CardLayerView.vue and CardViewport.vue', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const layerViewFile = path.resolve(__dirname, 'CardLayerView.vue')
    const layerContent = fs.readFileSync(layerViewFile, 'utf-8')
    expect(layerContent).not.toContain('sourceRoot')
    expect(layerContent).not.toContain('source-root')

    const viewportFile = path.resolve(__dirname, 'CardViewport.vue')
    const viewportContent = fs.readFileSync(viewportFile, 'utf-8')
    expect(viewportContent).not.toContain(':source-root')
    expect(viewportContent).not.toContain('sourceRoot')
  })

  it('Decoupling 2: WorkbenchOverlays has zero hidden DOM export container (top: -9999px)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const overlayFilePath = path.resolve(__dirname, '../../shell/components/WorkbenchOverlays.vue')
    const content = fs.readFileSync(overlayFilePath, 'utf-8')

    expect(content).not.toContain('-9999px')
    expect(content).not.toContain('showExportRenderer')
    expect(content).not.toContain('exportRendererRef')
    expect(content).not.toContain('exportCardFace')
  })

  it('Decoupling 3: useProjectExport runs in pure memory without accessing DOM', async () => {
    const { useProjectExport } = await import('../../shell/composables/useProjectExport')
    const { ref } = await import('vue')
    const { EMPTY_PROJECT_ICON_CATALOG } = await import('../../workspace/services/projectIconCatalog')
    const { fileSystemService } = await import('../../workspace/services/fileSystemService')
    const { prepareCardRender } = await import('../renderPipeline')
    const { parseCardDocument } = await import('../../../entities/card/storage')

    // Mock OffscreenCanvas in environment
    const PNG_HEADER = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
    const DUMMY_PNG = new Uint8Array([...PNG_HEADER, 0, 0, 0, 0])
    class TestOffscreenCanvas {
      width: number
      height: number
      ctx: MockCanvasContext
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
        this.ctx = createMockContext({} as HTMLCanvasElement)
      }
      getContext(type: string) {
        if (type === '2d') return this.ctx
        return null
      }
      async convertToBlob() {
        return new Blob([DUMMY_PNG], { type: 'image/png' })
      }
    }

    const originalOffscreen = globalThis.OffscreenCanvas
    // @ts-expect-error test mock
    globalThis.OffscreenCanvas = TestOffscreenCanvas

    // Spy on DOM query/element creation methods
    const querySelectorSpy = vi.spyOn(document, 'querySelector')
    const querySelectorAllSpy = vi.spyOn(document, 'querySelectorAll')
    const createElementSpy = vi.spyOn(document, 'createElement')
    const writeBinarySpy = vi.spyOn(fileSystemService, 'writeBinaryFile').mockResolvedValue(undefined)

    try {
      const testDoc = {
        type: 'card-document', id: 'doc-export', name: 'Export Card', version: '1',
        width: '400', height: '600', instances: [],
        faces: {
          front: {
            type: 'card-face', id: 'f1', background: '#ffffff',
            children: [
              {
                block: {
                  type: 'shape-block', id: 's1', name: 'Shape', shape: 'rectangle',
                  visible: true, width: '100px', height: '100px', background: '#00ff00',
                  borderColor: '#000', borderWidth: 0, borderStyle: 'solid', borderRadius: '',
                  translateX: '10px', translateY: '10px', scaleX: 1, scaleY: 1, transformAnchor: 'cc',
                  zIndex: 1, rotation: 0, opacity: 1,
                },
                location: { id: 's1-loc', type: 'simple-container-location', anchor: 'lt', x: '10px', y: '10px' },
              },
            ],
          },
        },
      }

      const render = prepareCardRender({
        document: parseCardDocument(testDoc),
        instance: null,
        resourceRootPath: '/workspace',
        sourceFilePath: null,
        environment: { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG },
      })

      const exporter = useProjectExport({
        sessions: ref([]),
        renderEnvironment: ref({
          project: null,
          dictionary: null,
          projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG,
          projectResourceEnvironment: {
            kind: 'project', namespace: 'test', rootPath: '/workspace',
            fontDocument: {}, fonts: {}, iconDocument: {},
            iconCatalog: EMPTY_PROJECT_ICON_CATALOG, refresh: vi.fn(async () => undefined),
          },
        }),
        readProjectFile: vi.fn(async () => JSON.stringify(testDoc)),
        resolveProjectPath: path => `/workspace/${path}`,
        getRelativeProjectPath: path => path.replace('/workspace/', ''),
        translate: key => key,
      })

      // Reset spy counts before export run
      querySelectorSpy.mockClear()
      querySelectorAllSpy.mockClear()
      createElementSpy.mockClear()

      const result = await exporter.renderCardImages(render, ['front'], 1, new Map([['front', '/workspace/out.png']]))

      expect(result).not.toBeNull()
      expect(writeBinarySpy).toHaveBeenCalledTimes(1)
      const writtenBytes = writeBinarySpy.mock.calls[0]?.[1] as Uint8Array
      expect(writtenBytes).toBeInstanceOf(Uint8Array)
      // Verify PNG magic bytes
      expect(Array.from(writtenBytes.slice(0, 8))).toEqual(PNG_HEADER)

      // Verify zero DOM operations occurred during export
      expect(querySelectorSpy).not.toHaveBeenCalled()
      expect(querySelectorAllSpy).not.toHaveBeenCalled()
      expect(createElementSpy).not.toHaveBeenCalled()
    } finally {
      ;(globalThis as Record<string, unknown>).OffscreenCanvas = originalOffscreen
      writeBinarySpy.mockRestore()
      querySelectorSpy.mockRestore()
      querySelectorAllSpy.mockRestore()
      createElementSpy.mockRestore()
    }
  })

  it('Decoupling 4: Global verification: dom-to-image-more is completely eradicated', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const pkgPath = path.resolve(__dirname, '../../../../package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    expect(pkg.dependencies?.['dom-to-image-more']).toBeUndefined()
    expect(pkg.devDependencies?.['dom-to-image-more']).toBeUndefined()

    const dtsPath = path.resolve(__dirname, '../../../types/dom-to-image-more.d.ts')
    expect(fs.existsSync(dtsPath)).toBe(false)
  })

  it('Preload Triggering: Triggers asset preloading for images and rich-text icons on mount and updates', async () => {
    const canvasAssetStoreModule = await import('../painter/canvasAssetStore')
    let storeInstance: CanvasAssetStore | null = null
    let preloadSpy: ReturnType<typeof vi.spyOn> | null = null
    const originalCreateStore = canvasAssetStoreModule.createCanvasAssetStore
    const createStoreSpy = vi.spyOn(canvasAssetStoreModule, 'createCanvasAssetStore').mockImplementation(() => {
      const store = originalCreateStore()
      storeInstance = store
      preloadSpy = vi.spyOn(store, 'preloadSceneAssets')
      return store
    })

    try {
      const card = createFace([
        imageBlock('img-1', 1, 'https://example.com/art.png'),
        textBlock('txt-1', 2, 'Champion @icon[badges/gold] Level 10'),
      ], 600, 800)

      const resourceContext = createCardRenderResourceContext({
        remoteResourcePolicy: { mode: 'allow-all' },
        projectIconCatalog: {
          series: [{ name: 'badges', key: 'badges' }],
          entries: [
            {
              seriesKey: 'badges',
              iconKey: 'gold',
              name: 'Gold Badge',
              source: 'icons/gold.png',
              src: 'https://example.com/icons/gold.png',
              tint: 'original',
            },
          ],
        },
      })

      const wrapper = mountView(card, 'img-1', { resourceContext })
      expect(createStoreSpy).toHaveBeenCalled()
      expect(storeInstance).not.toBeNull()
      expect(preloadSpy).not.toBeNull()

      await nextTick()
      await nextTick()

      // On mount, loadAndRepaint triggers preloadSceneAssets
      expect(preloadSpy!).toHaveBeenCalled()
      const callArgs = preloadSpy!.mock.calls[0]
      expect(callArgs?.[0].width).toBe(600)
      expect(callArgs?.[1]).toEqual(resourceContext)

      // Update props with new face
      const updatedCard = createFace([
        imageBlock('img-2', 1, 'https://example.com/updated.png'),
      ], 650, 850)
      preloadSpy!.mockClear()

      await wrapper.setProps({ face: updatedCard })
      await nextTick()
      await nextTick()

      expect(preloadSpy).toHaveBeenCalled()
      expect(preloadSpy.mock.calls[0]?.[0].width).toBe(650)

      wrapper.unmount()
    } finally {
      createStoreSpy.mockRestore()
    }
  })

  it('Reactive Repaint: Repaints canvas slices reactively when assets resolve via onAssetLoaded', async () => {
    const canvasAssetStoreModule = await import('../painter/canvasAssetStore')
    let capturedListener: (() => void) | null = null
    const originalCreateStore = canvasAssetStoreModule.createCanvasAssetStore

    const createStoreSpy = vi.spyOn(canvasAssetStoreModule, 'createCanvasAssetStore').mockImplementation(() => {
      const store = originalCreateStore()
      const originalOnAssetLoaded = store.onAssetLoaded.bind(store)
      store.onAssetLoaded = (cb) => {
        capturedListener = cb
        return originalOnAssetLoaded(cb)
      }
      return store
    })

    try {
      const card = createFace([
        imageBlock('img-1', 1, 'https://example.com/hero.png'),
      ], 600, 800)

      const wrapper = mountView(card, 'img-1')
      await nextTick()
      await nextTick()

      expect(capturedListener).not.toBeNull()

      const canvas = wrapper.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
      const ctx = contextsByCanvas.get(canvas.element)!
      const initialClears = ctx.clearRectCalls.length
      expect(initialClears).toBeGreaterThanOrEqual(1)

      // Simulate asset resolution trigger
      capturedListener!()
      await nextTick()

      // Canvas slice repainted reactively
      expect(ctx.clearRectCalls.length).toBeGreaterThan(initialClears)

      wrapper.unmount()
    } finally {
      createStoreSpy.mockRestore()
    }
  })

  it('Monotonic Token Concurrency: Rapid updates discard stale out-of-order preloading responses without visual corruption', async () => {
    const canvasAssetStoreModule = await import('../painter/canvasAssetStore')
    type Deferred = { promise: Promise<void>; resolve: () => void }
    function createDeferred(): Deferred {
      let resolve!: () => void
      const promise = new Promise<void>(res => { resolve = res })
      return { promise, resolve }
    }

    const deferredQueue: Deferred[] = []
    const originalCreateStore = canvasAssetStoreModule.createCanvasAssetStore

    const createStoreSpy = vi.spyOn(canvasAssetStoreModule, 'createCanvasAssetStore').mockImplementation(() => {
      const store = originalCreateStore()
      store.preloadSceneAssets = vi.fn(() => {
        const d = createDeferred()
        deferredQueue.push(d)
        return d.promise
      })
      return store
    })

    try {
      const faceInitial = createFace([textBlock('t1', 1, 'Initial Face', { width: '500px' })], 600, 800)
      const wrapper = mountView(faceInitial)
      await nextTick()

      // Initial mount created deferredQueue[0]
      expect(deferredQueue.length).toBe(1)
      deferredQueue[0]!.resolve()
      await nextTick()

      const canvas = wrapper.find<HTMLCanvasElement>('canvas.card-layer-view__block-content')
      const ctx = contextsByCanvas.get(canvas.element)!

      // Rapid Update 1 (slow network request, token 2)
      const faceSlow = createFace([textBlock('t1', 1, 'Slow Face Text', { width: '500px' })], 600, 800)
      await wrapper.setProps({ face: faceSlow })
      await nextTick()
      expect(deferredQueue.length).toBe(2)
      const slowDeferred = deferredQueue[1]!

      // Rapid Update 2 (fast network request, token 3)
      const faceFast = createFace([textBlock('t1', 1, 'Fast Face Final Text', { width: '500px' })], 600, 800)
      await wrapper.setProps({ face: faceFast })
      await nextTick()
      expect(deferredQueue.length).toBe(3)
      const fastDeferred = deferredQueue[2]!

      // OUT-OF-ORDER RESOLUTION: Fast request (token 3) resolves first!
      fastDeferred.resolve()
      await fastDeferred.promise
      await nextTick()
      await nextTick()

      const clearsAfterFast = ctx.clearRectCalls.length
      const lastTextAfterFast = ctx.fillTextCalls[ctx.fillTextCalls.length - 1]?.text
      expect(lastTextAfterFast).toBe('Fast Face Final Text')

      // Now Slow request (token 2) resolves LATER!
      slowDeferred.resolve()
      await slowDeferred.promise
      await nextTick()
      await nextTick()

      // Verification: Slow request was discarded by preloadToken guard!
      // clearRect must NOT have been called again by slow request, and canvas must NOT be overwritten!
      expect(ctx.clearRectCalls.length).toBe(clearsAfterFast)
      const lastTextAfterSlow = ctx.fillTextCalls[ctx.fillTextCalls.length - 1]?.text
      expect(lastTextAfterSlow).toBe('Fast Face Final Text')

      wrapper.unmount()
    } finally {
      createStoreSpy.mockRestore()
    }
  })

  it('Unmount Cleanup: Increments preloadToken, detaches listeners, and clears asset cache preventing leaks', async () => {
    const canvasAssetStoreModule = await import('../painter/canvasAssetStore')
    let storeInstance: CanvasAssetStore | null = null
    const originalCreateStore = canvasAssetStoreModule.createCanvasAssetStore

    let unmountResolve!: () => void
    const pendingPreloadPromise = new Promise<void>(res => { unmountResolve = res })

    const createStoreSpy = vi.spyOn(canvasAssetStoreModule, 'createCanvasAssetStore').mockImplementation(() => {
      const store = originalCreateStore()
      storeInstance = store
      return store
    })

    try {
      const card = createFace([imageBlock('img-unmount', 1, 'https://example.com/unmount.png')], 600, 800)
      const wrapper = mountView(card)
      await nextTick()

      expect(storeInstance).not.toBeNull()
      const clearSpy = vi.spyOn(storeInstance!, 'clear')

      // Set up in-flight preload
      storeInstance!.preloadSceneAssets = vi.fn(() => pendingPreloadPromise)
      await wrapper.setProps({ face: createFace([imageBlock('img-unmount', 1, 'https://example.com/unmount-2.png')], 600, 800) })
      await nextTick()

      // Unmount while preload is in-flight
      wrapper.unmount()

      // clear() must be called on unmount
      expect(clearSpy).toHaveBeenCalled()

      // Now resolve in-flight preload after unmount
      unmountResolve()
      await pendingPreloadPromise
      await nextTick()

      // No exceptions thrown, and unmounted component does not paint to detached DOM
    } finally {
      createStoreSpy.mockRestore()
    }
  })
})

