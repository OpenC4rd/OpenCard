type ScheduledTask = {
  run: () => Promise<void> | void
  timer: ReturnType<typeof setTimeout>
}

class TaskScheduler {
  private tasks = new Map<string, ScheduledTask>()
  private interactionUntil = 0
  private activeTransitions = 0
  private channel?: MessageChannel
  private continuations: Array<() => void> = []

  /** Latest input wins within a frame. Flush before committing a gesture; cancel on disposal. */
  frame<T>(apply: (value: T) => void) {
    let pending: { value: T } | undefined
    let handle: number | undefined
    const cancelFrame = () => {
      if (handle !== undefined) cancelAnimationFrame(handle)
      handle = undefined
    }
    const flush = () => {
      cancelFrame()
      const next = pending
      pending = undefined
      if (next) apply(next.value)
    }
    return {
      schedule(value: T) {
        pending = { value }
        handle ??= requestAnimationFrame(flush)
      },
      flush,
      cancel() { cancelFrame(); pending = undefined },
    }
  }

  observeInteractions(target: Window): () => void {
    const interact = (event: Event) => {
      if (event.type === 'pointermove' && !(event as PointerEvent).buttons) return
      if (event.type === 'transitionrun') this.activeTransitions++
      if (event.type === 'transitionend' || event.type === 'transitioncancel') this.activeTransitions = Math.max(0, this.activeTransitions - 1)
      this.interactionUntil = performance.now() + 120
    }
    const events = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'transitionrun', 'transitionend', 'transitioncancel']
    events.forEach(event => target.addEventListener(event, interact, { passive: true, capture: true }))
    return () => events.forEach(event => target.removeEventListener(event, interact, true))
  }

  async yieldToUi(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    await new Promise<void>(resolve => {
      if (typeof MessageChannel === 'undefined') { setTimeout(resolve, 0); return }
      if (!this.channel) {
        this.channel = new MessageChannel()
        this.channel.port1.onmessage = () => this.continuations.shift()?.()
      }
      this.continuations.push(resolve)
      this.channel.port2.postMessage(null)
    })
    signal?.throwIfAborted()
  }

  async forEach<T>(items: Iterable<T>, visit: (item: T) => void, signal?: AbortSignal): Promise<void> {
    function* steps() { for (const item of items) { visit(item); yield } }
    await this.runBatched(steps(), signal)
  }

  async runBatched(steps: Iterable<void | Promise<void>>, signal?: AbortSignal): Promise<void> {
    let started = performance.now()
    let count = 0
    const iterator = steps[Symbol.iterator]()
    while (true) {
      signal?.throwIfAborted()
      const step = iterator.next()
      if (step.done) return
      if (step.value) await step.value
      if (++count >= 256 || performance.now() - started >= (this.activeTransitions > 0 || started < this.interactionUntil ? 1 : 4)) {
        await this.yieldToUi(signal)
        started = performance.now()
        count = 0
      }
    }
  }

  schedule(key: string, delay: number, run: () => Promise<void> | void) {
    this.cancel(key)

    const timer = setTimeout(async () => {
      this.tasks.delete(key)
      await run()
    }, delay)

    this.tasks.set(key, { run, timer })
  }

  cancel(key: string) {
    const task = this.tasks.get(key)
    if (!task) return

    clearTimeout(task.timer)
    this.tasks.delete(key)
  }
}

export const taskScheduler = new TaskScheduler()
