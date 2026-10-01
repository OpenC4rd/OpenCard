import {
  DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
  IMPORT_RESOURCE_PACKAGE_ACTION_KEY,
  PROJECT_FILES_LIST_KEY,
  PROJECT_NEW_FOLDER_ACTION_KEY,
  PROJECT_NEW_OPENCARD_ACTION_KEY,
  PROJECT_REVEAL_ACTION_KEY,
  RESOURCE_PACKAGES_LIST_KEY,
  TIMELINE_LIST_KEY,
  TIMELINE_REFRESH_ACTION_KEY,
  USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
} from './shellSidebarConfig'
import {
  CARD_DATA_TABLE_EXPORT_ACTION_KEY,
  CARD_DATA_TABLE_IMPORT_ACTION_KEY,
  CARD_DESIGNER_MODE_ACTION_KEY,
  CARD_RENDER_IMAGE_OPTION_PREFIX,
  DICTIONARY_EXPORT_ACTION_KEY,
  DICTIONARY_IMPORT_ACTION_KEY,
  DIFF_EXIT_ACTION_KEY,
} from './shellWorkspaceActions'

export type ShellSidebarListIntent =
  | { type: 'timeline.refresh' }
  | { type: 'project.reveal' }
  | { type: 'project.create-entry'; kind: 'folder' | 'opencard' }
  | { type: 'resource-package.import' }
  | { type: 'resource-package.use-selected' }
  | { type: 'resource-package.disable-selected' }

export type ShellIntentDecodeResult =
  | { ok: true; intent: ShellSidebarListIntent }
  | { ok: false; code: 'unknown-sidebar-action'; listKey: string; actionKey: string }

/** 动态动作键只在这一层解析；壳层执行器只接收带命名空间的意图。 */
export function decodeShellSidebarListIntent(listKey: string, actionKey: string): ShellIntentDecodeResult {
  if (listKey === TIMELINE_LIST_KEY && actionKey === TIMELINE_REFRESH_ACTION_KEY) {
    return { ok: true, intent: { type: 'timeline.refresh' } }
  }
  if (listKey === PROJECT_FILES_LIST_KEY) {
    if (actionKey === PROJECT_REVEAL_ACTION_KEY) return { ok: true, intent: { type: 'project.reveal' } }
    if (actionKey === PROJECT_NEW_OPENCARD_ACTION_KEY) {
      return { ok: true, intent: { type: 'project.create-entry', kind: 'opencard' } }
    }
    if (actionKey === PROJECT_NEW_FOLDER_ACTION_KEY) {
      return { ok: true, intent: { type: 'project.create-entry', kind: 'folder' } }
    }
  }
  if (listKey === RESOURCE_PACKAGES_LIST_KEY) {
    if (actionKey === IMPORT_RESOURCE_PACKAGE_ACTION_KEY) {
      return { ok: true, intent: { type: 'resource-package.import' } }
    }
    if (actionKey === USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY) {
      return { ok: true, intent: { type: 'resource-package.use-selected' } }
    }
    if (actionKey === DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY) {
      return { ok: true, intent: { type: 'resource-package.disable-selected' } }
    }
  }
  return { ok: false, code: 'unknown-sidebar-action', listKey, actionKey }
}

export type ShellWorkspaceIntent =
  | { type: 'diff.exit' }
  | { type: 'diff.select'; side: 'before' | 'after'; revisionId: string | null }
  | { type: 'card.render-image'; source: 'current' | 'both'; scale: 0.5 | 1 | 2 }
  | { type: 'card.toggle-mode' }
  | { type: 'data-table.import' }
  | { type: 'data-table.export' }

export type ShellWorkspaceIntentDecodeResult =
  | { ok: true; intent: ShellWorkspaceIntent }
  | { ok: false; code: 'unknown-workspace-action'; actionKey: string }

