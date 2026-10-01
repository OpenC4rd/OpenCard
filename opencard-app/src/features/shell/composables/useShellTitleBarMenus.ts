import type { OcActionMenuEntry } from '../../../shared/ui/action/action.types'
import type { ShellTitleBarMenuGroup } from '../shell.types'

type Translate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string

export interface ShellTitleBarMenuOptions {
  translate: Translate
  projectPath: string
  buildResourcePackageActionKey: string
  autoSave: boolean
  activeSession: boolean
  isDiffMode: boolean
  sidebarCollapsed: boolean
  bottomPanelExpanded: boolean
  windowFullscreen: boolean
  canUndo: boolean
  canRedo: boolean
  unreadFeedbackReplyCount: number
  checkingForUpdate: boolean
  downloadingUpdate: boolean
  updateDownloaded: boolean
  installingUpdate: boolean
  developerMode: boolean
  debugHideCdeOverlays: boolean
  debugTransparentCdeViewport: boolean
  debugPassiveCdeViewport: boolean
  shortcuts: {
    newProject: readonly string[]
    save: readonly string[]
    undo: readonly string[]
    redo: readonly string[]
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
    icon: options.developerMode ? 'action.check' : 'format.code-braces',
  }]
}

function createDebugActions(options: ShellTitleBarMenuOptions): readonly OcActionMenuEntry[] {
  if (!import.meta.env.DEV) return []
  return [
    {
      key: 'toggle-debug-hide-cde-overlays',
      title: options.debugHideCdeOverlays
        ? options.translate('app.debug.showCdeOverlays')
        : options.translate('app.debug.hideCdeOverlays'),
      icon: options.debugHideCdeOverlays ? 'action.check' : 'format.code-braces',
    },
    {
      key: 'toggle-debug-transparent-cde-viewport',
      title: options.debugTransparentCdeViewport
        ? options.translate('app.debug.showCdeViewportBackground')
        : options.translate('app.debug.transparentCdeViewport'),
      icon: options.debugTransparentCdeViewport ? 'action.check' : 'format.code-braces',
    },
    {
      key: 'toggle-debug-passive-cde-viewport',
      title: options.debugPassiveCdeViewport
        ? options.translate('app.debug.interactiveCdeViewport')
        : options.translate('app.debug.passiveCdeViewport'),
      icon: options.debugPassiveCdeViewport ? 'action.check' : 'format.code-braces',
    },
  ]
}

export function createShellTitleBarMenus(options: ShellTitleBarMenuOptions): ShellTitleBarMenuGroup[] {
  const { translate: t } = options
  const developerModeActions = createDeveloperModeActions(options)
  const debugActions = createDebugActions(options)

  return [
    {
      key: 'file',
      label: t('app.menu.file'),
      actions: [
        {
          key: 'new-project',
          title: options.projectPath ? t('app.menu.closeAndNewProject') : t('app.menu.newProject'),
          icon: 'action.folder-plus',
          shortcut: options.shortcuts.newProject,
        },
        { type: 'divider', key: 'file-open-divider' },
        { key: 'open-project', title: t('sidebar.openProject'), icon: 'status.folder-open' },
        { key: 'open-file', title: t('app.menu.openFile'), icon: 'nav.files' },
        {
          key: 'close-project-and-welcome',
          title: t('app.menu.closeProjectFolder'),
          icon: 'nav.compass',
          disabled: !options.projectPath,
        },
        { type: 'divider', key: 'file-save-divider' },
        {
          key: 'save-active-editor',
          title: t('app.menu.save'),
          icon: 'action.save',
          shortcut: options.shortcuts.save,
          disabled: !options.activeSession,
        },
        {
          key: 'save-active-editor-as',
          title: t('app.menu.saveAs'),
          icon: 'action.save',
          disabled: !options.activeSession,
        },
        {
          key: 'save-all-editors',
          title: t('app.menu.saveAll'),
          icon: 'action.save',
          disabled: !options.activeSession,
        },
        {
          key: 'toggle-auto-save',
          title: options.autoSave ? t('app.menu.disableAutoSave') : t('app.menu.enableAutoSave'),
          icon: options.autoSave ? 'action.save-off' : 'action.save',
        },
        { type: 'divider', key: 'file-export-divider' },
        { key: options.buildResourcePackageActionKey, title: t('resourcePackage.buildTitle'), icon: 'file.package', disabled: !options.projectPath },
        { key: 'export-project-template', title: t('templateExport.menu'), icon: 'action.export', disabled: !options.projectPath },
        { key: 'export-card-documents', title: t('app.menu.exportCardDocuments'), icon: 'action.export', disabled: !options.projectPath },
      ],
    },
    {
      key: 'edit',
      label: t('app.menu.edit'),
      actions: [
        {
          key: 'undo-active-editor',
          title: t('app.menu.undo'),
          icon: 'action.undo',
          shortcut: options.shortcuts.undo,
          disabled: options.isDiffMode || !options.canUndo,
        },
        {
          key: 'redo-active-editor',
          title: t('app.menu.redo'),
          icon: 'action.redo',
          shortcut: options.shortcuts.redo,
          disabled: options.isDiffMode || !options.canRedo,
        },
        { type: 'divider', key: 'edit-settings-divider' },
        { key: 'open-settings', title: t('settings.title'), icon: 'tool.settings' },
      ],
    },
    {
      key: 'view',
      label: t('app.menu.view'),
      actions: [
        {
          key: 'toggle-sidebar',
          title: options.sidebarCollapsed ? t('app.shell.expandSidebar') : t('app.shell.collapseSidebar'),
          icon: options.sidebarCollapsed ? 'nav.sidebar-expand' : 'nav.sidebar-collapse',
        },
        {
          key: 'toggle-bottom-panel',
          title: options.bottomPanelExpanded ? t('app.shell.collapseBottomPanel') : t('app.shell.expandBottomPanel'),
          icon: options.bottomPanelExpanded ? 'nav.chevron-down' : 'nav.chevron-up',
        },
        { type: 'divider', key: 'view-window-divider' },
        {
          key: 'toggle-fullscreen',
          title: options.windowFullscreen ? t('app.shell.exitFullscreen') : t('app.shell.enterFullscreen'),
          icon: options.windowFullscreen ? 'window.fullscreen-exit' : 'window.fullscreen',
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
          icon: 'action.refresh',
          disabled: options.checkingForUpdate
            || options.downloadingUpdate
            || options.updateDownloaded
            || options.installingUpdate,
        },
        ...developerModeActions,
        ...debugActions,
        { type: 'divider', key: 'help-feedback-divider' },
        { key: 'send-feedback', title: t('app.menu.sendFeedback'), icon: 'action.edit' },
        {
          key: 'view-feedback',
          title: t('app.menu.viewFeedback'),
          icon: 'data.list-selection',
          badge: options.unreadFeedbackReplyCount,
          badgeLabel: options.unreadFeedbackReplyCount > 0
            ? t('app.feedback.unreadReplies', { count: options.unreadFeedbackReplyCount })
            : undefined,
        },
        { type: 'divider', key: 'help-about-divider' },
        { key: 'about-opencard', title: t('app.menu.aboutOpenCard'), icon: 'status.unknown' },
      ],
    },
  ]
}
