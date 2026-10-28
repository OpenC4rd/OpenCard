/** 把窗口底层的系统材质应用到当前窗口：Windows 用云母，macOS 用系统毛玻璃（NSVisualEffectView）。 */
import { isTauri } from '@tauri-apps/api/core'
import { Effect, EffectState, getCurrentWindow } from '@tauri-apps/api/window'
import { isMacPlatform } from '../../../shared/model/platform'

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

/**
 * macOS 的材质没有明暗变体，由 NSVisualEffectView 按窗口外观渲染，
 * 整窗一层的语义材质是 underWindowBackground，激活状态交给系统跟随。
 */
const MACOS_EFFECTS = {
  effects: [Effect.UnderWindowBackground],
  state: EffectState.FollowsWindowActiveState,
} satisfies { effects: Effect[]; state: EffectState }

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
  if (isMacPlatform()) return true
  const userAgentData = (navigator as unknown as { userAgentData?: UserAgentDataHints }).userAgentData
  if (!userAgentData?.getHighEntropyValues) return false

  try {
    const hints = await userAgentData.getHighEntropyValues(['platformVersion'])
    return isMicaPlatformVersion(hints.platformVersion)
  } catch {
    return false
  }
}

/**
 * 应用与当前主题一致的材质，返回窗口底层的材质是否已经生效。
 * macOS 的明暗跟着窗口外观走，所以界面强制明暗时把外观一并设过去；跟随系统时交还给系统，
 * 否则顶上去的外观会把之后监听的 prefers-color-scheme 一起钉死。
 */
export async function applyMicaBackdrop(
  theme: WindowBackdropTheme,
  followsSystemTheme: boolean,
): Promise<boolean> {
  if (!isTauri()) return false

  const window = getCurrentWindow()
  try {
    if (!isMacPlatform()) {
      await window.setEffects({ effects: [MICA_EFFECT_BY_THEME[theme]] })
      return true
    }
    await window.setTheme(followsSystemTheme ? null : theme)
    await window.setEffects(MACOS_EFFECTS)
    return true
  } catch {
    return false
  }
}

export async function clearMicaBackdrop(): Promise<void> {
  if (!isTauri()) return
  const window = getCurrentWindow()
  await window.clearEffects().catch(() => undefined)
  if (isMacPlatform()) await window.setTheme(null).catch(() => undefined)
}
