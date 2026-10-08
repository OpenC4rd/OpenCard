import { computed, shallowRef } from 'vue'

const dialogs = shallowRef<readonly HTMLElement[]>([])
export const activeDialogRoot = computed(() => dialogs.value[dialogs.value.length - 1] ?? null)

/** Order whole modal scopes by opening time, including their teleported children. */
export function registerDialogRoot(root: HTMLElement): () => void {
  function update(roots: readonly HTMLElement[]): void {
    dialogs.value = roots
    roots.forEach((element, index) => {
      element.style.zIndex = `calc(var(--oc-z-modal) + ${index})`
      element.inert = element !== activeDialogRoot.value
    })
  }
  update([...dialogs.value.filter(element => element.isConnected && element !== root), root])
  return () => update(dialogs.value.filter(element => element !== root))
}

export function resolveOverlayRoot(owner: Element | null): HTMLElement {
  return owner?.closest<HTMLElement>('.oc-dialog__backdrop') ?? document.body
}

export function isOverlayRootActive(root: HTMLElement): boolean {
  return !activeDialogRoot.value || root === activeDialogRoot.value
}
