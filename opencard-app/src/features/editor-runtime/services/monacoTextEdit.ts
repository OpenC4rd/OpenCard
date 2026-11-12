import type * as Monaco from 'monaco-editor'

/** Replaces a model's text as one undoable edit that touches only the span that changed. */
export function applyModelText(model: Monaco.editor.ITextModel, next: string): void {
  const previous = model.getValue()
  if (previous === next) return
  let start = 0
  const shared = Math.min(previous.length, next.length)
  while (start < shared && previous.charCodeAt(start) === next.charCodeAt(start)) start += 1
  let previousEnd = previous.length
  let nextEnd = next.length
  while (previousEnd > start && nextEnd > start && previous.charCodeAt(previousEnd - 1) === next.charCodeAt(nextEnd - 1)) {
    previousEnd -= 1
    nextEnd -= 1
  }
  const from = model.getPositionAt(start)
  const to = model.getPositionAt(previousEnd)
  model.pushStackElement()
  model.pushEditOperations(null, [{
    range: { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column },
    text: next.slice(start, nextEnd),
  }], () => null)
  model.pushStackElement()
}
