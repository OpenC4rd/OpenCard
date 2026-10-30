/**
 * 模块说明：
 * - 探测最近打开项目的可用性与封面，供侧栏列表和欢迎页封面墙共用
 * 职责边界：
 * - 只读取项目目录 不修改任何状态 探测失败一律降级为“不可用”或“无封面”
 */
import { readonly, ref, watch, type Ref } from 'vue'
import type { ProjectCover } from '../../workspace/model/projectCover'
import { readProjectCover } from '../../workspace/services/projectCoverService'
import { fileSystemService, type FileSystemService } from '../../workspace/services/fileSystemService'

export const WELCOME_COVER_SOURCE_LIMIT = 8

type RecentProjectSnapshot = {
  readonly available: boolean
  readonly cover: ProjectCover | null
}

type RecentProjectFileSystem = Pick<FileSystemService, 'fileExists' | 'readFile'>

export function recentProjectKey(path: string): string {
  return `recent-project:${path}`
}

async function probeRecentProject(
  fs: RecentProjectFileSystem,
  path: string,
  withCover: boolean,
): Promise<[string, RecentProjectSnapshot]> {
  const rootPath = path.replace(/\\/g, '/').replace(/\/+$/, '')
  let available = false
  try {
    available = Boolean(rootPath) && await fs.fileExists(rootPath)
  } catch {
    available = false
  }
  if (!available) return [recentProjectKey(path), { available: false, cover: null }]
  if (!withCover) return [recentProjectKey(path), { available: true, cover: null }]
  return [recentProjectKey(path), {
    available: true,
    cover: await readProjectCover({ fs, projectRootPath: rootPath }),
  }]
}

export function useRecentProjectSnapshots(options: {
  recentProjects: Readonly<Ref<readonly string[]>>
  fs?: RecentProjectFileSystem
}) {
  const snapshots = ref<ReadonlyMap<string, RecentProjectSnapshot>>(new Map())
  let revision = 0

  async function refresh(): Promise<void> {
    const current = ++revision
    const paths = options.recentProjects.value
    const fs = options.fs ?? fileSystemService
    const entries = await Promise.all(paths.map((path, index) => (
      probeRecentProject(fs, path, index < WELCOME_COVER_SOURCE_LIMIT)
    )))
    if (current !== revision) return
    snapshots.value = new Map(entries)
  }

  watch(options.recentProjects, () => { void refresh() }, { immediate: true })

  return { snapshots: readonly(snapshots), refresh }
}
