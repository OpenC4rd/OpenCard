import type { Ref } from 'vue'

export function useShellKeyboardShortcuts(options: {
  saveKey: string
  undoKey: string
  redoKey: string
  hasVisibleEditor: Readonly<Ref<boolean>>
  isDiffMode: Readonly<Ref<boolean>>
  canUndo: Readonly<Ref<boolean>>
  canRedo: Readonly<Ref<boolean>>
  save: () => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
}) {
  function isNativeHistoryTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('input, textarea, [contenteditable="true"], .monaco-editor'))
  }
  async function handle(event: KeyboardEvent): Promise<void> {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented || event.isComposing) return
    const key = event.key.toLowerCase()
    if (!options.hasVisibleEditor.value) return
    if (key === options.saveKey) { event.preventDefault(); await options.save(); return }
    if (key === options.undoKey) {
      if (options.isDiffMode.value || isNativeHistoryTarget(event.target)) return
      if (!options.canUndo.value && !(event.shiftKey && options.canRedo.value)) return
      event.preventDefault()
      await (event.shiftKey ? options.redo() : options.undo())
      return
    }
    if (key === options.redoKey && !options.isDiffMode.value && !isNativeHistoryTarget(event.target) && options.canRedo.value) {
      event.preventDefault()
      await options.redo()
    }
  }
  return { handle }
}