export function decodeShellWorkspaceIntent(actionKey: string): ShellWorkspaceIntentDecodeResult {
  if (actionKey === DIFF_EXIT_ACTION_KEY) return { ok: true, intent: { type: 'diff.exit' } }
  if (actionKey === CARD_DESIGNER_MODE_ACTION_KEY) return { ok: true, intent: { type: 'card.toggle-mode' } }
  if (actionKey === CARD_DATA_TABLE_IMPORT_ACTION_KEY || actionKey === DICTIONARY_IMPORT_ACTION_KEY) {
    return { ok: true, intent: { type: 'data-table.import' } }
  }
  if (actionKey === CARD_DATA_TABLE_EXPORT_ACTION_KEY || actionKey === DICTIONARY_EXPORT_ACTION_KEY) {
    return { ok: true, intent: { type: 'data-table.export' } }
  }
  const diffMatch = /^(diff\.(before|after)):(.+)$/.exec(actionKey)
  if (diffMatch) {
    const revisionId = diffMatch[3] === 'current' ? null : diffMatch[3]
    return {
      ok: true,
      intent: {
        type: 'diff.select',
        side: diffMatch[2] === 'before' ? 'before' : 'after',
        revisionId,
      },
    }
  }
  const renderMatch = new RegExp(`^${CARD_RENDER_IMAGE_OPTION_PREFIX}(current|both)\\.(0\\.5|1|2)$`).exec(actionKey)
  if (renderMatch) {
    return {
      ok: true,
      intent: {
        type: 'card.render-image',
        source: renderMatch[1] as 'current' | 'both',
        scale: Number(renderMatch[2]) as 0.5 | 1 | 2,
      },
    }
  }
  return { ok: false, code: 'unknown-workspace-action', actionKey }
}

export type ShellCommandIntent =
  | { type: 'resource-package.build' }
  | { type: 'settings.open' }
  | { type: 'updates.check' }
  | { type: 'developer.toggle' }
  | { type: 'debug.toggle-overlays' }
  | { type: 'debug.toggle-transparent-viewport' }
  | { type: 'debug.toggle-passive-viewport' }
  | { type: 'about.open' }
  | { type: 'feedback.open'; view: 'submit' | 'history' }
  | { type: 'editor.save' }
  | { type: 'editor.save-as' }
  | { type: 'editor.save-all' }
  | { type: 'editor.toggle-auto-save' }
  | { type: 'editor.undo' }
  | { type: 'editor.redo' }
  | { type: 'sidebar.toggle' }
  | { type: 'bottom-panel.toggle' }
  | { type: 'window.fullscreen' }
  | { type: 'primary-page.show'; page: 'welcome' | 'workbench' }
  | { type: 'flow.return' }
  | { type: 'project.new' }
  | { type: 'project.new-opencard' }
  | { type: 'project.open' }
  | { type: 'file.open' }
  | { type: 'project.close-to-welcome' }
  | { type: 'version.publish' }
  | { type: 'repository.initialize' }
  | { type: 'template.export' }
  | { type: 'card-documents.export' }

export type ShellCommandDecodeResult =
  | { ok: true; intent: ShellCommandIntent }
  | { ok: false; code: 'unknown-shell-command'; actionKey: string }

const shellCommandIntents: Readonly<Record<string, ShellCommandIntent>> = {
  'file.build-package': { type: 'resource-package.build' },
  'open-settings': { type: 'settings.open' },
  'check-for-updates': { type: 'updates.check' },
  'toggle-developer-mode': { type: 'developer.toggle' },
  'toggle-debug-hide-cde-overlays': { type: 'debug.toggle-overlays' },
  'toggle-debug-transparent-cde-viewport': { type: 'debug.toggle-transparent-viewport' },
  'toggle-debug-passive-cde-viewport': { type: 'debug.toggle-passive-viewport' },
  'about-opencard': { type: 'about.open' },
  'send-feedback': { type: 'feedback.open', view: 'submit' },
  'view-feedback': { type: 'feedback.open', view: 'history' },
  'save-active-editor': { type: 'editor.save' },
  'save-active-editor-as': { type: 'editor.save-as' },
  'save-all-editors': { type: 'editor.save-all' },
  'toggle-auto-save': { type: 'editor.toggle-auto-save' },
  'undo-active-editor': { type: 'editor.undo' },
  'redo-active-editor': { type: 'editor.redo' },
  'toggle-sidebar': { type: 'sidebar.toggle' },
  'toggle-bottom-panel': { type: 'bottom-panel.toggle' },
  'toggle-fullscreen': { type: 'window.fullscreen' },
  'show-welcome': { type: 'primary-page.show', page: 'welcome' },
  'show-workbench': { type: 'primary-page.show', page: 'workbench' },
  'return-primary-page': { type: 'flow.return' },
  'new-project': { type: 'project.new' },
  'new-open-card': { type: 'project.new-opencard' },
  'open-project': { type: 'project.open' },
  'open-file': { type: 'file.open' },
  'close-project-and-welcome': { type: 'project.close-to-welcome' },
  'publish-version': { type: 'version.publish' },
  'initialize-repository': { type: 'repository.initialize' },
  'export-project-template': { type: 'template.export' },
  'export-card-documents': { type: 'card-documents.export' },
}

export function decodeShellCommand(actionKey: string): ShellCommandDecodeResult {
  const intent = shellCommandIntents[actionKey]
  return intent ? { ok: true, intent } : { ok: false, code: 'unknown-shell-command', actionKey }
}
