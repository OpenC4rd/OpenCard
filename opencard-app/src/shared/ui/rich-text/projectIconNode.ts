import { mergeAttributes, Node, nodePasteRule } from '@tiptap/core'
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
      size: { default: null, parseHTML: element => element.getAttribute('data-oc-size') ?? element.getAttribute('data-size') ?? null },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-oc-icon-path]',
        getAttrs: element => {
          if (!(element instanceof HTMLElement)) return false
          const iconPath = element.getAttribute('data-oc-icon-path') ?? ''
          const size = element.getAttribute('data-oc-size') ?? element.getAttribute('data-size') ?? undefined
          return iconPath.trim() ? { iconPath, ...(size ? { size } : {}) } : false
        },
      },
      {
        tag: 'span[data-type="projectIcon"]',
        getAttrs: element => {
          if (!(element instanceof HTMLElement)) return false
          const iconPath = element.getAttribute('data-icon-path')
            ?? element.getAttribute('data-oc-icon-path')
            ?? ''
          const size = element.getAttribute('data-oc-size') ?? element.getAttribute('data-size') ?? undefined
          return iconPath.trim() ? { iconPath, ...(size ? { size } : {}) } : false
        },
      },
      {
        tag: 'span[data-icon-path]',
        getAttrs: element => {
          if (!(element instanceof HTMLElement)) return false
          const iconPath = element.getAttribute('data-icon-path') ?? ''
          const size = element.getAttribute('data-oc-size') ?? element.getAttribute('data-size') ?? undefined
          return iconPath.trim() ? { iconPath, ...(size ? { size } : {}) } : false
        },
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const iconPath = String(node.attrs.iconPath ?? '')
    const size = node.attrs.size ? String(node.attrs.size) : null
    const { iconPath: _iconPath, size: _size, ...safeAttributes } = HTMLAttributes
    return ['span', mergeAttributes(safeAttributes, {
      'data-oc-icon-path': iconPath,
      ...(size ? { 'data-oc-size': size } : {}),
    })]
  },
  renderText({ node }) {
    const iconPath = String(node.attrs.iconPath ?? '')
    const size = node.attrs.size ? String(node.attrs.size) : undefined
    let key = iconPath
    let pkg: string | undefined
    let version: string | undefined
    let scope: string | undefined
    const hashIdx = iconPath.indexOf('#')
    if (hashIdx >= 0) {
      const qualifier = iconPath.slice(0, hashIdx).trim()
      const rawKey = iconPath.slice(hashIdx + 1).trim()
      key = rawKey.startsWith('icon:') ? rawKey.slice('icon:'.length) : rawKey
      if (!qualifier) {
        scope = 'host'
      } else {
        const atIdx = qualifier.lastIndexOf('@')
        if (atIdx > 0) {
          pkg = qualifier.slice(0, atIdx)
          version = qualifier.slice(atIdx + 1)
        } else {
          pkg = qualifier
        }
      }
    } else if (key.startsWith('icon:')) {
      key = key.slice('icon:'.length)
    }
    const args: string[] = [`key="${key}"`]
    if (pkg) args.push(`pkg="${pkg}"`)
    if (version) args.push(`version="${version}"`)
    if (scope) args.push(`scope=${scope}`)
    if (size) args.push(`size="${size}"`)
    return `@icon(${args.join(',')})`
  },
  addPasteRules() {
    return [nodePasteRule({
      find: /@icon\(([^)]+)\)/g,
      type: this.type,
      getAttributes: match => {
        const raw = match[1] ?? ''
        const getArg = (name: string) => {
          const m = new RegExp(`(?:^|[,\\s])${name}=(?:"([^"]*)"|'([^']*)'|([^,()]+))`, 'i').exec(raw)
          return (m ? (m[1] ?? m[2] ?? m[3] ?? '') : '').trim() || undefined
        }
        const key = getArg('key') ?? raw.split(',')[0]?.trim() ?? ''
        const pkg = getArg('pkg')
        const version = getArg('version')
        const scope = getArg('scope')
        const size = getArg('size')

        let iconPath = key
        if (scope === 'host') {
          iconPath = `#${key.startsWith('icon:') ? key : `icon:${key}`}`
        } else if (pkg) {
          const qual = version ? `${pkg}@${version}` : pkg
          iconPath = `${qual}#${key.startsWith('icon:') ? key : `icon:${key}`}`
        }

        return {
          iconPath,
          ...(size ? { size } : {}),
        }
      },
    })]
  },
  addNodeView() { return VueNodeViewRenderer(ProjectIconNodeView) },
})
