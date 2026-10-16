import { computed, shallowRef } from 'vue'

export interface TutorialStep {
  id: string
  /** 文案使用 i18n key，由展示组件按当前语言解析。 */
  targets: readonly { key: string; title: string; desc: string; interactive?: boolean }[]
  /** 无需指向界面区域的欢迎或说明消息。 */
  message?: { title: string; desc: string }
  nextLabel?: string
  exitLabel?: string
  /** 覆盖整组教程的只读设置；false 时仅目标区域可交互。 */
  blockInteraction?: boolean
  /** 省略时等待业务调用 completeStep；说明步骤可允许用户继续。 */
  manual?: boolean
}

export interface TutorialDefinition {
  title: string
  /** 演示教程只允许操作说明卡，背景保持只读。 */
  blockInteraction?: boolean
  steps: readonly TutorialStep[]
}

export interface TutorialSession {
  tutorialId: string
  run: number
  index: number
  definition: TutorialDefinition
  step: TutorialStep
}

/** 只管理流程；启动条件和业务完成条件由调用方判断。 */
export function createTutorialStore(
  definitions: Readonly<Record<string, TutorialDefinition>>,
  onCompleted: (id: string) => void = () => {},
) {
  const session = shallowRef<TutorialSession | null>(null)
  let run = 0

  function start(id: string): boolean {
    const definition = Object.prototype.hasOwnProperty.call(definitions, id) ? definitions[id] : undefined
    if (session.value || !definition?.steps.length) return false
    session.value = { tutorialId: id, run: ++run, index: 0, definition, step: definition.steps[0]! }
    return true
  }

  function completeStep(id: string, stepId: string, expectedRun = session.value?.run): boolean {
    const current = session.value
    if (!current || current.tutorialId !== id || current.step.id !== stepId || current.run !== expectedRun) return false
    const index = current.index + 1
    const step = current.definition.steps[index]
    session.value = step ? { ...current, index, step } : null
    if (!step) onCompleted(id)
    return true
  }

  function exit(): void { session.value = null }

  return { session: computed(() => session.value), start, completeStep, exit }
}
