import type { CardBlock, CardDocument, CardFaceKey, CardInstanceRecord } from '../../entities/card/model'
import { visitCardBlockTree } from '../../entities/card/tree'
import { createCardPipelineIssue, type CardPipelineIssue } from './cardPipelineIssue'
import {
  parseCardMarkup,
  type CardMarkupDiagnostic,
  type CardMarkupDocument,
} from './markup'

type PreparedRichTextDocument = CardMarkupDocument

type PreparedRichText = {
  document: PreparedRichTextDocument
  diagnostics: readonly CardPipelineIssue[]
  valid: boolean
}

export type PreparedRichTextCatalog = ReadonlyMap<string, PreparedRichText>

function hostIssue(
  documentId: string,
  block: CardBlock,
  faceKey: CardFaceKey,
  instanceId: string | null,
  diagnostic: CardMarkupDiagnostic,
): CardPipelineIssue {
  return createCardPipelineIssue({
    type: 'card-designer.rich-text.invalid-markup',
    location: {
      documentId,
      instanceId,
      faceKey,
      owner: { kind: 'block', id: block.id },
      blockId: block.id,
      fieldKey: 'content',
      characterOffset: diagnostic.offset,
    },
    token: diagnostic.message,
    details: {
      code: diagnostic.code,
      message: diagnostic.message,
      offset: diagnostic.offset,
    },
  })
}

export function prepareRichText(options: {
  document: CardDocument
  currentCard?: CardInstanceRecord | null
}): { catalog: PreparedRichTextCatalog; issues: CardPipelineIssue[] } {
  const catalog = new Map<string, PreparedRichText>()
  const issues: CardPipelineIssue[] = []

  for (const [faceKey, face] of Object.entries(options.document.faces) as [
    CardFaceKey,
    CardDocument['faces'][CardFaceKey],
  ][]) {
    for (const child of face.children) {
      visitCardBlockTree(child.block, (host) => {
        if (host.type !== 'text-block') return
        const parsed = parseCardMarkup(host.content ?? '')
        const diagnostics = parsed.diagnostics.map((diag) =>
          hostIssue(options.document.id, host, faceKey, options.currentCard?.id ?? null, diag),
        )
        issues.push(...diagnostics)
        catalog.set(host.id, {
          document: parsed.document,
          diagnostics,
          valid: parsed.valid,
        })
      })
    }
  }

  return { catalog, issues }
}
