/** 自动记忆的长期应用状态；独立于用户设置，不属于可清理缓存。 */
import { isRecord } from '../../../shared/model/record'

export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 420
export const MAX_RECENT_PROJECTS = 8

export type ProjectWorkspaceSidebarState = {
  collapsedLists: string[]
  listWeights: Record<string, number>
}

/** Last package-builder input for one project; absent means "no build was made yet". */
export type ProjectPackageBuilderState = {
  name: string
  /** 给人看的名字；缺省是包名。 */
  title: string
  author: string
  version: string
  fontFamilyKeys: string[]
  fontCompositionKeys: string[]
  iconSeriesKeys: string[]
  customBlockKeys?: string[]
  imagePaths: string[]
  otherPaths?: string[]
}

export type ProjectWorkspaceState = {
  expandedDirectories: string[]
  sidebar?: ProjectWorkspaceSidebarState
  projectProfile?: {
    collapsedSections: string[]
  }
  packageBuilder?: ProjectPackageBuilderState
}
export interface AppState {
  layout: { sidebarWidth: number; sidebarCollapsed: boolean }
  projects: { lastParentPath: string; recent: string[]; workspaces: Record<string, ProjectWorkspaceState> }
}

export function createDefaultAppState(): AppState {
  return {
    layout: { sidebarWidth: 292, sidebarCollapsed: false },
    projects: { lastParentPath: '', recent: [], workspaces: {} },
  }
}

export function normalizeAppState(value: unknown): AppState {
  const record = isRecord(value) ? value : {}
  const layout = isRecord(record.layout) ? record.layout : {}
  const projects = isRecord(record.projects) ? record.projects : {}
  return {
    layout: {
      sidebarWidth: typeof layout.sidebarWidth === 'number' && Number.isFinite(layout.sidebarWidth)
        ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(layout.sidebarWidth))) : 292,
      sidebarCollapsed: layout.sidebarCollapsed === true,
    },
    projects: {
      lastParentPath: typeof projects.lastParentPath === 'string' ? projects.lastParentPath : '',
      recent: normalizeRecentProjects(projects.recent),
      workspaces: normalizeWorkspaceStates(projects.workspaces),
    },
  }
}

function normalizeRecentProjects(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const path = item.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    const identity = path.toLocaleLowerCase()
    if (!path || seen.has(identity)) continue
    seen.add(identity)
    result.push(path)
    if (result.length >= MAX_RECENT_PROJECTS) break
  }
  return result
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!text || /[\u0000-\u001F\u007F]/.test(text) || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' && !/[\u0000-\u001F\u007F]/.test(value) ? value : ''
}

function normalizePackageBuilderState(value: unknown): ProjectPackageBuilderState | null {
  if (!isRecord(value)) return null
  return {
    name: normalizeText(value.name),
    title: normalizeText(value.title),
    author: normalizeText(value.author),
    version: normalizeText(value.version),
    fontFamilyKeys: normalizeTextList(value.fontFamilyKeys),
    fontCompositionKeys: normalizeTextList(value.fontCompositionKeys),
    iconSeriesKeys: normalizeTextList(value.iconSeriesKeys),
    customBlockKeys: normalizeTextList(value.customBlockKeys),
    imagePaths: normalizeTextList(value.imagePaths),
    otherPaths: normalizeTextList(value.otherPaths),
  }
}

function normalizeWorkspaceStates(value: unknown): Record<string, ProjectWorkspaceState> {
  if (!isRecord(value)) return {}
  const result: Record<string, ProjectWorkspaceState> = {}
  for (const [pathInput, state] of Object.entries(value)) {
    if (!isRecord(state)) continue
    const path = pathInput.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (!path) continue
    const collapsedSections = isRecord(state.projectProfile) && Array.isArray(state.projectProfile.collapsedSections)
      ? [...new Set(state.projectProfile.collapsedSections.filter((item): item is string => (
          typeof item === 'string' && item.trim() !== ''
        )).map(item => item.trim()))]
      : []
    const sidebar = isRecord(state.sidebar)
      ? {
          collapsedLists: Array.isArray(state.sidebar.collapsedLists)
            ? [...new Set(state.sidebar.collapsedLists.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()))]
            : [],
          listWeights: isRecord(state.sidebar.listWeights)
            ? Object.fromEntries(Object.entries(state.sidebar.listWeights).flatMap(([key, weight]) => (
                typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? [[key, weight]] : []
              ))) as Record<string, number>
            : {},
        }
      : null
    const packageBuilder = normalizePackageBuilderState(state.packageBuilder)
    result[path] = {
      expandedDirectories: Array.isArray(state.expandedDirectories)
        ? state.expandedDirectories
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
        : [],
      ...(sidebar && (sidebar.collapsedLists.length > 0 || Object.keys(sidebar.listWeights).length > 0) ? { sidebar } : {}),
      ...(collapsedSections.length > 0 ? { projectProfile: { collapsedSections } } : {}),
      ...(packageBuilder ? { packageBuilder } : {}),
    }
  }
  return result
}

