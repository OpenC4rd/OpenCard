/**
 * 模块说明：
 * - 版本图表与文件时间线上的回撤操作：撤销一次提交、回退到某一版、恢复单个文件
 * 职责边界：
 * - 只做确认与调用 Git；节点代表哪次提交、哪个文件由时间线回答，刷新也交还给它
 */
import type { Ref } from 'vue'
import type { OcNodeActionEvent } from '../../../shared/ui/node/node.types'
import type { CommitSummary, GitCommandResult } from '../../version-control/git.types'
import {
  cleanupOperationState,
  createCommit,
  resetRepository,
  restorePathAtRevision,
  revertCommit,
} from '../../version-control/gitService'
import { VERSION_ACTION_KEYS } from '../../version-control/useProjectTimeline'

type Confirm = (request: { title: string, message: string, confirmLabel: string }) => Promise<boolean>

export function useVersionHistoryActions(options: {
  projectPath: Readonly<Ref<string>>
  /** 工作区里有没有尚未提交的改动；会被覆盖时要先说清楚。 */
  hasUncommittedChanges: () => boolean
  timeline: {
    resolveNodeTarget: (key: string) => { commit: CommitSummary, path?: string } | null
    refresh: () => Promise<void>
  }
  translate: (key: string, params?: Record<string, unknown>) => string
  requestConfirmation: Confirm
  notifySuccess: (message: string) => void
  notifyWarning: (message: string) => void
  notifyError: (message: string) => void
}) {
  const t = options.translate

  /** Runs one Git step; a refusal is reported and stops the action. */
  async function run<T>(step: Promise<GitCommandResult<T>>): Promise<T | null> {
    try {
      const result = await step
      if (result.ok) return result.value
      options.notifyError(result.error?.message ?? t('versionControl.history.failed'))
    } catch (error) {
      options.notifyError(error instanceof Error && error.message ? error.message : t('versionControl.history.failed'))
    }
    return null
  }

  /** Every action that rewrites files asks first, and says when unsaved work would be lost. */
  async function confirm(action: string, params: Record<string, unknown>, overwritesWork: boolean): Promise<boolean> {
    const warning = overwritesWork && options.hasUncommittedChanges() ? ` ${t('versionControl.history.uncommittedWarning')}` : ''
    return await options.requestConfirmation({
      title: t(`versionControl.history.${action}.title`),
      message: `${t(`versionControl.history.${action}.message`, params)}${warning}`,
      confirmLabel: t(`versionControl.history.${action}.confirm`),
    })
  }

  async function handleVersionAction(event: OcNodeActionEvent): Promise<boolean> {
    const root = options.projectPath.value
    const target = options.timeline.resolveNodeTarget(event.key)
    if (!root || !target) return false
    const { commit, path } = target
    const params = { name: commit.summary.trim() || commit.shortId, id: commit.shortId, path }
    let done: unknown = null

    switch (event.actionKey) {
      case VERSION_ACTION_KEYS.revert: {
        // 撤销：新建一次反向提交，原来的历史原样保留，随时可以再撤销回来。
        if (!await confirm('revert', params, false)) return true
        const state = await run(revertCommit(root, { revision: commit.id }))
        if (!state) break
        if (state.conflicts.length > 0) {
          options.notifyWarning(t('versionControl.history.revert.conflicts', { count: state.conflicts.length }))
          await options.timeline.refresh()
          return true
        }
        done = await run(createCommit(root, { message: t('versionControl.history.revert.commitMessage', params) }))
        await run(cleanupOperationState(root))
        break
      }
      case VERSION_ACTION_KEYS.reset:
        // 回退：之后的提交与未提交的改动都会丢掉，所以这是唯一需要强调代价的操作。
        if (!await confirm('reset', params, true)) return true
        done = await run(resetRepository(root, { revision: commit.id, mode: 'hard' }))
        break
      case VERSION_ACTION_KEYS.restoreFile:
        if (!path || !await confirm('restoreFile', params, true)) return true
        done = await run(restorePathAtRevision(root, { revision: commit.id, path }))
        break
      default:
        return false
    }
    if (done) options.notifySuccess(t(`versionControl.history.${actionName(event.actionKey)}.done`, params))
    await options.timeline.refresh()
    return true
  }

  return { handleVersionAction }
}

function actionName(actionKey: string): string {
  const entry = Object.entries(VERSION_ACTION_KEYS).find(([, key]) => key === actionKey)
  return entry?.[0] ?? 'revert'
}
