import type { CardFaceKey } from '../../entities/card/model'

export type CardIssueSeverity = 'error' | 'warning' | 'info'

export type CardIssueOwner =
  | { kind: 'document', id: string }
  | { kind: 'face', id: string }
  | { kind: 'instance', id: string }
  | { kind: 'block', id: string }
  | { kind: 'location', id: string }

export type CardIssueLocation = {
  documentId: string
  instanceId: string | null
  faceKey: CardFaceKey | null
  owner: CardIssueOwner
  blockId?: string
  blockPath?: string
  fieldKey: string
  valuePath?: readonly (string | number)[]
  characterOffset?: number
}

export type CardBindingIssueType =
  | 'card-designer.binding.invalid-token'
  | 'card-designer.binding.source-not-found'
  | 'card-designer.binding.field-not-allowed'
  | 'card-designer.binding.field-not-found'
  | 'card-designer.binding.cycle'
  | 'card-designer.binding.max-depth'
  | 'card-designer.binding.type-mismatch'

export type CardRenderParseIssueType =
  | 'card-designer.render-parse.invalid-type'
  | 'card-designer.render-parse.conversion-failed'
  | 'card-designer.render-parse.invalid-option'
  | 'card-designer.render-parse.out-of-range'
  | 'card-designer.render-parse.invalid-color'
  | 'card-designer.render-parse.invalid-css-length'
  | 'card-designer.render-parse.invalid-file-path'
  | 'card-designer.render-parse.invalid-object'
  | 'card-designer.render-parse.deprecated-block-type'
  | 'card-designer.render-parse.deprecated-property'
export type CardRichTextIssueType =
  | 'card-designer.rich-text.invalid-html'
  | 'card-designer.rich-text.limit-exceeded'
export type CardResourceIssueType =
  | 'card-designer.resource.remote-blocked'
  | 'card-designer.resource.system-font'
  | 'card-designer.resource.package-missing'
  | 'card-designer.resource.file-missing'

export type CardIssueType = CardBindingIssueType | CardRenderParseIssueType | CardRichTextIssueType | CardResourceIssueType

const cardIssueMessageKeys: Readonly<Record<CardIssueType, string>> = {
  'card-designer.binding.invalid-token': 'app.problems.bindingCodes.INVALID_TOKEN',
  'card-designer.binding.source-not-found': 'app.problems.bindingCodes.SOURCE_NOT_FOUND',
  'card-designer.binding.field-not-allowed': 'app.problems.bindingCodes.FIELD_NOT_ALLOWED',
  'card-designer.binding.field-not-found': 'app.problems.bindingCodes.FIELD_NOT_FOUND',
  'card-designer.binding.cycle': 'app.problems.bindingCodes.CYCLE',
  'card-designer.binding.max-depth': 'app.problems.bindingCodes.MAX_DEPTH',
  'card-designer.binding.type-mismatch': 'app.problems.bindingCodes.TYPE_MISMATCH',
  'card-designer.render-parse.invalid-type': 'app.problems.renderCodes.INVALID_TYPE',
  'card-designer.render-parse.conversion-failed': 'app.problems.renderCodes.CONVERSION_FAILED',
  'card-designer.render-parse.invalid-option': 'app.problems.renderCodes.INVALID_OPTION',
  'card-designer.render-parse.out-of-range': 'app.problems.renderCodes.OUT_OF_RANGE',
  'card-designer.render-parse.invalid-color': 'app.problems.renderCodes.INVALID_COLOR',
  'card-designer.render-parse.invalid-css-length': 'app.problems.renderCodes.INVALID_CSS_LENGTH',
  'card-designer.render-parse.invalid-file-path': 'app.problems.renderCodes.INVALID_FILE_PATH',
  'card-designer.render-parse.invalid-object': 'app.problems.renderCodes.INVALID_OBJECT',
  'card-designer.render-parse.deprecated-block-type': 'app.problems.renderCodes.DEPRECATED_BLOCK_TYPE',
  'card-designer.render-parse.deprecated-property': 'app.problems.renderCodes.DEPRECATED_PROPERTY',
  'card-designer.rich-text.invalid-html': 'app.problems.richTextCodes.INVALID_HTML',
  'card-designer.rich-text.limit-exceeded': 'app.problems.richTextCodes.LIMIT_EXCEEDED',
  'card-designer.resource.remote-blocked': 'app.problems.resourceCodes.REMOTE_BLOCKED',
  'card-designer.resource.system-font': 'app.problems.resourceCodes.SYSTEM_FONT',
  'card-designer.resource.package-missing': 'app.problems.resourceCodes.PACKAGE_MISSING',
  'card-designer.resource.file-missing': 'app.problems.resourceCodes.FILE_MISSING',
}

export function cardIssueMessageKey(type: CardIssueType): string {
  return cardIssueMessageKeys[type]
}

export type CardPipelineIssue = {
  id: string
  type: CardIssueType
  severity: CardIssueSeverity
  location: CardIssueLocation
  parameters?: Readonly<Record<string, string | number>>
  token?: string
  details?: Readonly<Record<string, unknown>>
  children?: readonly CardPipelineIssue[]
}

export type CreateCardPipelineIssueInput = Omit<CardPipelineIssue, 'id' | 'severity'>

export function createCardPipelineIssue(
  input: CreateCardPipelineIssueInput,
): CardPipelineIssue {
  return {
    ...input,
    id: JSON.stringify([
      input.location.documentId,
      input.location.instanceId,
      input.location.faceKey,
      input.type,
      input.location.owner.kind,
      input.location.owner.id,
      input.location.blockId ?? null,
      input.location.fieldKey,
      input.location.valuePath ?? null,
      input.location.characterOffset ?? null,
      input.token ?? null,
    ]),
    severity: 'warning',
  }
}
