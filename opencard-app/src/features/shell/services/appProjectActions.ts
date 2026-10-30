import { onUnmounted } from 'vue'
import type { ProjectCloseDestination } from '../shellLocation'
import type { ApplicationCloseAction } from '../composables/useUnsavedSessionGuard'
import type { CloseOutcome } from '../composables/useWorkbenchCloseCoordinator'

/** Application entry points shared by pages, menus and external-open requests. */
interface AppProjectActions {
  openProject: () => Promise<boolean>
  openRecentProject: (path: string) => Promise<boolean>
  relocateRecentProject: (path: string) => Promise<string | null>
  newProject: () => Promise<void>
  openFile: () => Promise<void>
  exportTemplate: () => Promise<void>
  cancelDeferredOpen: () => void
  closeProject: (destination?: ProjectCloseDestination) => Promise<CloseOutcome>
  closeApplication: (action?: ApplicationCloseAction) => Promise<CloseOutcome>
}

let actions: AppProjectActions | undefined

export function initializeAppProjectActions(value: AppProjectActions): void {
  actions = value
  onUnmounted(() => { if (actions === value) actions = undefined })
}
export function useAppProjectActions(): AppProjectActions {
  if (!actions) throw new Error('Application project actions have not been initialized')
  return actions
}
