import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, type SelectionBookmark, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'

type Preview = { from: number; to: number; style: string }
const previewKey = new PluginKey<Preview | null>('richTextFormatPreview')

/** Selection ownership and transient formatting share the editor transaction lifecycle. */
export function createRichTextInteraction(
  getEditor: () => Editor | undefined,
  resourceStyle: (attributes: Record<string, unknown>) => string,
) {
  let target: SelectionBookmark | null = null
  let applying = false
  const plugin = new Plugin<Preview | null>({
    key: previewKey,
    state: {
      init: () => null,
      apply(transaction, preview) {
        if (transaction.getMeta(previewKey) !== undefined) return transaction.getMeta(previewKey)
        if (!preview) return null
        const from = transaction.mapping.mapResult(preview.from, 1)
        const to = transaction.mapping.mapResult(preview.to, -1)
        return from.deletedAcross || to.deletedAcross || from.pos >= to.pos
          ? null : { ...preview, from: from.pos, to: to.pos }
      },
    },
    props: {
      decorations(state) {
        const preview = previewKey.getState(state)
        const decorations: Decoration[] = []
        state.doc.descendants((node, position) => {
          if (!node.isInline) return
          const attrs = node.marks.find(mark => mark.type.name === 'textStyle')?.attrs
          const style = attrs && resourceStyle(attrs)
          if (style) decorations.push(Decoration.inline(position, position + node.nodeSize, { style }))
        })
        if (preview && preview.from < preview.to) decorations.push(Decoration.inline(preview.from, preview.to, { style: preview.style }))
        return DecorationSet.create(state.doc, decorations)
      },
    },
  })

  function capture() {
    const editor = getEditor()
    if (editor && !target) target = editor.state.selection.getBookmark()
  }
  function clearPreview() {
    const editor = getEditor()
    if (editor && previewKey.getState(editor.state)) {
      editor.view.dispatch(editor.state.tr.setMeta(previewKey, null).setMeta('addToHistory', false))
    }
  }
  function release() { target = null; clearPreview() }
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
    editor.view.dispatch(editor.state.tr.setMeta(previewKey, {
      from: selection.from, to: selection.to, style,
    }).setMeta('addToHistory', false))
  }
  return { plugin, capture, release, update, run, preview, clearPreview }
}
