/**
 * Owns Card Designer canvas-keyboard arbitration and transient Layer View modifiers.
 * Selection truth, document commands, plane models, and viewport geometry stay outside.
 */
import { nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { isEditableEventPath } from './useCdeShortcuts'

export type CdeLayerViewPort = {
  nudgeSelection: (deltaX: number, deltaY: number) => boolean
  runSelectionQuickAction: (actionKey: string) => boolean
  stepLayer: (direction: -1 | 1, wholeLayer?: boolean) => void
  focusLayerBlock: (blockId: string) => void
  getFocusedLayerBlockId: () => string | null
  cycleLayerByInitial: (initial: string, currentLayerOnly?: boolean) => boolean
}

type ZIndexIntent = {
  blockId: string
  delta: -1 | 1
  existingLayersOnly: boolean
}

type UseCdeLayerViewInteractionOptions = {
  rootElement: Readonly<Ref<HTMLElement | null>>
  layerViewAvailable: Readonly<Ref<boolean>>
  selectedBlockId: Readonly<Ref<string | null>>
  viewportPort: Readonly<Ref<CdeLayerViewPort | null>>
  selectBlock: (blockId: string) => void
  changeZIndex: (intent: ZIndexIntent) => boolean
}

export function useCdeLayerViewInteraction(options: UseCdeLayerViewInteractionOptions) {
  const layerViewActive = ref(false)
  const spaceHeld = ref(false)

  function handleRootKeydown(event: KeyboardEvent): void {
    const root = options.rootElement.value
    const isInsideRoot = event.target instanceof Node && root?.contains(event.target)
    const isRootTarget = event.target === root
    if (
      event.defaultPrevented
      || !isInsideRoot
      || (!isRootTarget && event.key !== 'Tab')
      || event.ctrlKey
      || event.metaKey
      || event.altKey
    ) return

    if (event.key === 'Tab') {
      // Tab is the one key the canvas claims from anywhere inside the editor, but an editable
      // control owns Tab. The shortcut router exempts editables the same way.
      if (isEditableEventPath(event.composedPath())) return
      if (options.layerViewAvailable.value) layerViewActive.value = true
      consume(event)
      return
    }

    if (event.code === 'Space' || event.key === ' ') {
      if (!spaceHeld.value) {
        const focusedBlockId = options.viewportPort.value?.getFocusedLayerBlockId()
        if (focusedBlockId) options.selectBlock(focusedBlockId)
      }
      spaceHeld.value = true
      consume(event)
      return
    }

    const verticalDirection = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : null
    if (spaceHeld.value && verticalDirection) {
      changeSelectedZIndex(verticalDirection === -1 ? 1 : -1, event.shiftKey)
      consume(event)
      return
    }

    if (layerViewActive.value) {
      if (verticalDirection) {
        options.viewportPort.value?.stepLayer(verticalDirection, event.shiftKey)
        consume(event)
        return
      }
      if (!event.isComposing && /^\p{L}$/u.test(event.key)) {
        options.viewportPort.value?.cycleLayerByInitial(event.key, event.shiftKey)
        consume(event)
      }
      return
    }

    if (!options.selectedBlockId.value) return
    const movement = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key]
    if (movement) {
      const step = event.shiftKey ? 10 : 1
      if (!options.viewportPort.value?.nudgeSelection(movement.x * step, movement.y * step)) return
      consume(event)
      return
    }

  }

  function handleCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const target = event.target
    if (
      target instanceof Element
      && target.closest('button, input, textarea, select, [contenteditable="true"]')
    ) return
    options.rootElement.value?.focus({ preventScroll: true })
  }

  function handleViewportBlockClick(blockId: string): void {
    options.selectBlock(blockId)
    void nextTick(() => options.rootElement.value?.focus({ preventScroll: true }))
  }

  function handleLayerZIndexStep(intent: { delta: -1 | 1; existingLayersOnly: boolean }): void {
    changeSelectedZIndex(intent.delta, intent.existingLayersOnly)
  }

  function changeSelectedZIndex(delta: -1 | 1, existingLayersOnly: boolean): boolean {
    const blockId = options.selectedBlockId.value
    if (!blockId || !options.changeZIndex({ blockId, delta, existingLayersOnly })) return false
    void nextTick(() => options.viewportPort.value?.focusLayerBlock(blockId))
    return true
  }

  function handleWindowKeyup(event: KeyboardEvent): void {
    if (event.key === 'Tab') layerViewActive.value = false
    if (event.code === 'Space' || event.key === ' ') spaceHeld.value = false
  }

  function handleWindowBlur(): void {
    spaceHeld.value = false
    layerViewActive.value = false
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !layerViewActive.value) return
    consume(event)
    options.rootElement.value?.focus({ preventScroll: true })
  }

  onMounted(() => {
    window.addEventListener('keydown', handleWindowKeydown, true)
    window.addEventListener('keyup', handleWindowKeyup)
    window.addEventListener('blur', handleWindowBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleWindowKeydown, true)
    window.removeEventListener('keyup', handleWindowKeyup)
    window.removeEventListener('blur', handleWindowBlur)
    handleWindowBlur()
  })

  return {
    handleCanvasPointerDown,
    handleLayerZIndexStep,
    handleRootKeydown,
    handleViewportBlockClick,
    layerViewActive,
    spaceHeld,
  }
}

function consume(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}
