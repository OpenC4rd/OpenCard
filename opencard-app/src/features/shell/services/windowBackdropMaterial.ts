/** 把窗口底层的系统材质（Windows 云母）应用到当前窗口。 */
import { isTauri } from '@tauri-apps/api/core'
import { Effect, getCurrentWindow } from '@tauri-apps/api/window'

export type WindowBackdropTheme = 'dark' | 'light'

/**
 * Windows 11 从 build 22000 起在 User-Agent Client Hints 中上报平台主版本 13，
 * Windows 10 及更早版本上报 10 或更小。
 * Mica Alt 本身要 build 22523（22H2）以上，更早的 Windows 11 会忽略设置。
 */
const MICA_MINIMUM_PLATFORM_MAJOR = 13

/**
 * 按当前主题选择变体：它决定系统材质的明暗，并与界面主题保持一致。
 * 这里用 Mica Alt（tabbed）：桌面色调比标准 Mica 更重，观感更明显。
 */
const MICA_EFFECT_BY_THEME = {
  dark: Effect.TabbedDark,
  light: Effect.TabbedLight,
} satisfies Record<WindowBackdropTheme, Effect>

interface UserAgentDataHints {
  getHighEntropyValues?: (hints: readonly string[]) => Promise<{ platformVersion?: string }>
}

export function isMicaPlatformVersion(platformVersion: string | undefined): boolean {
  const major = Number.parseInt(platformVersion ?? '', 10)
  return Number.isFinite(major) && major >= MICA_MINIMUM_PLATFORM_MAJOR
}

/**
 * 窗口效果接口在系统不支持时同样返回成功，因此云母是否可用只能由平台版本来判断。
 */
export async function isMicaBackdropAvailable(): Promise<boolean> {
  if (!isTauri() || typeof navigator === 'undefined') return false
  const userAgentData = (navigator as unknown as { userAgentData?: UserAgentDataHints }).userAgentData
  if (!userAgentData?.getHighEntropyValues) return false

  try {
    const hints = await userAgentData.getHighEntropyValues(['platformVersion'])
    return isMicaPlatformVersion(hints.platformVersion)
  } catch {
    return false
  }
}

/** 应用与当前主题一致的云母变体，返回窗口底层的材质是否已经生效。 */
export async function applyMicaBackdrop(theme: WindowBackdropTheme): Promise<boolean> {
  if (!isTauri()) return false

  try {
    await getCurrentWindow().setEffects({ effects: [MICA_EFFECT_BY_THEME[theme]] })
    return true
  } catch {
    return false
  }
}

export async function clearMicaBackdrop(): Promise<void> {
  if (!isTauri()) return
  await getCurrentWindow().clearEffects().catch(() => undefined)
}
