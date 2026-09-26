type ScheduledTask = {
  run: () => Promise<void> | void
  timer: ReturnType<typeof setTimeout>
}

class TaskScheduler {
  private tasks = new Map<string, ScheduledTask>()

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
