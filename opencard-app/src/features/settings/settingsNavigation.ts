/**
 * 模块说明：
 * - 通用的设置跳转入口：任何地方拿到设置项的 key，就能让界面切到它所在的分类并把该行滚入视野。
 * 职责边界：
 * - 只做请求转发与"是否有人接管"的答复；分类解析、页面切换与滚动分别由 shell 与设置页完成。
 */
import type { AppSettingKey } from './model/appSettings'

type SettingsNavigator = (key: AppSettingKey) => void

let navigator: SettingsNavigator | null = null

/** 由持有 shell 页面状态的一方注册；传 null 注销（组件卸载时用）。 */
export function registerSettingsNavigator(next: SettingsNavigator | null): void {
  navigator = next
}

/** 跳到某个设置项；当前没有接管者时返回 false，调用方据此决定要不要退回别处。 */
export function openSetting(key: AppSettingKey): boolean {
  if (!navigator) return false
  navigator(key)
  return true
}
