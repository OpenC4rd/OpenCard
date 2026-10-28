/** 平台判定：快捷键显示用 ⌘ 还是 Ctrl、窗口材质走云母还是毛玻璃，都只在这里判断一次。 */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent)
}
