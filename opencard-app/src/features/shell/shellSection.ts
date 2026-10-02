import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type { SpaceKey } from './shellLocation'

export interface ShellSpaceDefinition {
  key: SpaceKey
  labelKey: string
  icon: IconToken
}

/**
 * 空间栏的静态身份表。
 * 侧栏和内容投影不放进这里，避免把运行时状态重新收集成一个总配置对象。
 */
export const shellSpaceDefinitions: Record<SpaceKey, ShellSpaceDefinition> = {
  welcome: { key: 'welcome', labelKey: 'app.shell.space.welcome', icon: 'nav.welcome' },
  workbench: { key: 'workbench', labelKey: 'app.shell.space.workbench', icon: 'nav.workbench' },
  market: { key: 'market', labelKey: 'app.shell.space.market', icon: 'nav.market' },
  test: { key: 'test', labelKey: 'app.shell.space.test', icon: 'nav.test' },
  settings: { key: 'settings', labelKey: 'app.shell.space.settings', icon: 'tool.settings' },
}

export const shellSpaceKeys = Object.keys(shellSpaceDefinitions) as SpaceKey[]
