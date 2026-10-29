import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createFlowContainerBlock,
  createSimpleContainerBlock,
  createTextBlock,
  getBlockProperty,
  setBlockProperty,
  type CardDocument,
} from '../../entities/card/model'
import { buildParentLookup } from '../../entities/card/tree'
import { useCdeSelectionCommands } from './useCdeSelectionCommands'

function createDocument(): CardDocument {
  const simpleChild = createTextBlock({
    id: 'simple-child',
    width: '20mm',
    height: '30mm',
    zIndex: '1.5',
  })
  const simple = createSimpleContainerBlock({
    id: 'simple',
    children: [{
      block: simpleChild,
      location: {
        id: 'simple-location',
        type: 'simple-container-location',
        anchor: 'rb',
        x: '1mm',
        y: '2mm',
      },
    }],
  })
  const flow = createFlowContainerBlock({
    id: 'flow',
    direction: 'lr',
    children: [{
      block: createTextBlock({ id: 'flow-child', width: '40mm', height: '50mm' }),
      location: {
        id: 'flow-location',
        type: 'flow-container-location',
        index: '0',
        align: 'start',
      },
    }],
  })
  return {
    type: 'card-document',

    id: 'document',
    name: 'Document',
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#fff',
        children: [
          {
            block: simple,
            location: { id: 'simple-root', type: 'simple-container-location', anchor: 'lt' },
          },
          {
            block: flow,
            location: { id: 'flow-root', type: 'simple-container-location', anchor: 'lt' },
          },
        ],
      },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [],
  }
}

function createHarness(isResizeAxisLocked?: (blockId: string, axis: 'width' | 'height') => boolean) {
  const document = createDocument()
  const cardDoc = ref<CardDocument | null>(document)
  const parentLookup = ref(buildParentLookup(document))
  const availableLayerZIndices = ref<readonly number[]>([-2, 1.5, 4])
  const refreshDocumentState = vi.fn()
  const markDocumentChanged = vi.fn()
  const commands = useCdeSelectionCommands({
    cardDoc,
    parentLookup,
    availableLayerZIndices,
    refreshDocumentState,
    markDocumentChanged,
    isResizeAxisLocked,
  })
  const simple = document.faces.front.children[0]!.block
  const flow = document.faces.front.children[1]!.block
  if (simple.type !== 'simple-container-block' || flow.type !== 'flow-container-block') {
    throw new Error('Invalid test document')
  }
  return {
    availableLayerZIndices,
    cardDoc,
    commands,
    document,
    flow,
    markDocumentChanged,
    refreshDocumentState,
    simple,
  }
}

