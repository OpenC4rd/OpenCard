import { ref } from 'vue'
import {
  type CardDocument,
} from '../../entities/card/model'
import { buildParentLookup, type ParentLookup } from '../../entities/card/tree'
import {
  parseCardDocument,
  stringifyCardDocument,
} from '../../entities/card/storage'
import { notifyAppError } from '../notifications/titlebarNotices'
import type { HistoryOperationMeta } from '../editor-runtime/history/history.types'

export type CdeDocumentChangeMode = 'typing' | 'action'

type UseCdeDocumentStateOptions = {
  updateContent: (content: string, history?: HistoryOperationMeta) => void
  resetSelection: () => void
}

export function useCdeDocumentState(options: UseCdeDocumentStateOptions) {
  const rawContent = ref('')
  const cardDoc = ref<CardDocument | null>(null)
  const parentLookup = ref<ParentLookup>(new Map())
  const documentRevision = ref(0)

  function rebuildParentLookup() {
    parentLookup.value = cardDoc.value ? buildParentLookup(cardDoc.value) : new Map()
  }

  function refreshDocumentState(structural = false) {
    if (!cardDoc.value) {
      if (structural) rebuildParentLookup()
      return
    }

    documentRevision.value += 1
    if (structural) rebuildParentLookup()
  }

  function markDocumentChanged(
    mode: CdeDocumentChangeMode = 'action',
    target = 'document',
    structural = false,
  ) {
    if (!cardDoc.value) return
    const content = stringifyCardDocument(cardDoc.value)
    if (content === rawContent.value) return
    rawContent.value = content
    options.updateContent(content, mode === 'typing'
      ? { mode: 'debounced', merge: { family: 'card-edit', target }, structural }
      : { mode: 'immediate', structural })
  }

  function loadRawDoc(content: string, saved = true) {
    rawContent.value = content
    if (saved) options.resetSelection()

    try {
      const parsed = JSON.parse(content) as unknown
      cardDoc.value = parseCardDocument(parsed)
      rebuildParentLookup()
    } catch (e) {
      notifyAppError('OC-E4003', e)
      cardDoc.value = null
      rebuildParentLookup()
    }
  }

  return {
    rawContent,
    cardDoc,
    documentRevision,
    parentLookup,
    markDocumentChanged,
    refreshDocumentState,
    loadRawDoc,
  }
}
