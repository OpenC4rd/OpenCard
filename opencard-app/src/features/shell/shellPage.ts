import type { AppSettingKey, SettingsCategoryKey } from '../settings/model/appSettings'

export type PrimaryShellPage = 'welcome' | 'workbench'
export type ProjectCloseDestination = 'current' | 'welcome' | 'create-project'

export type ShellPage =
  | { type: 'welcome' }
  | { type: 'workbench' }
  | { type: 'create-project'; returnPage: PrimaryShellPage }
  | { type: 'export-template'; returnPage: PrimaryShellPage }
  | { type: 'about'; returnPage: PrimaryShellPage }
  | {
      type: 'settings'
      categoryKey: SettingsCategoryKey
      returnPage: PrimaryShellPage
      /** 要带到前台的设置项 key；进入设置页后该行会滚入视野并高亮一次。 */
      focusKey?: AppSettingKey
    }

export function getPrimaryShellPage(page: ShellPage): PrimaryShellPage {
  return page.type === 'welcome' || page.type === 'workbench'
    ? page.type
    : page.returnPage
}

export function getOtherPrimaryShellPage(page: ShellPage): PrimaryShellPage {
  return getPrimaryShellPage(page) === 'welcome' ? 'workbench' : 'welcome'
}

export function resolveShellPageAfterProjectClose(
  page: ShellPage,
  destination: ProjectCloseDestination = 'current',
): ShellPage {
  if (destination === 'welcome') return { type: 'welcome' }
  if (destination === 'create-project') {
    return { type: 'create-project', returnPage: getPrimaryShellPage(page) }
  }
  return page.type === 'export-template' ? { type: 'workbench' } : page
}
