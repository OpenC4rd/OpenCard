/** CDE-local command table and global keyboard routing. */
import { onMounted, onUnmounted, type Ref } from 'vue'
import type { OcShortcutPart } from '../../components/standard/OcShortcut.vue'

export type CdeShortcutCommandKey =
  | 'selection.fill-parent'
  | 'selection.center'
  | 'selection.inset'
  | 'selection.outset'
  | 'selection.fill-cross-axis'
  | 'selection.center-cross-axis'
  | 'block.rename'
  | 'block.copy'
  | 'block.paste'
  | 'block.duplicate'
  | 'block.delete'
  | 'instance.rename'
  | 'instance.duplicate'
  | 'instance.delete'
  | 'viewport.fit'
  | 'viewport.zoom-in'
  | 'viewport.zoom-out'
  | 'view.toggle-snapping'
  | 'view.toggle-clip'
  | 'view.switch-face'
  | 'view.toggle-diff-mode'
  | 'view.diff-divider-left'
  | 'view.diff-divider-center'
  | 'view.diff-divider-right'

type CdeShortcutScope = 'canvas' | 'instance-tree' | 'structure-tree'

type CdeShortcutBinding = {
  key: string
  mod?: boolean
}

export type CdeShortcutCommand = {
  key: CdeShortcutCommandKey
  scopes?: readonly CdeShortcutScope[]
  canRun: () => boolean
  run: () => void | Promise<void>
}

type UseCdeShortcutsOptions = {
  rootElement: Readonly<Ref<HTMLElement | null>>
  commands: readonly CdeShortcutCommand[]
  /** True while another owner (Layer View) is arbitrating the canvas, so bare letters skip routing. */
  suspendLetterShortcuts: () => boolean
}

type ShortcutContext = {
  rootElement: Readonly<Ref<HTMLElement | null>>
  commands: readonly CdeShortcutCommand[]
  suspendLetterShortcuts: () => boolean
  scope: CdeShortcutScope
}

const commandBindings: Readonly<Record<CdeShortcutCommandKey, readonly CdeShortcutBinding[]>> = {
  'selection.fill-parent': [{ key: 'f' }],
  'selection.center': [{ key: 'c' }],
  'selection.inset': [{ key: 'i' }],
  'selection.outset': [{ key: 'o' }],
  'selection.fill-cross-axis': [{ key: 'f' }],
  'selection.center-cross-axis': [{ key: 'c' }],
  'block.rename': [{ key: 'F2' }],
  'block.copy': [{ key: 'c', mod: true }],
  'block.paste': [{ key: 'v', mod: true }],
  'block.duplicate': [{ key: 'd', mod: true }],
  'block.delete': [{ key: 'Delete' }, { key: 'Backspace' }],
  'instance.rename': [{ key: 'F2' }],
  'instance.duplicate': [{ key: 'd', mod: true }],
  'instance.delete': [{ key: 'Delete' }, { key: 'Backspace' }],
  'viewport.fit': [{ key: '0', mod: true }],
  'viewport.zoom-in': [{ key: '+', mod: true }, { key: '=', mod: true }],
  'viewport.zoom-out': [{ key: '-', mod: true }],
  'view.toggle-snapping': [{ key: 's' }],
  'view.toggle-clip': [{ key: 'x' }],
  'view.switch-face': [{ key: 'b' }],
  'view.toggle-diff-mode': [{ key: 'v' }],
  'view.diff-divider-left': [{ key: 'a' }],
  'view.diff-divider-center': [{ key: 's' }],
  'view.diff-divider-right': [{ key: 'd' }],
}

export function getCdeShortcutParts(key: CdeShortcutCommandKey): readonly OcShortcutPart[] {
  const binding = commandBindings[key][0]!
  const parts: OcShortcutPart[] = []
  if (binding.mod) parts.push(isMacPlatform() ? '⌘' : 'Ctrl')
  parts.push(displayKey(binding.key))
  return parts
}

export function formatCdeShortcutMarkup(key: CdeShortcutCommandKey): string {
  return getCdeShortcutParts(key)
    .map(part => typeof part === 'string' ? `[key]${part}[/key]` : '')
    .filter(Boolean)
    .join(' + ')
}

// The shell mounts one card designer at a time (a keyed editor slot), so routing state is module
// level: the newest mount owns it and the window listeners are registered once.
let activeContext: ShortcutContext | null = null
let listening = false

export function useCdeShortcuts(options: UseCdeShortcutsOptions): void {
  const context: ShortcutContext = {
    rootElement: options.rootElement,
    commands: options.commands,
    suspendLetterShortcuts: options.suspendLetterShortcuts,
    scope: 'canvas',
  }

  onMounted(() => {
    activeContext = context
    if (listening) return
    listening = true
    window.addEventListener('keydown', handleWindowKeydown, true)
    window.addEventListener('pointerdown', handleWindowPointerdown, true)
  })

  onUnmounted(() => {
    if (activeContext !== context) return
    activeContext = null
    listening = false
    window.removeEventListener('keydown', handleWindowKeydown, true)
    window.removeEventListener('pointerdown', handleWindowPointerdown, true)
  })
}

function handleWindowKeydown(event: KeyboardEvent): void {
  const context = activeContext
  if (context) dispatchShortcut(event, context)
}

function handleWindowPointerdown(event: PointerEvent): void {
  const context = activeContext
  if (!context) return
  const root = context.rootElement.value
  if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return
  context.scope = resolveScopeFromPath(event.composedPath()) ?? 'canvas'
}

function dispatchShortcut(event: KeyboardEvent, context: ShortcutContext): boolean {
  const root = context.rootElement.value
  if (!root || event.defaultPrevented || event.isComposing || event.altKey) return false
  if (event.target instanceof Node && !root.contains(event.target)) return false
  const path = event.composedPath()
  if (isEditableEventPath(path)) return false
  if (event.target instanceof Node && root.contains(event.target)) {
    context.scope = resolveScopeFromPath(path) ?? context.scope
  }

  for (const command of context.commands) {
    if (command.scopes && !command.scopes.includes(context.scope)) continue
    const bindings = commandBindings[command.key]
    if (!bindings.some(binding => matchesBinding(event, binding))) continue
    if (context.suspendLetterShortcuts() && bindings.some(binding => !binding.mod && binding.key.length === 1)) continue
    if (!command.canRun()) continue
    event.preventDefault()
    event.stopPropagation()
    command.run()
    return true
  }
  return false
}

function resolveScopeFromPath(path: readonly EventTarget[]): CdeShortcutScope | null {
  for (const target of path) {
    if (!(target instanceof HTMLElement)) continue
    const scope = target.dataset.cdeShortcutScope
    if (scope === 'canvas' || scope === 'instance-tree' || scope === 'structure-tree') return scope
  }
  return null
}

export function isEditableEventPath(path: readonly EventTarget[]): boolean {
  return path.some(target => target instanceof Element && (
    target.matches('input, textarea, select, [contenteditable="true"], .monaco-editor')
    || target.getAttribute('role') === 'textbox'
  ))
}

function matchesBinding(event: KeyboardEvent, binding: CdeShortcutBinding): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const expectedKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key
  const hasMod = event.ctrlKey || event.metaKey
  if (Boolean(binding.mod) !== hasMod) return false
  if (event.shiftKey && binding.key !== '+') return false
  return key === expectedKey
}

function displayKey(key: string): string {
  if (key === 'Delete') return 'Del'
  return key.length === 1 ? key.toUpperCase() : key
}

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent)
}
