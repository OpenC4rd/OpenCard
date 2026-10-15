import { computed, nextTick, ref, type Ref } from 'vue'
import { parseRichTextHtml, type RichTextDiagnostic } from '../../rich-text/richTextHtml'

export type RichTextEditorHandle = {
  focus: () => void
  getHtml: () => string
  applyHtml: (html: string) => boolean
  flushPendingInput: () => boolean
  endInteraction: () => void
}

/** The dialog owns the transaction; only the active mode owns writable content. */
export function useRichTextSession(
  editor: Ref<RichTextEditorHandle | null>,
  sourceInput: Ref<{ focus: () => void } | null>,
  handoffMessage: () => string,
) {
  const open = ref(false)
  const mode = ref<'rich' | 'source'>('rich')
  const initialHtml = ref('')
  const source = ref('')
  const handoffIssues = ref<RichTextDiagnostic[]>([])
  const diagnostics = computed(() => mode.value === 'source'
    ? [...parseRichTextHtml(source.value).diagnostics, ...handoffIssues.value] : [])
  async function begin(value: string) {
    initialHtml.value = value
    source.value = value
    handoffIssues.value = []
    mode.value = parseRichTextHtml(value).canEnterVisualMode ? 'rich' : 'source'
    open.value = true
    await nextTick()
    if (!open.value) return
    if (mode.value === 'rich' && editor.value && !editor.value.applyHtml(value)) {
      mode.value = 'source'
      handoffIssues.value = [{ code: 'invalid-structure', path: 'content', message: handoffMessage() }]
      await nextTick()
    }
    if (mode.value === 'rich') editor.value?.focus()
    else sourceInput.value?.focus()
  }
  async function switchMode(next: string) {
    if (!open.value || (next !== 'rich' && next !== 'source') || next === mode.value) return
    const current = editor.value
    if (!current) return
    if (!current.flushPendingInput()) return
    current.endInteraction()
    if (next === 'source') source.value = current.getHtml()
    else {
      if (!parseRichTextHtml(source.value).canEnterVisualMode) return
      if (!current.applyHtml(source.value)) {
        handoffIssues.value = [{ code: 'invalid-structure', path: 'content', message: handoffMessage() }]
        return
      }
    }
    handoffIssues.value = []
    mode.value = next
    await nextTick()
    if (!open.value) return
    if (next === 'rich') current.focus()
    else sourceInput.value?.focus()
  }
  function editSource(value: string) { source.value = value; handoffIssues.value = [] }
  function readForSave(): string | null {
    if (!open.value) return null
    if (editor.value && !editor.value.flushPendingInput()) return null
    editor.value?.endInteraction()
    // Handoff diagnostics prevent switching views, not saving otherwise valid source.
    if (mode.value === 'source') return parseRichTextHtml(source.value).diagnostics.length ? null : source.value
    return editor.value?.getHtml() ?? null
  }
  function finish() { editor.value?.endInteraction(); open.value = false }
  return { open, mode, initialHtml, source, diagnostics, begin, switchMode, editSource, readForSave, finish }
}
