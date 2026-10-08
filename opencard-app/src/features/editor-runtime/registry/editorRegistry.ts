/**
 * 模块说明：
 * - 维护内置编辑器及其能力的注册表
 * 职责边界：
 * - 只负责 `editorId -> component` 映射 不处理文件类型判定
 */

import type { Component } from 'vue'
import type { EditorCapabilities } from '../editorProtocol'

// 编辑器接口定义
export interface IEditor extends EditorCapabilities {
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
  history: 'monaco',
  name: 'Monaco Editor',
  component: MonacoEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'card-designer',
  history: 'structured',
  name: 'Card Designer',
  component: CardDesignEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'image-preview',
  content: 'none',
  name: 'Image Preview',
  component: ImagePreviewEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'project-config',
  history: 'structured',
  name: 'Project Configuration',
  component: ProjectConfigEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'font-registry',
  history: 'structured',
  immediateSave: true,
  name: 'Project Font Set',
  component: ProjectFontRegistryFileEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'icon-registry',
  history: 'structured',
  immediateSave: true,
  name: 'Project Icon Registry',
  component: ProjectIconRegistryFileEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'custom-block-registry',
  history: 'structured',
  immediateSave: true,
  name: 'Project Custom Block Registry',
  component: ProjectCustomBlockRegistryFileEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'package-manifest',
  content: 'none',
  name: 'Package Manifest',
  component: PackageManifestEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'package-manager',
  content: 'none',
  name: 'Package Manager',
  component: PackageManagerEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'font-preview',
  content: 'none',
  name: 'Font Preview',
  component: FontPreviewEditor,
  hasPreview: false,
  supportsDiff: true,
})

editorRegistry.register({
  id: 'unsupported-file',
  content: 'none',
  name: 'Unsupported File',
  component: UnsupportedFileEditor,
  hasPreview: false,
})

editorRegistry.register({
  id: 'dictionary',
  history: 'structured',
  name: 'Dictionary',
  component: DictionaryEditor,
  hasPreview: false,
})
