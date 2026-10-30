import type { AppSettingKey, SettingsCategoryKey } from '../settings/model/appSettings'

/** 一级空间；流程页不属于空间。 */
export type SpaceKey = 'welcome' | 'workbench' | 'collaboration' | 'export' | 'market' | 'test' | 'settings'
export type PrimarySpaceKey = Exclude<SpaceKey, 'settings'>
type ShellFlowKey = 'create-project' | 'export-template' | 'about'
export type ShellPage = SpaceKey | ShellFlowKey
export type ProjectCloseDestination = 'current' | 'welcome' | 'create-project'

type ShellBaseLocation =
  | { space: 'welcome' }
  | { space: 'workbench' }
  | { space: 'collaboration' }
  | { space: 'export' }
  | { space: 'market' }
  | { space: 'test' }
  | {
      space: 'settings'
      categoryKey: SettingsCategoryKey
      returnSpace: PrimarySpaceKey
      /** 要带到前台的设置项 key；进入设置页后该行会滚入视野并高亮一次。 */
      focusKey?: AppSettingKey
    }

export interface ShellLocation {
  base: ShellBaseLocation
  flow?: { type: ShellFlowKey }
}

/** Returns the one page currently visible in the shell. Flows take precedence over their base space. */
export function resolveShellPage(location: ShellLocation): ShellPage {
  return location.flow?.type ?? location.base.space
}

export function createSpaceLocation(space: SpaceKey, returnSpace: PrimarySpaceKey = 'welcome'): ShellLocation {
  if (space === 'settings') {
    return { base: { space, categoryKey: 'general', returnSpace } }
  }
  return { base: { space } }
}

export function getPrimarySpace(location: ShellLocation): PrimarySpaceKey {
  return location.base.space === 'settings' ? location.base.returnSpace : location.base.space
}

export function getActiveSpace(location: ShellLocation): SpaceKey {
  return location.base.space
}

export function openSettings(
  location: ShellLocation,
  categoryKey: SettingsCategoryKey,
  focusKey?: AppSettingKey,
): ShellLocation {
  return {
    base: {
      space: 'settings',
      categoryKey,
      returnSpace: getPrimarySpace(location),
      ...(focusKey ? { focusKey } : {}),
    },
  }
}

export function openFlow(location: ShellLocation, type: ShellFlowKey): ShellLocation {
  return {
    base: location.base,
    flow: { type },
  }
}

export function leaveFlow(location: ShellLocation): ShellLocation {
  return { base: location.base }
}

export function showPrimarySpace(_location: ShellLocation, space: PrimarySpaceKey): ShellLocation {
  return { base: { space } }
}

export function showSpace(location: ShellLocation, space: SpaceKey): ShellLocation {
  return space === 'settings'
    ? createSpaceLocation('settings', getPrimarySpace(location))
    : showPrimarySpace(location, space)
}

export function resolveLocationAfterProjectClose(
  location: ShellLocation,
  destination: ProjectCloseDestination = 'current',
): ShellLocation {
  if (destination === 'welcome') return createSpaceLocation('welcome')
  if (destination === 'create-project') return openFlow(location, 'create-project')
  if (location.flow?.type === 'export-template') return createSpaceLocation('workbench')
  return location
}
