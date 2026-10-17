import { watchEffect } from 'vue'
import { isWithinOverlayOwners } from './overlayScope'

/** Dismiss an open control when interaction leaves it and its owned floating layers. */
export function useOverlayDismiss(isOpen: () => boolean, getOwner: () => HTMLElement | null, dismiss: () => void) {
  watchEffect(cleanup => {
    if (!isOpen()) return
    const dismissOutside = (event: Event) => {
      const owner = getOwner()
      if (!owner || !(event.target instanceof Node) || !isWithinOverlayOwners(event.target, [owner])) dismiss()
    }
    const events = ['pointerdown', 'click', 'focusin'] as const
    const dismissWindow = (event: Event) => { if (event.target === window) dismiss() }
    events.forEach(event => document.addEventListener(event, dismissOutside, true))
    window.addEventListener('blur', dismissWindow)
    cleanup(() => {
      events.forEach(event => document.removeEventListener(event, dismissOutside, true))
      window.removeEventListener('blur', dismissWindow)
    })
  }, { flush: 'sync' })
}
