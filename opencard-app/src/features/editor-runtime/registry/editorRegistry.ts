/**
 * 模块说明：
 * - 维护内置编辑器及其能力的注册表
 * 职责边界：
 * - 只负责 `editorId -> component` 映射 不处理文件类型判定
 */

import type { Component } from 'vue'
import type { EditorCapabilities } from '../editorProtocol'
import CardDesignEditor from '../../card-designer/CardDesignEditor.vue'
import DictionaryEditor from '../../../components/editors/DictionaryEditor.vue'
import FontPreviewEditor from '../../../components/editors/FontPreviewEditor.vue'
import ImagePreviewEditor from '../../../components/editors/ImagePreviewEditor.vue'
import MonacoEditor from '../../../components/editors/MonacoEditor.vue'
import PackageManagerEditor from '../../../components/editors/PackageManagerEditor.vue'
import PackageManifestEditor from '../../../components/editors/PackageManifestEditor.vue'
import ProjectConfigEditor from '../../../components/editors/ProjectConfigEditor.vue'
import ProjectCustomBlockRegistryFileEditor from '../../../components/editors/ProjectCustomBlockRegistryFileEditor.vue'
import ProjectFontRegistryFileEditor from '../../../components/editors/ProjectFontRegistryFileEditor.vue'
import ProjectIconRegistryFileEditor from '../../../components/editors/ProjectIconRegistryFileEditor.vue'
import UnsupportedFileEditor from '../../../components/editors/UnsupportedFileEditor.vue'

interface IEditor extends EditorCapabilities {
  id: string
  name: string
  component: Component
  hasPreview?: boolean
  supportsDiff?: boolean
  previewComponent?: string
}

const editors: Record<string, IEditor> = {
  monaco: { id: 'monaco', history: 'monaco', name: 'Monaco Editor', component: MonacoEditor, hasPreview: false, supportsDiff: true },
  'card-designer': { id: 'card-designer', history: 'structured', name: 'Card Designer', component: CardDesignEditor, hasPreview: false, supportsDiff: true },
  'image-preview': { id: 'image-preview', content: 'none', name: 'Image Preview', component: ImagePreviewEditor, hasPreview: false, supportsDiff: true },
  'project-config': { id: 'project-config', history: 'structured', name: 'Project Configuration', component: ProjectConfigEditor, hasPreview: false },
  'font-registry': { id: 'font-registry', history: 'structured', immediateSave: true, name: 'Project Font Set', component: ProjectFontRegistryFileEditor, hasPreview: false, supportsDiff: true },
  'icon-registry': { id: 'icon-registry', history: 'structured', immediateSave: true, name: 'Project Icon Registry', component: ProjectIconRegistryFileEditor, hasPreview: false, supportsDiff: true },
  'custom-block-registry': { id: 'custom-block-registry', history: 'structured', immediateSave: true, name: 'Project Custom Block Registry', component: ProjectCustomBlockRegistryFileEditor, hasPreview: false, supportsDiff: true },
  'package-manifest': { id: 'package-manifest', content: 'none', name: 'Package Manifest', component: PackageManifestEditor, hasPreview: false },
  'package-manager': { id: 'package-manager', content: 'none', name: 'Package Manager', component: PackageManagerEditor, hasPreview: false },
  'font-preview': { id: 'font-preview', content: 'none', name: 'Font Preview', component: FontPreviewEditor, hasPreview: false, supportsDiff: true },
  'unsupported-file': { id: 'unsupported-file', content: 'none', name: 'Unsupported File', component: UnsupportedFileEditor, hasPreview: false },
  dictionary: { id: 'dictionary', history: 'structured', name: 'Dictionary', component: DictionaryEditor, hasPreview: false },
}

export const editorRegistry = {
  getEditor: (editorId: string): IEditor | undefined => editors[editorId],
}
