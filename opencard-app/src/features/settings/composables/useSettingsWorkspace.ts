/** Projects application settings into node, card and row view models. */
import { computed, type ComputedRef, type DeepReadonly, type Ref } from 'vue'
import type { OcActionDefinition } from '../../../shared/ui/action/action.types'
import type { IconToken } from '../../../shared/ui/icon/iconRegistry'
import type { OcNodeCollection } from '../../../shared/ui/node/node.types'
import { CACHE_GIB_BYTES, formatCacheUsage, type AppCacheUsage } from '../../../shared/storage/appCache'
import type {
  EditorItem,
  EditorItemEditorPart,
  PropertyCompletionProvider,
  PropertyEditorFieldDefinition,
} from '../../../shared/ui/property-editor/propertyEditor.types'
import {
  OC_THEME_REGISTRY,
  type OcEditableThemeColorKey,
  type OcThemeId,
} from '../../../shared/ui/foundation'
import {
  APP_THEME_PRESETS,
  MAX_AUTO_SAVE_INTERVAL_SECONDS,
  MAX_CACHE_LIMIT_GB,
  MAX_PHASE_IMAGE_SPEED,
  MAX_TITLE_BAR_NOTICE_HISTORY_LIMIT,
  MIN_AUTO_SAVE_INTERVAL_SECONDS,
  MIN_CACHE_LIMIT_GB,
  MIN_PHASE_IMAGE_SPEED,
  MIN_TITLE_BAR_NOTICE_HISTORY_LIMIT,
  SETTINGS_CATEGORY_KEYS,
  defaultCommitterEmail,
  type AppSettingKey,
  type AppSettings,
  type AppThemePresetId,
  type SettingsCategoryKey,
} from '../model/appSettings'

/** 某个设置项在设置页里的位置：分类 + 卡片 + 行 key。 */
export interface SettingsAnchor {
  category: SettingsCategoryKey
  cardKey: string
  itemKey: AppSettingKey
}

export interface SettingsCardViewModel {
  key: string
  title: string
  icon?: IconToken
  /** 作用于这张 card 整组的操作，例如主题预设的复制、读取与重置。 */
  actions: OcActionDefinition[]
  items: readonly EditorItem[]
}

export interface SettingsCategoryViewModel {
  key: SettingsCategoryKey
  title: string
  cards: readonly SettingsCardViewModel[]
  preview?: {
    glassIntensity: number
  }
}

interface UseSettingsWorkspaceOptions {
  settings: Readonly<Ref<DeepReadonly<AppSettings>>>
  categoryKey: Readonly<Ref<SettingsCategoryKey>>
  projectOpen: Readonly<Ref<boolean>>
  systemFontFamilies?: Readonly<Ref<readonly string[]>>
  /** `cache/` 的现量占用；进设置页时由 shell 量一次。 */
  cacheUsage: Readonly<Ref<AppCacheUsage>>
  translate: (key: string, fallback: string) => string
}

function editorPart(
  key: string,
  definition: PropertyEditorFieldDefinition,
  value: unknown,
): EditorItemEditorPart {
  return { type: 'editor', key, definition, value }
}

/** 标题保持简短，解释放在 subtitle 里；没有说明就不带这个字段。 */
function fieldItem(
  key: string,
  definition: PropertyEditorFieldDefinition,
  value: unknown,
  subtitle = '',
): EditorItem {
  return {
    key,
    title: definition.title,
    subtitle: subtitle || undefined,
    content: [editorPart('value', definition, value)],
  }
}

function cardAction(
  key: string,
  title: string,
  icon: IconToken,
  disabled = false,
): OcActionDefinition {
  return { key, title, icon, disabled }
}

function card(
  key: string,
  title: string,
  items: readonly EditorItem[],
  options: { icon?: IconToken; actions?: readonly OcActionDefinition[] } = {},
): SettingsCardViewModel {
  return { key, title, icon: options.icon, actions: [...(options.actions ?? [])], items }
}

const CATEGORY_KEYS = SETTINGS_CATEGORY_KEYS

