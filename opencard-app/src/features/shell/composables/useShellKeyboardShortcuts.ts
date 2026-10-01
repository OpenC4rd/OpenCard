import type { Ref } from 'vue'

export function useShellKeyboardShortcuts(options: {
  fullscreenKey: string
  newOpenCardKey: string
  newProjectKey: string
  saveKey: string
  undoKey: string
  redoKey: string
  isDiffMode: Readonly<Ref<boolean>>
  canUndo: Readonly<Ref<boolean>>
  canRedo: Readonly<Ref<boolean>>
  toggleFullscreen: () => Promise<void>
  newOpenCard: () => void
  newProject: () => Promise<void>
  save: () => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  translate: (key: string) => string
  notifyError: (message: string) => void
}) {
  function isNativeHistoryTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('input, textarea, [contenteditable="true"], .monaco-editor'))
  }
  async function handle(event: KeyboardEvent): Promise<void> {
    if (event.key === options.fullscreenKey) {
      event.preventDefault()
      if (!event.repeat) {
        try { await options.toggleFullscreen() }
        catch { options.notifyError(options.translate('app.notifications.fullscreenFailed')) }
      }
      return
    }
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented || event.isComposing) return
    const key = event.key.toLowerCase()
    if (key === options.newOpenCardKey && event.shiftKey) { event.preventDefault(); options.newOpenCard(); return }
    if (key === options.newProjectKey) { event.preventDefault(); await options.newProject(); return }
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
