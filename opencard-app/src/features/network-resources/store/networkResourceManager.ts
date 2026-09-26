import { shallowReactive } from 'vue'
import { normalizeNetworkResourceProjectPath, normalizeNetworkResourceUrl } from '../model/networkResourceCache'
import {
  networkResourceCacheService,
  type CachedNetworkResource,
  type NetworkResourceCacheProject,
  type NetworkResourceCacheService,
} from '../services/networkResourceCacheService'

export interface ProjectNetworkResources {
  /** 读这个 URL 的缓存；没有就顺手在后台取一次，命中前先返回 null。 */
  get(url: string): CachedNetworkResource | null
}

type ProjectRuntimeState = {
  cache: Promise<NetworkResourceCacheProject>
  resources: Map<string, CachedNetworkResource | null>
  loadedUrls: Set<string>
  requests: Map<string, Promise<CachedNetworkResource | null>>
}

type NetworkResourceManagerDependencies = {
  cacheService: Pick<NetworkResourceCacheService, 'forProject'>
}

const defaultDependencies: NetworkResourceManagerDependencies = {
  cacheService: networkResourceCacheService,
}

export class NetworkResourceManager {
  private readonly dependencies: NetworkResourceManagerDependencies
  private readonly projects = new Map<string, ProjectRuntimeState>()

  constructor(dependencies: Partial<NetworkResourceManagerDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  forProject(projectPath: string, canRequest: (url: string) => boolean): ProjectNetworkResources {
    const projectKey = normalizeNetworkResourceProjectPath(projectPath)
    if (!projectKey) throw new Error('Network resources require an absolute project path')
    let state = this.projects.get(projectKey)
    if (!state) {
      state = {
        cache: this.dependencies.cacheService.forProject(projectPath),
        resources: shallowReactive(new Map()),
        loadedUrls: new Set(),
        requests: new Map(),
      }
      this.projects.set(projectKey, state)
    }

    const allowedUrl = (source: string): string | null => {
      const url = normalizeNetworkResourceUrl(source)
      return url && canRequest(url) ? url : null
    }
    const request = (url: string): Promise<CachedNetworkResource | null> => {
      const existingRequest = state.requests.get(url)
      if (existingRequest) return existingRequest
      const pending = (async () => {
        try {
          const cache = await state.cache
          const cached = await cache.getCached(url)
          state.loadedUrls.add(url)
          if (cached) {
            state.resources.set(url, cached)
            return cached
          }
          const refreshed = await cache.refresh(url)
          state.loadedUrls.add(url)
          state.resources.set(url, refreshed)
          return refreshed
        } catch (error) {
          state.loadedUrls.add(url)
          if (!state.resources.has(url)) state.resources.set(url, null)
          throw error
        }
      })()
      state.requests.set(url, pending)
      void pending.finally(() => state.requests.delete(url)).catch(() => undefined)
      return pending
    }
    const loadCached = (url: string): void => {
      if (state.loadedUrls.has(url) || state.requests.has(url)) return
      void request(url).catch(() => undefined)
    }

    return {
      get: source => {
        const url = allowedUrl(source)
        if (!url) return null
        const resource = state.resources.get(url) ?? null
        if (!state.loadedUrls.has(url)) loadCached(url)
        return resource
      },
    }
  }
}

export const networkResourceManager = new NetworkResourceManager()
