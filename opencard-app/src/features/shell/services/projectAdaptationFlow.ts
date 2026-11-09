/**
 * 模块说明：
 * - 打开项目前把它带到当前结构：问一句、用 Git 存快照、跑适配脚本、再提交一次
 * 职责边界：
 * - 只编排；改写文件归适配脚本，快照与还原走现有的 Git 命令
 */
import { APP_VERSION } from '../../../shared/appVersion'
import { PROJECT_INTERNAL_DIRECTORY_NAME } from '../../workspace/model/projectStructure'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import {
  PROJECT_ADAPTATION_BASELINE,
  planProjectAdaptation,
  readRecordedProjectVersion,
  runProjectAdaptation,
} from '../../workspace/services/projectAdaptation'
import { PROJECT_ADAPTATION_SCRIPTS } from '../../workspace/services/projectAdaptationScripts'
import type { GitIdentity } from '../../version-control/git.types'
import { createCommit, initializeRepository, inspectRepository, resetRepository, stageAll } from '../../version-control/gitService'

export type ProjectAdaptationOutcome = 'not-a-project' | 'current' | 'declined' | 'adapted' | 'failed'

type ProjectAdaptationFlowOptions = {
  /** Offer to adapt even when the recorded version needs nothing, as the settings entry does. */
  force?: boolean
  identity: GitIdentity
  translate: (key: string, params?: Record<string, unknown>) => string
  confirm: (request: { title: string, message: string, confirmLabel: string }) => Promise<boolean>
  notifySuccess: (message: string) => void
  notifyWarning: (message: string) => void
  notifyError: (message: string) => void
}

function unwrap<T>(result: { ok: boolean, value: T | null, error: { message: string } | null }): T {
  if (!result.ok || result.value === null) throw new Error(result.error?.message ?? 'Git command failed')
  return result.value
}

/**
 * Commits everything as it is and returns the commit to go back to. A repository is created when the
 * project has none, so every adaptation can be undone the same way. A project with nothing new to commit
 * already sits on that commit.
 */
async function commitAll(root: string, identity: GitIdentity, message: string): Promise<string> {
  if (!unwrap(await inspectRepository(root)).initialized) unwrap(await initializeRepository(root, identity))
  unwrap(await stageAll(root))
  await createCommit(root, { message })
  const head = unwrap(await inspectRepository(root)).head
  if (!head) throw new Error('The project has no commit to return to')
  return head
}

export async function adaptProjectBeforeOpen(root: string, options: ProjectAdaptationFlowOptions): Promise<ProjectAdaptationOutcome> {
  const { translate: t } = options
  // A folder without OpenCard's own files has no old structure to carry forward.
  if (!await fileSystemService.fileExists(`${root}/${PROJECT_INTERNAL_DIRECTORY_NAME}`)) return 'not-a-project'
  const recorded = await readRecordedProjectVersion(fileSystemService, root)
  const plan = planProjectAdaptation(recorded)
  if (plan.status === 'current' && !options.force) return 'current'

  const params = { from: recorded ?? '', to: APP_VERSION, baseline: PROJECT_ADAPTATION_BASELINE }
  const reason = plan.status === 'pending' ? 'pending' : plan.status === 'unknown' ? plan.reason : 'current'
  const accepted = await options.confirm({
    title: t('projectAdaptation.title'),
    message: `${t(`projectAdaptation.reasons.${reason}`, params)} ${t('projectAdaptation.snapshotNote')}`,
    confirmLabel: t(plan.status === 'unknown' ? 'projectAdaptation.forceConfirm' : 'projectAdaptation.confirm'),
  })
  if (!accepted) return 'declined'

  let snapshot: string | null = null
  try {
    snapshot = await commitAll(root, options.identity, t('projectAdaptation.snapshotCommit', params))
    const notes = await runProjectAdaptation(fileSystemService, root, plan.status === 'current' ? PROJECT_ADAPTATION_SCRIPTS : plan.scripts)
    await commitAll(root, options.identity, t('projectAdaptation.adaptedCommit', params))
    options.notifySuccess(t('projectAdaptation.done', params))
    for (const note of notes) options.notifyWarning(note)
    return 'adapted'
  } catch (error) {
    // Whatever the scripts wrote goes back to the snapshot, so a failed adaptation leaves no half-state.
    if (snapshot) await resetRepository(root, { revision: snapshot, mode: 'hard' }).catch(() => undefined)
    options.notifyError(t('projectAdaptation.failed', { ...params, message: error instanceof Error ? error.message : String(error) }))
    return 'failed'
  }
}