export function useSettingsWorkspace(
  options: UseSettingsWorkspaceOptions,
): {
  categoryTreeData: ComputedRef<OcNodeCollection>
  activeCategory: ComputedRef<SettingsCategoryViewModel>
  settingsAnchorFor: (key: AppSettingKey) => SettingsAnchor | null
} {
  const categoryLabels = computed<Record<SettingsCategoryKey, string>>(() => ({
    general: options.translate('settings.categories.general', 'General'),
    appearance: options.translate('settings.categories.appearance', 'Appearance'),
    workspace: options.translate('settings.categories.workspace', 'Workspace'),
    versionControl: options.translate('settings.categories.versionControl', 'Version control'),
  }))
  const systemFontFamilies = computed(() => options.systemFontFamilies?.value ?? [])

  const categoryTreeData = computed<OcNodeCollection>(() => ({
    rootKeys: CATEGORY_KEYS,
    items: new Map([
      ['general', { label: categoryLabels.value.general, visual: { type: 'icon', icon: 'tool.settings' } }],
      ['appearance', { label: categoryLabels.value.appearance, visual: { type: 'icon', icon: 'data.symbol-color' } }],
      ['workspace', { label: categoryLabels.value.workspace, visual: { type: 'icon', icon: 'tool.workspace' } }],
      ['versionControl', { label: categoryLabels.value.versionControl, visual: { type: 'icon', icon: 'nav.collaboration' } }],
    ]),
    children: new Map(),
  }))

  function buildCategory(
    categoryKey: SettingsCategoryKey,
    settings: DeepReadonly<AppSettings>,
  ): SettingsCategoryViewModel {
    if (categoryKey === 'general') {
      return {
        key: categoryKey,
        title: categoryLabels.value.general,
        cards: [
          card('interface', options.translate('settings.cards.interface', 'Interface'), [
            fieldItem('appearance.locale', {
              title: options.translate('settings.fields.language', 'Language'),
              fieldType: 'string',
              presentation: 'select',
              options: ['system', 'zh-CN', 'en-US'],
              optionLabels: {
                system: options.translate('settings.values.systemLanguage', 'System'),
                'zh-CN': '简体中文',
                'en-US': 'English',
              },
            }, settings.appearance.locale),
            fieldItem('shell.titleBarNoticeHistoryLimit', {
              title: options.translate('settings.fields.titleBarNoticeHistoryLimit', 'Instant messages'),
              fieldType: 'number', presentation: 'slider',
              min: MIN_TITLE_BAR_NOTICE_HISTORY_LIMIT, max: MAX_TITLE_BAR_NOTICE_HISTORY_LIMIT, step: 1,
              ticks: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
              suffix: options.translate('settings.values.messages', ' messages'),
            }, settings.shell.titleBarNoticeHistoryLimit,
            options.translate('settings.descriptions.titleBarNoticeHistoryLimit', 'How many the title bar keeps.')),
          ], { icon: 'tool.interface' }),
          card('updates', options.translate('settings.cards.updates', 'Updates'), [
            fieldItem('updates.showReleaseNotesAfterUpdate', {
              title: options.translate('settings.fields.showReleaseNotesAfterUpdate', 'Show release notes'),
              fieldType: 'boolean',
            }, settings.updates.showReleaseNotesAfterUpdate),
          ], { icon: 'action.download' }),
          card('exporting', options.translate('settings.cards.exporting', 'Export'), [
            fieldItem('exporting.openCdeWorkbookAfterExport', {
              title: options.translate('settings.fields.openCdeWorkbookAfterExport', 'Open after export'),
              fieldType: 'boolean',
            }, settings.exporting.openCdeWorkbookAfterExport,
            options.translate('settings.descriptions.openCdeWorkbookAfterExport', 'Opens the exported CDE workbook; turn it off to only write the file.')),
          ], { icon: 'action.export' }),
          card('cache', options.translate('settings.cards.cache', 'Cache'), [
            fieldItem('cache.snapshots', {
              title: options.translate('settings.fields.cachePackages', 'Unpacked packages'),
              fieldType: 'string', isReadonly: true,
            }, formatCacheUsage(options.cacheUsage.value.snapshots, settings.cache.packageLimitGb * CACHE_GIB_BYTES),
            options.translate('settings.descriptions.cachePackages', 'Cleared on the next start once it is over the limit.')),
            fieldItem('cache.network', {
              title: options.translate('settings.fields.cacheNetwork', 'Downloaded images'),
              fieldType: 'string', isReadonly: true,
            }, formatCacheUsage(options.cacheUsage.value.network, settings.cache.networkLimitGb * CACHE_GIB_BYTES),
            options.translate('settings.descriptions.cacheNetwork', 'Cleared on the next start once it is over the limit.')),
            fieldItem('cache.staged', {
              title: options.translate('settings.fields.cacheStaged', 'Undo staging'),
              fieldType: 'string', isReadonly: true,
            }, formatCacheUsage(options.cacheUsage.value.staged),
            options.translate('settings.descriptions.cacheStaged', 'Undo bytes; cleared on the next start anyway.')),
            fieldItem('cache.packageLimitGb', {
              title: options.translate('settings.fields.cachePackageLimit', 'Package cache limit'),
              fieldType: 'number', presentation: 'slider',
              min: MIN_CACHE_LIMIT_GB, max: MAX_CACHE_LIMIT_GB, step: 1,
              ticks: [1, 2, 4, 8, 16, 32],
              suffix: 'GB',
            }, settings.cache.packageLimitGb),
            fieldItem('cache.networkLimitGb', {
              title: options.translate('settings.fields.cacheNetworkLimit', 'Image cache limit'),
              fieldType: 'number', presentation: 'slider',
              min: MIN_CACHE_LIMIT_GB, max: MAX_CACHE_LIMIT_GB, step: 1,
              ticks: [1, 2, 4, 8, 16, 32],
              suffix: 'GB',
            }, settings.cache.networkLimitGb),
          ], {
            icon: 'file.package',
            actions: [
              cardAction(
                'cache.clear',
                options.translate('settings.actions.clearCache', 'Clear cache'),
                'action.delete',
                options.projectOpen.value,
              ),
            ],
          }),
        ],
      }
    }

    if (categoryKey === 'appearance') {
      const presetLabel = (themeId: OcThemeId, presetId: AppThemePresetId): string => {
        if (presetId === 'default') {
          return themeId === 'dark'
            ? options.translate('settings.values.openCardDarkTheme', 'OpenCard Dark')
            : options.translate('settings.values.openCardLightTheme', 'OpenCard Light')
        }
        const labels: Record<Exclude<AppThemePresetId, 'default'>, [string, string]> = {
          graphite: ['graphiteTheme', 'Graphite'],
          'grass-block': ['grassBlockTheme', 'Grass Block'],
          'deep-sea': ['deepSeaTheme', 'Deep Sea'],
          ember: ['emberTheme', 'Ember'],
          'ink-bamboo': ['inkBambooTheme', 'Ink Bamboo'],
          'morning-mist': ['morningMistTheme', 'Morning Mist'],
          'sakura-paper': ['sakuraPaperTheme', 'Sakura Paper'],
          dune: ['duneTheme', 'Dune'],
          mint: ['mintTheme', 'Mint'],
        }
        const [key, fallback] = labels[presetId]
        return options.translate(`settings.values.${key}`, fallback)
      }
      const fontCompletion: PropertyCompletionProvider = ({ value, cursor }) => {
        const start = value.lastIndexOf(';', Math.max(0, cursor - 1)) + 1
        const nextSeparator = value.indexOf(';', cursor)
        const end = nextSeparator < 0 ? value.length : nextSeparator
        const fragment = value.slice(start, cursor).trim().toLocaleLowerCase()
        return {
          replaceStart: start,
          replaceEnd: end,
          items: systemFontFamilies.value
            .filter(font => !fragment || font.toLocaleLowerCase().includes(fragment))
            .map(font => ({
              key: font,
              label: font,
              labelStyle: { fontFamily: font },
              insertText: start > 0 ? ` ${font}` : font,
            })),
        }
      }
      const themeCard = (themeId: OcThemeId): SettingsCardViewModel => {
        const presetValue = settings.appearance.themePresetIds[themeId]
        const presetOptions = [
          ...APP_THEME_PRESETS[themeId].map(presetId => ({ value: presetId, label: presetLabel(themeId, presetId) })),
          ...settings.appearance.userThemePresets[themeId].map(preset => ({
            value: `user:${preset.name}`,
            label: preset.name,
          })),
        ]
        const currentPresetLabel = presetOptions.find(option => option.value === presetValue)?.label ?? ''
        const colorItems: EditorItem[] = [
          ['accentColor', 'Theme color', '--oc-accent'],
          ['baseBackgroundColor', 'Background', '--oc-bg-base'],
          ['primaryTextColor', 'Foreground', '--oc-fg-default'],
        ].map(([key, fallback, token]) => {
          const colorToken = token as OcEditableThemeColorKey
          const title = options.translate(`settings.fields.${key}`, fallback)
          return fieldItem(`color:${colorToken}`, {
            title, fieldType: 'color', allowAlpha: false,
            defaultValue: settings.appearance.themeOverrides[themeId][colorToken] ?? null,
          }, settings.appearance.themeOverrides[themeId][colorToken] ?? OC_THEME_REGISTRY[themeId][colorToken])
        })
        return card(
          `theme:${themeId}`,
          options.translate(`settings.fields.${themeId}ThemeColors`, themeId === 'dark' ? 'Dark theme' : 'Light theme'),
          [
            {
              key: 'preset',
              title: options.translate('settings.fields.themePreset', 'Preset'),
              content: [
                editorPart('value', {
                  title: options.translate('settings.fields.themePreset', 'Preset'),
                  fieldType: 'string', presentation: 'select',
                  options: presetOptions.map(option => option.value),
                  optionLabels: Object.fromEntries(presetOptions.map(option => [option.value, option.label])),
                  placeholder: options.translate('settings.values.selectThemePreset', 'Select preset'),
                }, presetValue),
              ],
            },
            fieldItem('name', {
              title: options.translate('settings.fields.themeName', 'Theme name'),
              fieldType: 'string', commitMode: 'blur',
              placeholder: currentPresetLabel || options.translate('settings.values.customTheme', 'Custom theme'),
            }, presetValue.startsWith('user:') ? presetValue.slice('user:'.length) : ''),
            ...colorItems,
            fieldItem('font', {
              title: options.translate('settings.fields.uiFont', 'UI font'),
              fieldType: 'string', commitMode: 'blur',
              placeholder: options.translate('settings.values.systemFont', 'System'),
              completion: { provider: fontCompletion },
            }, settings.appearance.fontFamilies[themeId] === 'system' ? '' : settings.appearance.fontFamilies[themeId],
            options.translate('settings.descriptions.uiFont', 'Leave empty to use the system font; separate several families with semicolons.')),
            fieldItem('angle', {
              title: options.translate('settings.fields.accentNeighborAngle', 'Secondary color phase angle'),
              fieldType: 'number', presentation: 'slider', min: -180, max: 180, step: 1, suffix: '°',
            }, settings.appearance.accentNeighborAngles[themeId],
            options.translate('settings.descriptions.accentNeighborAngle', 'Which side the secondary color leans toward.')),
          ],
          {
            icon: 'data.symbol-color',
            actions: [
              cardAction('theme.copy', options.translate('settings.actions.copyThemePreset', 'Copy this theme preset'), 'action.copy'),
              cardAction('theme.read', options.translate('settings.actions.readThemePreset', 'Read a theme preset from the clipboard'), 'action.import'),
              cardAction(
                'theme-preset.delete',
                options.translate('settings.actions.deleteThemePreset', 'Delete imported theme'),
                'action.delete',
                !presetValue.startsWith('user:'),
              ),
            ],
          },
        )
      }

      return {
        key: categoryKey,
        title: categoryLabels.value.appearance,
        preview: { glassIntensity: settings.appearance.glassIntensity },
        cards: [
          themeCard('dark'),
          themeCard('light'),
          card('interface', options.translate('settings.cards.interface', 'Interface'), [
            fieldItem('appearance.theme', {
              title: options.translate('settings.fields.theme', 'Theme'),
              fieldType: 'string', presentation: 'option-group',
              options: ['system', 'dark', 'light'],
              optionLabels: {
                system: options.translate('settings.values.systemTheme', 'System'),
                dark: options.translate('settings.values.dark', 'Dark'),
                light: options.translate('settings.values.light', 'Light'),
              },
            }, settings.appearance.theme),
            fieldItem('appearance.baseFontSize', {
              title: options.translate('settings.fields.baseFontSize', 'Base font size'),
              fieldType: 'number', presentation: 'slider', min: 10, max: 16, step: 1,
              ticks: [10, 11, 12, 13, 14, 15, 16], suffix: 'px',
            }, settings.appearance.baseFontSize),
            fieldItem('appearance.phaseImageSpeed', {
              title: options.translate('settings.fields.phaseImageSpeed', 'Phase animation speed'),
              fieldType: 'number', presentation: 'slider',
              min: MIN_PHASE_IMAGE_SPEED, max: MAX_PHASE_IMAGE_SPEED, step: 5, suffix: '%',
            }, settings.appearance.phaseImageSpeed),
            fieldItem('appearance.glassIntensity', {
              title: options.translate('settings.fields.glassIntensity', 'Glass intensity'),
              fieldType: 'number', presentation: 'slider', min: 0, max: 100, step: 1, suffix: '%',
            }, settings.appearance.glassIntensity),
            fieldItem('appearance.micaBackground', {
              title: options.translate('settings.fields.micaBackground', 'Mica window background'),
              fieldType: 'boolean',
            }, settings.appearance.micaBackground,
            options.translate('settings.descriptions.micaBackground', 'Uses the Windows 11 window material; falls back to an opaque background elsewhere.')),
          ], { icon: 'tool.interface' }),
        ],
      }
    }

    if (categoryKey === 'versionControl') {
      // 提交者身份与作者身份放在一起：名称留空就是这位作者 ID，邮箱再由名称推导。
      const committerName = settings.versionControl.committerName.trim() || settings.identity.publisherKey
      return {
        key: categoryKey,
        title: categoryLabels.value.versionControl,
        cards: [
          card('identity', options.translate('settings.cards.identity', 'Author identity'), [
            fieldItem('identity.publisherKey', {
              title: options.translate('settings.fields.publisherKey', 'Author ID'),
              fieldType: 'string', commitMode: 'blur',
            }, settings.identity.publisherKey,
            options.translate('settings.descriptions.publisherKey', 'Identifies the publisher and is written into a package manifest when you publish.')),
          ], {
            actions: [
              cardAction('identity.regenerate', options.translate('settings.actions.regeneratePublisherKey', 'Generate a new author ID'), 'action.refresh'),
            ],
          }),
          card('committer', options.translate('settings.cards.commitIdentity', 'Commit identity'), [
            fieldItem('versionControl.committerName', {
              title: options.translate('settings.fields.committerName', 'Committer name'),
              fieldType: 'string', commitMode: 'blur',
              placeholder: settings.identity.publisherKey,
            }, settings.versionControl.committerName,
            options.translate('settings.descriptions.committerName', 'Leave empty to use the author ID above.')),
            fieldItem('versionControl.committerEmail', {
              title: options.translate('settings.fields.committerEmail', 'Committer email'),
              fieldType: 'string', commitMode: 'blur',
              placeholder: defaultCommitterEmail(committerName),
            }, settings.versionControl.committerEmail,
            options.translate('settings.descriptions.committerEmail', 'Leave empty to build an @noreply.example address from the committer name.')),
            fieldItem('versionControl.createInitialCommit', {
              title: options.translate('settings.fields.createInitialCommit', 'Initial commit'),
              fieldType: 'boolean',
            }, settings.versionControl.createInitialCommit,
            options.translate('settings.descriptions.createInitialCommit', 'Also creates the first commit right after initializing.')),
          ], { icon: 'file.git' }),
        ],
      }
    }

    return {
      key: 'workspace',
      title: categoryLabels.value.workspace,
      cards: [
        card('save-and-history', options.translate('settings.cards.saveAndHistory', 'Save and history'), [
          fieldItem('workspace.autoSave', {
            title: options.translate('settings.fields.autoSave', 'Auto-save'), fieldType: 'boolean',
          }, settings.workspace.autoSave,
          options.translate('settings.descriptions.autoSave', 'Saves an opened file as soon as you change it.')),
          fieldItem('workspace.autoSaveIntervalSeconds', {
            title: options.translate('settings.fields.autoSaveInterval', 'Auto-save interval'),
            fieldType: 'number', presentation: 'slider',
            min: MIN_AUTO_SAVE_INTERVAL_SECONDS, max: MAX_AUTO_SAVE_INTERVAL_SECONDS, step: 1,
            ticks: [5, 15, 30, 60, 120, 300],
            suffix: options.translate('settings.values.seconds', ' seconds'),
          }, settings.workspace.autoSaveIntervalSeconds),
          fieldItem('workspace.historyEntryLimit', {
            title: options.translate('settings.fields.historyEntryLimit', 'History limit'),
            fieldType: 'number', presentation: 'slider', min: 10, max: 1000, step: 10,
            ticks: [10, 50, 100, 250, 500, 1000],
            suffix: options.translate('settings.values.historyEntries', ' entries'),
          }, settings.workspace.historyEntryLimit,
          options.translate('settings.descriptions.historyEntryLimit', 'How many steps each editor keeps; Monaco editors use their own undo history.')),
        ], { icon: 'action.history' }),
        card('file-tree', options.translate('settings.cards.fileTree', 'File tree'), [
          fieldItem('workspace.structureTreeSelectionBehavior', {
            title: options.translate('settings.fields.structureTreeSelectionBehavior', 'Structure tree selection'),
            fieldType: 'string', presentation: 'select',
            options: ['expand-exclusive', 'expand', 'none'],
            optionLabels: {
              'expand-exclusive': options.translate('settings.values.expandExclusive', 'Expand and collapse others'),
              expand: options.translate('settings.values.expand', 'Expand ancestors'),
              none: options.translate('settings.values.noAutoExpand', 'Do not expand'),
            },
          }, settings.workspace.structureTreeSelectionBehavior,
          options.translate('settings.descriptions.structureTreeSelectionBehavior', 'How the structure tree expands around the block you select.')),
          fieldItem('workspace.structureTreeScrollToSelection', {
            title: options.translate('settings.fields.structureTreeScrollToSelection', 'Scroll to selected block'), fieldType: 'boolean',
          }, settings.workspace.structureTreeScrollToSelection,
          options.translate('settings.descriptions.structureTreeScrollToSelection', 'Scrolls the structure tree to the selected block.')),
          fieldItem('workspace.hideDotFiles', {
            title: options.translate('settings.fields.hideDotFiles', 'Hide dot-files'), fieldType: 'boolean',
          }, settings.workspace.hideDotFiles,
          options.translate('settings.descriptions.hideDotFiles', 'Files and folders whose names start with a dot stay out of the file tree.')),
        ], {
          icon: 'data.list-tree',
          actions: [
            cardAction(
              'project-workspace.reset',
              options.translate('settings.actions.resetProjectWorkspace', 'Reset this project’s interface state'),
              'action.restart',
              !options.projectOpen.value,
            ),
          ],
        }),
        card('canvas-assist', options.translate('settings.cards.canvasAssist', 'Canvas assist'), [
          fieldItem('workspace.showSelectionPositionOnMove', {
            title: options.translate('settings.fields.showSelectionPositionOnMove', 'Show guides while moving'), fieldType: 'boolean',
          }, settings.workspace.showSelectionPositionOnMove,
          options.translate('settings.descriptions.showSelectionPositionOnMove', 'Shows the anchor and X/Y guides while dragging blocks.')),
          fieldItem('workspace.showSelectionSizeOnResize', {
            title: options.translate('settings.fields.showSelectionSizeOnResize', 'Show size labels while resizing'), fieldType: 'boolean',
          }, settings.workspace.showSelectionSizeOnResize,
          options.translate('settings.descriptions.showSelectionSizeOnResize', 'Shows the width and height next to the selection while resizing.')),
          fieldItem('workspace.alignmentSnappingEnabledByDefault', {
            title: options.translate('settings.fields.alignmentSnappingEnabledByDefault', 'Alignment snapping'), fieldType: 'boolean',
          }, settings.workspace.alignmentSnappingEnabledByDefault,
          options.translate('settings.descriptions.alignmentSnappingEnabledByDefault', 'Whether a newly opened canvas starts with alignment snapping on.')),
        ], { icon: 'layout.artboard' }),
      ],
    }
  }

  const categoryViewModels = computed<Record<SettingsCategoryKey, SettingsCategoryViewModel>>(() => {
    const settings = options.settings.value
    return {
      general: buildCategory('general', settings),
      appearance: buildCategory('appearance', settings),
      workspace: buildCategory('workspace', settings),
      versionControl: buildCategory('versionControl', settings),
    }
  })
  const activeCategory = computed(() => categoryViewModels.value[options.categoryKey.value])

  /**
   * 跳转锚点：按设置项的 key 找出它所在分类与卡片。
   * 视图模型里的行 key 就是设置项 key，所以这里遍历已构建的分类即可，不需要另抄一份映射。
   */
  function settingsAnchorFor(key: AppSettingKey): SettingsAnchor | null {
    for (const category of Object.values(categoryViewModels.value)) {
      for (const card of category.cards) {
        if (card.items.some(item => item.key === key)) {
          return { category: category.key, cardKey: card.key, itemKey: key }
        }
      }
    }
    return null
  }

  return { categoryTreeData, activeCategory, settingsAnchorFor }
}
