/**
 * 小贴士调度：按设置里的间隔，从注册表里伪随机取一条发成全局即时消息。
 * 只负责计时与取词，怎么显示由 `notify` 决定。
 */
import { pickTipKey, type TipKey } from './tips'

interface TipSchedulerOptions {
  /** 把一条小贴士发出去（壳层接的是标题栏即时消息）。 */
  notify: (message: string) => void
  /** 按 key 取当前语言的文案；取不到就跳过这一条。 */
  translate: (key: string) => string
  /** 伪随机源，测试可替换。 */
  random?: () => number
}

interface TipScheduler {
  /** 应用当前设置：关掉就停，改了间隔就重新计时。 */
  configure(enabled: boolean, intervalMinutes: number): void
  stop(): void
}

export function createTipScheduler(options: TipSchedulerOptions): TipScheduler {
  let timer: ReturnType<typeof setInterval> | null = null
  let previous: TipKey | null = null

  function stop(): void {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  function send(): void {
    previous = pickTipKey(previous, options.random)
    const message = options.translate(`tips.${previous}`)
    if (message) options.notify(message)
  }

  function configure(enabled: boolean, intervalMinutes: number): void {
    stop()
    // 第一条也要等满一个间隔：刚启动就冒出来的建议更像打扰。
    if (enabled) timer = setInterval(send, intervalMinutes * 60_000)
  }

  return { configure, stop }
}
