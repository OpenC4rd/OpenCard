import { mergeAttributes, Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import type { PropertyIconEntry } from '../property-editor/propertyEditor.types'
import ProjectIconNodeView from './ProjectIconNodeView.vue'

export type ProjectIconNodeOptions = {
  /** Resolves a stored icon reference, which may name an icon owned by a package. */
  resolve?: (reference: string) => PropertyIconEntry | null
}

export const ProjectIconNode = Node.create<ProjectIconNodeOptions>({
  name: 'projectIcon', group: 'inline', inline: true, atom: true, selectable: true, marks: '_',
  addOptions() { return {} },
  addAttributes() {
    return {
      iconPath: { default: '', parseHTML: element => element.getAttribute('data-oc-icon-path') ?? '' },
    }
  },
  parseHTML() {
    return [{
      tag: 'span[data-oc-icon-path]',
      getAttrs: element => {
        if (!(element instanceof HTMLElement)) return false
        const iconPath = element.getAttribute('data-oc-icon-path') ?? ''
        return iconPath.trim() ? { iconPath } : false
      },
    }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const iconPath = String(node.attrs.iconPath ?? '')
    const { iconPath: _iconPath, ...safeAttributes } = HTMLAttributes
    return ['span', mergeAttributes(safeAttributes, {
      'data-oc-icon-path': iconPath,
    })]
  },
  addNodeView() { return VueNodeViewRenderer(ProjectIconNodeView) },
})
