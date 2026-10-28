// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const macosUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
const windowsUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const windowApi = vi.hoisted(() => ({
  setEffects: vi.fn(async () => undefined),
  clearEffects: vi.fn(async () => undefined),
  setTheme: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowApi,
  Effect: { UnderWindowBackground: 'underWindowBackground', TabbedDark: 'tabbedDark', TabbedLight: 'tabbedLight' },
  EffectState: { FollowsWindowActiveState: 'followsWindowActiveState' },
}))

import { applyMicaBackdrop, clearMicaBackdrop } from './windowBackdropMaterial'

function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => userAgent })
}

describe('window backdrop material', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUserAgent(macosUserAgent)
  })

  it('uses the macOS system material and pins the window appearance to a forced theme', async () => {
    await applyMicaBackdrop('dark', false)

    expect(windowApi.setTheme).toHaveBeenCalledWith('dark')
    expect(windowApi.setEffects).toHaveBeenCalledWith({
      effects: ['underWindowBackground'],
      state: 'followsWindowActiveState',
    })
  })

  it('leaves the window appearance to the system when the theme follows macOS', async () => {
    await applyMicaBackdrop('light', true)

    expect(windowApi.setTheme).toHaveBeenCalledWith(null)
  })

  it('keeps the Windows Mica variant on Windows instead of a macOS material', async () => {
    setUserAgent(windowsUserAgent)

    await applyMicaBackdrop('light', false)

    expect(windowApi.setEffects).toHaveBeenCalledWith({ effects: ['tabbedLight'] })
    expect(windowApi.setTheme).not.toHaveBeenCalled()
  })

  it('releases the window appearance when the material is turned off', async () => {
    await clearMicaBackdrop()

    expect(windowApi.clearEffects).toHaveBeenCalled()
    expect(windowApi.setTheme).toHaveBeenCalledWith(null)
  })
})
