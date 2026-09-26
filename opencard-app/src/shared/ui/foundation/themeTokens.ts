/**
 * 主题 Token 键集合 — 定义 UI 系统中所有可主题化的 CSS 变量。
 * "中庸"原则：只保留实际被多处使用的语义 token，不过度细分。
 */
export type OcThemeId = 'dark' | 'light'

export const OC_THEME_TOKEN_KEYS = [
  // 滚动条
  '--oc-scrollbar-size',
  '--oc-scrollbar-thumb',
  '--oc-scrollbar-thumb-hover',

  // 背景 — 层级
  '--oc-bg-base',
  '--oc-bg-surface',
  '--oc-bg-block',
  '--oc-bg-raised',

  // 背景 — 交互态
  '--oc-bg-hover',
  '--oc-bg-active',
  '--oc-bg-selected',

  // 背景 — 输入
  '--oc-bg-input',

  // 背景 — 强调
  '--oc-bg-accent',
  '--oc-bg-accent-hover',
  '--oc-bg-accent-subtle',

  // 背景 — 危险
  '--oc-bg-danger-subtle',

  // 背景 — 警告
  '--oc-bg-warning-subtle',

  // 背景 — 成功
  '--oc-bg-success-subtle',

  // 背景 — 特殊
  '--oc-bg-glass',
  '--oc-bg-modal-backdrop',
  '--oc-opacity-disabled',
  '--oc-bg-glass-blur',
  '--oc-bg-glass-saturate',

  // 边框
  '--oc-border-width',
  '--oc-border-default',
  '--oc-border-muted',
  '--oc-border-strong',
  '--oc-border-accent',
  '--oc-diff-added-border',
  '--oc-diff-removed-border',
  '--oc-diff-changed-border',
  '--oc-diff-divider',
  '--oc-diff-divider-width',
  '--oc-diff-version-label-max-width',

  // 强调色
  '--oc-accent',
  '--oc-accent-neighbor',
  '--oc-accent-fg',
  '--oc-accent-glow',

  // 危险色
  '--oc-danger',

  // 文本
  '--oc-fg-default',
  '--oc-fg-muted',
  '--oc-fg-subtle',
  '--oc-fg-disabled',
  '--oc-fg-accent',
  '--oc-fg-success',
  '--oc-fg-warning',
  '--oc-fg-danger',

  // 图标
  '--oc-icon-default',
  '--oc-icon-muted',
  '--oc-icon-accent',
  '--oc-icon-success',
  '--oc-icon-active',
  '--oc-icon-warning',
  '--oc-icon-danger',

  // 图标尺寸
  '--oc-icon-size-sm',
  '--oc-icon-size-md',
  '--oc-icon-size-lg',
  '--oc-icon-size-action',
  '--oc-icon-size-display',
  '--oc-field-affix-icon-offset-y',

  // 数字角标
  '--oc-number-badge-size',
  '--oc-number-badge-padding-inline',
  '--oc-number-badge-font-size',
  '--oc-number-badge-line-height',

  // 内联标记
  '--oc-inline-key-height',
  '--oc-inline-key-padding-inline',
  '--oc-inline-key-highlight',
  '--oc-inline-key-lowlight',
  '--oc-inline-key-shadow-offset',

  // 文件类型图标色
  '--oc-icon-file-opencard',
  '--oc-icon-file-json',
  '--oc-icon-file-markdown',
  '--oc-icon-file-typescript',
  '--oc-icon-file-javascript',
  '--oc-icon-file-vue',
  '--oc-icon-file-html',
  '--oc-icon-file-css',
  '--oc-icon-file-image',
  '--oc-icon-file-config',
  '--oc-icon-folder',
  '--oc-icon-folder-open',

  // 块类型图标色
  '--oc-icon-block-text',
  '--oc-icon-block-markdown',
  '--oc-icon-block-image',
  '--oc-icon-block-qrcode',
  '--oc-icon-block-shape',
  '--oc-icon-block-simple-container',
  '--oc-icon-block-flow-container',

  // 字体
  '--oc-font-sans',
  '--oc-font-mono',

  // 字号
  '--oc-text-xs',
  '--oc-text-sm',
  '--oc-text-base',
  '--oc-text-lg',
  '--oc-text-xl',
  '--oc-font-preview-size',

  // 间距
  '--oc-space-1',
  '--oc-space-2',
  '--oc-space-3',
  '--oc-space-4',
  '--oc-space-5',
  '--oc-space-6',
  '--oc-space-8',
  '--oc-tree-indent',
  '--oc-page-editor-indent',
  '--oc-page-editor-column-gap',
  '--oc-page-editor-row-min-height',
  '--oc-page-editor-title-min-width',
  '--oc-page-editor-content-min-width',
  '--oc-page-editor-value-width',

  // 控件高度
  '--oc-size-sm',
  '--oc-size-md',
  '--oc-size-lg',
  '--oc-viewport-status-size',

  // 颜色通道控件
  '--oc-color-picker-plane-height',
  '--oc-color-channel-track-height',
  '--oc-color-channel-handle-width',
  '--oc-color-channel-handle-height',
  '--oc-color-channel-handle-border-width',
  '--oc-color-channel-handle-border-color',
  '--oc-color-channel-handle-shadow',

  // 列表高度上限
  '--oc-list-max-height-sm',
  '--oc-list-max-height-md',
  '--oc-list-max-height-lg',

  // 需要自持滚动的列表（虚拟滚动）的固定高度
  '--oc-list-height-md',

  // 页面内容宽度
  '--oc-content-width-md',
  '--oc-settings-preview-height-lg',
  '--oc-settings-preview-height-md',
  '--oc-settings-preview-shrink-distance',
  '--oc-settings-preview-sticky-offset',
  '--oc-settings-preview-glass-opacity-min',
  '--oc-settings-preview-glass-opacity-max',
  '--oc-z-settings-preview',
  '--oc-project-outline-width',
  '--oc-shell-sidebar-collapse-threshold',
  '--oc-project-font-list-min-width',
  '--oc-project-font-list-width',
  '--oc-project-icon-atlas-height',
  '--oc-project-icon-property-min-width',
  '--oc-project-icon-inspector-min-height',
  '--oc-project-icon-workbench-series-width',
  '--oc-project-icon-workbench-inspector-width',
  '--oc-project-icon-workbench-icon-list-height',
  '--oc-project-icon-preview-size',
  '--oc-cover-preview-width',
  '--oc-cover-preview-height',
  '--oc-cover-banner-height',
  '--oc-album-card-min-width',
  '--oc-album-card-aspect-ratio',
  '--oc-album-cover-zoom',
  '--oc-welcome-cover-tile-width',
  '--oc-welcome-cover-tile-aspect-ratio',
  '--oc-welcome-cover-tile-gap',
  '--oc-welcome-cover-wall-perspective',
  '--oc-welcome-cover-wall-rotate-x',
  '--oc-welcome-cover-wall-rotate-y',
  '--oc-welcome-cover-wall-scale',
  '--oc-welcome-cover-wall-blur',
  '--oc-welcome-cover-wall-opacity',
  '--oc-welcome-hero-text-shadow',
  '--oc-welcome-background-mask',
  '--oc-welcome-cover-tile-emphasis-opacity',
  '--oc-welcome-cover-tile-emphasis-scale',
  '--oc-welcome-cover-wall-duration',
  '--oc-viewport-inspector-min-height',
  '--oc-viewport-inspector-visible-min-height',
  '--oc-z-viewport-inspector',
  '--oc-floating-surface-padding',
  '--oc-floating-surface-gap',
  '--oc-card-editor-dock-min-width',
  '--oc-card-editor-dock-max-width',
  '--oc-card-editor-dock-default-width',
  '--oc-card-editor-dock-expand-threshold',
  '--oc-card-editor-dock-collapse-threshold',
  '--oc-card-editor-dock-top-min-height',
  '--oc-card-editor-dock-bottom-min-height',
  '--oc-card-editor-dock-responsive-width',
  '--oc-data-table-preview-min-width',
  '--oc-data-table-preview-min-height',
  '--oc-data-table-preview-default-width',
  '--oc-data-table-preview-default-height',
  '--oc-z-data-table-preview',
  '--oc-z-card-designer',
  '--oc-z-shell-floating-control',
  '--oc-overlay-toolbar-field-min-width',
  '--oc-overlay-toolbar-field-max-width',
  '--oc-autocomplete-popover-min-width',
  '--oc-json-editor-min-height',
  '--oc-json-editor-array-min-height',
  '--oc-dialog-width-sm',
  '--oc-dialog-width-md',
  '--oc-dialog-width-lg',
  '--oc-dialog-width-xl',
  '--oc-dialog-height-sm',
  '--oc-dialog-height-md',
  '--oc-dialog-height-lg',
  '--oc-dialog-height-workspace',
  '--oc-dialog-max-height',
  '--oc-dialog-header-padding-block',
  '--oc-dialog-header-padding-inline',
  '--oc-dialog-body-padding',
  '--oc-dialog-body-gap',
  '--oc-dialog-footer-padding-block',
  '--oc-dialog-footer-padding-inline',
  '--oc-z-modal',
  '--oc-z-overlay-toolbar',
  '--oc-viewport-dot-pattern',
  '--oc-viewport-dot-size',
  '--oc-viewport-dot-position',
  '--oc-viewport-alignment-snap-distance',
  '--oc-viewport-alignment-snap-release-distance',

  // 属性编辑器行高
  '--oc-property-row-height',
  '--oc-property-row-expanded-height',
  '--oc-sidebar-tree-min-height',

  // 数据表行高
  '--oc-table-row-height',

  // 数据网格几何
  '--oc-data-grid-key-column-width',
  '--oc-data-grid-column-width',
  '--oc-data-grid-column-min-width',
  '--oc-data-grid-column-max-width',
  '--oc-data-grid-tail-column-width',
  '--oc-data-grid-column-resize-step',
  '--oc-data-grid-bg-inherited',
  '--oc-data-grid-preload-block-distance',
  '--oc-data-grid-preload-inline-distance',
  '--oc-data-grid-z-sticky-column',
  '--oc-data-grid-z-sticky-header',
  '--oc-data-grid-z-corner',

  // 圆角
  '--oc-radius-sm',
  '--oc-radius-md',
  '--oc-radius-lg',
  '--oc-radius-full',

  // 阴影
  '--oc-shadow-sm',
  '--oc-shadow-md',
  '--oc-shadow-lg',

  // 动效
  '--oc-duration-fast',
  '--oc-duration-normal',
  '--oc-duration-slow',
  '--oc-duration-theme',
  '--oc-viewport-status-duration',
  '--oc-overflow-text-duration',
  '--oc-ease',

  // 焦点环
  '--oc-focus-ring',
] as const

export type OcThemeTokenKey = (typeof OC_THEME_TOKEN_KEYS)[number]
export type OcThemeTokens = Record<OcThemeTokenKey, string>

export const OC_EDITABLE_THEME_COLOR_KEYS = [
  '--oc-accent',
  '--oc-bg-base',
  '--oc-fg-default',
] as const

export type OcEditableThemeColorKey = (typeof OC_EDITABLE_THEME_COLOR_KEYS)[number]
export type OcThemeColorOverrides = Partial<Record<OcEditableThemeColorKey, string>>
