/**
 * 模块说明：
 * - 记录一次“打开项目”的分段耗时，供开发期定位加载慢在哪一步
 * 职责边界：
 * - 只测量与打印 不改变打开流程的任何行为与结果
 */

type ProjectOpenTimer = {
  /** 记录上一段到现在的耗时。 */
  step: (label: string) => void
  /** 记录已经量好的耗时（用于并行分支内部）。 */
  mark: (label: string, segmentMs: number) => void
  /** 打印全部记录，并返回总耗时；`suffix` 用于补充关键规模数据。 */
  done: (suffix?: string) => number
}

export function createProjectOpenTimer(project: string): ProjectOpenTimer {
  const startedAt = performance.now()
  let previousAt = startedAt
  const records: { label: string, segmentMs: number }[] = []

  function mark(label: string, segmentMs: number): void {
    records.push({ label, segmentMs })
  }

  function step(label: string): void {
    const now = performance.now()
    mark(label, now - previousAt)
    previousAt = now
  }

  function done(suffix?: string): number {
    const totalMs = performance.now() - startedAt
    const detail = records.map(record => `${record.label} ${record.segmentMs.toFixed(1)}ms`).join(' | ')
    console.info(
      `[OpenCard/ProjectOpen] ${project}: ${totalMs.toFixed(1)}ms total — ${detail}${suffix ? ` | ${suffix}` : ''}`,
    )
    return totalMs
  }

  return { step, mark, done }
}
