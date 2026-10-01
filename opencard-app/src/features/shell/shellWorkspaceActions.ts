import type { OcActionMenuEntry } from '../../shared/ui/action/action.types'
import type { DiffRevisionOption } from '../version-control/diff.types'
import type { ShellWorkspaceAction } from './shell.types'

export const DIFF_EXIT_ACTION_KEY = 'diff.exit'
export const DIFF_BEFORE_ACTION_KEY = 'diff.before'
export const DIFF_AFTER_ACTION_KEY = 'diff.after'
export const CARD_DESIGNER_MODE_ACTION_KEY = 'card-designer.toggle-mode'
export const CARD_DATA_TABLE_IMPORT_ACTION_KEY = 'card-designer.data-table.import'
export const CARD_DATA_TABLE_EXPORT_ACTION_KEY = 'card-designer.data-table.export'
export const CARD_RENDER_IMAGE_ACTION_KEY = 'card-designer.render-image'
export const CARD_RENDER_IMAGE_OPTION_PREFIX = `${CARD_RENDER_IMAGE_ACTION_KEY}.`
export const DICTIONARY_IMPORT_ACTION_KEY = 'dictionary.workbook.import'
export const DICTIONARY_EXPORT_ACTION_KEY = 'dictionary.workbook.export'

type Translate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string

export interface ShellWorkspaceActionsOptions {
  translate: Translate
  isWorkbench: boolean
  isDiff: boolean
  beforeRevisionId: string | null
  afterRevisionId: string | null
  timelineRevisionOptions: readonly DiffRevisionOption[]
  editorHeaderActions: readonly ShellWorkspaceAction[]
  isDictionaryEditor: boolean
  isCardDesignerEditor: boolean
  activeCardDesignerMode: 'design' | 'data-table'
  isDataTableWorkbookBusy: boolean
  canExportDataTableWorkbook: boolean
  isProjectExportRunning: boolean
  canRenderCardImage: boolean
}

function formatRevisionLabel(
  option: DiffRevisionOption | undefined,
  fallback: string,
): string {
  if (!option) return fallback
  return option.shortId ? `${option.label} ${option.shortId}` : option.label
}

function createRevisionMenu(
  options: readonly DiffRevisionOption[],
  prefix: string,
  selectedId: string | null,
): readonly OcActionMenuEntry[] {
  return options.map(option => ({
    key: `${prefix}:${option.commitId ?? 'current'}`,
    title: formatRevisionLabel(option, option.label),
    icon: option.commitId === selectedId ? 'action.check' as const : 'file.git' as const,
  }))
}

export function createShellWorkspaceActions(
  options: ShellWorkspaceActionsOptions,
): ShellWorkspaceAction[] {
  const { translate: t } = options
  if (!options.isWorkbench) return []

  if (options.isDiff) {
    const beforeOption = options.timelineRevisionOptions.find(option => option.commitId === options.beforeRevisionId)
    const afterOption = options.timelineRevisionOptions.find(option => option.commitId === options.afterRevisionId)
    return [
      beforeOption?.shortId ?? beforeOption?.label ?? t('sidebar.diffViewer.diskVersion'),
      {
        type: 'selection',
        key: DIFF_BEFORE_ACTION_KEY,
        icon: 'file.git',
        value: formatRevisionLabel(beforeOption, t('sidebar.diffViewer.versionA')),
        hoverTip: t('sidebar.diffViewer.versionA'),
        options: createRevisionMenu(options.timelineRevisionOptions, DIFF_BEFORE_ACTION_KEY, options.beforeRevisionId),
      },
      afterOption?.shortId ?? afterOption?.label ?? t('sidebar.diffViewer.diskVersion'),
      {
        type: 'selection',
        key: DIFF_AFTER_ACTION_KEY,
        icon: 'file.git',
        value: formatRevisionLabel(afterOption, t('sidebar.diffViewer.versionB')),
        hoverTip: t('sidebar.diffViewer.versionB'),
        options: createRevisionMenu(options.timelineRevisionOptions, DIFF_AFTER_ACTION_KEY, options.afterRevisionId),
      },
      { key: DIFF_EXIT_ACTION_KEY, icon: 'nav.arrow-left', hoverTip: t('sidebar.diffViewer.exitComparison') },
    ]
  }

  if (options.isDictionaryEditor) return [
    {
      key: DICTIONARY_IMPORT_ACTION_KEY,
      icon: 'action.import',
      hoverTip: t('dictionaryEditor.workbook.import'),
      disabled: options.isDataTableWorkbookBusy,
    },
    {
      key: DICTIONARY_EXPORT_ACTION_KEY,
      icon: 'action.export',
      hoverTip: t('dictionaryEditor.workbook.export'),
      disabled: options.isDataTableWorkbookBusy || !options.canExportDataTableWorkbook,
    },
  ]

  if (!options.isCardDesignerEditor) return [...options.editorHeaderActions]

  const tableMode = options.activeCardDesignerMode === 'data-table'
  const modeAction: ShellWorkspaceAction = {
    key: CARD_DESIGNER_MODE_ACTION_KEY,
    icon: tableMode ? 'file.opencard' : 'data.table',
    hoverTip: tableMode
      ? t('cardDesigner.dataTable.switchToDesignMode')
      : t('cardDesigner.dataTable.switchToTableMode'),
  }
  const renderImageAction: ShellWorkspaceAction = {
    key: CARD_RENDER_IMAGE_ACTION_KEY,
    icon: 'action.image-plus',
    hoverTip: t('cardDesigner.renderImage.title'),
    disabled: options.isProjectExportRunning || !options.canRenderCardImage,
    children: ['current', 'both'].map(faceMode => ({
      key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}`,
      title: t(`cardDesigner.renderImage.${faceMode}`),
      children: [
        { key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}.0.5`, title: t('cardDesigner.renderImage.preview') },
        { key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}.1`, title: t('cardDesigner.renderImage.standard') },
        { key: `${CARD_RENDER_IMAGE_OPTION_PREFIX}${faceMode}.2`, title: t('cardDesigner.renderImage.highDefinition') },
      ],
    })),
  }

  if (!tableMode) return [renderImageAction, modeAction]
  return [
    {
      key: CARD_DATA_TABLE_IMPORT_ACTION_KEY,
      icon: 'action.import',
      hoverTip: t('cardDesigner.dataTable.importWorkbook'),
      disabled: options.isDataTableWorkbookBusy,
    },
    {
      key: CARD_DATA_TABLE_EXPORT_ACTION_KEY,
      icon: 'action.export',
      hoverTip: t('cardDesigner.dataTable.exportWorkbook'),
      disabled: options.isDataTableWorkbookBusy || !options.canExportDataTableWorkbook,
    },
    modeAction,
  ]
}
