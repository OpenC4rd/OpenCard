import { computed, shallowRef } from 'vue'

type ModalScope = { root: HTMLElement; onEscape?: () => void; blockShortcuts?: boolean }
const dialogs = shallowRef<readonly ModalScope[]>([])
export const activeDialogRoot = computed(() => dialogs.value[dialogs.value.length - 1]?.root ?? null)
const originalInert = new Map<HTMLElement, boolean>()
const overlayOwners = new WeakMap<Node, HTMLElement>()

/** 保留 Teleport 浮层与触发元素的归属关系。 */
export function registerOverlayOwner(root: HTMLElement, owner: HTMLElement): () => void {
  overlayOwners.set(root, owner)
  return () => { overlayOwners.delete(root) }
}

export function isWithinOverlayOwners(target: Node, owners: readonly HTMLElement[]): boolean {
  let current: Node | null = target
  while (current) {
    const node = current
    if (owners.some(owner => owner.contains(node))) return true
    current = overlayOwners.get(current) ?? current.parentNode
  }
  return false
}

function updateBackground(): void {
  const active = activeDialogRoot.value
  for (const element of document.body.children) {
    if (!(element instanceof HTMLElement)) continue
    if (!originalInert.has(element)) originalInert.set(element, element.inert)
    element.inert = active ? !element.contains(active) : originalInert.get(element)!
  }
  if (!active) {
    originalInert.forEach((inert, element) => { element.inert = inert })
    originalInert.clear()
  }
}

function focusTargets(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
  )].filter(element => !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true')
}

function focusInitial(root: HTMLElement): void {
  ;(root.querySelector<HTMLElement>('[autofocus]') ?? focusTargets(root)[0] ?? root).focus()
}

function handleKeydown(event: KeyboardEvent): void {
  const scope = dialogs.value[dialogs.value.length - 1]
  if (!scope || event.defaultPrevented) return
  const inside = event.target instanceof Node && scope.root.contains(event.target)
  if (event.key === 'Escape' && scope.onEscape) {
    event.preventDefault()
    event.stopImmediatePropagation()
    scope.onEscape()
  } else if (event.key === 'Tab') {
    const targets = focusTargets(scope.root)
    const first = targets[0] ?? scope.root, last = targets[targets.length - 1] ?? scope.root
    if (!inside || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
    event.stopPropagation()
  } else if (scope.blockShortcuts) {
    if (!inside || event.ctrlKey || event.metaKey || event.altKey) event.preventDefault()
    event.stopImmediatePropagation()
  }
}

function captureKeydown(event: KeyboardEvent): void {
  const scope = dialogs.value[dialogs.value.length - 1]
  if (scope && (scope.blockShortcuts || (event.key === 'Tab' && !scope.root.contains(event.target as Node)))) handleKeydown(event)
}

/** 弹窗与演示教程共用层级、背景锁定、键盘与焦点生命周期。 */
export function registerDialogRoot(root: HTMLElement, options: Omit<ModalScope, 'root'> = {}): () => void {
  const previousFocus = document.activeElement
  const scope = { root, ...options }
  root.setAttribute('data-oc-modal-root', '')
  root.tabIndex = -1
  dialogs.value = [...dialogs.value.filter(candidate => candidate.root.isConnected), scope]
  dialogs.value.forEach(({ root }, index) => { root.style.zIndex = `calc(var(--oc-z-modal) + ${index})` })
  updateBackground()
  root.addEventListener('keydown', handleKeydown)
  if (dialogs.value.length === 1) {
    window.addEventListener('keydown', captureKeydown, true)
  }
  focusInitial(root)
  queueMicrotask(() => {
    if (activeDialogRoot.value === root && !root.contains(document.activeElement)) focusInitial(root)
  })
  return () => {
    const wasActive = activeDialogRoot.value === root
    dialogs.value = dialogs.value.filter(candidate => candidate !== scope)
    root.removeEventListener('keydown', handleKeydown)
    root.removeAttribute('data-oc-modal-root')
    updateBackground()
    if (!dialogs.value.length) {
      window.removeEventListener('keydown', captureKeydown, true)
    }
    if (wasActive) {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus()
      else if (activeDialogRoot.value) focusInitial(activeDialogRoot.value)
    }
  }
}

export function resolveOverlayRoot(owner: Element | null): HTMLElement {
  return owner?.closest<HTMLElement>('[data-oc-modal-root]') ?? document.body
}

export function isOverlayRootActive(root: HTMLElement): boolean {
  return !activeDialogRoot.value || root === activeDialogRoot.value
}
