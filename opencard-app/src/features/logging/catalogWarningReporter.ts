/**
 * 模块说明：
 * - 把某个目录里无法使用的条目交给用户可见的两个通道：即时信息给摘要，输出给逐条明细。
 * 职责边界：
 * - 只负责上报，不改动目录数据；同一个问题只上报一次，避免每次加载都重复打扰。
 */
import { publishAppOutput } from './appOutput'
import { notifyWarning } from '../notifications/titlebarNotices'

type CatalogWarning = {
  path: string
  reason: string
}

const reportedWarningKeys = new Set<string>()

function entryNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

export function reportCatalogWarnings(options: {
  warnings: readonly CatalogWarning[]
  /** 即时信息里的汇总文案，接收 {count}。 */
  summaryKey: string
  /** 输出面板里的逐条文案，接收 {name}。 */
  itemKey: string
  translate: (key: string, params?: Record<string, unknown>) => string
}): void {
  const { warnings, summaryKey, itemKey, translate } = options
  const freshWarnings = warnings.filter((warning) => !reportedWarningKeys.has(`${warning.path}\u0000${warning.reason}`))
  if (freshWarnings.length === 0) return

  for (const warning of freshWarnings) {
    reportedWarningKeys.add(`${warning.path}\u0000${warning.reason}`)
    publishAppOutput({
      severity: 'warning',
      message: translate(itemKey, { name: entryNameFromPath(warning.path) }),
      detail: `${warning.path}: ${warning.reason}`,
    })
  }
  notifyWarning(translate(summaryKey, { count: freshWarnings.length }))
}
