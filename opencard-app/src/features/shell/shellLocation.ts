import type { AppSettingKey, SettingsCategoryKey } from '../settings/model/appSettings'

/** 一级空间；流程页不属于空间。 */
export type SpaceKey = 'welcome' | 'workbench' | 'market' | 'test' | 'settings'
export type PrimarySpaceKey = Exclude<SpaceKey, 'settings'>
export type ShellFlowKey = 'create-project' | 'export-template' | 'about'
export type ProjectCloseDestination = 'current' | 'welcome' | 'create-project'

export type ShellBaseLocation =
  | { space: 'welcome' }
  | { space: 'workbench' }
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

export function getOtherPrimarySpace(location: ShellLocation): PrimarySpaceKey {
  return getPrimarySpace(location) === 'welcome' ? 'workbench' : 'welcome'
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
