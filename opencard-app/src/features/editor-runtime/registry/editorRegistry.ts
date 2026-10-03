/**
 * 模块说明：
 * - 维护编辑器协议定义与内置编辑器注册表
 * 职责边界：
 * - 只负责 `editorId -> component` 映射 不处理文件类型判定
 */

import type { Component } from 'vue'
import type {
  CardDesignerLayoutState,
  CardDesignerMode,
  CardDesignerViewState,
  EditorDiffUiState,
  EditorViewportTransform,
} from '../model/editorUiState'
import type { EditorIssueSnapshot } from '../model/editorIssue'
import type { OcThemeColorOverrides, OcThemeId } from '../../../shared/ui/foundation'
import type { ProjectRemoteResourcePolicy } from '../../workspace/model/projectMetadata'
import type { ProjectInformation } from '../../workspace/model/projectMetadata'
import type { ProjectIconCatalog } from '../../workspace/services/projectIconCatalog'
import type { ContentHistoryOperationMeta } from '../history/contentHistory'

export interface EditorProps {
  mode?: 'edit' | 'diff'
  comparison?: EditorComparisonInput
  diffUiState?: EditorDiffUiState
  sessionId?: string
  filePath: string
  fileName?: string
  resourceRootPath?: string | null
  remoteResourcePolicy?: ProjectRemoteResourcePolicy
  modelValue?: string
  savedContent?: string
  viewportTransform?: EditorViewportTransform
  pixelated?: boolean
  cardDesignerMode?: CardDesignerMode
  cardDesignerLayout?: CardDesignerLayoutState
  cardDesignerView?: CardDesignerViewState
  structureTreeSelectionBehavior?: 'none' | 'expand' | 'expand-exclusive'
  structureTreeScrollToSelection?: boolean
  showSelectionPositionOnMove?: boolean
  showSelectionSizeOnResize?: boolean
  alignmentSnappingEnabledByDefault?: boolean
  debugHideCdeOverlays?: boolean
  debugTransparentCdeViewport?: boolean
  debugPassiveCdeViewport?: boolean
  themeId?: OcThemeId
  themeOverrides?: OcThemeColorOverrides
}

export interface EditorSnapshotContext {
  revisionId: string | null
  label: string
  content: string
  resourceRootPath?: string | null
  sourceFilePath?: string | null
  project?: Readonly<ProjectInformation> | null
  dictionary?: Readonly<Record<string, string>>
  projectIconCatalog?: ProjectIconCatalog
  resolveFontFamily?: (references: string) => string
  remoteResourcePolicy?: ProjectRemoteResourcePolicy
}

export interface EditorComparisonInput {
  before: EditorSnapshotContext
  after: EditorSnapshotContext
}

export interface EditorEmits {
  (e: 'save'): void
  (e: 'modified', isModified: boolean): void
  (e: 'update:modelValue', value: string, history?: ContentHistoryOperationMeta): void
  (e: 'update-viewport-transform', value: EditorViewportTransform): void
  (e: 'update:pixelated', value: boolean): void
  (e: 'update:card-designer-mode', value: CardDesignerMode): void
  (e: 'update-card-designer-layout', value: CardDesignerLayoutState): void
  (e: 'update-card-designer-view', value: CardDesignerViewState): void
  (e: 'update-diff-ui-state', value: EditorDiffUiState): void
  (e: 'issue-snapshot', snapshot: EditorIssueSnapshot): void
  (e: 'open-file', path: string): void
  /** 请壳层把一个项目文件移到回收站：编辑器不自己删文件，删除只有壳层那一条路。 */
  (e: 'trash-file', path: string): void
}

// 编辑器接口定义
export interface IEditor {
  // 编辑器唯一标识
  id: string
  // 编辑器显示名称
  name: string
  // Vue 组件引用
  component: Component
  // 是否支持预览
  hasPreview?: boolean
  supportsDiff?: boolean
  // 预览组件名称
  previewComponent?: string
}

// 编辑器注册表
class EditorRegistry {
  private editors: Map<string, IEditor> = new Map()

  // 注册编辑器
  register(editor: IEditor) {
    this.editors.set(editor.id, editor)
  }

  getEditor(editorId: string): IEditor | undefined {
    return this.editors.get(editorId)
  }

  // 获取所有编辑器
  getAllEditors(): IEditor[] {
    return Array.from(this.editors.values())
  }
}

import MonacoEditor from '../../../components/editors/MonacoEditor.vue'
import CardDesignEditor from '../../card-designer/CardDesignEditor.vue'
import ImagePreviewEditor from '../../../components/editors/ImagePreviewEditor.vue'
import ProjectConfigEditor from '../../../components/editors/ProjectConfigEditor.vue'
import ProjectFontRegistryFileEditor from '../../../components/editors/ProjectFontRegistryFileEditor.vue'
import ProjectIconRegistryFileEditor from '../../../components/editors/ProjectIconRegistryFileEditor.vue'
import ProjectCustomBlockRegistryFileEditor from '../../../components/editors/ProjectCustomBlockRegistryFileEditor.vue'
import PackageManifestEditor from '../../../components/editors/PackageManifestEditor.vue'
import PackageManagerEditor from '../../../components/editors/PackageManagerEditor.vue'
import DictionaryEditor from '../../../components/editors/DictionaryEditor.vue'
import FontPreviewEditor from '../../../components/editors/FontPreviewEditor.vue'
import UnsupportedFileEditor from '../../../components/editors/UnsupportedFileEditor.vue'

// 单例实例
export const editorRegistry = new EditorRegistry()

// 在此处注册内置编辑器
editorRegistry.register({
  id: 'monaco',
  name: 'Monaco Editor',
  component: MonacoEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'card-designer',
  name: 'Card Designer',
  component: CardDesignEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'image-preview',
  name: 'Image Preview',
  component: ImagePreviewEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'project-config',
  name: 'Project Configuration',
  component: ProjectConfigEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'font-registry',
  name: 'Project Font Set',
  component: ProjectFontRegistryFileEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'icon-registry',
  name: 'Project Icon Registry',
  component: ProjectIconRegistryFileEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'custom-block-registry',
  name: 'Project Custom Block Registry',
  component: ProjectCustomBlockRegistryFileEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'package-manifest',
  name: 'Package Manifest',
  component: PackageManifestEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'package-manager',
  name: 'Package Manager',
  component: PackageManagerEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'font-preview',
  name: 'Font Preview',
  component: FontPreviewEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'unsupported-file',
  name: 'Unsupported File',
  component: UnsupportedFileEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'dictionary',
  name: 'Dictionary',
  component: DictionaryEditor,
  hasPreview: false,
})
