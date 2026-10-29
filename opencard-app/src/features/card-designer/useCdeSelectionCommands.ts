/**
 * Applies stable-id canvas geometry intents to the raw Card document.
 * Selection state, DOM measurement, keyboard routing, and viewport focus stay with the caller.
 */
import type { Ref } from 'vue'
import { getBlockProperty, setBlockProperty, type CardDocument } from '../../entities/card/model'
import type { ParentLookup } from '../../entities/card/tree'

export type CdeSelectionResizeIntent = {
  blockId: string
  width?: number
  height?: number
  x?: number
  y?: number
}

export type CdeSelectionMoveIntent = {
  blockId: string
  x: number
  y: number
}

export type CdeSelectionLayoutIntent =
  | { type: 'fill-parent'; blockId: string; width: boolean; height: boolean }
  | { type: 'fill-cross-axis'; blockId: string }
  | { type: 'center-cross-axis'; blockId: string }
  | {
      type: 'geometry.apply'
      operation: 'center' | 'inset' | 'outset'
      blockId: string
      width?: number
      height?: number
      x?: number
      y?: number
    }

export type CdeFaceDimensionIntent = {
  dimension: 'width' | 'height'
  value: number
  final: boolean
}

export type CdeSelectionZIndexIntent = {
  blockId: string
  delta: -1 | 1
  existingLayersOnly: boolean
}

type UseCdeSelectionCommandsOptions = {
  cardDoc: Readonly<Ref<CardDocument | null>>
  parentLookup: Readonly<Ref<ParentLookup>>
  availableLayerZIndices: Readonly<Ref<readonly number[]>>
  refreshDocumentState: () => void
  markDocumentChanged: (mode: 'typing' | 'action', target?: string, structural?: boolean) => void
  isResizeAxisLocked?: (blockId: string, axis: 'width' | 'height') => boolean
}

export function useCdeSelectionCommands(options: UseCdeSelectionCommandsOptions) {
  function resizeSelection(intent: CdeSelectionResizeIntent): boolean {
    const target = resolveTarget(intent.blockId)
    if (!target) return false

    const widthLocked = options.isResizeAxisLocked?.(intent.blockId, 'width') === true
    const heightLocked = options.isResizeAxisLocked?.(intent.blockId, 'height') === true
    let changed = false
    if (intent.width !== undefined && !widthLocked) {
      setBlockProperty(target.block, 'width', formatLength(intent.width))
      changed = true
    }
    if (intent.height !== undefined && !heightLocked) {
      setBlockProperty(target.block, 'height', formatLength(intent.height))
      changed = true
    }
    if (target.location.type === 'simple-container-location') {
      if (intent.x !== undefined && !widthLocked) {
        target.location.x = formatLength(intent.x)
        changed = true
      }
      if (intent.y !== undefined && !heightLocked) {
        target.location.y = formatLength(intent.y)
        changed = true
      }
    }
    if (!changed) return false
    commitAction()
    return true
  }

  function moveSelection(intent: CdeSelectionMoveIntent): boolean {
    const target = resolveTarget(intent.blockId)
    if (!target || target.location.type !== 'simple-container-location') return false

    target.location.x = formatLength(intent.x)
    target.location.y = formatLength(intent.y)
    commitAction()
    return true
  }

  function applySelectionLayout(intent: CdeSelectionLayoutIntent): boolean {
    const target = resolveTarget(intent.blockId)
    if (!target) return false

    if (intent.type === 'geometry.apply') {
      if (target.location.type !== 'simple-container-location') return false
      let changed = false
      if (intent.width !== undefined && !options.isResizeAxisLocked?.(intent.blockId, 'width')) {
        setBlockProperty(target.block, 'width', formatLength(intent.width))
        if (intent.x !== undefined) target.location.x = formatLength(intent.x)
        changed = true
      } else if (intent.operation === 'center' && intent.x !== undefined) {
        target.location.x = formatLength(intent.x)
        changed = true
      }
      if (intent.height !== undefined && !options.isResizeAxisLocked?.(intent.blockId, 'height')) {
        setBlockProperty(target.block, 'height', formatLength(intent.height))
        if (intent.y !== undefined) target.location.y = formatLength(intent.y)
        changed = true
      } else if (intent.operation === 'center' && intent.y !== undefined) {
        target.location.y = formatLength(intent.y)
        changed = true
      }
      if (!changed) return false
      commitAction()
      return true
    }

    if (intent.type === 'fill-parent') {
      if (target.location.type !== 'simple-container-location') return false
      let changed = false
      if (intent.width && !options.isResizeAxisLocked?.(intent.blockId, 'width')) {
        setBlockProperty(target.block, 'width', '100%')
        target.location.x = '0mm'
        changed = true
      }
      if (intent.height && !options.isResizeAxisLocked?.(intent.blockId, 'height')) {
        setBlockProperty(target.block, 'height', '100%')
        target.location.y = '0mm'
        changed = true
      }
      if (!changed) return false
    } else {
      if (
        target.location.type !== 'flow-container-location'
        || target.parent.type !== 'flow-container-block'
      ) return false

      if (intent.type === 'fill-cross-axis') {
        if (target.parent.direction === 'lr' || target.parent.direction === 'rl') {
          if (options.isResizeAxisLocked?.(intent.blockId, 'height')) return false
          setBlockProperty(target.block, 'height', '100%')
        } else {
          if (options.isResizeAxisLocked?.(intent.blockId, 'width')) return false
          setBlockProperty(target.block, 'width', '100%')
        }
        target.location.align = 'justify'
      } else {
        target.location.align = 'center'
      }
    }

    commitAction()
    return true
  }

  function changeFaceDimension(intent: CdeFaceDimensionIntent): boolean {
    const document = options.cardDoc.value
    if (!document) return false

    const nextValue = String(intent.value)
    if (document[intent.dimension] !== nextValue) {
      document[intent.dimension] = nextValue
      options.refreshDocumentState()
    }
    options.markDocumentChanged(
      intent.final ? 'action' : 'typing',
      `face-dimension:${intent.dimension}`,
    )
    return true
  }

  function changeSelectionZIndex(intent: CdeSelectionZIndexIntent): boolean {
    const target = resolveTarget(intent.blockId)
    if (!target) return false

    const parsed = Number(getBlockProperty<string>(target.block, 'zIndex') ?? '0')
    const current = Number.isFinite(parsed) ? parsed : 0
    let next = Math.round((current + intent.delta) * 100) / 100
    if (intent.existingLayersOnly) {
      const layers = [...options.availableLayerZIndices.value].sort((left, right) => left - right)
      const adjacent = intent.delta > 0
        ? layers.find(value => value > current)
        : layers.reverse().find(value => value < current)
      if (adjacent === undefined) return false
      next = adjacent
    }

    setBlockProperty(target.block, 'zIndex', String(Object.is(next, -0) ? 0 : next))
    commitAction()
    return true
  }

  function resolveTarget(blockId: string) {
    const parent = options.parentLookup.value.get(blockId)
    const entry = parent?.children.find(child => child.block.id === blockId)
    return parent && entry
      ? { block: entry.block, location: entry.location, parent }
      : null
  }

  function commitAction(): void {
    options.refreshDocumentState()
    options.markDocumentChanged('action')
  }

  return {
    applySelectionLayout,
    changeFaceDimension,
    changeSelectionZIndex,
    moveSelection,
    resizeSelection,
  }
}

function formatLength(value: number): string {
  const normalized = Math.round(value * 100) / 100
  return `${Object.is(normalized, -0) ? 0 : normalized}mm`
}
