import type { OcActionMenuEntry } from '../../../shared/ui/action/action.types'
import { actionChildren } from '../../../shared/ui/action/action.types'
import type { ShellTitleBarMenuGroup, ShellMenuContribution, ShellActionHandler } from '../shell.types'

type Translate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string

export interface ShellTitleBarMenuOptions {
  onAction: ShellActionHandler
  translate: Translate
  projectPath: string
  contributions?: Partial<Record<'file' | 'edit' | 'view' | 'help', ShellMenuContribution>>
  sidebarCollapsed: boolean
  bottomPanelExpanded: boolean
  windowFullscreen: boolean
  unreadFeedbackReplyCount: number
  checkingForUpdate: boolean
  downloadingUpdate: boolean
  updateDownloaded: boolean
  installingUpdate: boolean
  developerMode: boolean
  shortcuts: {
    newProject: readonly string[]
    fullscreen: readonly string[]
  }
}

function createDeveloperModeActions(options: ShellTitleBarMenuOptions): readonly OcActionMenuEntry[] {
  if (!import.meta.env.DEV) return []
  return [{
    key: 'toggle-developer-mode',
    title: options.developerMode
      ? options.translate('app.updater.disableDeveloperMode')
      : options.translate('app.updater.enableDeveloperMode'),
    icon: options.developerMode ? 'mdiCheck' : 'mdiCodeBraces',
  }]
}

export function createShellTitleBarMenus(options: ShellTitleBarMenuOptions): ShellTitleBarMenuGroup[] {
  const { translate: t } = options
  const developerModeActions = createDeveloperModeActions(options)

  const groups: ShellTitleBarMenuGroup[] = [
    {
      key: 'file',
      label: t('app.menu.file'),
      actions: [
        {
          key: 'new-project',
          title: options.projectPath ? t('app.menu.closeAndNewProject') : t('app.menu.newProject'),
          icon: 'mdiFolderPlusOutline',
          shortcut: options.shortcuts.newProject,
        },
        { type: 'divider', key: 'file-open-divider' },
        { key: 'open-project', title: t('sidebar.openProject'), icon: 'mdiFolderOpenOutline' },
        { key: 'open-file', title: t('app.menu.openFile'), icon: 'mdiFileMultipleOutline' },
        {
          key: 'close-project-and-welcome',
          title: t('app.menu.closeProjectFolder'),
          icon: 'mdiCompassOutline',
          disabled: !options.projectPath,
        },
        ...(options.contributions?.file?.actions ?? []),
      ],
    },
    {
      key: 'edit',
      label: t('app.menu.edit'),
      actions: [
        ...(options.contributions?.edit?.actions ?? []),
        { type: 'divider', key: 'edit-settings-divider' },
        { key: 'open-settings', title: t('settings.title'), icon: 'mdiCogOutline' },
      ],
    },
    {
      key: 'view',
      label: t('app.menu.view'),
      actions: [
        ...(options.contributions?.view?.actions ?? []),
        {
          key: 'toggle-sidebar',
          title: options.sidebarCollapsed ? t('app.shell.expandSidebar') : t('app.shell.collapseSidebar'),
          icon: options.sidebarCollapsed ? 'mdiArrowExpandRight' : 'mdiArrowCollapseLeft',
        },
        {
          key: 'toggle-bottom-panel',
          title: options.bottomPanelExpanded ? t('app.shell.collapseBottomPanel') : t('app.shell.expandBottomPanel'),
          icon: options.bottomPanelExpanded ? 'mdiChevronDown' : 'mdiChevronUp',
        },
        { type: 'divider', key: 'view-window-divider' },
        {
          key: 'toggle-fullscreen',
          title: options.windowFullscreen ? t('app.shell.exitFullscreen') : t('app.shell.enterFullscreen'),
          icon: options.windowFullscreen ? 'mdiFullscreenExit' : 'mdiFullscreen',
          shortcut: options.shortcuts.fullscreen,
        },
      ],
    },
    {
      key: 'help',
      label: t('app.menu.help'),
      badge: options.unreadFeedbackReplyCount,
      badgeLabel: options.unreadFeedbackReplyCount > 0
        ? t('app.feedback.unreadReplies', { count: options.unreadFeedbackReplyCount })
        : undefined,
      actions: [
        {
          key: 'check-for-updates',
          title: options.checkingForUpdate ? t('app.updater.checking') : t('app.updater.check'),
          icon: 'mdiRefresh',
          disabled: options.checkingForUpdate
            || options.downloadingUpdate
            || options.updateDownloaded
            || options.installingUpdate,
        },
        ...developerModeActions,
        ...(options.contributions?.help?.actions ?? []),
        { type: 'divider', key: 'help-feedback-divider' },
        { key: 'send-feedback', title: t('app.menu.sendFeedback'), icon: 'mdiPencilOutline' },
        {
          key: 'view-feedback',
          title: t('app.menu.viewFeedback'),
          icon: 'mdiFormatListBulletedSquare',
          badge: options.unreadFeedbackReplyCount,
          badgeLabel: options.unreadFeedbackReplyCount > 0
            ? t('app.feedback.unreadReplies', { count: options.unreadFeedbackReplyCount })
            : undefined,
        },
        { type: 'divider', key: 'help-about-divider' },
        { key: 'about-opencard', title: t('app.menu.aboutOpenCard'), icon: 'mdiHelpCircleOutline' },
      ],
    },
  ]
  return groups.map(group => {
    const contribution = options.contributions?.[group.key as 'file' | 'edit' | 'view' | 'help']
    const owners = new Map<string, ShellActionHandler>()
    function collect(entries: readonly OcActionMenuEntry[]): void {
      for (const entry of entries) {
        if (entry.type === 'divider') continue
        owners.set(entry.key, contribution!.onAction)
        if (entry.children) collect(actionChildren(entry))
      }
    }
    if (contribution) collect(contribution.actions)
    return { ...group, onAction: (key: string) => (owners.get(key) ?? options.onAction)(key) }
  })
}
