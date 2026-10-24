import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ imported: false }))

vi.mock('monaco-editor', () => {
  state.imported = true
  return { editor: {}, Uri: {}, KeyMod: {}, KeyCode: {} }
})

async function loadWarmUp() {
  vi.resetModules()
  return await import('./warmCodeEditor')
}

describe('warmCodeEditorOnIdle', () => {
  beforeEach(() => {
    state.imported = false
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits for an idle window and loads the editor module only once', async () => {
    const idleCallbacks: Array<() => void> = []
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idleCallbacks.push(callback)
      return idleCallbacks.length
    })
    const { warmCodeEditorOnIdle } = await loadWarmUp()

    warmCodeEditorOnIdle()
    warmCodeEditorOnIdle()

    expect(idleCallbacks).toHaveLength(1)
    expect(state.imported).toBe(false)

    idleCallbacks[0]?.()
    await vi.waitFor(() => expect(state.imported).toBe(true))
  })

  it('falls back to a timer where the runtime has no idle callback', async () => {
    vi.stubGlobal('requestIdleCallback', undefined)
    const scheduleSpy = vi.spyOn(globalThis, 'setTimeout')
    const { warmCodeEditorOnIdle } = await loadWarmUp()

    warmCodeEditorOnIdle()
    warmCodeEditorOnIdle()

    // 一次预热只排一次延迟加载：没有空闲回调的运行环境（例如 WKWebView）也不能漏掉它。
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
    scheduleSpy.mockRestore()
  })

  it('stays silent when the editor module cannot be loaded', async () => {
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      callback()
      return 1
    })
    vi.doMock('monaco-editor', () => { throw new Error('chunk unavailable') })
    const { warmCodeEditorOnIdle } = await loadWarmUp()

    expect(() => warmCodeEditorOnIdle()).not.toThrow()
    await Promise.resolve()
  })
})
