import { describe, expect, it } from 'vitest'
import {
  applyMicaBackdrop,
  clearMicaBackdrop,
  isMicaBackdropAvailable,
  isMicaPlatformVersion,
} from './windowBackdropMaterial'

describe('windowBackdropMaterial', () => {
  it('accepts the windows 11 platform versions', () => {
    expect(isMicaPlatformVersion('13.0.0')).toBe(true)
    expect(isMicaPlatformVersion('15.0.0')).toBe(true)
  })

  it('rejects windows 10 and unreported platform versions', () => {
    expect(isMicaPlatformVersion('10.0.0')).toBe(false)
    expect(isMicaPlatformVersion('1.0.0')).toBe(false)
    expect(isMicaPlatformVersion('')).toBe(false)
    expect(isMicaPlatformVersion(undefined)).toBe(false)
  })

  it('reports no mica support outside the tauri runtime', async () => {
    await expect(isMicaBackdropAvailable()).resolves.toBe(false)
    await expect(applyMicaBackdrop('dark')).resolves.toBe(false)
    await expect(clearMicaBackdrop()).resolves.toBeUndefined()
  })
})
