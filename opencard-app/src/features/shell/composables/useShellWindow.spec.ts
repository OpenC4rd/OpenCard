import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fullscreen: false,
  maximized: false,
  events: [] as string[],
  isFullscreen: vi.fn(),
  isMaximized: vi.fn(),
  setFullscreen: vi.fn(),
  toggleMaximize: vi.fn(),
  minimize: vi.fn(),
  destroy: vi.fn(),
  onResized: vi.fn(),
  onCloseRequested: vi.fn(),
  listenExternal: vi.fn(),
  unlistenResize: vi.fn(),
  unlistenClose: vi.fn(),
  unlistenExternal: vi.fn(),
  resizeHandler: null as ((event?: unknown) => void) | null,
  closeHandler: null as ((event: { preventDefault: () => void }) => void) | null,
  externalHandler: null as ((paths: readonly string[]) => Promise<void> | void) | null,
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isFullscreen: mocks.isFullscreen,
    isMaximized: mocks.isMaximized,
    setFullscreen: mocks.setFullscreen,
    toggleMaximize: mocks.toggleMaximize,
    minimize: mocks.minimize,
    destroy: mocks.destroy,
    onResized: mocks.onResized,
    onCloseRequested: mocks.onCloseRequested,
  }),
}))

vi.mock('../services/externalOpenService', () => ({
  listenForExternalOpenRequests: mocks.listenExternal,
}))

import { useShellWindow } from './useShellWindow'

function createShellWindow() {
  const requestApplicationClose = vi.fn(async () => undefined)
  const shellWindow = useShellWindow({
    requestApplicationClose,
    handleExternalOpenPaths: async () => undefined,
  })
  return { shellWindow, requestApplicationClose }
}

describe('useShellWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fullscreen = false
    mocks.maximized = false
    mocks.events = []
    mocks.resizeHandler = null
    mocks.closeHandler = null
    mocks.externalHandler = null
    mocks.isFullscreen.mockImplementation(async () => mocks.fullscreen)
    mocks.isMaximized.mockImplementation(async () => mocks.maximized)
    mocks.setFullscreen.mockImplementation(async (fullscreen: boolean) => {
      mocks.events.push(`fullscreen:${fullscreen}`)
      mocks.fullscreen = fullscreen
    })
    mocks.toggleMaximize.mockImplementation(async () => {
      mocks.events.push('toggle-maximize')
      mocks.maximized = !mocks.maximized
    })
    mocks.minimize.mockResolvedValue(undefined)
    mocks.destroy.mockResolvedValue(undefined)
    mocks.onResized.mockImplementation(async (handler: (event?: unknown) => void) => {
      mocks.resizeHandler = handler
      return mocks.unlistenResize
    })
    mocks.onCloseRequested.mockImplementation(async (
      handler: (event: { preventDefault: () => void }) => void,
    ) => {
      mocks.closeHandler = handler
      return mocks.unlistenClose
    })
    mocks.listenExternal.mockImplementation(async (
      handler: (paths: readonly string[]) => Promise<void> | void,
    ) => {
      mocks.externalHandler = handler
      return mocks.unlistenExternal
    })
  })

  it('restores a maximized window after entering and exiting fullscreen', async () => {
    mocks.maximized = true
    const { shellWindow } = createShellWindow()

    await shellWindow.toggleFullscreen()
    expect(mocks.events).toEqual(['toggle-maximize', 'fullscreen:true'])
    expect(mocks.maximized).toBe(false)

    await shellWindow.toggleFullscreen()
    expect(mocks.events).toEqual([
      'toggle-maximize',
      'fullscreen:true',
      'fullscreen:false',
      'toggle-maximize',
    ])
    expect(mocks.maximized).toBe(true)
    expect(shellWindow.isFullscreen.value).toBe(false)
    expect(shellWindow.isMaximized.value).toBe(true)
  })

  it('restores maximized state when entering fullscreen fails', async () => {
    mocks.maximized = true
    mocks.setFullscreen.mockRejectedValueOnce(new Error('fullscreen failed'))
    const { shellWindow } = createShellWindow()

    await expect(shellWindow.toggleFullscreen()).rejects.toThrow('fullscreen failed')

    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(2)
    expect(mocks.maximized).toBe(true)
    expect(shellWindow.isFullscreen.value).toBe(false)
    expect(shellWindow.isMaximized.value).toBe(true)
  })

  it('routes minimize, maximize, fullscreen guard, and destroy to the app window', async () => {
    const { shellWindow } = createShellWindow()

    await shellWindow.minimize()
    await shellWindow.toggleMaximize()
    expect(mocks.minimize).toHaveBeenCalledOnce()
    expect(mocks.toggleMaximize).toHaveBeenCalledOnce()

    mocks.fullscreen = true
    await shellWindow.toggleMaximize()
    expect(mocks.toggleMaximize).toHaveBeenCalledOnce()

    await shellWindow.destroy()
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('prevents native close synchronously and requests protected close once', async () => {
    const { shellWindow, requestApplicationClose } = createShellWindow()
    await shellWindow.start()
    const preventDefault = vi.fn()

    mocks.closeHandler?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(requestApplicationClose).toHaveBeenCalledOnce()
    shellWindow.dispose()
  })

  it('pairs all registrations with disposal and ignores callbacks after dispose', async () => {
    const { shellWindow, requestApplicationClose } = createShellWindow()
    await shellWindow.start()
    shellWindow.dispose()

    expect(mocks.unlistenResize).toHaveBeenCalledOnce()
    expect(mocks.unlistenClose).toHaveBeenCalledOnce()
    expect(mocks.unlistenExternal).toHaveBeenCalledOnce()

    mocks.closeHandler?.({ preventDefault: vi.fn() })
    await mocks.externalHandler?.(['D:/cards/main.ocdocument'])
    expect(requestApplicationClose).not.toHaveBeenCalled()
  })

  it('immediately releases a listener that finishes registering after dispose', async () => {
    let finishResizeRegistration: ((unlisten: () => void) => void) | undefined
    mocks.onResized.mockImplementationOnce(() => new Promise((resolve) => {
      finishResizeRegistration = resolve
    }))
    const { shellWindow } = createShellWindow()

    const starting = shellWindow.start()
    shellWindow.dispose()
    finishResizeRegistration?.(mocks.unlistenResize)
    await starting

    expect(mocks.unlistenResize).toHaveBeenCalledOnce()
  })

  it('tracks browser viewport width only while started', async () => {
    const { shellWindow } = createShellWindow()
    await shellWindow.start()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    window.dispatchEvent(new Event('resize'))
    expect(shellWindow.viewportWidth.value).toBe(820)

    shellWindow.dispose()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
    window.dispatchEvent(new Event('resize'))
    expect(shellWindow.viewportWidth.value).toBe(820)
  })
})
