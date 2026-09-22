/**
 * 模块说明：
 * - 更改列表上的三类写操作：只提交勾选项、放弃某几条改动、把一条路径写进 `.gitignore`。
 * 职责边界：
 * - 只做操作与结果，不弹提示、不刷新界面：失败抛错，由调用方决定提示文案与后续刷新。
 */
import { fileSystemService } from '../workspace/services/fileSystemService'
import type { GitCommandResult } from './git.types'
import { createCommit, discardPaths, stagePaths, unstageAll, unstagePaths } from './gitService'
import { appendGitignorePattern } from './gitignorePatterns'

/** 项目根的忽略文件；忽略规则写在里面，它自己也是受版本库跟踪的一条改动。 */
const GITIGNORE_FILE_NAME = '.gitignore'

function throwIfFailed(result: GitCommandResult<unknown>, fallback: string): void {
  if (!result.ok) throw new Error(result.error?.message || fallback)
}

function joinRoot(projectRoot: string, relativePath: string): string {
  return `${projectRoot.replace(/[\\/]+$/, '')}/${relativePath}`
}

/**
 * 只提交勾选项：索引先回到 HEAD（未勾选的东西因此不会被带上），再暂存勾选路径，最后提交。
 * 界面里没有手动暂存的入口，索引只是这一次提交的中间态。
 */
export async function commitSelectedPaths(options: {
  projectRoot: string
  paths: readonly string[]
  message: string
}): Promise<void> {
  throwIfFailed(await unstageAll(options.projectRoot), 'The index could not be reset')
  throwIfFailed(
    await stagePaths(options.projectRoot, { paths: [...options.paths] }),
    'The selected changes could not be staged',
  )
  throwIfFailed(
    await createCommit(options.projectRoot, { message: options.message }),
    'The commit could not be created',
  )
}

/** 放弃已跟踪的改动：索引与工作区一起回到 HEAD。 */
export async function discardTrackedPaths(projectRoot: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  throwIfFailed(
    await discardPaths(projectRoot, { paths: [...paths] }),
    'The changes could not be discarded',
  )
}

/**
 * 放弃新增的内容：先退出索引，再移入回收站。
 * 这些路径 HEAD 里没有可恢复的版本，删掉就没了，所以走回收站而不是直接删除。
 */
export async function discardUntrackedPaths(options: {
  projectRoot: string
  paths: readonly string[]
  moveToTrash: (relativePath: string) => Promise<void>
}): Promise<void> {
  // 未跟踪目录在更改列表里带尾部 `/`，交给 git 与回收站之前去掉它。
  const paths = options.paths.map(path => path.replace(/[\\/]+$/, '')).filter(Boolean)
  if (paths.length === 0) return
  throwIfFailed(
    await unstagePaths(options.projectRoot, { paths }),
    'The added paths could not be unstaged',
  )
  for (const path of paths) await options.moveToTrash(path)
}

/** 写一条忽略规则：`.gitignore` 不存在就建，已经有同一行就不动它。 */
export async function ignoreGitPath(options: { projectRoot: string; pattern: string }): Promise<void> {
  const ignorePath = joinRoot(options.projectRoot, GITIGNORE_FILE_NAME)
  const existing = await fileSystemService.fileExists(ignorePath)
    ? await fileSystemService.readFile(ignorePath)
    : ''
  const next = appendGitignorePattern(existing, options.pattern)
  if (next === existing) return
  await fileSystemService.writeFile(ignorePath, next)
}
