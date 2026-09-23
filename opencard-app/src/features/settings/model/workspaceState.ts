/** Shared per-project workspace cache access: one owner for path keys, value shape, and record projection. */
import { toRaw, type DeepReadonly } from 'vue'
import type { AppSettings, ProjectWorkspaceState } from './appSettings'

export type ProjectWorkspaceStates = AppSettings['projectCreation']['workspaceStates']
export type ProjectWorkspaceStatesSource = DeepReadonly<ProjectWorkspaceStates>
/** The store exposes settings as a deep-readonly projection; updates return the mutable record. */
export type ProjectWorkspaceStateRead = DeepReadonly<ProjectWorkspaceState>

export function findProjectWorkspaceState(
  states: ProjectWorkspaceStatesSource,
  path: string,
): ProjectWorkspaceStateRead | undefined {
  const identity = workspaceStateIdentity(path)
  if (!identity) return undefined
  return Object.entries(states)
    .find(([candidate]) => workspaceStateIdentity(candidate) === identity)?.[1]
}

/** Copies one cached state into a shape callers may patch before storing it back. */
export function cloneProjectWorkspaceState(state: ProjectWorkspaceStateRead | undefined): ProjectWorkspaceState {
  // 这份状态是纯数据（加载时已经归一化，未知字段不会留到这里），所以一次深拷贝就够。
  // 必须先 `toRaw`：读出来的是深只读投影，也就是 Vue 代理，而 `structuredClone` 吃代理会抛
  // "could not be cloned" —— 代理不是它认得的对象。断言只是因为 `toRaw` 的类型签名原样返回
  // 那个深只读类型，看不穿它交出来的是原始可变数据。
  const raw: unknown = toRaw(state ?? { expandedDirectories: [] })
  return structuredClone(raw) as ProjectWorkspaceState
}

/** Rebuilds the record for one project, preserving fields the caller does not touch. */
export function updateProjectWorkspaceState(
  states: ProjectWorkspaceStatesSource,
  path: string,
  update: (current: ProjectWorkspaceState) => ProjectWorkspaceState,
): ProjectWorkspaceStates {
  const key = workspaceStateKey(path)
  if (!key) return readProjectWorkspaceStates(states)
  return {
    ...readProjectWorkspaceStates(states),
    [key]: update(cloneProjectWorkspaceState(findProjectWorkspaceState(states, key))),
  }
}

function readProjectWorkspaceStates(states: ProjectWorkspaceStatesSource): ProjectWorkspaceStates {
  return Object.fromEntries(Object.entries(states).map(([path, state]) => [path, cloneProjectWorkspaceState(state)]))
}

function workspaceStateKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function workspaceStateIdentity(path: string): string {
  const key = workspaceStateKey(path)
  return /^[A-Za-z]:\//.test(key) ? key.toLocaleLowerCase() : key
}