describe('useCdeSelectionCommands', () => {
  it('rejects writes to locked resize axes', () => {
    const { commands, simple } = createHarness((_blockId, axis) => axis === 'width')
    const child = simple.children[0].block
    expect(commands.resizeSelection({ blockId: child.id, width: 99 })).toBe(false)
    expect(getBlockProperty<string>(child, 'width')).toBe('20mm')
    expect(commands.resizeSelection({ blockId: child.id, width: 99, height: 44 })).toBe(true)
    expect(getBlockProperty<string>(child, 'width')).toBe('20mm')
    expect(getBlockProperty<string>(child, 'height')).toBe('44mm')
    expect(commands.resizeSelection({ blockId: child.id, x: 99 })).toBe(false)
    expect(simple.children[0]!.location.x).toBe('1mm')
  })

  it('rejects fully locked resize intents without committing position changes', () => {
    const { commands, simple, markDocumentChanged } = createHarness(() => true)
    const child = simple.children[0]!

    expect(commands.resizeSelection({ blockId: child.block.id, width: 99, height: 44, x: 10, y: 12 })).toBe(false)
    expect(child.block).toMatchObject({ width: '20mm', height: '30mm' })
    expect(child.location).toMatchObject({ x: '1mm', y: '2mm' })
    expect(markDocumentChanged).not.toHaveBeenCalled()
  })

  it('resizes and moves a simple child with normalized CSS pixels', () => {
    const { commands, markDocumentChanged, refreshDocumentState, simple } = createHarness()

    expect(commands.resizeSelection({
      blockId: 'simple-child',
      width: 10.125,
      height: -0.001,
      x: -0,
      y: 2.345,
    })).toBe(true)
    expect(simple.children[0]!.block).toMatchObject({ width: '10.13mm', height: '0mm' })
    expect(simple.children[0]!.location).toMatchObject({ x: '0mm', y: '2.35mm' })

    expect(commands.moveSelection({ blockId: 'simple-child', x: 8.444, y: -0 })).toBe(true)
    expect(simple.children[0]!.location).toMatchObject({ x: '8.44mm', y: '0mm' })
    expect(refreshDocumentState).toHaveBeenCalledTimes(2)
    expect(markDocumentChanged).toHaveBeenNthCalledWith(1, 'action')
    expect(markDocumentChanged).toHaveBeenNthCalledWith(2, 'action')
  })

  it('resizes a flow child without creating absolute location coordinates', () => {
    const { commands, flow } = createHarness()

    expect(commands.resizeSelection({
      blockId: 'flow-child',
      width: 120,
      height: 60,
      x: 99,
      y: 88,
    })).toBe(true)
    expect(flow.children[0]!.block).toMatchObject({ width: '120mm', height: '60mm' })
    expect(flow.children[0]!.location).not.toHaveProperty('x')
    expect(commands.resizeSelection({ blockId: 'flow-child', height: 75 })).toBe(true)
    expect(flow.children[0]!.block).toMatchObject({ width: '120mm', height: '75mm' })
    expect(commands.resizeSelection({ blockId: 'flow-child' })).toBe(false)
    expect(commands.moveSelection({ blockId: 'flow-child', x: 1, y: 2 })).toBe(false)
  })

  it('applies simple layouts while preserving the anchor', () => {
    const { commands, simple } = createHarness()

    expect(commands.applySelectionLayout({
      type: 'geometry.apply',
      operation: 'inset',
      blockId: 'simple-child',
      width: 100.555,
      height: 80.444,
      x: 10,
      y: 12,
    })).toBe(true)
    expect(simple.children[0]!.block).toMatchObject({ width: '100.56mm', height: '80.44mm' })
    expect(simple.children[0]!.location).toMatchObject({ anchor: 'rb', x: '10mm', y: '12mm' })

    expect(commands.applySelectionLayout({
      type: 'fill-parent', blockId: 'simple-child', width: true, height: true,
    })).toBe(true)
    expect(simple.children[0]!.block).toMatchObject({ width: '100%', height: '100%' })
    expect(simple.children[0]!.location).toMatchObject({ anchor: 'rb', x: '0mm', y: '0mm' })
  })

  it('applies flow layouts only on the parent cross axis', () => {
    const { commands, flow } = createHarness()

    expect(commands.applySelectionLayout({ type: 'fill-cross-axis', blockId: 'flow-child' })).toBe(true)
    expect(flow.children[0]!.block).toMatchObject({ width: '40mm', height: '100%' })
    expect(flow.children[0]!.location.align).toBe('justify')

    flow.direction = 'tb'
    setBlockProperty(flow.children[0]!.block, 'width', '40mm')
    expect(commands.applySelectionLayout({ type: 'fill-cross-axis', blockId: 'flow-child' })).toBe(true)
    expect(getBlockProperty<string>(flow.children[0]!.block, 'width')).toBe('100%')
    expect(commands.applySelectionLayout({ type: 'center-cross-axis', blockId: 'flow-child' })).toBe(true)
    expect(flow.children[0]!.location.align).toBe('center')
  })

  it('filters layout writes on locked axes', () => {
    const { commands, simple } = createHarness((_blockId, axis) => axis === 'width')
    const child = simple.children[0]!

    expect(commands.applySelectionLayout({
      type: 'geometry.apply', operation: 'inset', blockId: child.block.id,
      width: 80, height: 30, x: 5, y: 6,
    })).toBe(true)
    expect(child.block).toMatchObject({ width: '20mm', height: '30mm' })
    expect(child.location).toMatchObject({ x: '1mm', y: '6mm' })
    expect(commands.applySelectionLayout({
      type: 'fill-parent', blockId: child.block.id, width: true, height: true,
    })).toBe(true)
    expect(child.block).toMatchObject({ width: '20mm', height: '100%' })
    expect(child.location).toMatchObject({ x: '1mm', y: '0mm' })
  })

  it('finishes face dimension typing even when the final value is unchanged', () => {
    const { commands, document, markDocumentChanged, refreshDocumentState } = createHarness()

    expect(commands.changeFaceDimension({ dimension: 'width', value: 600, final: false })).toBe(true)
    expect(document.width).toBe('600')
    expect(refreshDocumentState).toHaveBeenCalledOnce()
    expect(markDocumentChanged).toHaveBeenLastCalledWith('typing', 'face-dimension:width')

    expect(commands.changeFaceDimension({ dimension: 'width', value: 600, final: true })).toBe(true)
    expect(refreshDocumentState).toHaveBeenCalledOnce()
    expect(markDocumentChanged).toHaveBeenLastCalledWith('action', 'face-dimension:width')
  })

  it('changes zIndex numerically or moves to an adjacent existing layer', () => {
    const { commands, simple } = createHarness()
    const block = simple.children[0]!.block

    expect(commands.changeSelectionZIndex({
      blockId: 'simple-child',
      delta: 1,
      existingLayersOnly: false,
    })).toBe(true)
    expect(getBlockProperty<string>(block, 'zIndex')).toBe('2.5')

    setBlockProperty(block, 'zIndex', '1.5')
    expect(commands.changeSelectionZIndex({
      blockId: 'simple-child',
      delta: 1,
      existingLayersOnly: true,
    })).toBe(true)
    expect(getBlockProperty<string>(block, 'zIndex')).toBe('4')
    expect(commands.changeSelectionZIndex({
      blockId: 'simple-child',
      delta: -1,
      existingLayersOnly: true,
    })).toBe(true)
    expect(getBlockProperty<string>(block, 'zIndex')).toBe('1.5')
  })

  it('ignores stale ids and existing-layer boundaries without a transaction', () => {
    const {
      availableLayerZIndices,
      commands,
      markDocumentChanged,
      refreshDocumentState,
      simple,
    } = createHarness()

    expect(commands.moveSelection({ blockId: 'missing', x: 1, y: 2 })).toBe(false)
    setBlockProperty(simple.children[0]!.block, 'zIndex', '4')
    availableLayerZIndices.value = [-2, 1.5, 4]
    expect(commands.changeSelectionZIndex({
      blockId: 'simple-child',
      delta: 1,
      existingLayersOnly: true,
    })).toBe(false)
    expect(refreshDocumentState).not.toHaveBeenCalled()
    expect(markDocumentChanged).not.toHaveBeenCalled()
  })
})
