import { computed, nextTick, ref, type Ref } from 'vue'
import { parseCardMarkup, type CardMarkupDiagnostic } from '../../../features/card-rendering/markup'

type RichTextSessionDiagnostic = {
  code: string
  offset?: number
  message: string
  path?: string
}

export type RichTextEditorHandle = {
  focus: () => void
  getHtml: () => string
  applyHtml: (html: string) => boolean
  getContent?: () => string
  setContent?: (content: string) => boolean
  flushPendingInput: () => boolean
  endInteraction: () => void
}

/** The dialog owns the transaction; only the active mode owns writable content. */
export function useRichTextSession(
  editor: Ref<RichTextEditorHandle | null>,
  sourceInput: Ref<{ focus: () => void } | null>,
  _handoffMessage?: () => string,
) {
  const open = ref(false)
  const mode = ref<'rich' | 'source'>('rich')
  const initialHtml = ref('')
  const source = ref('')
  const diagnostics = computed<RichTextSessionDiagnostic[]>(() => {
    if (mode.value !== 'source') return []
    const result = parseCardMarkup(source.value)
    return result.diagnostics.map((d: CardMarkupDiagnostic) => {
      const lines = source.value.slice(0, d.offset).split('\n')
      const line = lines.length
      const col = lines[lines.length - 1]!.length + 1
      return {
        code: d.code,
        offset: d.offset,
        message: d.message,
        path: line > 1 ? `ln ${line}, col ${col}` : `col ${col}`,
      }
    })
  })

  async function begin(value: string) {
    initialHtml.value = value
    source.value = value
    mode.value = 'rich'
    open.value = true
    await nextTick()
    if (!open.value) return
    const current = editor.value
    if (current) {
      if (current.setContent) current.setContent(value)
      else current.applyHtml(value)
      current.focus()
    } else {
      sourceInput.value?.focus()
    }
  }

  async function switchMode(next: string) {
    if (!open.value || (next !== 'rich' && next !== 'source') || next === mode.value) return
    const current = editor.value
    if (current && !current.flushPendingInput()) return
    current?.endInteraction()

    if (next === 'source') {
      if (current) {
        source.value = current.getContent ? current.getContent() : current.getHtml()
      }
    } else {
      if (current) {
        if (current.setContent) current.setContent(source.value)
        else current.applyHtml(source.value)
      }
    }
    mode.value = next
    await nextTick()
    if (!open.value) return
    if (next === 'rich') current?.focus()
    else sourceInput.value?.focus()
  }

  function editSource(value: string) {
    source.value = value
  }

  function readForSave(): string | null {
    if (!open.value) return null
    if (editor.value && !editor.value.flushPendingInput()) return null
    editor.value?.endInteraction()
    if (mode.value === 'source') return source.value
    const current = editor.value
    if (!current) return null
    return current.getContent ? current.getContent() : current.getHtml()
  }

  function finish() {
    editor.value?.endInteraction()
    open.value = false
  }

  return {
    open,
    mode,
    initialHtml,
    source,
    diagnostics,
    begin,
    switchMode,
    editSource,
    readForSave,
    finish,
  }
}

