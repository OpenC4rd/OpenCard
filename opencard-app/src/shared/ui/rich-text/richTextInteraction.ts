import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type SelectionBookmark, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'

type Range = { from: number; to: number }
/** 文档之外的瞬态：颜色预览，以及焦点离开编辑区后仍要看得见的选区。 */
type Transient = { preview: (Range & { style: string }) | null; retained: Range | null }
const transientKey = new PluginKey<Transient>('richTextTransient')

function mapRange<T extends Range>(range: T | null, transaction: Transaction): T | null {
  if (!range) return null
  const from = transaction.mapping.mapResult(range.from, 1)
  const to = transaction.mapping.mapResult(range.to, -1)
  return from.deletedAcross || to.deletedAcross || from.pos >= to.pos
    ? null : { ...range, from: from.pos, to: to.pos }
}

/** Selection ownership and transient formatting share the editor transaction lifecycle. */
export function createRichTextInteraction(
  getEditor: () => Editor | undefined,
  resourceStyle: (node: ProseMirrorNode, previewStyle: string) => string,
) {
  let target: SelectionBookmark | null = null
  let applying = false
  const plugin = new Plugin<Transient>({
    key: transientKey,
    state: {
      init: () => ({ preview: null, retained: null }),
      apply: (transaction, transient) => ({
        preview: mapRange(transient.preview, transaction),
        retained: mapRange(transient.retained, transaction),
        ...transaction.getMeta(transientKey) as Partial<Transient> | undefined,
      }),
    },
    props: {
      // Background is painted with glyph fill in decorations; serialization stays native.
      markViews: { highlight: () => {
        const dom = document.createElement('mark')
        dom.style.backgroundColor = 'transparent'
        dom.style.color = 'inherit'
        return { dom }
      } },
      decorations(state) {
        const { preview, retained } = transientKey.getState(state)!
        const decorations: Decoration[] = retained
          ? [Decoration.inline(retained.from, retained.to, { class: 'oc-rich-text-editor__retained-selection' })] : []
        state.doc.descendants((node, position) => {
          if (!node.isInline) return
          const hasStyle = node.marks.some(mark => mark.type.name === 'textStyle' || mark.type.name === 'highlight')
          const end = position + node.nodeSize
          const boundaries = [position, ...(preview ? [preview.from, preview.to].filter(at => at > position && at < end) : []), end]
          for (let index = 0; index < boundaries.length - 1; index++) {
            const from = boundaries[index]!
            const to = boundaries[index + 1]!
            const previewStyle = preview && from >= preview.from && to <= preview.to ? preview.style : ''
            if (!hasStyle && !previewStyle) continue
            const style = resourceStyle(node, previewStyle)
            if (style) decorations.push(Decoration.inline(from, to, { style }))
          }
        })
        return DecorationSet.create(state.doc, decorations) as any
      },
    },
  })

  function patchTransient(editor: Editor, patch: Partial<Transient>) {
    editor.view.dispatch(editor.state.tr.setMeta(transientKey, patch).setMeta('addToHistory', false))
  }
  function capture() {
    const editor = getEditor()
    if (!editor || target) return
    const { selection } = editor.state
    target = selection.getBookmark()
    if (!selection.empty) patchTransient(editor, { retained: { from: selection.from, to: selection.to } })
  }
  function clearPreview() {
    const editor = getEditor()
    if (editor && transientKey.getState(editor.state)?.preview) patchTransient(editor, { preview: null })
  }
  function release() {
    target = null
    const editor = getEditor()
    const transient = editor && transientKey.getState(editor.state)
    if (transient?.preview || transient?.retained) patchTransient(editor!, { preview: null, retained: null })
  }
  function update(transaction: Transaction) {
    if (!applying && transaction.selectionSet) release()
    else if (target && transaction.docChanged) {
      const before = target.resolve(transaction.before)
      const next = target.map(transaction.mapping)
      const after = next.resolve(transaction.doc)
      if (before.constructor !== after.constructor || (!before.empty && after.empty)) release()
      else target = next
    }
  }
  function run(command: (editor: Editor) => unknown, historyBoundary = false) {
    const editor = getEditor()
    if (!editor || editor.isDestroyed) return
    capture()
    applying = true
    try {
      const selection = target?.resolve(editor.state.doc)
      if (selection && !selection.eq(editor.state.selection)) editor.view.dispatch(editor.state.tr.setSelection(selection))
      clearPreview()
      if (historyBoundary) editor.view.dispatch(closeHistory(editor.state.tr))
      command(editor)
      target = editor.state.selection.getBookmark()
      if (historyBoundary) editor.view.dispatch(closeHistory(editor.state.tr))
    } finally { applying = false }
  }
  function preview(style: string) {
    const editor = getEditor()
    if (!editor) return
    capture()
    const selection = target?.resolve(editor.state.doc) ?? editor.state.selection
    patchTransient(editor, { preview: { from: selection.from, to: selection.to, style } })
  }
  return { plugin, capture, release, update, run, preview, clearPreview }
}
