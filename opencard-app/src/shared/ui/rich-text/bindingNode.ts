import { mergeAttributes, Node, nodeInputRule, nodePasteRule } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import BindingNodeView from './BindingNodeView.vue'
import type { PropertyCompletionProvider } from '../property-editor/propertyEditor.types'

export type BindingNodeOptions = {
  completion?: PropertyCompletionProvider
}

export const BindingNode = Node.create<BindingNodeOptions>({
  name: 'binding',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  marks: '_',

  addOptions() {
    return {}
  },

  addAttributes() {
    return {
      expression: {
        default: '',
        parseHTML: element => element.getAttribute('data-oc-binding') ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-oc-binding]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const expression = String(node.attrs.expression ?? '').trim()
    const { expression: _expression, ...safeAttributes } = HTMLAttributes
    return [
      'span',
      mergeAttributes(safeAttributes, { 'data-oc-binding': expression }),
      `{{${expression}}}`,
    ]
  },

  renderText({ node }) {
    return `{{${String(node.attrs.expression ?? '').trim()}}}`
  },

  addNodeView() {
    return VueNodeViewRenderer(BindingNodeView)
  },

  addInputRules() {
    return [nodeInputRule({
      find: /\{\{$/,
      type: this.type,
      getAttributes: { expression: '' },
    })]
  },

  addPasteRules() {
    return [nodePasteRule({
      find: /\{\{\s*([^{}]+?)\s*\}\}/g,
      type: this.type,
      getAttributes: match => ({ expression: match[1]?.trim() ?? '' }),
    })]
  },
})
