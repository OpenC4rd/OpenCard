import { nextTick } from 'vue'

interface CardVisualReadinessTicket {
  settle(): void
}

interface CardVisualReadinessSlot {
  begin(): CardVisualReadinessTicket
  dispose(): void
}

export interface CardVisualReadinessRegistrar {
  createSlot(): CardVisualReadinessSlot
}

export type CardVisualReadinessState = {
  revision: number
  status: 'pending' | 'ready'
}

type FrameScheduler = (callback: FrameRequestCallback) => number
type FrameCanceller = (handle: number) => void

const VISUAL_RESOURCE_READINESS_TIMEOUT_MS = 5_000

export function createCardVisualReadiness(
  notify: (state: CardVisualReadinessState) => void,
  scheduleFrame: FrameScheduler = callback => requestAnimationFrame(callback),
  cancelFrame: FrameCanceller = handle => cancelAnimationFrame(handle),
): CardVisualReadinessRegistrar & { reset(): void; dispose(): void } {
  const pendingSlots = new Set<symbol>()
  let revision = 0
  let frameHandle: number | null = null
  let disposed = false

  function cancelReadyFrame(): void {
    if (frameHandle === null) return
    cancelFrame(frameHandle)
    frameHandle = null
  }

  function markPending(): number {
    cancelReadyFrame()
    revision += 1
    notify({ revision, status: 'pending' })
    return revision
  }

  function scheduleReady(expectedRevision: number): void {
    if (disposed || pendingSlots.size > 0 || expectedRevision !== revision) return
    void nextTick(() => {
      if (disposed || pendingSlots.size > 0 || expectedRevision !== revision) return
      cancelReadyFrame()
      frameHandle = scheduleFrame(() => {
        frameHandle = null
        if (disposed || pendingSlots.size > 0 || expectedRevision !== revision) return
        notify({ revision, status: 'ready' })
      })
    })
  }

  function createSlot(): CardVisualReadinessSlot {
    const slotId = Symbol('card-visual-resource')
    let ticketRevision = 0
    let active = false
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    let slotDisposed = false

    function clearTicketTimeout(): void {
      if (timeoutHandle === null) return
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }

    return {
      begin() {
        if (slotDisposed || disposed) return { settle: () => undefined }
        ticketRevision += 1
        const currentTicket = ticketRevision
        clearTicketTimeout()
        active = true
        pendingSlots.add(slotId)
        markPending()
        const settle = () => {
          if (slotDisposed || disposed || currentTicket !== ticketRevision || !active) return
          clearTicketTimeout()
          active = false
          pendingSlots.delete(slotId)
          scheduleReady(revision)
        }
        timeoutHandle = setTimeout(settle, VISUAL_RESOURCE_READINESS_TIMEOUT_MS)
        return { settle }
      },
      dispose() {
        if (slotDisposed) return
        slotDisposed = true
        ticketRevision += 1
        clearTicketTimeout()
        if (!active) return
        active = false
        pendingSlots.delete(slotId)
        const nextRevision = markPending()
        scheduleReady(nextRevision)
      },
    }
  }

  function reset(): void {
    if (disposed) return
    pendingSlots.clear()
    const nextRevision = markPending()
    scheduleReady(nextRevision)
  }

  function dispose(): void {
    disposed = true
    pendingSlots.clear()
    cancelReadyFrame()
  }

  return { createSlot, reset, dispose }
}
