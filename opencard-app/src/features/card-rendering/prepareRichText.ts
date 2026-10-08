import type { CardBlock, CardDocument, CardFaceKey, CardInstanceRecord } from '../../entities/card/model'
import { visitCardBlockTree } from '../../entities/card/tree'
import { parseRichTextHtml, type RichTextDocument } from '../../shared/rich-text/richTextHtml'
import type { ProjectInformation } from '../workspace/model/projectMetadata'
import { createCardPipelineIssue, type CardPipelineIssue } from './cardPipelineIssue'
import type { RenderReadyCardBlock } from './render.types'

export type PreparedRichText = {
  document: RichTextDocument
  embeddedBlocks: ReadonlyMap<string, RenderReadyCardBlock>
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

function prepareRichTextForBlockTree(options: {
  root: CardBlock
  documentId: string
  instanceId?: string | null
  faceKey: CardFaceKey
  project?: Readonly<ProjectInformation> | null
  dictionary?: Readonly<Record<string, string>> | null
}): { catalog: PreparedRichTextCatalog, issues: CardPipelineIssue[], rootParseCount: number } {
  const prepared = new Map<string, PreparedRichText>()
  const issues: CardPipelineIssue[] = []
  let rootParseCount = 0

  visitCardBlockTree(options.root, host => {
    if (host.type !== 'text-block') return
    rootParseCount += 1
    const parsed = parseRichTextHtml(host.content)
    const diagnostics: CardPipelineIssue[] = []
    const embeddedBlocks = new Map<string, RenderReadyCardBlock>()
    if (!parsed.canEnterVisualMode) {
      const issue = hostIssue(options.documentId, host, options.faceKey, options.instanceId ?? null, 'card-designer.rich-text.invalid-html')
      diagnostics.push(issue)
      issues.push(issue)
    }
    prepared.set(host.id, {
      document: parsed.document,
      embeddedBlocks,
      diagnostics,
      valid: parsed.canEnterVisualMode,
    })
  })

  return { catalog: prepared, issues, rootParseCount }
}

export function prepareRichText(options: {
  document: CardDocument
  currentCard?: CardInstanceRecord | null
  project?: Readonly<ProjectInformation> | null
  dictionary?: Readonly<Record<string, string>> | null
}): { catalog: PreparedRichTextCatalog, issues: CardPipelineIssue[], rootParseCount: number } {
  const prepared = new Map<string, PreparedRichText>()
  const issues: CardPipelineIssue[] = []
  let rootParseCount = 0

  for (const [faceKey, face] of Object.entries(options.document.faces) as [CardFaceKey, CardDocument['faces'][CardFaceKey]][]) {
    for (const child of face.children) visitCardBlockTree(child.block, host => {
      if (host.type !== 'text-block') return
      const result = prepareRichTextForBlockTree({
        root: host,
        documentId: options.document.id,
        instanceId: options.currentCard?.id ?? null,
        faceKey,
        project: options.project,
        dictionary: options.dictionary,
      })
      rootParseCount += result.rootParseCount
      result.catalog.forEach((value, key) => prepared.set(key, value))
      issues.push(...result.issues)
    })
  }

  return { catalog: prepared, issues, rootParseCount }
}
