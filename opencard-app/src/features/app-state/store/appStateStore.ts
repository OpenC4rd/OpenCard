import { readonly, ref } from 'vue'
import { describeError } from '../../../shared/model/error'
import { APP_STATE_FILE_NAME, resolveAppStoragePath } from '../../../shared/storage/appStoragePaths'
import { createJsonPersistence, type JsonPersistence } from '../../../shared/storage/jsonPersistence'
import { createDefaultAppState, normalizeAppState, type AppState } from '../model/appState'

export function createAppStateStore(persistence: JsonPersistence = createJsonPersistence(
  () => resolveAppStoragePath(APP_STATE_FILE_NAME), 'app-state',
)) {
  const state = ref<AppState>(createDefaultAppState())
  const isReady = ref(false)
  const error = ref<string | null>(null)
  let initialization: Promise<void> | undefined
  let writes = Promise.resolve()

  function commit(candidate: AppState): void {
    const snapshot = normalizeAppState(candidate)
    state.value = snapshot
    writes = writes.catch(() => {}).then(async () => {
      try { await persistence.save(snapshot); error.value = null }
      catch (cause) { error.value = describeError(cause); throw cause }
    })
    void writes.catch(() => {})
  }

  async function initialize(): Promise<void> {
    initialization ??= (async () => {
      try { state.value = normalizeAppState(await persistence.load()) }
      catch (cause) { error.value = describeError(cause) }
      finally { isReady.value = true }
    })()
    await initialization
  }

  function updateLayout(patch: Partial<AppState['layout']>): void {
    commit({ ...state.value, layout: { ...state.value.layout, ...patch } })
  }
  function updateProjects(patch: Partial<AppState['projects']>): void {
    commit({ ...state.value, projects: { ...state.value.projects, ...patch } })
  }
  function rememberRecentProject(path: string): void {
    const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (!normalized) return
    updateProjects({ recent: [normalized, ...state.value.projects.recent.filter(item => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase())] })
  }
  function forgetRecentProject(path: string): void {
    const identity = path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
    const workspaces = { ...state.value.projects.workspaces }
    const key = Object.keys(workspaces).find(item => item.toLocaleLowerCase() === identity)
    if (key) delete workspaces[key]
    updateProjects({ recent: state.value.projects.recent.filter(item => item.toLocaleLowerCase() !== identity), workspaces })
  }
  async function flush(): Promise<void> { await writes; await persistence.flush() }

  return { state: readonly(state), isReady: readonly(isReady), error: readonly(error), initialize,
    updateLayout, updateProjects, rememberRecentProject, forgetRecentProject, flush }
}

export type AppStateStore = ReturnType<typeof createAppStateStore>
const appStateStore = createAppStateStore()
export function useAppStateStore() { return appStateStore }
