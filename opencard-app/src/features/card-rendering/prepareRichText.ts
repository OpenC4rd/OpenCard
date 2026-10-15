import type { CardBlock, CardDocument, CardFaceKey, CardInstanceRecord } from '../../entities/card/model'
import { visitCardBlockTree } from '../../entities/card/tree'
import { parseRichTextHtml, type RichTextDocument } from '../../shared/rich-text/richTextHtml'
import { createCardPipelineIssue, type CardPipelineIssue } from './cardPipelineIssue'

export type PreparedRichText = {
  document: RichTextDocument
  diagnostics: readonly CardPipelineIssue[]
  valid: boolean
}

export type PreparedRichTextCatalog = ReadonlyMap<string, PreparedRichText>

function hostIssue(documentId: string, block: CardBlock, faceKey: CardFaceKey, instanceId: string | null, type: CardPipelineIssue['type']): CardPipelineIssue {
  return createCardPipelineIssue({
    type,
    location: {
      documentId, instanceId, faceKey,
      owner: { kind: 'block', id: block.id }, blockId: block.id, fieldKey: 'content',
    },
  })
}

export function prepareRichText(options: {
  document: CardDocument
  currentCard?: CardInstanceRecord | null
}): { catalog: PreparedRichTextCatalog, issues: CardPipelineIssue[] } {
  const catalog = new Map<string, PreparedRichText>()
  const issues: CardPipelineIssue[] = []
  for (const [faceKey, face] of Object.entries(options.document.faces) as [CardFaceKey, CardDocument['faces'][CardFaceKey]][]) {
    for (const child of face.children) visitCardBlockTree(child.block, host => {
      if (host.type !== 'text-block') return
      const parsed = parseRichTextHtml(host.content)
      const diagnostics = parsed.canEnterVisualMode ? [] : [hostIssue(options.document.id, host, faceKey,
        options.currentCard?.id ?? null, 'card-designer.rich-text.invalid-html')]
      issues.push(...diagnostics)
      catalog.set(host.id, { document: parsed.document, diagnostics, valid: parsed.canEnterVisualMode })
    })
  }
  return { catalog, issues }
}
